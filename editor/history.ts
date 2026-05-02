import { state, themeColors, colorLinks } from './app-state';
import { STORAGE_KEY, COLORS_KEY, LINKS_KEY, UNDO_KEY } from './storage';
import type { UndoSnapshot } from './types';

let undoStack: UndoSnapshot[] = [];
let redoStack: UndoSnapshot[] = [];
export let lastSaved: UndoSnapshot | null = null;

let baseLinks: Record<string, string>  = {};
let themeKeys: string[]                = [];
let onRender: (() => void) | null      = null;
let onRebuildColors: (() => void) | null = null;

export interface HistoryConfig {
	baseLinks: Record<string, string>;
	themeKeys: string[];
	onRender: () => void;
	onRebuildColors: () => void;
}

export function initHistory(config: HistoryConfig): void {
	baseLinks       = config.baseLinks;
	themeKeys       = config.themeKeys;
	onRender        = config.onRender;
	onRebuildColors = config.onRebuildColors;
}

export function setLastSaved(snap: UndoSnapshot): void {
	lastSaved = snap;
}

export function captureSnapshot(): UndoSnapshot {
	return {
		state:       JSON.parse(JSON.stringify(state)),
		themeColors: JSON.parse(JSON.stringify(themeColors)),
		colorLinks:  JSON.parse(JSON.stringify(colorLinks)),
	};
}

export function persistRaw(snapshot?: UndoSnapshot): void {
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
	lastSaved = snapshot ?? captureSnapshot();
}

export function trackUndo(current: UndoSnapshot): void {
	if (!lastSaved) return;
	if (JSON.stringify(current) === JSON.stringify(lastSaved)) return;
	undoStack.push(lastSaved);
	if (undoStack.length > 100) undoStack.shift();
	redoStack = [];
	saveUndoHistory();
	updateUndoButtons();
}

export function persist(): void {
	const current = captureSnapshot();
	trackUndo(current);
	persistRaw(current);
}

export function saveUndoHistory(): void {
	try { localStorage.setItem(UNDO_KEY, JSON.stringify({ u: undoStack, r: redoStack, ts: Date.now() })); } catch {}
}

export function loadUndoHistory(): void {
	try {
		const raw = localStorage.getItem(UNDO_KEY);
		if (!raw) return;
		const saved = JSON.parse(raw) as { u: UndoSnapshot[]; r: UndoSnapshot[]; ts: number };
		if (Date.now() - saved.ts > 7 * 24 * 60 * 60 * 1000) return;
		undoStack = saved.u ?? [];
		redoStack = saved.r ?? [];
	} catch {}
}

export function updateUndoButtons(): void {
	const u = document.getElementById('btn-undo') as HTMLButtonElement | null;
	const r = document.getElementById('btn-redo') as HTMLButtonElement | null;
	if (u) u.disabled = !undoStack.length;
	if (r) r.disabled = !redoStack.length;
}

function applySnapshot(snap: UndoSnapshot): void {
	for (const k of Object.keys(state)) delete (state as Record<string, unknown>)[k];
	Object.assign(state, JSON.parse(JSON.stringify(snap.state)));
	for (const k of Object.keys(themeColors)) delete themeColors[k];
	Object.assign(themeColors, JSON.parse(JSON.stringify(snap.themeColors)));
	for (const k of Object.keys(colorLinks)) delete colorLinks[k];
	Object.assign(colorLinks, JSON.parse(JSON.stringify(snap.colorLinks)));
	const root = document.documentElement;
	for (const k of themeKeys) {
		const link = colorLinks[k];
		root.style.setProperty(`--${k}`, link ? (themeColors[link] ?? '#000000') : (themeColors[k] ?? ''));
	}
	onRebuildColors?.();
	onRender?.();
	persistRaw();
	updateUndoButtons();
}

export function restoreSnapshot(snap: UndoSnapshot): void {
	applySnapshot(snap);
}

export function performUndo(): void {
	if (!undoStack.length) return;
	redoStack.push(captureSnapshot());
	applySnapshot(undoStack.pop()!);
	saveUndoHistory();
}

export function performRedo(): void {
	if (!redoStack.length) return;
	undoStack.push(captureSnapshot());
	applySnapshot(redoStack.pop()!);
	saveUndoHistory();
}
