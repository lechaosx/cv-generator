import os
import json
import uuid
import random
import base64
import mimetypes
from urllib.parse import urljoin, quote as urlquote

import diskcache
import flask
import requests
import yaml

app = flask.Flask(__name__)
app.jinja_env.trim_blocks = True
app.jinja_env.lstrip_blocks = True
app.config['MAX_CONTENT_LENGTH']    = 50 * 1024 * 1024
app.config['MAX_FORM_MEMORY_SIZE']  = 50 * 1024 * 1024

ICONIFY_URL = "https://api.iconify.design/{name}.svg?color=currentColor"

icon_cache = {}

def get_icon(name):
	if name not in icon_cache:
		url = ICONIFY_URL.format(name=name)
		try:
			response = requests.get(url, timeout=5)
			if response.ok:
				icon_cache[name] = response.text
				app.logger.info("Fetched icon '%s'", name)
			else:
				app.logger.warning("Icon '%s' not found (status %s)", name, response.status_code)
		except requests.exceptions.RequestException:
			app.logger.exception("Failed to fetch icon '%s'", name)
	svg = icon_cache.get(name, "")
	if svg:
		svg = svg.replace('<svg', '<svg aria-hidden="true"', 1)
	return svg

app.jinja_env.globals['get_icon'] = get_icon

LABELS = {
	'en': {
		'about_me':              'About Me',
		'interests':             'Interests',
		'connect':               'Connect',
		'work_experience':       'Work Experience',
		'education':             'Education',
		'present':               'present',
		'full_name':             'Full Name',
		'job_position':          'Job Position',
		'location':              'Location',
		'phone':                 'Phone',
		'email':                 'Email',
		'organization':          'Organization',
		'department':            'Department',
		'title':                 'Title',
		'description':           'Description',
		'badge':                 'Badge',
		'interest':              'Interest',
		'platform':              'Platform',
		'url':                   'URL',
	},
	'cs': {
		'about_me':              'O mně',
		'interests':             'Zájmy',
		'connect':               'Kontakty',
		'work_experience':       'Pracovní zkušenosti',
		'education':             'Vzdělání',
		'present':               'současnost',
		'full_name':             'Celé jméno',
		'job_position':          'Pracovní pozice',
		'location':              'Lokalita',
		'phone':                 'Telefon',
		'email':                 'Email',
		'organization':          'Organizace',
		'department':            'Oddělení',
		'title':                 'Titul',
		'description':           'Popis',
		'badge':                 'Štítek',
		'interest':              'Zájem',
		'platform':              'Platforma',
		'url':                   'URL',
	},
}

app.jinja_env.globals['LABELS'] = LABELS
app.jinja_env.filters['urlencode'] = lambda s: urlquote(s, safe='')

DICTIONARY = [
	"apple", "banana", "cherry", "date", "elderberry",
	"fig", "grape", "honeydew", "kiwi", "lemon",
	"mango", "nectarine", "orange", "peach", "quince"
]

DOMAINS_CONFIG = os.getenv('DOMAINS_CONFIG')
DEFAULT_CV     = os.getenv('DEFAULT_CV')
CACHE_TTL      = 60 * 60 * 24 * 7

def normalize_cv(data):
	for entry in data.get('experience', []) + data.get('education', []):
		if 'organization' not in entry:
			entry['organization'] = entry.pop('company', None) or entry.pop('institution', None) or ''
		if 'department' not in entry:
			entry['department'] = entry.pop('subinstitution', None) or ''
	return data


def load_cv(path_or_url):
	if path_or_url.startswith(('http://', 'https://')):
		data = yaml.safe_load(requests.get(path_or_url).content)
		if data.get('photo') and not data['photo'].startswith(('http://', 'https://')):
			data['photo'] = urljoin(path_or_url, data['photo'])
	else:
		with open(path_or_url) as f:
			data = yaml.safe_load(f)
		if data.get('photo') and not data['photo'].startswith(('http://', 'https://', 'data:')):
			photo_path = os.path.join(os.path.dirname(path_or_url), data['photo'])
			mime, _ = mimetypes.guess_type(photo_path)
			with open(photo_path, 'rb') as f:
				data['photo'] = f"data:{mime};base64,{base64.b64encode(f.read()).decode()}"
	return normalize_cv(data)


def load_domains():
	if not DOMAINS_CONFIG:
		return {}
	try:
		with open(DOMAINS_CONFIG) as f:
			return json.load(f)
	except (FileNotFoundError, json.JSONDecodeError):
		app.logger.warning("Could not load domains config from %s", DOMAINS_CONFIG)
		return {}

