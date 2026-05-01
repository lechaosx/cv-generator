(() => {

const urlParams  = new URLSearchParams(location.search);
const seed       = urlParams.get('seed');
const tokenInUrl = urlParams.get('token');

if (seed && tokenInUrl) {
	localStorage.setItem(`cv-token:${seed}`, tokenInUrl);
	urlParams.delete('token');
	history.replaceState({}, '', location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : ''));
}

const editUrl     = urlParams.get('url');
const stateKey    = seed || (editUrl ? `url:${editUrl}` : location.host);
const token       = seed ? localStorage.getItem(`cv-token:${seed}`) : null;
const STORAGE_KEY = `cv-edit:${stateKey}`;
const COLORS_KEY  = `cv-edit-colors:${stateKey}`;
const LINKS_KEY   = `cv-edit-links:${stateKey}`;
const UNDO_KEY    = `cv-edit-undo:${stateKey}`;
const PHOTO_DB    = 'cv-edit';
const PHOTO_STORE = 'photo';
const PHOTO_REF_PREFIX = 'idb:';

function openPhotoDB() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(PHOTO_DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(PHOTO_STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror   = () => reject(req.error);
	});
}

async function idbGet(key) {
	try {
		const db = await openPhotoDB();
		return await new Promise(resolve => {
			const req = db.transaction(PHOTO_STORE, 'readonly').objectStore(PHOTO_STORE).get(key);
			req.onsuccess = () => resolve(req.result);
			req.onerror   = () => resolve(null);
		});
	} catch { return null; }
}

async function idbPut(key, value) {
	try {
		const db = await openPhotoDB();
		db.transaction(PHOTO_STORE, 'readwrite').objectStore(PHOTO_STORE).put(value, key);
	} catch (e) { console.warn('IndexedDB photo write failed:', e); }
}

const photoCache = new Map();

async function hashString(s) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

async function storePhotoData(dataUrl, name) {
	const hash = await hashString(dataUrl);
	const record = { data: dataUrl, name: name || `image-${hash.slice(0, 8)}` };
	if (!photoCache.has(hash)) {
		photoCache.set(hash, record);
		await idbPut(hash, record);
	}
	return PHOTO_REF_PREFIX + hash;
}

async function resolvePhotoRef(ref) {
	if (!ref) return null;
	if (!ref.startsWith(PHOTO_REF_PREFIX)) return { data: ref };
	const hash = ref.slice(PHOTO_REF_PREFIX.length);
	if (photoCache.has(hash)) return photoCache.get(hash);
	let record = await idbGet(hash);
	if (typeof record === 'string') record = { data: record, name: `image-${hash.slice(0, 8)}` };
	if (record) photoCache.set(hash, record);
	return record;
}

async function ensureRef(value, name) {
	if (!value) return '';
	if (value.startsWith('data:')) return await storePhotoData(value, name);
	return value;
}

const saved = localStorage.getItem(STORAGE_KEY);
const state = saved ? JSON.parse(saved) : structuredClone(window.CV_DATA);
const LABELS = window.CV_LABELS || { en: {} };
if (!state.language || !LABELS[state.language]) state.language = 'en';
let themeColors = {};
let colorLinks  = {};
const colorInputs = {};
const timelineRenderers = {};

function t(key) {
	return (LABELS[state.language] || LABELS.en || {})[key] || key;
}

function updateLabels() {
	document.querySelectorAll('[data-label]').forEach(el => {
		el.textContent = t(el.dataset.label);
	});
	document.querySelectorAll('[data-placeholder-key]').forEach(el => {
		el.setAttribute('data-placeholder', t(el.dataset.placeholderKey));
	});
	document.documentElement.lang = state.language;
	const ls = document.getElementById('lang-select');
	if (ls && ls.value !== state.language) ls.value = state.language;
}

function persistRaw(snapshot) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	localStorage.setItem(COLORS_KEY, JSON.stringify(themeColors));
	const linkDelta = {};
	for (const [k, v] of Object.entries(colorLinks)) {
		if (BASE_LINKS[k] !== v) linkDelta[k] = v;
	}
	for (const k of Object.keys(BASE_LINKS)) {
		if (!colorLinks[k]) linkDelta[k] = '';
	}
	localStorage.setItem(LINKS_KEY, JSON.stringify(linkDelta));
	lastSaved = snapshot ?? captureSnapshot();
}

function persist() {
	const current = captureSnapshot();
	trackUndo(current);
	persistRaw(current);
}

function trackUndo(current) {
	if (!lastSaved) return;
	if (JSON.stringify(current) === JSON.stringify(lastSaved)) return;
	undoStack.push(lastSaved);
	if (undoStack.length > 100) undoStack.shift();
	redoStack = [];
	saveUndoHistory();
	updateUndoButtons();
}

// ── Undo / Redo ───────────────────────────────────────────────────────────────

let undoStack = [];
let redoStack = [];
let lastSaved  = null;

function captureSnapshot() {
	return {
		state:       JSON.parse(JSON.stringify(state)),
		themeColors: JSON.parse(JSON.stringify(themeColors)),
		colorLinks:  JSON.parse(JSON.stringify(colorLinks)),
	};
}

function saveUndoHistory() {
	try { localStorage.setItem(UNDO_KEY, JSON.stringify({ u: undoStack, r: redoStack, ts: Date.now() })); } catch(e) {}
}

function loadUndoHistory() {
	try {
		const raw = localStorage.getItem(UNDO_KEY);
		if (!raw) return;
		const saved = JSON.parse(raw);
		if (Date.now() - saved.ts > 7 * 24 * 60 * 60 * 1000) return;
		undoStack = saved.u || [];
		redoStack = saved.r || [];
	} catch(e) {}
}

function updateUndoButtons() {
	const u = document.getElementById('btn-undo');
	const r = document.getElementById('btn-redo');
	if (u) u.disabled = !undoStack.length;
	if (r) r.disabled = !redoStack.length;
}


