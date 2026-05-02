import type { Store } from './store';
import { defined } from './assert';
import { enableDragSort, dragOnlyOutsideText } from './drag-sort';
import { setupEditable } from './text-edit';
import { makeStringList } from './lists';
import type { ExperienceEntry, EducationEntry } from './types';

let expTimeline: HTMLElement | null = null;
let eduTimeline: HTMLElement | null = null;

function descStr(d: string | string[]): string {
	return Array.isArray(d) ? d.join(' ') : (d ?? '');
}

function inTimeline(timeline: HTMLElement | null, e?: FocusEvent): boolean {
	return !!timeline?.contains(e?.relatedTarget as Node);
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

function materializeExpEntry(store: Store, idx: number, timelineEl: HTMLElement): void {
	const entry  = defined(store.state.experience[idx], `experience entry at index ${idx}`);
	const isReal = !!(entry.company?.trim() && entry.title?.trim());

	const expCommit = (mutate: (e: ExperienceEntry) => void, e?: FocusEvent) =>
		store.commit(s => mutate(s.experience[idx]!), inTimeline(expTimeline, e) ? null : ['experience']);

	const left = document.createElement('div');
	left.classList.add('timeline-entry');
	if (isReal) { left.draggable = true; left.dataset['dragIdx'] = String(idx); dragOnlyOutsideText(left); }

	const company = document.createElement('strong');
	setupEditable(company, entry.company, 'company', (v, e) => expCommit(ent => { ent.company = v as string; }, e));

	const badgeList = document.createElement('div');
	badgeList.className = 'badge-list';
	makeStringList(
		badgeList,
		() => store.state.experience[idx]?.badges ?? [],
		v => store.commit(s => { if (s.experience[idx]) s.experience[idx]!.badges = v; }, ['experience']),
		v => store.commit(s => { if (s.experience[idx]) s.experience[idx]!.badges = v; }, null),
		'badge',
	);

	left.append(company, makeDateRange(
		entry.start_month, entry.start_year, entry.end_month, entry.end_year,
		(field, v, e) => expCommit(ent => { (ent as unknown as Record<string, unknown>)[field] = v; }, e),
	), badgeList);

	const right = document.createElement('div');
	right.classList.add('timeline-entry');
	if (isReal) { right.draggable = true; right.dataset['dragIdx'] = String(idx); dragOnlyOutsideText(right); }

	const title = document.createElement('strong');
	setupEditable(title, entry.title, 'title', (v, e) => expCommit(ent => { ent.title = v as string; }, e));

	const desc = document.createElement('p');
	setupEditable(desc, descStr(entry.description), 'description', (v, e) =>
		expCommit(ent => { ent.description = v ? [v as string] : []; }, e));

	right.append(title, desc);
	timelineEl.append(left, right);
}

function materializeEduEntry(store: Store, idx: number, timelineEl: HTMLElement): void {
	const entry  = defined(store.state.education[idx], `education entry at index ${idx}`);
	const isReal = !!(entry.institution?.trim() && entry.title?.trim());

	const eduCommit = (mutate: (e: EducationEntry) => void, e?: FocusEvent) =>
		store.commit(s => mutate(s.education[idx]!), inTimeline(eduTimeline, e) ? null : ['education']);

	const left = document.createElement('div');
	left.classList.add('timeline-entry');
	if (isReal) { left.draggable = true; left.dataset['dragIdx'] = String(idx); dragOnlyOutsideText(left); }

	const institution = document.createElement('strong');
	setupEditable(institution, entry.institution, 'institution', (v, e) =>
		eduCommit(ent => { ent.institution = v as string; }, e));

	const eduSubSpan = document.createElement('span');
	setupEditable(eduSubSpan, entry.subinstitution, 'faculty', (v, e) =>
		eduCommit(ent => { ent.subinstitution = v as string; }, e));

	const eduSub = document.createElement('div');
	eduSub.append(eduSubSpan);
	left.append(institution, eduSub, makeDateRange(
		entry.start_month, entry.start_year, entry.end_month, entry.end_year,
		(field, v, e) => eduCommit(ent => { (ent as unknown as Record<string, unknown>)[field] = v; }, e),
	));

	const right = document.createElement('div');
	right.classList.add('timeline-entry');
	if (isReal) { right.draggable = true; right.dataset['dragIdx'] = String(idx); dragOnlyOutsideText(right); }

	const title = document.createElement('strong');
	setupEditable(title, entry.title, 'title', (v, e) =>
		eduCommit(ent => { ent.title = v as string; }, e));

	const desc = document.createElement('p');
	setupEditable(desc, descStr(entry.description), 'description', (v, e) =>
		eduCommit(ent => { ent.description = v ? [v as string] : []; }, e));

	right.append(title, desc);
	timelineEl.append(left, right);
}

export function renderExperienceTimeline(store: Store): void {
	if (!expTimeline) return;
	expTimeline.innerHTML = '';
	store.state.experience.forEach((_, idx) => materializeExpEntry(store, idx, expTimeline!));
}

export function renderEducationTimeline(store: Store): void {
	if (!eduTimeline) return;
	eduTimeline.innerHTML = '';
	store.state.education.forEach((_, idx) => materializeEduEntry(store, idx, eduTimeline!));
}

export function initTimelines(store: Store): void {
	const timelines = document.querySelectorAll<HTMLElement>('.timeline');
	expTimeline = timelines[0] ?? null;
	eduTimeline = timelines[1] ?? null;

	if (expTimeline) {
		enableDragSort(expTimeline, '.timeline-entry',
			() => store.state.experience,
			reordered => store.commit(s => { s.experience = reordered; }, ['experience']),
		);
	}
	if (eduTimeline) {
		enableDragSort(eduTimeline, '.timeline-entry',
			() => store.state.education,
			reordered => store.commit(s => { s.education = reordered; }, ['education']),
		);
	}
}