domains = load_domains()

cache = diskcache.Cache(os.getenv('SEEDS_DIR', '/data/seeds'))


@app.route("/healthz")
def healthz():
	return ("ok", 200)


@app.route("/photo")
def photo():
	seed = flask.request.args.get('seed')
	url  = flask.request.args.get('url')

	if seed:
		data, _ = get_seeded_cv(seed)
	elif url:
		data, _ = fetch_yaml_cv(url)
	else:
		host   = flask.request.host.split(':')[0]
		source = domains.get(host) or DEFAULT_CV
		data   = load_cv(source) if source else None

	if not data:
		flask.abort(404)

	photo_val = (data.get('photo') or '').strip()
	if not photo_val:
		flask.abort(404)

	if not photo_val.startswith('data:'):
		return flask.redirect(photo_val)

	try:
		header, encoded = photo_val.split(',', 1)
		mime = header.split(':')[1].split(';')[0]
		image_data = base64.b64decode(encoded)
	except Exception:
		flask.abort(422)

	resp = flask.make_response(image_data)
	resp.headers['Content-Type'] = mime
	resp.headers['Cache-Control'] = 'public, max-age=3600'
	return resp


@app.route("/check-domain")
def check_domain():
	domain = flask.request.args.get("domain", "").split(":")[0]
	return ("", 200) if domain in domains else ("", 403)


@app.route("/preview", methods=['POST'])
def preview():
	data = json.loads(flask.request.form['data'])
	return flask.render_template('cv.html', data=data, url='', seed='', error=None, edit_mode=False)


MAX_SEED_ATTEMPTS = 10

@app.route("/fork", methods=['POST'])
def fork():
	data = flask.request.get_json()
	if not isinstance(data, dict):
		flask.abort(400)

	token = str(uuid.uuid4())

	for _ in range(MAX_SEED_ATTEMPTS):
		seed = "-".join(random.choices(DICTIONARY, k=3))
		if cache.get(seed) is None:
			break
	else:
		app.logger.error("Could not generate a unique seed after %d attempts", MAX_SEED_ATTEMPTS)
		flask.abort(503)

	cache.set(seed, {'data': data, 'token': token}, expire=CACHE_TTL)
	return flask.jsonify({'url': flask.url_for('edit', seed=seed, token=token)})


@app.route("/edit")
def edit():
	seed = flask.request.args.get('seed')
	url  = flask.request.args.get('url')

	if seed:
		entry = cache.get(seed)
		if not entry:
			return flask.redirect(flask.url_for('edit'))
		data = entry['data']
	elif url:
		data, error = fetch_yaml_cv(url)
	else:
		host   = flask.request.host.split(':')[0]
		source = domains.get(host) or DEFAULT_CV
		data   = load_cv(source) if source else None

	if data and data.get('photo'): data['photo'] = f'/photo?{flask.request.query_string.decode()}'.rstrip('?')
	return flask.render_template('cv.html', data=data, url=url or '', seed=seed or '', error=None, edit_mode=True)


@app.route("/save", methods=['POST'])
def save():
	seed  = flask.request.args.get('seed')
	token = flask.request.args.get('token')
	if not seed or not token:
		flask.abort(400)
	data = flask.request.get_json()
	if not isinstance(data, dict):
		flask.abort(400)
	entry = cache.get(seed)
	if not entry or entry.get('token') != token:
		flask.abort(403)
	cache.set(seed, {'data': data, 'token': token}, expire=CACHE_TTL)
	return ("", 204)


@app.route("/", methods=['GET'])
def index():
	url  = flask.request.args.get('url')
	seed = flask.request.args.get('seed')

	if url:
		data, error = fetch_yaml_cv(url)
	elif seed:
		data, error = get_seeded_cv(seed)
	else:
		host  = flask.request.host.split(':')[0]
		data  = load_cv(source) if (source := domains.get(host) or DEFAULT_CV) else None
		error = None

	if data and data.get('photo'): data['photo'] = f'/photo?{flask.request.query_string.decode()}'.rstrip('?')
	return flask.render_template('cv.html', data=data, url=url or '', seed=seed or '', error=error, edit_mode=False)


def fetch_yaml_cv(url):
	try:
		return load_cv(url), None
	except Exception:
		app.logger.exception("Failed to fetch YAML from URL: %s", url)
		return None, "Could not fetch or parse the YAML from the provided URL."


def get_seeded_cv(seed):
	entry = cache.get(seed)
	if entry is not None:
		return entry['data'], None
	return None, "CV not found or expired."
