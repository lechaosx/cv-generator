(() => {

const STORAGE_KEY = `cv-edit:${location.host}`;
const COLORS_KEY  = `cv-edit-colors:${location.host}`;

const saved = localStorage.getItem(STORAGE_KEY);
const state = saved ? JSON.parse(saved) : structuredClone(window.CV_DATA);
let themeColors = {};
const timelineRenderers = {};

function persist() {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	localStorage.setItem(COLORS_KEY, JSON.stringify(themeColors));
}

function entryHasContent(entry, type) {
	if (type === 'experience') {
		return !!(entry.company?.trim() || entry.title?.trim() ||
		          entry.start_month?.trim() || entry.start_year?.trim() ||
		          entry.end_month?.trim() || entry.end_year?.trim() ||
		          entry.description?.some(d => d.trim()) || entry.badges?.length);
	}
	return !!(entry.institution?.trim() || entry.title?.trim() ||
	          entry.subinstitution?.trim() || entry.start_month?.trim() ||
	          entry.start_year?.trim() || entry.end_month?.trim() ||
	          entry.end_year?.trim() || entry.description?.some(d => d.trim()));
}

function emptyExpEntry() {
	return { company: '', title: '', start_month: '', start_year: '', end_month: '', end_year: '', description: [], badges: [] };
}

function emptyEduEntry() {
	return { institution: '', title: '', subinstitution: '', start_month: '', start_year: '', end_month: '', end_year: '', description: [] };
}

function ensureGhost(type) {
	const list = state[type];
	const last = list[list.length - 1];
	if (!last || entryHasContent(last, type)) {
		list.push(type === 'experience' ? emptyExpEntry() : emptyEduEntry());
		return true;
	}
	return false;
}

function checkEntry(field) {
	const m = field.match(/^(experience|education)\.(\d+)\./);
	if (!m) return;
	const type = m[1], idx = +m[2];
	const list = state[type];
	const entry = list?.[idx];
	if (!entry) return;

	if (idx === list.length - 1) {
		// Last entry is the ghost — if it now has content, spawn a new ghost
		if (entryHasContent(entry, type)) {
			if (ensureGhost(type)) { persist(); timelineRenderers[type]?.(); }
		}
		return;
	}

	// Non-ghost entry: remove if empty
	if (!entryHasContent(entry, type)) {
		list.splice(idx, 1);
		persist();
		timelineRenderers[type]?.();
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPath(obj, path) {
	return path.split('.').reduce((o, k) => o?.[isNaN(k) ? k : +k], obj);
}

function setPath(obj, path, value) {
	const parts = path.split('.');
	let cur = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const k = isNaN(parts[i]) ? parts[i] : +parts[i];
		cur = cur[k];
	}
	const last = parts.at(-1);
	cur[isNaN(last) ? last : +last] = value;
}

function resolveColor(val) {
	if (!val) return '#000000';
	const s = String(val).trim();
	if (s.startsWith('#')) return s;
	if (s.startsWith('--')) return rgbToHex(getComputedStyle(document.documentElement).getPropertyValue(s).trim());
	return rgbToHex(s);
}

function rgbToHex(color) {
	if (!color) return '#000000';
	if (color.startsWith('#')) return color;
	const m = color.match(/\d+/g);
	if (!m) return '#000000';
	return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
}

function yamlStr(s) {
	if (s == null || s === '') return '""';
	s = String(s);
	if (/[:#\[\]{}"'\n\\|>]/.test(s) || s.startsWith(' ') || s.startsWith('-') || s.startsWith('!'))
		return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
	return s;
}

function toYaml(obj, indent = 0) {
	const sp = '  '.repeat(indent);
	let out = '';
	for (const [k, v] of Object.entries(obj)) {
		if (v == null) {
			out += `${sp}${k}: ""\n`;
		} else if (typeof v === 'string') {
			out += `${sp}${k}: ${yamlStr(v)}\n`;
		} else if (Array.isArray(v)) {
			if (!v.length) {
				out += `${sp}${k}: []\n`;
			} else if (typeof v[0] !== 'object') {
				out += `${sp}${k}:\n`;
				for (const item of v) out += `${sp}  - ${yamlStr(String(item))}\n`;
			} else {
				out += `${sp}${k}:\n`;
				for (const item of v) {
					let first = true;
					for (const [ik, iv] of Object.entries(item)) {
						const prefix = first ? `${sp}  - ` : `${sp}    `;
						first = false;
						if (Array.isArray(iv))
							out += `${prefix}${ik}: [${iv.map(s => yamlStr(String(s))).join(', ')}]\n`;
						else
							out += `${prefix}${ik}: ${yamlStr(String(iv ?? ''))}\n`;
					}
				}
			}
		} else if (typeof v === 'object') {
			out += `${sp}${k}:\n`;
			out += toYaml(v, indent + 1);
		}
	}
	return out;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const style = document.createElement('style');
style.textContent = `
	.cv-field { cursor: text; }
	.cv-field:hover { outline: 1px dashed var(--border); border-radius: 2px; }
	[contenteditable]:focus { outline: 2px solid var(--border) !important; border-radius: 2px; }

	/* ghost items: whole element faded */
	.edit-ghost { opacity: .5; }

	/* placeholder text — same visual weight everywhere */
	[data-placeholder]:empty::before {
		content: attr(data-placeholder);
		opacity: .5;
		pointer-events: none;
	}
	/* ghost ::before: opacity 1 relative to parent so combined = .5 */
	.edit-ghost[data-placeholder]:empty::before { opacity: 1; }

	/* show all date fields in edit mode */
	.cv-dates .start-part, .cv-dates .end-part { display: inline !important; }
	.cv-dates .start-month, .cv-dates .sm-sep,
	.cv-dates .end-month,   .cv-dates .em-sep   { display: inline !important; }
	.cv-dates .present-text { display: none !important; }

	/* ghost entry — same structure as real entries, just faded */
	.entry-ghost { opacity: .5; }

	/* toolbar always uses dark theme colours */
	#edit-toolbar {
		position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
		background: var(--panel-dark); border-top: 2px solid var(--light);
		display: flex; gap: 10px; padding: 10px 20px; align-items: center;
		font-family: var(--condensed-font); font-size: 14px; color: var(--text-dark);
	}
	#edit-toolbar button {
		padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer;
		background: var(--button-dark); color: var(--button-text-dark);
		font-family: var(--condensed-font); font-size: 14px;
	}
	#edit-toolbar button:hover { opacity: .8; }
	#btn-reset { background: #5a2a2a !important; color: white !important; }
	#edit-color-panel {
		position: fixed; bottom: 52px; right: 20px; z-index: 9998;
		background: var(--panel-dark); border: 1px solid var(--light); border-radius: 8px;
		padding: 16px; display: none; flex-direction: column; gap: 10px;
		font-family: var(--condensed-font); font-size: 13px; color: var(--text-dark); min-width: 220px;
	}
	#edit-color-panel input[type=color] {
		width: 36px; height: 28px; padding: 0; border: 1px solid var(--border);
		cursor: pointer; border-radius: 4px; background: none;
	}
`;
document.head.appendChild(style);

// ── Text editing ──────────────────────────────────────────────────────────────

function setupEditable(el, path, placeholder) {
	el.contentEditable = 'true';
	el.classList.add('cv-field');
	el.setAttribute('data-placeholder', placeholder);

	// Apply state (state is always initialised — from localStorage or CV_DATA)
	const v = getPath(state, path);
	if (v != null) {
		if (Array.isArray(v)) el.textContent = v.join(' ');
		else { el.innerHTML = ''; el.textContent = v; }
	}

	el.addEventListener('focus', () => { el.dataset.before = el.textContent; });
	el.addEventListener('blur', () => {
		let value = el.textContent.trim();
		if (!value) el.innerHTML = '';
		if (path.endsWith('.description')) value = value ? [value] : [];
		setPath(state, path, value);
		persist();
		checkEntry(path);
	});
	el.addEventListener('keydown', e => {
		if (e.key === 'Escape') { el.textContent = el.dataset.before || ''; el.blur(); }
		else if (e.key === 'Enter' && !e.shiftKey && !el.matches('p')) { e.preventDefault(); el.blur(); }
	});
}

// Static field map — [getter, statePath, placeholder]
const FIELD_MAP = [
	[() => document.querySelectorAll('.main-info .title')[0], 'title_before_name', 'Title'],
	[() => document.querySelector('h1'),                      'name',              'Full Name'],
	[() => document.querySelectorAll('.main-info .title')[1], 'title_after_name',  'Title'],
	[() => document.querySelector('.position'),               'position',          'Job Position'],
	[() => document.querySelector('.contact-list div:nth-child(1) span'), 'location', 'Location'],
	[() => document.querySelector('.contact-list div:nth-child(2) span'), 'phone',    'Phone'],
	[() => document.querySelector('.contact-list div:nth-child(3) span'), 'email',    'Email'],
	[() => document.querySelector('.additional-info section:first-child p'), 'description', 'Description'],
];

for (const [getter, path, placeholder] of FIELD_MAP) {
	const el = getter();
	if (el) setupEditable(el, path, placeholder);
}

// ── Ghost list (interests & badges) ──────────────────────────────────────────

function makeGhostList(container, getItems, setItems, makeEl, placeholder = 'Add…') {
	function render() {
		container.innerHTML = '';
		[...getItems(), ''].forEach((item, i) => {
			const isGhost = i === getItems().length;
			const el = makeEl(item, isGhost);
			el.contentEditable = 'true';
			if (isGhost) {
				el.classList.add('edit-ghost');
				el.setAttribute('data-placeholder', placeholder);
			}

			el.addEventListener('blur', () => {
				const val = el.textContent.trim();
				const items = getItems();
				if (isGhost) {
					if (val) { setItems([...items, val]); persist(); render(); }
				} else {
					const next = [...items];
					if (val) { next[i] = val; setItems(next); persist(); }
					else { next.splice(i, 1); setItems(next); persist(); render(); }
				}
			});
			el.addEventListener('keydown', e => {
				if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
				if (e.key === 'Escape') { el.textContent = item; el.blur(); }
			});

			container.appendChild(el);
		});
	}
	render();
}

// Interests
const interestsEl = document.querySelector('.additional-info section:nth-child(2) p');
if (interestsEl) {
	interestsEl.removeAttribute('data-field');
	interestsEl.classList.add('interests-list');
	interestsEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 8px;align-items:baseline;';
	makeGhostList(interestsEl,
		() => state.interests || [],
		v => { state.interests = v; },
		(item) => {
			const span = document.createElement('span');
			span.textContent = item;
			return span;
		},
		'Interest'
	);
}

// Badges set up via materializeExpEntry — no discovery needed here

// ── Connect / links ───────────────────────────────────────────────────────────

function setupConnectEdit() {
	const additionalInfo = document.querySelector('.additional-info');
	let section = additionalInfo.querySelector('.connect');
	if (!section) {
		section = document.createElement('section');
		section.className = 'connect';
		section.innerHTML = '<h2 class="section-header">Connect</h2>';
		additionalInfo.insertBefore(section, additionalInfo.querySelector('.cv-gen'));
	}

	function renderLinks() {
		section.querySelectorAll('.edit-link-row').forEach(el => el.remove());
		const links = Object.entries(state.links || {});

		function makeRow(platform, url, isGhost) {
			const row = document.createElement('div');
			row.className = 'edit-link-row';
			row.style.cssText = 'display:flex;gap:6px;align-items:center;';

			const pEl = document.createElement('span');
			pEl.contentEditable = 'true';
			pEl.textContent = platform;
			pEl.style.cssText = 'min-width:60px;font-weight:bold;';
			pEl.setAttribute('data-placeholder', 'Platform');
			if (isGhost) pEl.classList.add('edit-ghost');

			const sep = document.createElement('span');
			sep.textContent = '·';
			sep.style.opacity = '.4';

			const uEl = document.createElement('span');
			uEl.contentEditable = 'true';
			uEl.textContent = url;
			uEl.style.cssText = 'flex:1;';
			uEl.setAttribute('data-placeholder', 'URL');
			if (isGhost) uEl.classList.add('edit-ghost');

			let saveTimer;
			function scheduleSave() {
				clearTimeout(saveTimer);
				saveTimer = setTimeout(() => {
					if (document.activeElement === pEl || document.activeElement === uEl) return;
					const p = pEl.textContent.trim().toLowerCase();
					const u = uEl.textContent.trim().replace(/^https?:\/\//, '');
					const links = state.links || {};
					if (!isGhost) delete links[platform];
					if (p && u) { links[p] = u; state.links = links; persist(); renderLinks(); }
					else if (!isGhost) { state.links = links; persist(); renderLinks(); }
				}, 100);
			}

			pEl.addEventListener('blur', scheduleSave);
			uEl.addEventListener('blur', scheduleSave);
			[pEl, uEl].forEach(el => {
				el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
				el.addEventListener('focus', () => el.classList.remove('edit-ghost'));
			});

			row.appendChild(pEl);
			row.appendChild(sep);
			row.appendChild(uEl);

			// Insert before the existing server-rendered anchor (for real entries)
			// or append (for ghost)
			return row;
		}

		// Replace server-rendered anchors with editable rows
		section.querySelectorAll('a').forEach(a => a.style.display = 'none');

		links.forEach(([platform, url]) => {
			section.appendChild(makeRow(platform, url, false));
		});
		section.appendChild(makeRow('', '', true));
	}

	renderLinks();
}

setupConnectEdit();

// ── Materialize timeline entries ──────────────────────────────────────────────

function mkSpan(cls, path, ph) {
	const s = document.createElement('span');
	s.className = cls;
	setupEditable(s, path, ph);
	return s;
}

function materializeExpEntry(idx, timelineEl) {
	const job = state.experience[idx];
	const left = document.createElement('div');

	const company = document.createElement('strong');
	setupEditable(company, `experience.${idx}.company`, 'Company');

	const startPart = document.createElement('span');
	startPart.className = 'start-part';
	const smSep = document.createElement('span'); smSep.className = 'sm-sep'; smSep.textContent = '/';
	const rangeSep = document.createElement('span'); rangeSep.className = 'range-sep'; rangeSep.textContent = ' – ';
	startPart.append(mkSpan('start-month', `experience.${idx}.start_month`, 'MM'), smSep,
	                 mkSpan('start-year', `experience.${idx}.start_year`,  'YYYY'), rangeSep);

	const endPart = document.createElement('span');
	endPart.className = 'end-part';
	const emSep = document.createElement('span'); emSep.className = 'em-sep'; emSep.textContent = '/';
	endPart.append(mkSpan('end-month', `experience.${idx}.end_month`, 'MM'), emSep,
	               mkSpan('end-year', `experience.${idx}.end_year`,  'YYYY'));

	const presentText = document.createElement('span');
	presentText.className = 'present-text';
	presentText.textContent = 'present';

	const dates = document.createElement('div');
	dates.className = 'cv-dates';
	dates.append(startPart, endPart, presentText);

	const badgeList = document.createElement('div');
	badgeList.className = 'badge-list';
	makeGhostList(badgeList,
		() => state.experience[idx]?.badges || [],
		v => { if (state.experience[idx]) { state.experience[idx].badges = v; checkEntry(`experience.${idx}.badges`); } },
		(item) => { const s = document.createElement('span'); s.textContent = item; return s; },
		'Badge'
	);

	left.append(company, dates, badgeList);

	const right = document.createElement('div');
	const title = document.createElement('strong');
	setupEditable(title, `experience.${idx}.title`, 'Title');
	const desc = document.createElement('p');
	setupEditable(desc, `experience.${idx}.description`, 'Description');

	right.append(title, desc);
	timelineEl.append(left, right);
}

function materializeEduEntry(idx, timelineEl) {
	const edu = state.education[idx];
	const left = document.createElement('div');

	const institution = document.createElement('strong');
	setupEditable(institution, `education.${idx}.institution`, 'Institution');

	const eduSub = document.createElement('div');
	const eduSubSpan = document.createElement('span');
	setupEditable(eduSubSpan, `education.${idx}.subinstitution`, 'Faculty');
	eduSub.append(eduSubSpan);

	const startPart = document.createElement('span');
	startPart.className = 'start-part';
	const smSep2 = document.createElement('span'); smSep2.className = 'sm-sep'; smSep2.textContent = '/';
	const rangeSep = document.createElement('span'); rangeSep.className = 'range-sep'; rangeSep.textContent = ' – ';
	startPart.append(mkSpan('start-month', `education.${idx}.start_month`, 'MM'), smSep2,
	                 mkSpan('start-year',  `education.${idx}.start_year`,  'YYYY'), rangeSep);

	const endPart = document.createElement('span');
	endPart.className = 'end-part';
	const emSep2 = document.createElement('span'); emSep2.className = 'em-sep'; emSep2.textContent = '/';
	endPart.append(mkSpan('end-month', `education.${idx}.end_month`, 'MM'), emSep2,
	               mkSpan('end-year',  `education.${idx}.end_year`,  'YYYY'));

	const presentText = document.createElement('span');
	presentText.className = 'present-text';
	presentText.textContent = 'present';

	const dates = document.createElement('div');
	dates.className = 'cv-dates';
	dates.append(startPart, endPart, presentText);

	left.append(institution, eduSub, dates);

	const right = document.createElement('div');
	const title = document.createElement('strong');
	setupEditable(title, `education.${idx}.title`, 'Title');
	const desc = document.createElement('p');
	setupEditable(desc, `education.${idx}.description`, 'Description');

	right.append(title, desc);
	timelineEl.append(left, right);
}

// ── Timeline renderers ────────────────────────────────────────────────────────

function markGhost(timelineEl) {
	const ch = [...timelineEl.children];
	if (ch.length >= 2) {
		ch[ch.length - 2].classList.add('entry-ghost');
		ch[ch.length - 1].classList.add('entry-ghost');
	}
}

const expTimeline = document.querySelector('.timeline');
if (expTimeline) {
	timelineRenderers.experience = function renderExp() {
		expTimeline.innerHTML = '';
		ensureGhost('experience');
		state.experience.forEach((_, idx) => materializeExpEntry(idx, expTimeline));
		markGhost(expTimeline);
	};
	timelineRenderers.experience();
}

const eduTimeline = document.querySelectorAll('.timeline')[1];
if (eduTimeline) {
	timelineRenderers.education = function renderEdu() {
		eduTimeline.innerHTML = '';
		ensureGhost('education');
		state.education.forEach((_, idx) => materializeEduEntry(idx, eduTimeline));
		markGhost(eduTimeline);
	};
	timelineRenderers.education();
}

// ── Colors ────────────────────────────────────────────────────────────────────

const root = document.documentElement;
const computed = getComputedStyle(root);

const THEME_LABELS = {
	dark: 'Dark panel', light: 'Accent color',
	'panel-dark': 'Dark panel bg', 'panel-light': 'Light panel bg',
	'badge-dark': 'Badge (dark)', 'badge-text-dark': 'Badge text (dark)',
	'badge-light': 'Badge (light)', 'badge-text-light': 'Badge text (light)',
};

const themeKeys = ['dark', 'light', ...Object.keys(state.theme || {}).filter(k => k !== 'dark' && k !== 'light')];
const savedColors = JSON.parse(localStorage.getItem(COLORS_KEY) || '{}');
for (const k of themeKeys) {
	themeColors[k] = savedColors[k] || resolveColor(state.theme?.[k] || computed.getPropertyValue(`--${k}`).trim());
	if (savedColors[k]) root.style.setProperty(`--${k}`, savedColors[k]);
}

function applyColor(k, hex) {
	themeColors[k] = hex;
	root.style.setProperty(`--${k}`, hex);
	persist();
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

const toolbar = document.createElement('div');
toolbar.id = 'edit-toolbar';
toolbar.innerHTML = `
	<span style="flex:1;opacity:.5">✏️ Double-click text to edit</span>
	<button id="btn-reset">Reset</button>
	<button id="btn-colors">🎨 Colors</button>
	<button id="btn-preview">Preview</button>
	<button id="btn-export">📋 Export YAML</button>
`;
document.body.appendChild(toolbar);
document.body.style.paddingBottom = toolbar.offsetHeight + 'px';

// ── Color panel ───────────────────────────────────────────────────────────────

const colorPanel = document.createElement('div');
colorPanel.id = 'edit-color-panel';
colorPanel.innerHTML = '<strong>Theme Colors</strong>';

for (const k of themeKeys) {
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;align-items:center;gap:8px;';
	row.innerHTML = `<span style="flex:1">${THEME_LABELS[k] || k}</span>`;
	const input = document.createElement('input');
	input.type = 'color';
	input.value = themeColors[k] || '#000000';
	input.addEventListener('input', () => applyColor(k, input.value));
	row.appendChild(input);
	colorPanel.appendChild(row);
}
document.body.appendChild(colorPanel);

document.getElementById('btn-colors').addEventListener('click', () => {
	colorPanel.style.display = colorPanel.style.display === 'flex' ? 'none' : 'flex';
});

// ── Reset ─────────────────────────────────────────────────────────────────────

document.getElementById('btn-reset').addEventListener('click', () => {
	if (!confirm('Reset all changes?')) return;
	localStorage.removeItem(STORAGE_KEY);
	localStorage.removeItem(COLORS_KEY);
	location.reload();
});

// ── Preview ───────────────────────────────────────────────────────────────────

document.getElementById('btn-preview').addEventListener('click', () => {
	const out = structuredClone(state);
	if (out.experience?.length && !entryHasContent(out.experience.at(-1), 'experience')) out.experience.pop();
	if (out.education?.length  && !entryHasContent(out.education.at(-1),  'education'))  out.education.pop();
	const theme = {};
	for (const [k, v] of Object.entries(themeColors)) {
		if (k === 'dark' && v === '#283649') continue;
		if (k === 'light' && v === '#9c7843') continue;
		theme[k] = v;
	}
	if (Object.keys(theme).length) out.theme = theme;
	else delete out.theme;
	if (out.photo?.startsWith('data:')) out.photo = '';

	const form = document.createElement('form');
	form.method = 'POST';
	form.action = '/preview';
	form.target = '_blank';
	const input = document.createElement('input');
	input.type = 'hidden';
	input.name = 'data';
	input.value = JSON.stringify(out);
	form.appendChild(input);
	document.body.appendChild(form);
	form.submit();
	form.remove();
});

// ── Export ────────────────────────────────────────────────────────────────────

document.getElementById('btn-export').addEventListener('click', () => {
	const out = structuredClone(state);
	if (out.experience?.length && !entryHasContent(out.experience.at(-1), 'experience')) out.experience.pop();
	if (out.education?.length  && !entryHasContent(out.education.at(-1),  'education'))  out.education.pop();
	const theme = {};
	for (const [k, v] of Object.entries(themeColors)) {
		if (k === 'dark' && v === '#283649') continue;
		if (k === 'light' && v === '#9c7843') continue;
		theme[k] = v;
	}
	if (Object.keys(theme).length) out.theme = theme;
	else delete out.theme;
	if (out.photo?.startsWith('data:')) out.photo = '';

	const yaml = toYaml(out);
	const modal = document.createElement('div');
	modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;';
	modal.innerHTML = `
		<div style="background:var(--panel-dark);border:1px solid var(--light);border-radius:8px;padding:24px;width:min(700px,90vw);display:flex;flex-direction:column;gap:12px;">
			<div style="display:flex;justify-content:space-between;align-items:center;color:var(--text-dark);font-family:var(--condensed-font);">
				<strong>Export YAML</strong>
				<div style="display:flex;gap:8px;">
					<button id="modal-copy" style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:var(--button-dark);color:var(--button-text-dark);font-family:var(--condensed-font);">Copy</button>
					<button id="modal-close" style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:#444;color:white;font-family:var(--condensed-font);">✕</button>
				</div>
			</div>
			<textarea readonly style="font-family:var(--mono-font);font-size:12px;background:#0a0a0e;color:#ccc;border:1px solid var(--border-dark);border-radius:4px;padding:12px;height:60vh;resize:none;width:100%;"></textarea>
		</div>`;
	modal.querySelector('textarea').value = yaml;
	document.body.appendChild(modal);
	modal.querySelector('textarea').select();
	modal.querySelector('#modal-copy').addEventListener('click', function () {
		navigator.clipboard.writeText(modal.querySelector('textarea').value);
		this.textContent = 'Copied!';
		setTimeout(() => this.textContent = 'Copy', 2000);
	});
	modal.querySelector('#modal-close').addEventListener('click', () => modal.remove());
	modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
});

})();
