import type { Store } from './store';
import { defined } from './assert';
import { enableDragSort, dragOnlyOutsideText } from './drag-sort';
import { setupEditable } from './text-edit';
import { makeStringList } from './lists';
import type { TimelineEntry } from './types';

const timelines = new Map<'experience' | 'education', HTMLElement>();

function descStr(d: string | string[]): string {
	return Array.isArray(d) ? d.join(' ') : (d ?? '');
}

function inTimeline(section: 'experience' | 'education', e?: FocusEvent): boolean {
	return !!timelines.get(section)?.contains(e?.relatedTarget as Node);
}

function makeDateRange(
	sm: string, sy: string, em: string, ey: string,
	onField: (field: string, v: string, e?: FocusEvent) => void,
): HTMLElement {
	const mkSpan = (cls: string, val: string, ph: string, field: string): HTMLElement => {
		const s = document.createElement('span');
		s.className = cls;
		setupEditable(s, val, ph, (v, e) => onField(field, v as string, e));
		return s;
	};

	const startPart = document.createElement('span'); startPart.className = 'start-part';
	const smSep     = document.createElement('span'); smSep.className = 'sm-sep'; smSep.textContent = '/';
	const rangeSep  = document.createElement('span'); rangeSep.className = 'range-sep'; rangeSep.textContent = ' – ';
	startPart.append(mkSpan('start-month', sm, 'MM', 'start_month'), smSep,
	                 mkSpan('start-year',  sy, 'YYYY', 'start_year'), rangeSep);

	const endPart = document.createElement('span'); endPart.className = 'end-part';
	const emSep   = document.createElement('span'); emSep.className = 'em-sep'; emSep.textContent = '/';
	endPart.append(mkSpan('end-month', em, 'MM', 'end_month'), emSep,
	               mkSpan('end-year',  ey, 'YYYY', 'end_year'));

	const presentText = document.createElement('span');
	presentText.className = 'present-text';
	presentText.dataset['label'] = 'present';

	const dates = document.createElement('div');
	dates.className = 'cv-dates';
	dates.append(startPart, endPart, presentText);
	return dates;
}

function materializeEntry(
	store: Store,
	section: 'experience' | 'education',
	idx: number,
	timelineEl: HTMLElement,
): void {
	const entry  = defined(store.state[section][idx], `${section}[${idx}]`);
	const isReal = !!(entry.organization.trim() && entry.title.trim());

	const commit = (mutate: (e: TimelineEntry) => void, e?: FocusEvent) =>
		store.commit(s => mutate(s[section][idx]!), inTimeline(section, e) ? null : [section]);

	const left = document.createElement('div');
	left.classList.add('timeline-entry');
	if (isReal) { left.draggable = true; left.dataset['dragIdx'] = String(idx); dragOnlyOutsideText(left); }

	const orgEl = document.createElement('strong');
	setupEditable(orgEl, entry.organization, 'organization', (v, e) =>
		commit(ent => { ent.organization = v as string; }, e));

	const subSpan = document.createElement('span');
	setupEditable(subSpan, entry.department, 'department', (v, e) =>
		commit(ent => { ent.department = v as string; }, e));
	const subDiv = document.createElement('div');
	subDiv.append(subSpan);

	const badgeList = document.createElement('div');
	badgeList.className = 'badge-list';
	makeStringList(
		badgeList,
		() => store.state[section][idx]?.badges ?? [],
		v => store.commit(s => { if (s[section][idx]) s[section][idx]!.badges = v; }, [section]),
		v => store.commit(s => { if (s[section][idx]) s[section][idx]!.badges = v; }, null),
		'badge',
	);

	left.append(orgEl, subDiv, makeDateRange(
		entry.start_month, entry.start_year, entry.end_month, entry.end_year,
		(field, v, e) => commit(ent => { (ent as unknown as Record<string, unknown>)[field] = v; }, e),
	), badgeList);

	const right = document.createElement('div');
	right.classList.add('timeline-entry');
	if (isReal) { right.draggable = true; right.dataset['dragIdx'] = String(idx); dragOnlyOutsideText(right); }

	const titleEl = document.createElement('strong');
	setupEditable(titleEl, entry.title, 'title', (v, e) =>
		commit(ent => { ent.title = v as string; }, e));

	const descEl = document.createElement('p');
	setupEditable(descEl, descStr(entry.description), 'description', (v, e) =>
		commit(ent => { ent.description = v ? [v as string] : []; }, e));

	right.append(titleEl, descEl);
	timelineEl.append(left, right);
}

function renderSection(store: Store, section: 'experience' | 'education'): void {
	const el = timelines.get(section);
	if (!el) return;
	el.innerHTML = '';
	store.state[section].forEach((_, idx) => materializeEntry(store, section, idx, el));
}

export function renderExperienceTimeline(store: Store): void { renderSection(store, 'experience'); }
export function renderEducationTimeline(store: Store): void  { renderSection(store, 'education'); }

export function initTimelines(store: Store): void {
	const els = document.querySelectorAll<HTMLElement>('.timeline');
	(['experience', 'education'] as const).forEach((section, i) => {
		const el = els[i];
		if (!el) return;
		timelines.set(section, el);
		enableDragSort(el, '.timeline-entry',
			() => store.state[section],
			reordered => store.commit(s => { s[section] = reordered; }, [section]),
		);
	});
}
