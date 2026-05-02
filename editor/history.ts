import type { UndoSnapshot } from './types';
import { saveUndoHistory } from './persistence';

let undoStack: UndoSnapshot[] = [];
let redoStack: UndoSnapshot[] = [];

export function loadStacks(stacks: { u: UndoSnapshot[]; r: UndoSnapshot[] }): void {
	undoStack = stacks.u;
	redoStack = stacks.r;
}

export function push(lastSaved: UndoSnapshot, current: UndoSnapshot): void {
	if (JSON.stringify(current) === JSON.stringify(lastSaved)) return;
	undoStack.push(lastSaved);
	if (undoStack.length > 100) undoStack.shift();
	redoStack = [];
	saveUndoHistory(undoStack, redoStack);
	updateUndoButtons();
}

export function popUndo(current: UndoSnapshot): UndoSnapshot | null {
	if (!undoStack.length) return null;
	redoStack.push(current);
	const snap = undoStack.pop()!;
	saveUndoHistory(undoStack, redoStack);
	updateUndoButtons();
	return snap;
}

export function popRedo(current: UndoSnapshot): UndoSnapshot | null {
	if (!redoStack.length) return null;
	undoStack.push(current);
	const snap = redoStack.pop()!;
	saveUndoHistory(undoStack, redoStack);
	updateUndoButtons();
	return snap;
}

export function updateUndoButtons(): void {
	const u = document.getElementById('btn-undo') as HTMLButtonElement | null;
	const r = document.getElementById('btn-redo') as HTMLButtonElement | null;
	if (u) u.disabled = !undoStack.length;
	if (r) r.disabled = !redoStack.length;
}
