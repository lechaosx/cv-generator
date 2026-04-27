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

// Generic content check — works for any entry shape.
function isEntryEmpty(entry) {
	if (!entry || typeof entry !== 'object') return true;
	for (const v of Object.values(entry)) {
		if (v == null) continue;
		if (typeof v === 'string') { if (v.trim()) return false; continue; }
		if (Array.isArray(v) && v.some(x => typeof x === 'string' ? x.trim() : (x && typeof x === 'object'))) return false;
	}
	return true;
}

// ── List state machine (REAL / DRAFT / EMPTY) ─────────────────────────────────
//
// Each editable list shares the same lifecycle:
//   REAL  — fully usable entry: kept in original position
//   DRAFT — partially filled: kept in original position (no data loss)
//   EMPTY — nothing filled: dropped (one trailing empty slot is appended when no DRAFT exists)
//
// Components plug in their own predicates + an "empty entry" factory.

function normalizeList(arr, isReal, isEmpty, makeEmpty, ghostFirst = false) {
	if (!Array.isArray(arr)) arr = [];
	const result = [];
	let hasDraft = false;
	for (const item of arr) {
		if (isReal(item)) result.push(item);
		else if (!isEmpty(item)) { result.push(item); hasDraft = true; }
	}
	if (!hasDraft) (ghostFirst ? result.unshift : result.push).call(result, makeEmpty());
	return result;
}

const isStringReal  = s => !!(s && String(s).trim());
const isStringEmpty = s => !s || !String(s).trim();
const makeEmptyStr  = () => '';

function normalizeInterests() {
	state.interests = normalizeList(state.interests, isStringReal, isStringEmpty, makeEmptyStr);
}

function normalizeBadges(idx) {
	const job = state.experience?.[idx];
	if (job) job.badges = normalizeList(job.badges, isStringReal, isStringEmpty, makeEmptyStr);
}

function normalizeLinks() {
	let arr = state.links;
	if (!Array.isArray(arr) && arr && typeof arr === 'object') {
		arr = Object.entries(arr).map(([platform, url]) => ({ platform: String(platform || ''), url: String(url || '') }));
	}
	state.links = normalizeList(arr,
		l => !!((l.platform || '').trim() && (l.url || '').trim()),
		l => !(l.platform || '').trim() && !(l.url || '').trim(),
		() => ({ platform: '', url: '' })
	);
}

function normalizeExperience() {
	state.experience = normalizeList(state.experience,
		e => !!(e.company?.trim() && e.title?.trim()),
		isEntryEmpty,
		() => ({ company: '', title: '', start_month: '', start_year: '', end_month: '', end_year: '', description: [], badges: [] }),
		true
	);
}

function normalizeEducation() {
	state.education = normalizeList(state.education,
		e => !!(e.institution?.trim() && e.title?.trim()),
		isEntryEmpty,
		() => ({ institution: '', title: '', subinstitution: '', start_month: '', start_year: '', end_month: '', end_year: '', description: [] }),
		true
	);
}

function syncExperience() { normalizeExperience(); persist(); timelineRenderers.experience?.(); }
function syncEducation()  { normalizeEducation();  persist(); timelineRenderers.education?.();  }

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

	/* drag-and-drop reordering */
	[draggable="true"].drag-item,
	[draggable="true"].edit-link-row,
	[draggable="true"].timeline-entry { cursor: grab; }
	[draggable="true"].drag-item:active,
	[draggable="true"].edit-link-row:active,
	[draggable="true"].timeline-entry:active { cursor: grabbing; }
	.dragging { opacity: .4; }