function restoreSnapshot(snap) {
	for (const k of Object.keys(state)) delete state[k];
	Object.assign(state, JSON.parse(JSON.stringify(snap.state)));
	for (const k of Object.keys(themeColors)) delete themeColors[k];
	Object.assign(themeColors, JSON.parse(JSON.stringify(snap.themeColors)));
	for (const k of Object.keys(colorLinks)) delete colorLinks[k];
	Object.assign(colorLinks, JSON.parse(JSON.stringify(snap.colorLinks)));
	for (const k of themeKeys) {
		const link = colorLinks[k];
		root.style.setProperty(`--${k}`, link ? (themeColors[link] || '#000000') : (themeColors[k] || ''));
	}
	buildColorPanelContent();
	render();
	persistRaw();
	updateUndoButtons();
}

function performUndo() {
	if (!undoStack.length) return;
	redoStack.push(captureSnapshot());
	restoreSnapshot(undoStack.pop());
	saveUndoHistory();
}

function performRedo() {
	if (!redoStack.length) return;
	undoStack.push(captureSnapshot());
	restoreSnapshot(redoStack.pop());
	saveUndoHistory();
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
	for (const i of state.experience.keys()) normalizeBadges(i);
}

function normalizeEducation() {
	state.education = normalizeList(state.education,
		e => !!(e.institution?.trim() && e.title?.trim()),
		isEntryEmpty,
		() => ({ institution: '', title: '', subinstitution: '', start_month: '', start_year: '', end_month: '', end_year: '', description: [] }),
		true
	);
}

function syncExperience(e) {
	normalizeExperience(); persist();
	if (!expTimeline?.contains(e?.relatedTarget)) timelineRenderers.experience?.();
}
function syncEducation(e) {
	normalizeEducation(); persist();
	if (!eduTimeline?.contains(e?.relatedTarget)) timelineRenderers.education?.();
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
	.cv-field[contenteditable="false"] { user-select: none; }
	.cv-field:hover { outline: 1px dashed var(--border); border-radius: 2px; }

	body.drag-active:not(.photo-modal-open) .photo.drop-target img,
	body.drag-active:not(.photo-modal-open) .photo.drop-target svg,
	body.drag-active input.drop-target { box-shadow: 0 0 0 2px var(--border); transition: box-shadow .15s; }
	body:not(.photo-modal-open) .photo.drop-target.dropping img,
	body:not(.photo-modal-open) .photo.drop-target.dropping svg,
	input.drop-target.dropping { box-shadow: 0 0 0 4px var(--light) !important; }


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
	#edit-toolbar button,
	#edit-toolbar select {
		padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer;
		background: var(--button-dark); color: var(--button-text-dark);
		font-family: var(--condensed-font); font-size: 14px;
	}
	#edit-toolbar button:hover, #edit-toolbar select:hover { opacity: .8; }
	#edit-toolbar button:disabled { opacity: .3; cursor: default; pointer-events: none; }
	#btn-reset { background: #5a2a2a !important; color: white !important; }
	#edit-color-panel {
		position: fixed; bottom: 52px; right: 20px; z-index: 9998;
		background: var(--panel-dark); border: 1px solid var(--light); border-radius: 8px;
		padding: 16px; display: none; flex-direction: column; gap: 12px;
		font-family: var(--condensed-font); font-size: 13px; color: var(--text-dark);
	}
	#edit-color-panel input[type=color] {
		padding: 0; border: 1px solid var(--border);
		cursor: pointer; border-radius: 4px; background: none;
	}
	.color-base-row {
		display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
	}
	.color-swatch {
		display: flex; flex-direction: column; align-items: center; gap: 4px;
	}
	.color-swatch input[type=color] {
		width: 44px; height: 36px; border-radius: 6px;
	}
	.color-swatch label {
		font-size: 11px; text-align: center; opacity: .75; white-space: nowrap;
	}
	.color-variants {
		display: grid; grid-template-columns: 1fr auto auto;
		row-gap: 5px; column-gap: 10px; align-items: center;
		border-top: 1px solid rgba(255,255,255,.15); padding-top: 10px;
	}
	.color-col-title {
		font-weight: bold; opacity: .8; font-size: 12px; text-transform: uppercase;
		letter-spacing: .05em; text-align: center;
	}
	.color-variant-controls {
		display: flex; align-items: center; gap: 4px;
	}
	.color-variant-controls input[type=color] {
		width: 32px; height: 24px; border-radius: 4px; flex-shrink: 0;
	}
	.color-reset-btn {
		flex-shrink: 0; background: none; border: none; color: inherit;
		cursor: pointer; opacity: .35; font-size: 13px; padding: 0; line-height: 1;
	}
	.color-reset-btn:hover { opacity: 1; }
	.color-link-dots {
		display: flex; gap: 6px; align-items: center; flex-shrink: 0;
	}
	.color-link-dot {
		width: 13px; height: 13px; border-radius: 50%; flex-shrink: 0;
		border: 2px solid transparent; cursor: pointer; padding: 0;
		outline: 1px solid rgba(255,255,255,.25);
		outline-offset: 0;
	}
	.color-link-dot.active {
		outline: 2px solid rgba(255,255,255,.85); outline-offset: 1px;
	}

	/* drag-and-drop reordering */
	[draggable="true"].drag-item,
	[draggable="true"].edit-link-row,
	[draggable="true"].timeline-entry { cursor: grab; }
	[draggable="true"].drag-item:active,
	[draggable="true"].edit-link-row:active,
	[draggable="true"].timeline-entry:active { cursor: grabbing; }
	.drag-item > *,
	.edit-link-row > span { cursor: text; }
	.dragging { opacity: .4; }
