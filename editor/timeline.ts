import { state, t } from './app-state';
import { persist } from './history';
import { normalizeExperience, normalizeEducation, normalizeBadges } from './normalize';
import { enableDragSort, dragOnlyOutsideText } from './drag-sort';
import { setupEditable } from './text-edit';
import { makeStringList } from './lists';
import type { AfterBlur } from './text-edit';

let expTimeline: HTMLElement | null = null;
let eduTimeline: HTMLElement | null = null;

function syncExperience(e?: FocusEvent): void {
	normalizeExperience(); persist();
	if (!expTimeline?.contains(e?.relatedTarget as Node)) renderExperienceTimeline();
}

function syncEducation(e?: FocusEvent): void {
	normalizeEducation(); persist();
	if (!eduTimeline?.contains(e?.relatedTarget as Node)) renderEducationTimeline();
}

function mkSpan(cls: string, path: string, ph: string, afterBlur: AfterBlur): HTMLElement {
	const s = document.createElement('span');
	s.className = cls;
	setupEditable(s, path, ph, afterBlur);
	return s;
}

function makeDateRange(prefix: string, sync: AfterBlur): HTMLElement {
	const startPart = document.createElement('span'); startPart.className = 'start-part';
	const smSep     = document.createElement('span'); smSep.className = 'sm-sep'; smSep.textContent = '/';
	const rangeSep  = document.createElement('span'); rangeSep.className = 'range-sep'; rangeSep.textContent = ' – ';
	startPart.append(mkSpan('start-month', `${prefix}.start_month`, 'MM', sync), smSep,
	                 mkSpan('start-year',  `${prefix}.start_year`,  'YYYY', sync), rangeSep);

	const endPart = document.createElement('span'); endPart.className = 'end-part';
	const emSep   = document.createElement('span'); emSep.className = 'em-sep'; emSep.textContent = '/';
	endPart.append(mkSpan('end-month', `${prefix}.end_month`, 'MM', sync), emSep,
	               mkSpan('end-year',  `${prefix}.end_year`,  'YYYY', sync));

	const presentText = document.createElement('span');
	presentText.className = 'present-text';
	presentText.dataset['label'] = 'present';
	presentText.textContent = t('present');

	const dates = document.createElement('div');
	dates.className = 'cv-dates';
	dates.append(startPart, endPart, presentText);
	return dates;
}

function materializeExpEntry(idx: number, timelineEl: HTMLElement): void {
	const entry  = state.experience[idx]!;
	const isReal = !!(entry?.company?.trim() && entry?.title?.trim());

	const left = document.createElement('div');
	left.classList.add('timeline-entry');
	if (isReal) { left.draggable = true; left.dataset['dragIdx'] = String(idx); dragOnlyOutsideText(left); }

	const company = document.createElement('strong');
	setupEditable(company, `experience.${idx}.company`, 'company', syncExperience);
	normalizeBadges(idx);
	const badgeList = document.createElement('div');
	badgeList.className = 'badge-list';
	makeStringList(badgeList,
		() => state.experience[idx]?.badges ?? [],
		v  => { const job = state.experience[idx]; if (job) job.badges = v; },
		() => normalizeBadges(idx),
		'badge',
	);
	left.append(company, makeDateRange(`experience.${idx}`, syncExperience), badgeList);

	const right = document.createElement('div');
	right.classList.add('timeline-entry');
	if (isReal) { right.draggable = true; right.dataset['dragIdx'] = String(idx); dragOnlyOutsideText(right); }
	const title = document.createElement('strong');
	setupEditable(title, `experience.${idx}.title`, 'title', syncExperience);
	const desc = document.createElement('p');
	setupEditable(desc, `experience.${idx}.description`, 'description', syncExperience);
	right.append(title, desc);

	timelineEl.append(left, right);
}

function materializeEduEntry(idx: number, timelineEl: HTMLElement): void {
	const entry  = state.education[idx]!;
	const isReal = !!(entry?.institution?.trim() && entry?.title?.trim());

	const left = document.createElement('div');
	left.classList.add('timeline-entry');
	if (isReal) { left.draggable = true; left.dataset['dragIdx'] = String(idx); dragOnlyOutsideText(left); }

	const institution = document.createElement('strong');
	setupEditable(institution, `education.${idx}.institution`, 'institution', syncEducation);
	const eduSubSpan = document.createElement('span');
	setupEditable(eduSubSpan, `education.${idx}.subinstitution`, 'faculty', syncEducation);
	const eduSub = document.createElement('div');
	eduSub.append(eduSubSpan);
	left.append(institution, eduSub, makeDateRange(`education.${idx}`, syncEducation));

	const right = document.createElement('div');
	right.classList.add('timeline-entry');
	if (isReal) { right.draggable = true; right.dataset['dragIdx'] = String(idx); dragOnlyOutsideText(right); }
	const title = document.createElement('strong');
	setupEditable(title, `education.${idx}.title`, 'title', syncEducation);
	const desc = document.createElement('p');
	setupEditable(desc, `education.${idx}.description`, 'description', syncEducation);
	right.append(title, desc);

	timelineEl.append(left, right);
}

export function renderExperienceTimeline(): void {
	if (!expTimeline) return;
	expTimeline.innerHTML = '';
	state.experience.forEach((_, idx) => materializeExpEntry(idx, expTimeline!));
}

export function renderEducationTimeline(): void {
	if (!eduTimeline) return;
	eduTimeline.innerHTML = '';
	state.education.forEach((_, idx) => materializeEduEntry(idx, eduTimeline!));
}

export function initTimelines(): void {
	const timelines = document.querySelectorAll<HTMLElement>('.timeline');
	expTimeline = timelines[0] ?? null;
	eduTimeline = timelines[1] ?? null;

	if (expTimeline) {
		enableDragSort(expTimeline, '.timeline-entry',
			() => state.experience,
			v  => { state.experience = v; },
			syncExperience,
		);
	}
	if (eduTimeline) {
		enableDragSort(eduTimeline, '.timeline-entry',
			() => state.education,
			v  => { state.education = v; },
			syncEducation,
		);
	}
}