`;
document.head.appendChild(style);

// ── Text editing ──────────────────────────────────────────────────────────────

function setupEditable(el, path, placeholder, afterBlur = persist) {
	el.contentEditable = 'true';
	el.draggable = false;
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
		afterBlur();
	});
	el.addEventListener('keydown', e => {
		if (e.key === 'Escape') { el.textContent = el.dataset.before || ''; el.blur(); }
		else if (e.key === 'Enter' && !e.shiftKey && !el.matches('p')) { e.preventDefault(); el.blur(); }
	});
}

// ── Drag-and-drop reordering ──────────────────────────────────────────────────

// Disable drag when mousedown lands on editable text — gives back native text selection.
function dragOnlyOutsideText(el) {
	el.addEventListener('mousedown', e => {
		el.draggable = !e.target.closest('[contenteditable="true"]');
	});
	el.addEventListener('mouseup', () => { el.draggable = true; });
}

function enableDragSort(container, itemSelector, getList, setList, onChange, axis = 'v') {
	// Drop-indicator approach: a thin line shows where the dragged item will
	// land. State is updated only on drop (no DOM manipulation during dragover).
	let dragKey = null;
	let dropTarget = null; // { key, before }

	function removeLine() { document.getElementById('drop-line')?.remove(); }

	function showLine(targetEls, before) {
		removeLine();
		const first = targetEls[0].getBoundingClientRect();
		const last  = targetEls[targetEls.length - 1].getBoundingClientRect();
		const line = document.createElement('div');
		line.id = 'drop-line';
		line.style.cssText = 'position:absolute;background:var(--light);z-index:9999;pointer-events:none;border-radius:1px;';
		if (axis === 'h') {
			const x = before ? first.left : last.right;
			line.style.left   = (x + scrollX - 1) + 'px';
			line.style.top    = (first.top + scrollY) + 'px';
			line.style.width  = '2px';
			line.style.height = (first.bottom - first.top) + 'px';
		} else {
			const y = before ? first.top : last.bottom;
			line.style.left   = (first.left + scrollX) + 'px';
			line.style.top    = (y + scrollY - 1) + 'px';
			line.style.width  = (last.right - first.left) + 'px';
			line.style.height = '2px';
		}
		document.body.appendChild(line);
	}

	container.addEventListener('dragstart', e => {
		const item = e.target.closest(itemSelector);
		if (!item || item.dataset.dragIdx == null || !container.contains(item)) return;
		e.stopPropagation();
		dragKey = item.dataset.dragIdx;
		container.querySelectorAll(`${itemSelector}[data-drag-idx="${CSS.escape(dragKey)}"]`)
			.forEach(el => el.classList.add('dragging'));
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', '');
	});

	container.addEventListener('dragover', e => {
		if (dragKey == null) return;
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = 'move';

		const target = e.target.closest(itemSelector);
		if (!target || target.dataset.dragIdx == null || !container.contains(target) || target.dataset.dragIdx === dragKey) {
			removeLine();
			dropTarget = null;
			return;
		}

		const rect = target.getBoundingClientRect();
		const before = axis === 'h'
			? e.clientX < rect.left + rect.width / 2
			: e.clientY < rect.top + rect.height / 2;

		const targetEls = [...container.querySelectorAll(`${itemSelector}[data-drag-idx="${CSS.escape(target.dataset.dragIdx)}"]`)];
		if (!targetEls.length) return;
		showLine(targetEls, before);
		dropTarget = { key: target.dataset.dragIdx, before };
	});

	container.addEventListener('dragleave', e => {
		if (!container.contains(e.relatedTarget)) { removeLine(); dropTarget = null; }
	});

	container.addEventListener('drop', e => {
		if (dragKey == null) return;
		e.preventDefault();
		e.stopPropagation();
		if (dropTarget && dropTarget.key !== dragKey) {
			const fromIdx = +dragKey;
			const toIdx   = +dropTarget.key;
			let insertAt = toIdx + (dropTarget.before ? 0 : 1);
			if (fromIdx < insertAt) insertAt--;
			const list = [...getList()];
			const [moved] = list.splice(fromIdx, 1);
			list.splice(insertAt, 0, moved);
			setList(list);
		}
	});

	container.addEventListener('dragend', e => {
		if (dragKey == null) return;
		e.stopPropagation();
		container.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
		removeLine();
		dragKey = null;
		dropTarget = null;
		onChange();
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

function renderStatic() {
	for (const [getter, path, placeholder] of FIELD_MAP) {
		const el = getter();
		if (!el) continue;
		if (!el.classList.contains('cv-field')) {
			setupEditable(el, path, placeholder);
		} else {
			const v = getPath(state, path);
			el.innerHTML = '';
			if (v != null && v !== '') el.textContent = Array.isArray(v) ? v.join(' ') : v;
		}
	}
}

// ── Ghost list (interests & badges) ──────────────────────────────────────────

// makeStringList — for atomic-string lists (interests, badges).
// State must already be normalised (real strings + a trailing '' if no draft).
function makeStringList(container, get, set, normalize, placeholder) {
	function render() {
		container.innerHTML = '';
		const items = get();
		items.forEach((item, i) => {
			const wrap = document.createElement('span');
			wrap.className = 'drag-item';
			wrap.style.cssText = 'display:inline-flex;align-items:baseline;gap:2px;';

			if (item && String(item).trim()) {
				wrap.dataset.dragIdx = i;
				wrap.draggable = true;
				dragOnlyOutsideText(wrap);
			}

			const el = document.createElement('span');
			el.textContent = item;
			el.contentEditable = 'true';
			el.draggable = false;
			el.setAttribute('data-placeholder', placeholder);

			el.addEventListener('blur', () => {
				const val = el.textContent.trim();
				const next = [...get()];
				next[i] = val;
				set(next);
				normalize();
				persist();
				render();
			});
			el.addEventListener('keydown', e => {
				if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
				if (e.key === 'Escape') { el.textContent = item; el.blur(); }
			});

			wrap.appendChild(el);
			container.appendChild(wrap);
		});
	}

	if (!container.dataset.dragInited) {
		container.dataset.dragInited = '1';
		enableDragSort(container, '.drag-item', get, set, () => { normalize(); persist(); render(); }, 'h');
	}
	render();
}

function renderInterests() {
	const interestsEl = document.querySelector('.additional-info section:nth-child(2) p');
	if (!interestsEl) return;
	interestsEl.classList.add('badge-list');
	makeStringList(interestsEl,
		() => state.interests,
		v => { state.interests = v; },
		normalizeInterests,
		'Interest'
	);
}

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
		section.querySelectorAll('a').forEach(a => a.style.display = 'none');

		state.links.forEach((_, idx) => section.appendChild(makeRow(idx)));
	}

	function makeRow(idx) {
		const link = state.links[idx];
		const isEmpty = !((link.platform || '').trim() || (link.url || '').trim());

		const row = document.createElement('div');
		row.className = 'edit-link-row';
		row.style.cssText = 'display:flex;gap:6px;align-items:center;';

		if (!isEmpty) {
			row.dataset.dragIdx = idx;
			row.draggable = true;
			dragOnlyOutsideText(row);
		}

		const pEl = document.createElement('span');
		pEl.contentEditable = 'true';
		pEl.draggable = false;
		pEl.textContent = link.platform;
		pEl.style.cssText = 'min-width:60px;font-weight:bold;';
		pEl.setAttribute('data-placeholder', 'Platform');

		const sep = document.createElement('span');
		sep.textContent = '·';
		sep.style.opacity = '.4';

		const uEl = document.createElement('span');
		uEl.contentEditable = 'true';
		uEl.draggable = false;
		uEl.textContent = link.url;
		uEl.style.cssText = 'flex:1;';
		uEl.setAttribute('data-placeholder', 'URL');

		let saveTimer;
		function scheduleSave() {
			clearTimeout(saveTimer);
			saveTimer = setTimeout(() => {
				if (document.activeElement === pEl || document.activeElement === uEl) return;
				if (!state.links[idx]) return;
				state.links[idx].platform = pEl.textContent.trim();
				state.links[idx].url      = uEl.textContent.trim();
				normalizeLinks();
				persist();
				renderLinks();
			}, 100);
		}

		pEl.addEventListener('blur', scheduleSave);
		uEl.addEventListener('blur', scheduleSave);
		[pEl, uEl].forEach(el => {
			el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
		});

		row.append(pEl, sep, uEl);
		return row;
	}

	if (!section.dataset.dragInited) {
		section.dataset.dragInited = '1';
		enableDragSort(section, '.edit-link-row', () => state.links, v => { state.links = v; }, () => {
			normalizeLinks();
			persist();
			renderLinks();
		});
	}

	renderLinks();
}


// ── Materialize timeline entries ──────────────────────────────────────────────

function mkSpan(cls, path, ph, afterBlur) {
	const s = document.createElement('span');
	s.className = cls;
	setupEditable(s, path, ph, afterBlur);
	return s;
}

function makeDateRange(prefix, sync) {
	const startPart = document.createElement('span'); startPart.className = 'start-part';
	const smSep = document.createElement('span'); smSep.className = 'sm-sep'; smSep.textContent = '/';
	const rangeSep = document.createElement('span'); rangeSep.className = 'range-sep'; rangeSep.textContent = ' – ';
	startPart.append(
		mkSpan('start-month', `${prefix}.start_month`, 'MM',   sync), smSep,
		mkSpan('start-year',  `${prefix}.start_year`,  'YYYY', sync), rangeSep);

	const endPart = document.createElement('span'); endPart.className = 'end-part';
	const emSep = document.createElement('span'); emSep.className = 'em-sep'; emSep.textContent = '/';
	endPart.append(
		mkSpan('end-month', `${prefix}.end_month`, 'MM',   sync), emSep,
		mkSpan('end-year',  `${prefix}.end_year`,  'YYYY', sync));

	const presentText = document.createElement('span');
	presentText.className = 'present-text';
	presentText.textContent = 'present';

	const dates = document.createElement('div');
	dates.className = 'cv-dates';
	dates.append(startPart, endPart, presentText);
	return dates;
}

function materializeExpEntry(idx, timelineEl) {
	const isReal = !isEntryEmpty(state.experience[idx]);
	const left = document.createElement('div');
	left.classList.add('timeline-entry');
	if (isReal) { left.draggable = true; left.dataset.dragIdx = idx; dragOnlyOutsideText(left); }

	const company = document.createElement('strong');
	setupEditable(company, `experience.${idx}.company`, 'Company', syncExperience);

	const dates = makeDateRange(`experience.${idx}`, syncExperience);

	const badgeList = document.createElement('div');
	badgeList.className = 'badge-list';
	normalizeBadges(idx);
	makeStringList(badgeList,
		() => state.experience[idx]?.badges || [],
		v => { if (state.experience[idx]) state.experience[idx].badges = v; },
		() => normalizeBadges(idx),
		'Badge'
	);

	left.append(company, dates, badgeList);

	const right = document.createElement('div');
	right.classList.add('timeline-entry');
	if (isReal) { right.draggable = true; right.dataset.dragIdx = idx; dragOnlyOutsideText(right); }
	const title = document.createElement('strong');
	setupEditable(title, `experience.${idx}.title`, 'Title', syncExperience);
	const desc = document.createElement('p');
	setupEditable(desc, `experience.${idx}.description`, 'Description', syncExperience);

	right.append(title, desc);
	timelineEl.append(left, right);
}

function materializeEduEntry(idx, timelineEl) {
	const isReal = !isEntryEmpty(state.education[idx]);
	const left = document.createElement('div');
	left.classList.add('timeline-entry');
	if (isReal) { left.draggable = true; left.dataset.dragIdx = idx; dragOnlyOutsideText(left); }

	const institution = document.createElement('strong');
	setupEditable(institution, `education.${idx}.institution`, 'Institution', syncEducation);

	const eduSub = document.createElement('div');
	const eduSubSpan = document.createElement('span');
	setupEditable(eduSubSpan, `education.${idx}.subinstitution`, 'Faculty', syncEducation);
	eduSub.append(eduSubSpan);

	const dates = makeDateRange(`education.${idx}`, syncEducation);

	left.append(institution, eduSub, dates);

	const right = document.createElement('div');
	right.classList.add('timeline-entry');
	if (isReal) { right.draggable = true; right.dataset.dragIdx = idx; dragOnlyOutsideText(right); }
	const title = document.createElement('strong');
	setupEditable(title, `education.${idx}.title`, 'Title', syncEducation);
	const desc = document.createElement('p');
	setupEditable(desc, `education.${idx}.description`, 'Description', syncEducation);

	right.append(title, desc);
	timelineEl.append(left, right);
}

// ── Timeline renderers ────────────────────────────────────────────────────────

const expTimeline = document.querySelector('.timeline');
if (expTimeline) {
	timelineRenderers.experience = function renderExp() {
		expTimeline.innerHTML = '';
		state.experience.forEach((_, idx) => materializeExpEntry(idx, expTimeline));
	};
	enableDragSort(expTimeline, '.timeline-entry', () => state.experience, v => { state.experience = v; }, syncExperience);
}

const eduTimeline = document.querySelectorAll('.timeline')[1];
if (eduTimeline) {
	timelineRenderers.education = function renderEdu() {
		eduTimeline.innerHTML = '';
		state.education.forEach((_, idx) => materializeEduEntry(idx, eduTimeline));
	};
	enableDragSort(eduTimeline, '.timeline-entry', () => state.education, v => { state.education = v; }, syncEducation);
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

// ── Toolbar ───────────────────────────────────────────────────────────────────

const toolbar = document.createElement('div');
toolbar.id = 'edit-toolbar';
toolbar.innerHTML = `
	<span style="flex:1;opacity:.5">✏️ Click any text to edit</span>
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
	input.addEventListener('input', () => {
		themeColors[k] = input.value;
		root.style.setProperty(`--${k}`, input.value);
		persist();
	});
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

