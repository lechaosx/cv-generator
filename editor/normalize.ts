import type { CVState, ExperienceEntry, EducationEntry, LinkEntry } from './types';

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

export function normalizeInterests(interests: string[]): string[] {
	return normalizeList(interests ?? [], isStringReal, isStringEmpty, makeEmptyStr);
}

export function normalizeBadges(badges: string[]): string[] {
	return normalizeList(badges ?? [], isStringReal, isStringEmpty, makeEmptyStr);
}

export function normalizeLinks(links: LinkEntry[] | Record<string, string>): LinkEntry[] {
	let arr = links as LinkEntry[];
	if (!Array.isArray(arr) && arr && typeof arr === 'object') {
		arr = Object.entries(arr as Record<string, string>)
			.map(([platform, url]) => ({ platform: String(platform ?? ''), url: String(url ?? '') }));
	}
	return normalizeList(
		arr ?? [],
		l => !!((l.platform ?? '').trim() && (l.url ?? '').trim()),
		l => !(l.platform ?? '').trim() && !(l.url ?? '').trim(),
		() => ({ platform: '', url: '' }),
	);
}

export function normalizeExperience(experience: ExperienceEntry[]): ExperienceEntry[] {
	const result = normalizeList<ExperienceEntry>(
		experience ?? [],
		e => !!(e.company?.trim() && e.title?.trim()),
		isEntryEmpty,
		() => ({ company: '', title: '', start_month: '', start_year: '', end_month: '', end_year: '', description: [], badges: [] }),
		true,
	);
	return result.map(e => ({ ...e, badges: normalizeBadges(e.badges) }));
}

export function normalizeEducation(education: EducationEntry[]): EducationEntry[] {
	return normalizeList<EducationEntry>(
		education ?? [],
		e => !!(e.institution?.trim() && e.title?.trim()),
		isEntryEmpty,
		() => ({ institution: '', title: '', subinstitution: '', start_month: '', start_year: '', end_month: '', end_year: '', description: [] }),
		true,
	);
}

export function normalizeAll(state: CVState): CVState {
	return {
		...state,
		interests:  normalizeInterests(state.interests),
		links:      normalizeLinks(state.links as LinkEntry[]),
		experience: normalizeExperience(state.experience),
		education:  normalizeEducation(state.education),
	};
}
