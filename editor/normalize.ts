import { state } from './app-state';
import type { ExperienceEntry, EducationEntry, LinkEntry } from './types';

export function isEntryEmpty(entry: unknown): boolean {
	if (!entry || typeof entry !== 'object') return true;
	for (const v of Object.values(entry as Record<string, unknown>)) {
		if (v == null) continue;
		if (typeof v === 'string') { if (v.trim()) return false; continue; }
		if (Array.isArray(v) && v.some(x => (typeof x === 'string' ? x.trim() : x && typeof x === 'object'))) return false;
	}
	return true;
}

function normalizeList<T>(
	arr: T[],
	isReal: (item: T) => boolean,
	isEmpty: (item: T) => boolean,
	makeEmpty: () => T,
	ghostFirst = false,
): T[] {
	if (!Array.isArray(arr)) arr = [];
	const result: T[] = [];
	let hasDraft = false;
	for (const item of arr) {
		if (isReal(item)) result.push(item);
		else if (!isEmpty(item)) { result.push(item); hasDraft = true; }
	}
	if (!hasDraft) (ghostFirst ? result.unshift : result.push).call(result, makeEmpty());
	return result;
}

const isStringReal  = (s: unknown) => !!(s && String(s).trim());
const isStringEmpty = (s: unknown) => !s || !String(s).trim();
const makeEmptyStr  = (): string => '';

export function normalizeInterests(): void {
	state.interests = normalizeList(state.interests, isStringReal, isStringEmpty, makeEmptyStr);
}

export function normalizeBadges(idx: number): void {
	const job = state.experience?.[idx];
	if (job) job.badges = normalizeList(job.badges, isStringReal, isStringEmpty, makeEmptyStr);
}

export function normalizeLinks(): void {
	let arr = state.links as LinkEntry[];
	if (!Array.isArray(arr) && arr && typeof arr === 'object') {
		arr = Object.entries(arr as Record<string, string>)
			.map(([platform, url]) => ({ platform: String(platform ?? ''), url: String(url ?? '') }));
	}
	state.links = normalizeList(
		arr,
		l => !!((l.platform ?? '').trim() && (l.url ?? '').trim()),
		l => !(l.platform ?? '').trim() && !(l.url ?? '').trim(),
		() => ({ platform: '', url: '' }),
	);
}

export function normalizeExperience(): void {
	state.experience = normalizeList<ExperienceEntry>(
		state.experience,
		e => !!(e.company?.trim() && e.title?.trim()),
		isEntryEmpty,
		() => ({ company: '', title: '', start_month: '', start_year: '', end_month: '', end_year: '', description: [], badges: [] }),
		true,
	);
	for (const i of state.experience.keys()) normalizeBadges(i);
}

export function normalizeEducation(): void {
	state.education = normalizeList<EducationEntry>(
		state.education,
		e => !!(e.institution?.trim() && e.title?.trim()),
		isEntryEmpty,
		() => ({ institution: '', title: '', subinstitution: '', start_month: '', start_year: '', end_month: '', end_year: '', description: [] }),
		true,
	);
}