// ── State → YAML / preview ─────────────────────────────────────────────────────

function buildExport() {
	const out = structuredClone(state);

	// Drop the empty placeholder slot from every list (drafts with content are kept)
	const head = arr => { while (arr?.length && isEntryEmpty(arr[0])) arr.shift(); };
	head(out.experience);
	head(out.education);
	if (Array.isArray(out.interests)) out.interests = out.interests.filter(s => s && String(s).trim());
	if (Array.isArray(out.experience)) for (const job of out.experience) job.badges = (job.badges || []).filter(s => s && String(s).trim());

	// Links: array → dict, keeping only fully-filled entries
	if (Array.isArray(out.links)) {
		const dict = {};
		for (const { platform, url } of out.links) {
			const p = (platform || '').trim();
			const u = (url || '').trim();
			if (p && u) dict[p] = u;
		}
		if (Object.keys(dict).length) out.links = dict;
		else delete out.links;
	}

	const theme = {};
	for (const [k, v] of Object.entries(themeColors)) {
		if (k === 'dark' && v === '#283649') continue;
		if (k === 'light' && v === '#9c7843') continue;
		theme[k] = v;
	}
	if (Object.keys(theme).length) out.theme = theme;
	else delete out.theme;
	if (out.photo?.startsWith('data:')) out.photo = '';
	return out;
}

