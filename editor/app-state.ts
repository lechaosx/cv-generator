import type { CVState } from './types';
import { STORAGE_KEY } from './storage';

export const LABELS: Record<string, Record<string, string>> = window.CV_LABELS ?? { en: {} };

const saved = localStorage.getItem(STORAGE_KEY);
export const state: CVState = saved
	? (JSON.parse(saved) as CVState)
	: structuredClone(window.CV_DATA);

if (!state.language || !LABELS[state.language]) state.language = 'en';

export const themeColors: Record<string, string> = {};
export const colorLinks: Record<string, string>  = {};

export function t(key: string): string {
	return (LABELS[state.language] ?? LABELS['en'] ?? {})[key] ?? key;
}

export function updateLabels(): void {
	document.querySelectorAll<HTMLElement>('[data-label]').forEach(el => {
		el.textContent = t(el.dataset['label']!);
	});
	document.querySelectorAll<HTMLElement>('[data-placeholder-key]').forEach(el => {
		el.setAttribute('data-placeholder', t(el.dataset['placeholderKey']!));
	});
	document.documentElement.lang = state.language;
	const ls = document.getElementById('lang-select') as HTMLSelectElement | null;
	if (ls && ls.value !== state.language) ls.value = state.language;
}