`;
document.head.appendChild(style);

// ── Text editing ──────────────────────────────────────────────────────────────

function placeCaretAtPoint(x, y) {
	let range;
	if (document.caretRangeFromPoint) {
		range = document.caretRangeFromPoint(x, y);
	} else if (document.caretPositionFromPoint) {
		const pos = document.caretPositionFromPoint(x, y);
		if (pos) {
			range = document.createRange();
			range.setStart(pos.offsetNode, pos.offset);
			range.collapse(true);
		}
	}
	if (range) {
		const sel = window.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);
	}
}

function activateOnInteract(el) {
	function enterEdit(x, y) {
		el.contentEditable = 'true';
		el.focus();
		if (x != null) placeCaretAtPoint(x, y);
	}
	el.addEventListener('dblclick', e => {
		if (el.contentEditable === 'true') return;
		e.stopPropagation(); e.preventDefault();
		enterEdit(e.clientX, e.clientY);
	});
	let pressTimer;
	el.addEventListener('touchstart', e => {
		if (el.contentEditable === 'true') return;
		const t = e.touches[0];
		const x = t?.clientX, y = t?.clientY;
		pressTimer = setTimeout(() => { e.preventDefault(); enterEdit(x, y); }, 500);
	}, { passive: false });
	el.addEventListener('touchmove',  () => clearTimeout(pressTimer));
	el.addEventListener('touchend',   () => clearTimeout(pressTimer));
}

function setupEditable(el, path, placeholderKey, afterBlur = persist) {
	const v = getPath(state, path);
	const hasValue = v != null && (Array.isArray(v) ? v.some(x => String(x).trim()) : String(v).trim() !== '');
	const immediate = !hasValue;

	el.contentEditable = immediate ? 'true' : 'false';
	el.draggable = false;
	el.classList.add('cv-field');
	el.dataset.placeholderKey = placeholderKey;
	el.setAttribute('data-placeholder', t(placeholderKey));

	if (v != null) {
		if (Array.isArray(v)) el.textContent = v.join(' ');
		else { el.innerHTML = ''; el.textContent = v; }
	}

	if (!immediate) activateOnInteract(el);

	el.addEventListener('focus', () => { el.dataset.before = el.textContent; });
	el.addEventListener('blur', e => {
		if (!immediate) el.contentEditable = 'false';
		let value = el.textContent.trim();
		if (!value) el.innerHTML = '';
		if (path.endsWith('.description')) value = value ? [value] : [];
		setPath(state, path, value);
		afterBlur(e);
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

// Static field map — [getter, statePath, placeholderKey]
const FIELD_MAP = [
	[() => document.querySelectorAll('.main-info .title')[0], 'title_before_name', 'title'],
	[() => document.querySelector('h1'),                      'name',              'full_name'],
	[() => document.querySelectorAll('.main-info .title')[1], 'title_after_name',  'title'],
	[() => document.querySelector('.position'),               'position',          'job_position'],
	[() => document.querySelector('.contact-list div:nth-child(1) span'), 'location', 'location'],
	[() => document.querySelector('.contact-list div:nth-child(2) span'), 'phone',    'phone'],
	[() => document.querySelector('.contact-list div:nth-child(3) span'), 'email',    'email'],
	[() => document.querySelector('.additional-info section:first-child p'), 'description', 'description'],
];

function renderStatic() {
	for (const [getter, path, placeholderKey] of FIELD_MAP) {
		const el = getter();
		if (!el) continue;
		if (!el.classList.contains('cv-field')) {
			setupEditable(el, path, placeholderKey);
		} else {
			el.dataset.placeholderKey = placeholderKey;
			el.setAttribute('data-placeholder', t(placeholderKey));
			const v = getPath(state, path);
			el.innerHTML = '';
			if (v != null && v !== '') el.textContent = Array.isArray(v) ? v.join(' ') : v;
		}
	}
}

// ── Ghost list (interests & badges) ──────────────────────────────────────────

// makeStringList — for atomic-string lists (interests, badges).
// State must already be normalised (real strings + a trailing '' if no draft).
function makeStringList(container, get, set, normalize, placeholderKey) {
	function render() {
		container.innerHTML = '';
		const items = get();
		items.forEach((item, i) => {
			const isNonEmpty = !!(item && String(item).trim());
			const wrap = document.createElement('span');
			wrap.className = 'drag-item';
			wrap.style.cssText = 'display:inline-flex;align-items:baseline;gap:2px;';

			if (isNonEmpty) {
				wrap.dataset.dragIdx = i;
				wrap.draggable = true;
			}

			const el = document.createElement('span');
			el.textContent = item;
			el.contentEditable = isNonEmpty ? 'false' : 'true';
			el.draggable = false;
			el.dataset.placeholderKey = placeholderKey;
			el.setAttribute('data-placeholder', t(placeholderKey));

			if (isNonEmpty) {
				const enterEdit = (x, y) => {
					wrap.draggable = false;
					el.contentEditable = 'true';
					el.focus();
					if (x != null) placeCaretAtPoint(x, y);
				};
				el.addEventListener('dblclick', e => {
					if (el.contentEditable === 'true') return;
					e.stopPropagation(); e.preventDefault();
					enterEdit(e.clientX, e.clientY);
				});
				let pressTimer;
				el.addEventListener('touchstart', e => {
					if (el.contentEditable === 'true') return;
					const t = e.touches[0];
					const x = t?.clientX, y = t?.clientY;
					pressTimer = setTimeout(() => { e.preventDefault(); enterEdit(x, y); }, 500);
				}, { passive: false });
				el.addEventListener('touchmove',  () => clearTimeout(pressTimer));
				el.addEventListener('touchend',   () => clearTimeout(pressTimer));
			}

			el.addEventListener('blur', e => {
				if (isNonEmpty) { el.contentEditable = 'false'; wrap.draggable = true; }
				const val = el.textContent.trim();
				const next = [...get()];
				next[i] = val;
				set(next);
				normalize();
				persist();
				if (!container.contains(e.relatedTarget)) render();
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
	const section = document.querySelector('.additional-info section:nth-child(2)');
	if (!section) return;
	let interestsEl = section.querySelector('.badge-list');
	if (!interestsEl) {
		const p = section.querySelector('p');
		if (!p) return;
		interestsEl = document.createElement('div');
		interestsEl.className = 'badge-list';
		p.replaceWith(interestsEl);
	}
	makeStringList(interestsEl,
		() => state.interests,
		v => { state.interests = v; },
		normalizeInterests,
		'interest'
	);
}

// ── Photo ─────────────────────────────────────────────────────────────────────

const PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
	<circle cx="50" cy="50" r="50" fill="var(--white)"/>
	<circle cx="50" cy="38" r="18" fill="var(--light)"/>
	<ellipse cx="50" cy="90" rx="30" ry="22" fill="var(--light)"/>
</svg>`;

