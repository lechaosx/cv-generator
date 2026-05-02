import type { CVState, UndoSnapshot } from './types';
import { STORAGE_KEY, COLORS_KEY, LINKS_KEY, UNDO_KEY } from './storage';
import { warn } from './log';

export function saveState(
	state: CVState,
	themeColors: Record<string, string>,
	colorLinks: Record<string, string>,
	baseLinks: Record<string, string>,
): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	localStorage.setItem(COLORS_KEY, JSON.stringify(themeColors));
	const linkDelta: Record<string, string> = {};
	for (const [k, v] of Object.entries(colorLinks)) {
		if (baseLinks[k] !== v) linkDelta[k] = v;
	}
	for (const k of Object.keys(baseLinks)) {
		if (!colorLinks[k]) linkDelta[k] = '';
	}
	localStorage.setItem(LINKS_KEY, JSON.stringify(linkDelta));
}

export function saveUndoHistory(u: UndoSnapshot[], r: UndoSnapshot[]): void {
	try { localStorage.setItem(UNDO_KEY, JSON.stringify({ u, r, ts: Date.now() })); }
	catch (e) { warn('Failed to save undo history', e); }
}

export function loadUndoHistory(): { u: UndoSnapshot[]; r: UndoSnapshot[] } | null {
	try {
		const raw = localStorage.getItem(UNDO_KEY);
		if (!raw) return null;
		const saved = JSON.parse(raw) as { u: UndoSnapshot[]; r: UndoSnapshot[]; ts: number };
		if (Date.now() - saved.ts > 7 * 24 * 60 * 60 * 1000) return null;
		return { u: saved.u ?? [], r: saved.r ?? [] };
	} catch (e) { warn('Failed to load undo history', e); return null; }
}
