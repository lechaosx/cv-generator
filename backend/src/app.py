import os
import json
import random

import flask
import redis
import openai
import pydantic
import requests

app = flask.Flask(__name__)

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
	return icon_cache.get(name, "")

app.jinja_env.globals['get_icon'] = get_icon

DICTIONARY = [
	"apple", "banana", "cherry", "date", "elderberry",
	"fig", "grape", "honeydew", "kiwi", "lemon",
	"mango", "nectarine", "orange", "peach", "quince"
]

DEFAULT_CV_URL = "https://lechaosx.github.io/cv-data/cv.json"
CACHE_TTL = 60 * 60 * 24 * 7

with open(os.getenv("OPENAI_KEY"), "r") as file:
	openai.api_key = file.read().strip()

redis_client = redis.StrictRedis(host='redis', port=6379, db=0, decode_responses=True)


class Experience(pydantic.BaseModel):
	title: str             = pydantic.Field(description="Job title.")
	company: str           = pydantic.Field(description="Company full legal name.")
	start_month: str       = pydantic.Field(description="Starting month of employment. Use two decimal places, like 01 or 12.")
	start_year: str        = pydantic.Field(description="Starting year of employment.")
	end_month: str         = pydantic.Field(description="Ending month of employment. Use two decimal places, like 01 or 12. Make it empty string when not known.")
	end_year: str          = pydantic.Field(description="Ending year of employment. Make it empty string when not known.")
	description: list[str] = pydantic.Field(description="Description of the job responsibilities and achievements. When not available or is too short, create a description from the input.")
	badges: list[str]      = pydantic.Field(description="Skills and technologies associated with the position.")

class Education(pydantic.BaseModel):
	title: str          = pydantic.Field(description="Degree title. Use wordy name, like 'Master's Degree' or such.")
	institution: str    = pydantic.Field(description="Institution name, full university name.")
	subinstitution: str = pydantic.Field(description="Sub-institution, faculty or department, if applicable.")
	end_year: str       = pydantic.Field(description="Year of graduation. Make it empty string when not known.")
	description: str    = pydantic.Field(description="Description of studies or achievements. When not available or is too short, try to come up with something from the data.")

class PersonalInfo(pydantic.BaseModel):
	title_before_name: str       = pydantic.Field(description="Title before the person's name (Ing., Bc.). Leave empty when not available.")
	name: str                    = pydantic.Field(description="Full name of the person.")
	title_after_name: str        = pydantic.Field(description="Title after the person's name (PhD). Leave empty when not available.")
	position: str                = pydantic.Field(description="Current job position. Leave empty if not known.")
	phone: str                   = pydantic.Field(description="Contact phone number.")
	email: str                   = pydantic.Field(description="Email address.")
	location: str                = pydantic.Field(description="Current location (city, state).")
	photo: str                   = pydantic.Field(description="URL of the profile photo.")
	description: str             = pydantic.Field(description="A brief personal description or bio. Make something up if not directly available.")
	interests: list[str]         = pydantic.Field(description="List of personal interests or hobbies.")
	links: dict[str, str]        = pydantic.Field(description="Social and web profile links. Key is the platform name in lowercase (e.g. 'github', 'linkedin', 'twitter'), value is the URL without the http/https prefix.")
	experience: list[Experience] = pydantic.Field(description="List of work experiences.")
	education: list[Education]   = pydantic.Field(description="List of educational qualifications.")


@app.route("/", methods=['GET'])
def index():
	url = flask.request.args.get('url')
	seed = flask.request.args.get('seed')

	if url and not seed:
		seed = "-".join(random.choices(DICTIONARY, k=3))
		return flask.redirect(flask.url_for('index', url=url, seed=seed))

	data, error = get_cv_data(url, seed) if url else (None, None)
	if data is None and not error:
		data = requests.get(DEFAULT_CV_URL).json()

	return flask.render_template('cv.html', data=data, url=url or '', error=error)


def get_cv_data(url, seed):
	redis_key = f"{url}:{seed}"

	try:
		cached = redis_client.get(redis_key)
		if cached:
			return json.loads(cached), None
	except redis.exceptions.ConnectionError:
		app.logger.exception("Redis unavailable")
		return None, "Cache is unavailable — results may differ between page loads."

	try:
		response = requests.get(url, timeout=10)
		response.raise_for_status()
	except requests.exceptions.RequestException:
		app.logger.exception("Failed to fetch URL: %s", url)
		return None, "Could not fetch the provided URL."

	try:
		openai_response = openai.beta.chat.completions.parse(
			model="gpt-4o-mini",
			messages=[
				{"role": "system", "content": "You are an assistant that extracts personal information for a CV."},
				{"role": "user", "content": response.text}
			],
			response_format=PersonalInfo,
			seed=hash(seed)
		)
	except Exception:
		app.logger.exception("OpenAI extraction failed for URL: %s", url)
		return None, "Could not extract CV data from the provided URL."

	data = openai_response.choices[0].message.parsed.model_dump(mode='json')
	redis_client.set(redis_key, json.dumps(data), ex=CACHE_TTL)
	return data, None