function attachImageDrop(el, onResult) {
	el.classList.add('drop-target');
	el.ondragenter = e => {
		e.preventDefault(); e.stopPropagation();
		el.classList.add('dropping');
	};
	el.ondragover = e => { e.preventDefault(); e.stopPropagation(); };
	el.ondragleave = e => {
		if (!el.contains(e.relatedTarget)) el.classList.remove('dropping');
	};
	el.ondrop = e => {
		e.preventDefault(); e.stopPropagation();
		el.classList.remove('dropping');
		const file = e.dataTransfer?.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = () => onResult(reader.result, file.name);
			reader.readAsDataURL(file);
			return;
		}
		const fromUriList = (e.dataTransfer?.getData('text/uri-list') || '')
			.split(/\r?\n/).find(l => l && !l.startsWith('#'));
		const url = (fromUriList || e.dataTransfer?.getData('text/plain') || '').trim();
		if (url) onResult(url);
	};
}

let dragActiveTimer;
document.addEventListener('dragover', () => {
	document.body.classList.add('drag-active');
	clearTimeout(dragActiveTimer);
	dragActiveTimer = setTimeout(() => document.body.classList.remove('drag-active'), 100);
}, true);
document.addEventListener('drop', () => {
	clearTimeout(dragActiveTimer);
	document.body.classList.remove('drag-active');
});

async function commitPhoto(value, name) {
	state.photo = await ensureRef(value, name);
	renderPhoto();
	setTimeout(persist, 0);
}

async function renderPhoto() {
	const photoDiv = document.querySelector('.photo');
	if (!photoDiv) return;
	photoDiv.style.cursor = 'pointer';
	photoDiv.title = 'Click to edit photo, or drop an image';
	photoDiv.onclick = openPhotoEdit;
	attachImageDrop(photoDiv, commitPhoto);
	const ref = state.photo;
	if (!ref) { photoDiv.innerHTML = PHOTO_SVG; return; }
	const record = await resolvePhotoRef(ref);
	if (state.photo !== ref) return; // stale render
	if (!record?.data) { photoDiv.innerHTML = PHOTO_SVG; return; }
	const img = document.createElement('img');
	img.alt = '';
	img.width = 400;
	img.onerror = () => { photoDiv.innerHTML = PHOTO_SVG; };
	img.src = record.data;
	photoDiv.innerHTML = '';
	photoDiv.appendChild(img);
}