// ── Render: rebuild the entire view from state ────────────────────────────────

let yamlModal = null;

function render() {
	// Normalise every list — each enforces its own real/draft/empty invariants
	normalizeInterests();
	normalizeLinks();
	normalizeExperience();
	normalizeEducation();
	for (const i of state.experience.keys()) normalizeBadges(i);

	renderStatic();
	renderInterests();
	setupConnectEdit();
	timelineRenderers.experience?.();
	timelineRenderers.education?.();
	if (yamlModal) yamlModal.querySelector('textarea').value = toYaml(buildExport());
}

render();

// ── Preview ───────────────────────────────────────────────────────────────────

document.getElementById('btn-preview').addEventListener('click', () => {
	const form = document.createElement('form');
	form.method = 'POST';
	form.action = '/preview';
	form.target = '_blank';
	const input = document.createElement('input');
	input.type = 'hidden';
	input.name = 'data';
	input.value = JSON.stringify(buildExport());
	form.appendChild(input);
	document.body.appendChild(form);
	form.submit();
	form.remove();
});

// ── YAML editor ───────────────────────────────────────────────────────────────

document.getElementById('btn-export').addEventListener('click', () => {
	if (yamlModal) return;
	const yaml = toYaml(buildExport());
	yamlModal = document.createElement('div');
	yamlModal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;';
	yamlModal.innerHTML = `
		<div style="background:var(--panel-dark);border:1px solid var(--light);border-radius:8px;padding:24px;width:min(700px,90vw);display:flex;flex-direction:column;gap:12px;">
			<div style="display:flex;justify-content:space-between;align-items:center;color:var(--text-dark);font-family:var(--condensed-font);">
				<strong>YAML</strong>
				<div style="display:flex;gap:8px;">
					<button id="modal-apply" style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:var(--button-dark);color:var(--button-text-dark);font-family:var(--condensed-font);">Apply</button>
					<button id="modal-copy"  style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:var(--button-dark);color:var(--button-text-dark);font-family:var(--condensed-font);">Copy</button>
					<button id="modal-close" style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:#444;color:white;font-family:var(--condensed-font);">✕</button>
				</div>
			</div>
			<textarea spellcheck="false" style="font-family:var(--mono-font);font-size:12px;background:#0a0a0e;color:#ccc;border:1px solid var(--border-dark);border-radius:4px;padding:12px;height:60vh;resize:none;width:100%;"></textarea>
			<div id="yaml-error" style="color:#e07070;font-family:var(--mono-font);font-size:12px;display:none;white-space:pre-wrap;"></div>
		</div>`;
	const textarea = yamlModal.querySelector('textarea');
	const errEl    = yamlModal.querySelector('#yaml-error');
	textarea.value = yaml;
	document.body.appendChild(yamlModal);

	yamlModal.querySelector('#modal-apply').addEventListener('click', () => {
		try {
			const parsed = jsyaml.load(textarea.value);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('YAML must be a mapping');
			for (const k of Object.keys(state)) delete state[k];
			Object.assign(state, parsed);
			persist();
			errEl.style.display = 'none';
			render();
		} catch (e) {
			errEl.textContent = String(e.message || e);
			errEl.style.display = 'block';
		}
	});
	yamlModal.querySelector('#modal-copy').addEventListener('click', function () {
		navigator.clipboard.writeText(textarea.value);
		this.textContent = 'Copied!';
		setTimeout(() => this.textContent = 'Copy', 2000);
	});
	const close = () => { yamlModal.remove(); yamlModal = null; };
	yamlModal.querySelector('#modal-close').addEventListener('click', close);
	yamlModal.addEventListener('click', e => { if (e.target === yamlModal) close(); });
});

})();
