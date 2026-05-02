import type { CVState, UndoSnapshot } from './types';
import { normalizeAll } from './normalize';
import { saveState } from './persistence';
import { push, popUndo, popRedo, updateUndoButtons } from './history';

export type CommitFn = (mutate: (s: CVState) => void, sections?: string[] | null) => void;

export class Store {
	private _state: CVState;
	private _themeColors: Record<string, string> = {};
	private _colorLinks:  Record<string, string> = {};
	private _lastSaved:   UndoSnapshot;

	private _themeKeys: string[] = [];
	private _baseLinks: Record<string, string> = {};

	private _renderer:       ((store: Store) => void) | null = null;
	private _colorRebuilder: (() => void) | null             = null;
	private _sectionRenderers = new Map<string, (store: Store) => void>();
	private _observers: ((store: Store) => void)[] = [];

	constructor(state: CVState) {
		this._state     = state;
		this._lastSaved = this._snapshot();
	}

	get state(): Readonly<CVState>                          { return this._state; }
	get themeColors(): Readonly<Record<string, string>>     { return this._themeColors; }
	get colorLinks():  Readonly<Record<string, string>>     { return this._colorLinks; }

	setRenderer(fn: (store: Store) => void): void           { this._renderer = fn; }
	setColorRebuilder(fn: () => void): void                 { this._colorRebuilder = fn; }

	setColorConfig(themeKeys: string[], baseLinks: Record<string, string>): void {
		this._themeKeys = themeKeys;
		this._baseLinks = baseLinks;
	}

	initColorState(themeColors: Record<string, string>, colorLinks: Record<string, string>): void {
		Object.assign(this._themeColors, themeColors);
		Object.assign(this._colorLinks,  colorLinks);
		this._lastSaved = this._snapshot();
	}

	registerSection(name: string, fn: (store: Store) => void): void {
		this._sectionRenderers.set(name, fn);
	}

	addObserver(fn: (store: Store) => void): void {
		this._observers.push(fn);
	}

	// sections = undefined → full render, null → no render, string[] → named sections
	commit(mutate: (s: CVState) => void, sections?: string[] | null): void {
		mutate(this._state);
		this._state = normalizeAll(this._state);
		if (sections !== null) this._doRender(sections);
		this._persist();
		this._notify();
	}

	// Color mutations: no render, no panel rebuild — CSS applied by caller
	commitColors(mutate: (colors: Record<string, string>, links: Record<string, string>) => void): void {
		mutate(this._themeColors, this._colorLinks);
		this._persist();
	}

	undo(): void {
		const snap = popUndo(this._snapshot());
		if (snap) this._applySnapshot(snap);
	}

	redo(): void {
		const snap = popRedo(this._snapshot());
		if (snap) this._applySnapshot(snap);
	}

	replace(snap: UndoSnapshot): void {
		this._applySnapshot(snap);
	}

	snapshot(): UndoSnapshot { return this._snapshot(); }

	setLastSaved(snap: UndoSnapshot): void { this._lastSaved = snap; }

	private _snapshot(): UndoSnapshot {
		return {
			state:       JSON.parse(JSON.stringify(this._state)),
			themeColors: JSON.parse(JSON.stringify(this._themeColors)),
			colorLinks:  JSON.parse(JSON.stringify(this._colorLinks)),
		};
	}

	private _persist(): void {
		const current = this._snapshot();
		push(this._lastSaved, current);
		saveState(this._state, this._themeColors, this._colorLinks, this._baseLinks);
		this._lastSaved = current;
	}

	private _doRender(sections?: string[]): void {
		if (!sections?.length) {
			this._renderer?.(this);
		} else {
			for (const s of sections) this._sectionRenderers.get(s)?.(this);
		}
	}

	private _notify(): void {
		for (const fn of this._observers) fn(this);
	}

	private _applySnapshot(snap: UndoSnapshot): void {
		this._state = JSON.parse(JSON.stringify(snap.state));
		for (const k of Object.keys(this._themeColors)) delete this._themeColors[k];
		Object.assign(this._themeColors, JSON.parse(JSON.stringify(snap.themeColors)));
		for (const k of Object.keys(this._colorLinks)) delete this._colorLinks[k];
		Object.assign(this._colorLinks, JSON.parse(JSON.stringify(snap.colorLinks)));
		this._applyThemeCss();
		this._colorRebuilder?.();
		this._renderer?.(this);
		saveState(this._state, this._themeColors, this._colorLinks, this._baseLinks);
		this._lastSaved = this._snapshot();
		updateUndoButtons();
		this._notify();
	}

	private _applyThemeCss(): void {
		const root = document.documentElement;
		for (const k of this._themeKeys) {
			const link = this._colorLinks[k];
			root.style.setProperty(`--${k}`, link ? (this._themeColors[link] ?? '#000000') : (this._themeColors[k] ?? ''));
		}
	}
}