function openPhotoEdit() {
	const modal = document.createElement('div');
	modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;';
	modal.innerHTML = `
		<div style="background:var(--panel-dark);border:1px solid var(--light);border-radius:8px;padding:24px;width:min(500px,90vw);display:flex;flex-direction:column;gap:12px;color:var(--text-dark);font-family:var(--condensed-font);">
			<strong>Photo URL</strong>
			<input type="url" id="photo-url" placeholder="https://..." style="padding:6px;border-radius:4px;border:1px solid var(--border-dark);background:#0a0a0e;color:#ccc;font-family:var(--mono-font);font-size:12px;">
			<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
				<button id="photo-reset" title="Reset to default" style="background:none;border:none;color:inherit;cursor:pointer;opacity:.5;font-size:18px;padding:0;line-height:1;">↺</button>
				<div style="display:flex;gap:8px;">
					<button id="photo-cancel" style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:#444;color:white;font-family:var(--condensed-font);">Cancel</button>
					<button id="photo-apply" style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:var(--button-dark);color:var(--button-text-dark);font-family:var(--condensed-font);">Apply</button>
				</div>
			</div>
		</div>`;
	document.body.appendChild(modal);
	document.body.classList.add('photo-modal-open');

	const urlEl = modal.querySelector('#photo-url');
	let pendingRef = state.photo || '';
	let typedMode = false;

	const refToDisplay = ref => {
		if (!ref) return '';
		if (!ref.startsWith(PHOTO_REF_PREFIX)) return ref;
		const hash = ref.slice(PHOTO_REF_PREFIX.length);
		return photoCache.get(hash)?.name || hash;
	};

	resolvePhotoRef(pendingRef).then(() => { urlEl.value = refToDisplay(pendingRef); });
	urlEl.value = refToDisplay(pendingRef);
	urlEl.focus();

	urlEl.addEventListener('input', () => { typedMode = true; });
	attachImageDrop(urlEl, async (value, name) => {
		typedMode = false;
		if (value.startsWith('data:')) {
			pendingRef = await storePhotoData(value, name);
		} else {
			pendingRef = value;
		}
		urlEl.value = refToDisplay(pendingRef);
	});

	const close = () => {
		document.body.classList.remove('photo-modal-open');
		modal.remove();
	};
	const apply = () => {
		close();
		if (typedMode) commitPhoto(urlEl.value.trim());
		else if (pendingRef !== state.photo) commitPhoto(pendingRef);
	};
	urlEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
	modal.querySelector('#photo-apply').addEventListener('click', apply);
	modal.querySelector('#photo-reset').addEventListener('click', () => {
		pendingRef = window.CV_DATA?.photo || '';
		typedMode = false;
		resolvePhotoRef(pendingRef).then(() => { urlEl.value = refToDisplay(pendingRef); });
		urlEl.value = refToDisplay(pendingRef);
	});
	modal.querySelector('#photo-cancel').addEventListener('click', close);
	modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

// ── Connect / links ───────────────────────────────────────────────────────────

function setupConnectEdit() {
	const additionalInfo = document.querySelector('.additional-info');
	let section = additionalInfo.querySelector('.connect');
	if (!section) {
		section = document.createElement('section');
		section.className = 'connect';
		section.innerHTML = `<h2 class="section-header" data-label="connect">${t('connect')}</h2>`;
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

		const pEmpty = !(link.platform || '').trim();
		const uEmpty = !(link.url || '').trim();

		const pEl = document.createElement('span');
		pEl.contentEditable = pEmpty ? 'true' : 'false';
		pEl.draggable = false;
		pEl.textContent = link.platform;
		pEl.style.cssText = 'min-width:60px;font-weight:bold;';
		pEl.dataset.placeholderKey = 'platform';
		pEl.setAttribute('data-placeholder', t('platform'));
		if (!pEmpty) activateOnInteract(pEl);

		const sep = document.createElement('span');
		sep.textContent = '·';
		sep.style.opacity = '.4';

		const uEl = document.createElement('span');
		uEl.contentEditable = uEmpty ? 'true' : 'false';
		uEl.draggable = false;
		uEl.textContent = link.url;
		uEl.style.cssText = 'flex:1;';
		uEl.dataset.placeholderKey = 'url';
		uEl.setAttribute('data-placeholder', t('url'));
		if (!uEmpty) activateOnInteract(uEl);

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

		pEl.addEventListener('blur', () => { if (!pEmpty) pEl.contentEditable = 'false'; scheduleSave(); });
		uEl.addEventListener('blur', () => { if (!uEmpty) uEl.contentEditable = 'false'; scheduleSave(); });
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
	presentText.dataset.label = 'present';
	presentText.textContent = t('present');

	const dates = document.createElement('div');
	dates.className = 'cv-dates';
	dates.append(startPart, endPart, presentText);
	return dates;
}

function materializeExpEntry(idx, timelineEl) {
	const entry = state.experience[idx];
	const isReal = !!(entry?.company?.trim() && entry?.title?.trim());
	const left = document.createElement('div');
	left.classList.add('timeline-entry');
	if (isReal) { left.draggable = true; left.dataset.dragIdx = idx; dragOnlyOutsideText(left); }

	const company = document.createElement('strong');
	setupEditable(company, `experience.${idx}.company`, 'company', syncExperience);

	const dates = makeDateRange(`experience.${idx}`, syncExperience);

	const badgeList = document.createElement('div');
	badgeList.className = 'badge-list';
	normalizeBadges(idx);
	makeStringList(badgeList,
		() => state.experience[idx]?.badges || [],
		v => { if (state.experience[idx]) state.experience[idx].badges = v; },
		() => normalizeBadges(idx),
		'badge'
	);

	left.append(company, dates, badgeList);

	const right = document.createElement('div');
	right.classList.add('timeline-entry');
	if (isReal) { right.draggable = true; right.dataset.dragIdx = idx; dragOnlyOutsideText(right); }
	const title = document.createElement('strong');
	setupEditable(title, `experience.${idx}.title`, 'title', syncExperience);
	const desc = document.createElement('p');
	setupEditable(desc, `experience.${idx}.description`, 'description', syncExperience);

	right.append(title, desc);
	timelineEl.append(left, right);
}

function materializeEduEntry(idx, timelineEl) {
	const entry = state.education[idx];
	const isReal = !!(entry?.institution?.trim() && entry?.title?.trim());
	const left = document.createElement('div');
	left.classList.add('timeline-entry');
	if (isReal) { left.draggable = true; left.dataset.dragIdx = idx; dragOnlyOutsideText(left); }

	const institution = document.createElement('strong');
	setupEditable(institution, `education.${idx}.institution`, 'institution', syncEducation);

	const eduSub = document.createElement('div');
	const eduSubSpan = document.createElement('span');
	setupEditable(eduSubSpan, `education.${idx}.subinstitution`, 'faculty', syncEducation);
	eduSub.append(eduSubSpan);

	const dates = makeDateRange(`education.${idx}`, syncEducation);

	left.append(institution, eduSub, dates);

	const right = document.createElement('div');
	right.classList.add('timeline-entry');
	if (isReal) { right.draggable = true; right.dataset.dragIdx = idx; dragOnlyOutsideText(right); }
	const title = document.createElement('strong');
	setupEditable(title, `education.${idx}.title`, 'title', syncEducation);
	const desc = document.createElement('p');
	setupEditable(desc, `education.${idx}.description`, 'description', syncEducation);

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

const { BASE_COLORS, DEFAULT_BASE_VALUES, DEFAULT_LINKS } = (() => {
	const BASE_COLORS = [], DEFAULT_BASE_VALUES = {}, DEFAULT_LINKS = {};
	for (const sheet of document.styleSheets) {
		if (!sheet.href?.includes('/static/style.css')) continue;
		try {
			for (const rule of sheet.cssRules) {
				if (rule.selectorText !== ':root') continue;
				for (let i = 0; i < rule.style.length; i++) {
					const prop = rule.style[i];
					if (!prop.startsWith('--')) continue;
					const key = prop.slice(2);
					const val = rule.style.getPropertyValue(prop).trim();
					if (val.startsWith('#')) { BASE_COLORS.push(key); DEFAULT_BASE_VALUES[key] = val; }
				}
				for (let i = 0; i < rule.style.length; i++) {
					const prop = rule.style[i];
					if (!prop.startsWith('--')) continue;
					const key = prop.slice(2);
					const val = rule.style.getPropertyValue(prop).trim();
					const m = val.match(/^var\(--([a-z-]+)\)$/);
					if (m && BASE_COLORS.includes(m[1])) DEFAULT_LINKS[key] = m[1];
				}
				break;
			}
		} catch {}
	}
	return { BASE_COLORS, DEFAULT_BASE_VALUES, DEFAULT_LINKS };
})();

const VARIANT_KEYS  = Object.keys(DEFAULT_LINKS);
const PANEL_COLORS  = VARIANT_KEYS.filter(k => k.startsWith('panel'));
const DARK_COLORS   = VARIANT_KEYS.filter(k => k.endsWith('-dark')  && !k.startsWith('panel'));
const LIGHT_COLORS  = VARIANT_KEYS.filter(k => k.endsWith('-light') && !k.startsWith('panel'));
const LINK_BASES    = [...new Set(Object.values(DEFAULT_LINKS))].sort((a, b) => BASE_COLORS.indexOf(a) - BASE_COLORS.indexOf(b));

const BASE_LABEL_OVERRIDES = { light: 'Accent' };
const BASE_LABELS = Object.fromEntries(BASE_COLORS.map(k => [k, BASE_LABEL_OVERRIDES[k] || k.charAt(0).toUpperCase() + k.slice(1)]));

function variantLabel(key) {
	return key.replace(/-(dark|light)$/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const themeKeys = [...new Set([...BASE_COLORS, ...PANEL_COLORS, ...DARK_COLORS, ...LIGHT_COLORS,
	...Object.keys(state.theme || {}).filter(k => !BASE_COLORS.includes(k) && !PANEL_COLORS.includes(k) && !DARK_COLORS.includes(k) && !LIGHT_COLORS.includes(k))])];
const savedColors = JSON.parse(localStorage.getItem(COLORS_KEY) || '{}');
const BASE_LINKS = { ...DEFAULT_LINKS };
for (const [k, v] of Object.entries(state.theme || {})) {
	if (BASE_COLORS.includes(k) || PANEL_COLORS.includes(k)) continue;
	if (String(v).startsWith('--')) BASE_LINKS[k] = String(v).slice(2);
	else delete BASE_LINKS[k];
}
colorLinks = { ...BASE_LINKS };
const savedLinkDelta = JSON.parse(localStorage.getItem(LINKS_KEY) || '{}');
for (const [k, v] of Object.entries(savedLinkDelta)) {
	if (v) colorLinks[k] = v;
	else delete colorLinks[k];
}
for (const k of themeKeys) {
	themeColors[k] = savedColors[k] || resolveColor(state.theme?.[k] || computed.getPropertyValue(`--${k}`).trim());
	if (savedColors[k] && !colorLinks[k]) root.style.setProperty(`--${k}`, savedColors[k]);
}
// Apply linked component colors after base colors are initialized
for (const [ck, base] of Object.entries(colorLinks)) {
	if (!BASE_COLORS.includes(ck)) root.style.setProperty(`--${ck}`, themeColors[base] || '#000000');
}

// ── Toolbar ───────────────────────────────────────────────────────────────────

const toolbar = document.createElement('div');
toolbar.id = 'edit-toolbar';
toolbar.innerHTML = `
	<button id="btn-undo" title="Undo (Ctrl+Z)">↩</button>
	<button id="btn-redo" title="Redo (Ctrl+Y)">↪</button>
	<button id="btn-reset">Reset</button>
	<select id="lang-select" title="Language">
		${Object.keys(LABELS).map(code => `<option value="${code}">${({ en: 'English', cs: 'Čeština' })[code] || code}</option>`).join('')}
	</select>
	<button id="btn-colors">🎨 Colors</button>
	<span style="flex:1"></span>
	<button id="btn-export">📋 YAML</button>
	<button id="btn-preview">Preview</button>
`;
document.body.appendChild(toolbar);
document.body.style.paddingBottom = toolbar.offsetHeight + 'px';

if (seed) {
	const roUrl = `${location.origin}/?seed=${encodeURIComponent(seed)}`;
	const rwUrl = token ? `${location.origin}/edit?seed=${encodeURIComponent(seed)}&token=${encodeURIComponent(token)}` : null;

	const sharePanel = document.createElement('div');
	sharePanel.id = 'share-panel';
	sharePanel.style.cssText = `
		position:fixed; bottom:52px; right:20px; z-index:9998;
		background:var(--panel-dark); border:1px solid var(--light); border-radius:8px;
		padding:16px; display:none; flex-direction:column; gap:10px;
		font-family:var(--condensed-font); font-size:13px; color:var(--text-dark); min-width:340px;
	`;

	function makeShareRow(label, url) {
		const row = document.createElement('div');
		row.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
		const lbl = document.createElement('span');
		lbl.textContent = label;
		lbl.style.cssText = 'opacity:.6; font-size:11px; text-transform:uppercase; letter-spacing:.05em;';
		const controls = document.createElement('div');
		controls.style.cssText = 'display:flex; gap:6px; align-items:center;';
		const input = document.createElement('input');
		input.readOnly = true;
		input.value = url;
		input.style.cssText = 'flex:1; padding:4px 6px; border-radius:4px; border:1px solid var(--border-dark); background:#0a0a0e; color:#ccc; font-family:var(--mono-font); font-size:11px;';
		const btn = document.createElement('button');
		btn.textContent = 'Copy';
		btn.addEventListener('click', () => {
			navigator.clipboard.writeText(url);
			btn.textContent = '✓';
			setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
		});
		controls.append(input, btn);
		row.append(lbl, controls);
		return row;
	}

	sharePanel.appendChild(makeShareRow('View only', roUrl));
	if (rwUrl) sharePanel.appendChild(makeShareRow('Edit (keep private)', rwUrl));
	document.body.appendChild(sharePanel);

	const btnShare = document.createElement('button');
	btnShare.id = 'btn-share';
	btnShare.textContent = 'Share';
	toolbar.appendChild(btnShare);

	btnShare.addEventListener('click', () => {
		sharePanel.style.display = sharePanel.style.display === 'flex' ? 'none' : 'flex';
	});
	document.addEventListener('click', e => {
		if (!sharePanel.contains(e.target) && e.target !== btnShare)
			sharePanel.style.display = 'none';
	});
}

if (seed && token) {
	const btnSave = document.createElement('button');
	btnSave.id = 'btn-save';
	btnSave.textContent = 'Save';
	toolbar.appendChild(btnSave);

	btnSave.addEventListener('click', async () => {
		btnSave.disabled = true;
		try {
			const out  = await buildExport();
			const resp = await fetch(`/save?seed=${encodeURIComponent(seed)}&token=${encodeURIComponent(token)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(out),
			});
			btnSave.textContent = resp.ok ? '✓ Saved' : '✗ Failed';
		} catch {
			btnSave.textContent = '✗ Error';
		} finally {
			btnSave.disabled = false;
			setTimeout(() => { btnSave.textContent = 'Save'; }, 2000);
		}
	});
} else {
	const btnFork = document.createElement('button');
	btnFork.id = 'btn-fork';
	btnFork.textContent = 'Fork';
	toolbar.appendChild(btnFork);

	btnFork.addEventListener('click', async () => {
		btnFork.disabled = true;
		try {
			const out  = await buildExport();
			const resp = await fetch('/fork', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(out),
			});
			if (resp.ok) {
				const { url } = await resp.json();
				location.href = url;
			} else {
				btnFork.textContent = '✗ Failed';
				setTimeout(() => { btnFork.textContent = 'Fork'; btnFork.disabled = false; }, 2000);
			}
		} catch {
			btnFork.textContent = '✗ Error';
			setTimeout(() => { btnFork.textContent = 'Fork'; btnFork.disabled = false; }, 2000);
		}
	});
}

// ── Color panel ───────────────────────────────────────────────────────────────

const colorPanel = document.createElement('div');
colorPanel.id = 'edit-color-panel';
colorPanel.innerHTML = '<strong>Theme Colors</strong>';

function getLinkedHex(k) {
	const base = colorLinks[k];
	return base ? (themeColors[base] || '#000000') : (themeColors[k] || '#000000');
}

function applyLinkedColor(ck) {
	const hex = getLinkedHex(ck);
	root.style.setProperty(`--${ck}`, hex);
	if (colorInputs[ck]) colorInputs[ck].value = hex;
}

function makeColorInput(k, isBase = false) {
	const input = document.createElement('input');
	input.type = 'color';
	input.value = getLinkedHex(k);
	colorInputs[k] = input;
	input.addEventListener('input', () => {
		themeColors[k] = input.value;
		root.style.setProperty(`--${k}`, input.value);
		if (isBase) {
			for (const [ck, base] of Object.entries(colorLinks)) {
				if (base === k) applyLinkedColor(ck);
			}
		}
		persist();
	});
	return input;
}

function makeVariantControls(k) {
	const wrap = document.createElement('div');
	wrap.className = 'color-variant-controls';

	const dotsWrap = document.createElement('div');
	dotsWrap.className = 'color-link-dots';
	const dots = {};
	for (const base of LINK_BASES) {
		const dot = document.createElement('button');
		dot.className = 'color-link-dot';
		dot.title = BASE_LABELS[base];
		dot.style.background = `var(--${base})`;
		if (colorLinks[k] === base) dot.classList.add('active');
		dot.addEventListener('click', () => {
			if (colorLinks[k] === base) {
				delete colorLinks[k];
				dot.classList.remove('active');
				input.classList.remove('is-linked');
				themeColors[k] = input.value;
				root.style.setProperty(`--${k}`, input.value);
			} else {
				if (colorLinks[k]) dots[colorLinks[k]]?.classList.remove('active');
				colorLinks[k] = base;
				dot.classList.add('active');
				input.classList.add('is-linked');
				applyLinkedColor(k);
			}
			persist();
			checkReset();
		});
		dots[base] = dot;
		dotsWrap.appendChild(dot);
	}

	const input = makeColorInput(k, false);
	if (colorLinks[k]) input.classList.add('is-linked');

	input.addEventListener('input', () => {
		if (!colorLinks[k]) return;
		dots[colorLinks[k]]?.classList.remove('active');
		delete colorLinks[k];
		input.classList.remove('is-linked');
		checkReset();
	});

	const resetBtn = document.createElement('button');
	resetBtn.className = 'color-reset-btn';
	resetBtn.title = 'Reset to default';
	resetBtn.textContent = '↺';
	const checkReset = () => {
		resetBtn.style.opacity = colorLinks[k] === BASE_LINKS[k] ? '0' : '';
	};
	checkReset();
	resetBtn.addEventListener('click', () => {
		if (colorLinks[k]) dots[colorLinks[k]]?.classList.remove('active');
		const defaultLink = BASE_LINKS[k];
		if (defaultLink) {
			colorLinks[k] = defaultLink;
			dots[defaultLink]?.classList.add('active');
			input.classList.add('is-linked');
		} else {
			delete colorLinks[k];
			input.classList.remove('is-linked');
		}
		applyLinkedColor(k);
		persist();
		checkReset();
	});

	wrap.appendChild(dotsWrap);
	wrap.appendChild(input);
	wrap.appendChild(resetBtn);
	return wrap;
}

function buildColorPanelContent() {
	while (colorPanel.children.length > 1) colorPanel.lastChild.remove();
	for (const k of Object.keys(colorInputs)) delete colorInputs[k];

	const baseRow = document.createElement('div');
	baseRow.className = 'color-base-row';
	for (const k of BASE_COLORS) {
		const swatch = document.createElement('div');
		swatch.className = 'color-swatch';
		const yamlVal = state.theme?.[k];
		const defaultVal = yamlVal ? resolveColor(yamlVal) : DEFAULT_BASE_VALUES[k];
		const input = makeColorInput(k, true);
		const resetBtn = document.createElement('button');
		resetBtn.className = 'color-reset-btn';
		resetBtn.title = 'Reset to default';
		resetBtn.textContent = '↺';
		const checkReset = () => { resetBtn.style.display = themeColors[k] === defaultVal ? 'none' : ''; };
		checkReset();
		input.addEventListener('input', checkReset);
		resetBtn.addEventListener('click', () => {
			themeColors[k] = defaultVal;
			root.style.setProperty(`--${k}`, defaultVal);
			input.value = defaultVal;
			for (const [ck, base] of Object.entries(colorLinks)) {
				if (base === k) applyLinkedColor(ck);
			}
			persist();
			checkReset();
		});
		const lbl = document.createElement('label');
		lbl.textContent = BASE_LABELS[k] || k;
		const lblRow = document.createElement('div');
		lblRow.style.cssText = 'display:flex;align-items:center;gap:3px;';
		lblRow.appendChild(lbl);
		lblRow.appendChild(resetBtn);
		swatch.appendChild(input);
		swatch.appendChild(lblRow);
		baseRow.appendChild(swatch);
	}
	colorPanel.appendChild(baseRow);

	const variants = document.createElement('div');
	variants.className = 'color-variants';
	variants.appendChild(document.createElement('div'));
	const darkHdr = document.createElement('div');
	darkHdr.className = 'color-col-title';
	darkHdr.textContent = 'Dark';
	variants.appendChild(darkHdr);
	const lightHdr = document.createElement('div');
	lightHdr.className = 'color-col-title';
	lightHdr.textContent = 'Light';
	variants.appendChild(lightHdr);

	const panelLabel = document.createElement('div');
	panelLabel.textContent = 'Surface';
	panelLabel.style.cssText = 'font-size:13px;';
	variants.appendChild(panelLabel);
	variants.appendChild(makeVariantControls('panel-dark'));
	variants.appendChild(makeVariantControls('panel-light'));

	for (let i = 0; i < DARK_COLORS.length; i++) {
		const label = document.createElement('div');
		label.textContent = variantLabel(DARK_COLORS[i]);
		label.style.cssText = 'font-size:13px;';
		variants.appendChild(label);
		variants.appendChild(makeVariantControls(DARK_COLORS[i]));
		variants.appendChild(makeVariantControls(LIGHT_COLORS[i]));
	}
	colorPanel.appendChild(variants);
}

buildColorPanelContent();
document.body.appendChild(colorPanel);

document.getElementById('btn-colors').addEventListener('click', () => {
	colorPanel.style.display = colorPanel.style.display === 'flex' ? 'none' : 'flex';
});

document.getElementById('btn-undo').addEventListener('click', performUndo);
document.getElementById('btn-redo').addEventListener('click', performRedo);

const langSelect = document.getElementById('lang-select');
langSelect.value = state.language;
langSelect.addEventListener('change', () => {
	state.language = langSelect.value;
	persist();
	updateLabels();
	render();
});

document.addEventListener('keydown', e => {
	if (document.activeElement?.getAttribute('contenteditable') === 'true') return;
	if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); performUndo(); }
	if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); performRedo(); }
});

// ── Reset ─────────────────────────────────────────────────────────────────────

function buildResetSnapshot() {
	const resetState = structuredClone(window.CV_DATA);
	const resetColorLinks = { ...BASE_LINKS };
	const resetThemeColors = {};
	for (const k of BASE_COLORS) {
		const yamlVal = resetState.theme?.[k];
		resetThemeColors[k] = (yamlVal && String(yamlVal).startsWith('#')) ? yamlVal : DEFAULT_BASE_VALUES[k];
	}
	for (const k of [...PANEL_COLORS, ...DARK_COLORS, ...LIGHT_COLORS]) {
		const link = BASE_LINKS[k];
		if (link) {
			resetThemeColors[k] = resetThemeColors[link] || '#000000';
		} else {
			const s = String(resetState.theme?.[k] ?? '');
			if (s.startsWith('#')) resetThemeColors[k] = s;
			else if (s.startsWith('--')) resetThemeColors[k] = resetThemeColors[s.slice(2)] || '#000000';
			else resetThemeColors[k] = '#000000';
		}
	}
	return { state: resetState, themeColors: resetThemeColors, colorLinks: resetColorLinks };
}

document.getElementById('btn-reset').addEventListener('click', () => {
	trackUndo(captureSnapshot());
	restoreSnapshot(buildResetSnapshot());
	saveUndoHistory();
});

// ── State → YAML / preview ─────────────────────────────────────────────────────

const TOP_ORDER = ['title_before_name', 'name', 'title_after_name', 'position', 'phone', 'email', 'location', 'description', 'interests', 'links', 'theme', 'experience', 'education', 'language', 'photo'];
const EXP_ORDER = ['title', 'company', 'start_month', 'start_year', 'end_month', 'end_year', 'description', 'badges'];
const EDU_ORDER = ['title', 'institution', 'subinstitution', 'start_month', 'start_year', 'end_month', 'end_year', 'description'];

function reorderKeys(obj, order) {
	const out = {};
	for (const k of order) if (k in obj) out[k] = obj[k];
	for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
	return out;
}

function stripEmpty(obj) {
	const out = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v == null) continue;
		if (typeof v === 'string' && !v.trim()) continue;
		if (Array.isArray(v) && v.length === 0) continue;
		if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
		out[k] = v;
	}
	return out;
}

async function buildExport() {
	const out = structuredClone(state);
	if (out.photo?.startsWith(PHOTO_REF_PREFIX)) {
		const r = await resolvePhotoRef(out.photo);
		out.photo = r?.data || '';
	}

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
	for (const k of themeKeys) {
		const v = themeColors[k];
		if (BASE_COLORS.includes(k) && v === DEFAULT_BASE_VALUES[k]) continue;
		const link = colorLinks[k];
		if (link) {
			if (DEFAULT_LINKS[k] === link) continue;
			theme[k] = `--${link}`;
		} else {
			theme[k] = v;
		}
	}
	if (Object.keys(theme).length) out.theme = theme;
	else delete out.theme;
	if (Array.isArray(out.experience)) out.experience = out.experience.map(e => stripEmpty(reorderKeys(e, EXP_ORDER)));
	if (Array.isArray(out.education))  out.education  = out.education.map(e => stripEmpty(reorderKeys(e, EDU_ORDER)));
	return stripEmpty(reorderKeys(out, TOP_ORDER));
}

// ── Render: rebuild the entire view from state ────────────────────────────────

let yamlModal = null;

function render() {
	if (!state.language || !LABELS[state.language]) state.language = 'en';
	// Normalise every list — each enforces its own real/draft/empty invariants
	normalizeInterests();
	normalizeLinks();
	normalizeExperience();
	normalizeEducation();

	renderStatic();
	renderPhoto();
	renderInterests();
	setupConnectEdit();
	timelineRenderers.experience?.();
	timelineRenderers.education?.();
	updateLabels();
	if (yamlModal) buildExport().then(o => { yamlModal.querySelector('textarea').value = toYaml(o); });
}

render();
lastSaved = captureSnapshot();
loadUndoHistory();
updateUndoButtons();

if (state.photo?.startsWith('data:')) {
	storePhotoData(state.photo).then(ref => {
		state.photo = ref;
		renderPhoto();
		setTimeout(persist, 0);
	});
}

// ── Preview ───────────────────────────────────────────────────────────────────

document.getElementById('btn-preview').addEventListener('click', async () => {
	const out = await buildExport();
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

// ── YAML editor ───────────────────────────────────────────────────────────────

document.getElementById('btn-export').addEventListener('click', async () => {
	if (yamlModal) return;
	const yaml = toYaml(await buildExport());
	yamlModal = document.createElement('div');
	yamlModal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;';
	yamlModal.innerHTML = `
		<div style="background:var(--panel-dark);border:1px solid var(--light);border-radius:8px;padding:24px;width:min(700px,90vw);display:flex;flex-direction:column;gap:12px;">
			<div style="display:flex;justify-content:space-between;align-items:center;color:var(--text-dark);font-family:var(--condensed-font);">
				<strong>YAML</strong>
				<div style="display:flex;gap:8px;align-items:center;">
					<button id="modal-reset" title="Reset to default" style="background:none;border:none;color:inherit;cursor:pointer;opacity:.5;font-size:18px;padding:0;line-height:1;">↺</button>
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

	yamlModal.querySelector('#modal-reset').addEventListener('click', () => {
		const defaultData = structuredClone(window.CV_DATA || {});
		if (Array.isArray(defaultData.experience)) defaultData.experience = defaultData.experience.map(e => stripEmpty(reorderKeys(e, EXP_ORDER)));
		if (Array.isArray(defaultData.education))  defaultData.education  = defaultData.education.map(e => stripEmpty(reorderKeys(e, EDU_ORDER)));
		textarea.value = toYaml(stripEmpty(reorderKeys(defaultData, TOP_ORDER)));
	});

	yamlModal.querySelector('#modal-apply').addEventListener('click', async () => {
		try {
			const parsed = jsyaml.load(textarea.value);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('YAML must be a mapping');
			if (parsed.photo) parsed.photo = await ensureRef(parsed.photo);
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
