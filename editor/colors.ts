import type { Store } from './store';
import { COLORS_KEY, LINKS_KEY } from './storage';
import { warn } from './log';
import type { UndoSnapshot } from './types';

function rgbToHex(color: string): string {
	if (!color) return '#000000';
	if (color.startsWith('#')) return color;
	const m = color.match(/\d+/g);
	if (!m) return '#000000';
	return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
}

function resolveColor(val: string | undefined): string {
	if (!val) return '#000000';
	const s = String(val).trim();
	if (s.startsWith('#')) return s;
	if (s.startsWith('--')) return rgbToHex(getComputedStyle(document.documentElement).getPropertyValue(s).trim());
	return rgbToHex(s);
}

function parseColorScheme(): {
	BASE_COLORS: string[];
	DEFAULT_BASE_VALUES: Record<string, string>;
	DEFAULT_LINKS: Record<string, string>;
} {
	const BASE_COLORS: string[] = [];
	const DEFAULT_BASE_VALUES: Record<string, string> = {};
	const DEFAULT_LINKS: Record<string, string>       = {};
	for (const sheet of document.styleSheets) {
		if (!sheet.href?.includes('/static/style.css')) continue;
		try {
			for (const rule of sheet.cssRules) {
				if ((rule as CSSStyleRule).selectorText !== ':root') continue;
				const style = (rule as CSSStyleRule).style;
				for (let i = 0; i < style.length; i++) {
					const prop = style[i]!;
					if (!prop.startsWith('--')) continue;
					const key = prop.slice(2);
					const val = style.getPropertyValue(prop).trim();
					if (val.startsWith('#')) { BASE_COLORS.push(key); DEFAULT_BASE_VALUES[key] = val; }
				}
				for (let i = 0; i < style.length; i++) {
					const prop = style[i]!;
					if (!prop.startsWith('--')) continue;
					const key = prop.slice(2);
					const val = style.getPropertyValue(prop).trim();
					const m   = val.match(/^var\(--([a-z-]+)\)$/);
					if (m && BASE_COLORS.includes(m[1]!)) DEFAULT_LINKS[key] = m[1]!;
				}
				break;
			}
		} catch (e) { warn('Failed to parse color scheme from stylesheet', e); }
	}
	return { BASE_COLORS, DEFAULT_BASE_VALUES, DEFAULT_LINKS };
}

export const { BASE_COLORS, DEFAULT_BASE_VALUES, DEFAULT_LINKS } = parseColorScheme();

const VARIANT_KEYS = Object.keys(DEFAULT_LINKS);
const PANEL_COLORS = VARIANT_KEYS.filter(k => k.startsWith('panel'));
const DARK_COLORS  = VARIANT_KEYS.filter(k => k.endsWith('-dark')  && !k.startsWith('panel'));
const LIGHT_COLORS = VARIANT_KEYS.filter(k => k.endsWith('-light') && !k.startsWith('panel'));
const LINK_BASES   = [...new Set(Object.values(DEFAULT_LINKS))].sort(
	(a, b) => BASE_COLORS.indexOf(a) - BASE_COLORS.indexOf(b),
);

const BASE_LABEL_OVERRIDES: Record<string, string> = { light: 'Accent' };
const BASE_LABELS = Object.fromEntries(
	BASE_COLORS.map(k => [k, BASE_LABEL_OVERRIDES[k] ?? k.charAt(0).toUpperCase() + k.slice(1)]),
);

function variantLabel(key: string): string {
	return key.replace(/-(dark|light)$/, '').split('-')
		.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export const colorPanel = document.createElement('div');
colorPanel.id = 'edit-color-panel';
colorPanel.innerHTML = '<strong>Theme Colors</strong>';

export interface ColorConfig {
	themeKeys: string[];
	BASE_LINKS: Record<string, string>;
	BASE_COLORS: string[];
	DEFAULT_BASE_VALUES: Record<string, string>;
	DEFAULT_LINKS: Record<string, string>;
}

export function initColors(store: Store): ColorConfig {
	const root          = document.documentElement;
	const computed      = getComputedStyle(root);
	const savedColors   = JSON.parse(localStorage.getItem(COLORS_KEY) ?? '{}') as Record<string, string>;
	const savedLinkDelta = JSON.parse(localStorage.getItem(LINKS_KEY) ?? '{}') as Record<string, string>;

	const themeKeys = [...new Set([
		...BASE_COLORS, ...PANEL_COLORS, ...DARK_COLORS, ...LIGHT_COLORS,
		...Object.keys(store.state.theme ?? {}).filter(k =>
			!BASE_COLORS.includes(k) && !PANEL_COLORS.includes(k) && !DARK_COLORS.includes(k) && !LIGHT_COLORS.includes(k),
		),
	])];

	const BASE_LINKS: Record<string, string> = { ...DEFAULT_LINKS };
	for (const [k, v] of Object.entries(store.state.theme ?? {})) {
		if (BASE_COLORS.includes(k) || PANEL_COLORS.includes(k)) continue;
		if (String(v).startsWith('--')) BASE_LINKS[k] = String(v).slice(2);
		else delete BASE_LINKS[k];
	}

	const colorLinks: Record<string, string> = { ...BASE_LINKS };
	for (const [k, v] of Object.entries(savedLinkDelta)) {
		if (v) colorLinks[k] = v;
		else delete colorLinks[k];
	}

	const themeColors: Record<string, string> = {};
	for (const k of themeKeys) {
		themeColors[k] = savedColors[k] ?? resolveColor(store.state.theme?.[k] as string | undefined ?? computed.getPropertyValue(`--${k}`).trim());
		if (savedColors[k] && !colorLinks[k]) root.style.setProperty(`--${k}`, savedColors[k]);
	}
	for (const [ck, base] of Object.entries(colorLinks)) {
		if (!BASE_COLORS.includes(ck)) root.style.setProperty(`--${ck}`, themeColors[base] ?? '#000000');
	}

	store.initColorState(themeColors, colorLinks);
	store.setColorConfig(themeKeys, BASE_LINKS);
	store.setColorRebuilder(() => buildColorPanelContent(store, themeKeys));

	return { themeKeys, BASE_LINKS, BASE_COLORS, DEFAULT_BASE_VALUES, DEFAULT_LINKS };
}

const colorInputs: Record<string, HTMLInputElement> = {};

function getLinkedHex(store: Store, k: string): string {
	const base = store.colorLinks[k];
	return base ? (store.themeColors[base] ?? '#000000') : (store.themeColors[k] ?? '#000000');
}

function applyLinkedColor(store: Store, ck: string): void {
	const hex = getLinkedHex(store, ck);
	document.documentElement.style.setProperty(`--${ck}`, hex);
	const inp = colorInputs[ck];
	if (inp) inp.value = hex;
}

function makeColorInput(store: Store, k: string, isBase: boolean): HTMLInputElement {
	const input = document.createElement('input');
	input.type  = 'color';
	input.value = getLinkedHex(store, k);
	colorInputs[k] = input;
	input.addEventListener('input', () => {
		store.commitColors((colors, links) => {
			colors[k] = input.value;
			document.documentElement.style.setProperty(`--${k}`, input.value);
			if (isBase) {
				for (const [ck, base] of Object.entries(links)) {
					if (base === k) applyLinkedColor(store, ck);
				}
			}
		});
	});
	return input;
}

function makeVariantControls(store: Store, k: string): HTMLElement {
	const wrap     = document.createElement('div'); wrap.className = 'color-variant-controls';
	const dotsWrap = document.createElement('div'); dotsWrap.className = 'color-link-dots';
	const dots: Record<string, HTMLButtonElement> = {};

	for (const base of LINK_BASES) {
		const dot = document.createElement('button');
		dot.className = 'color-link-dot';
		dot.title = BASE_LABELS[base] ?? base;
		dot.style.background = `var(--${base})`;
		if (store.colorLinks[k] === base) dot.classList.add('active');
		dot.addEventListener('click', () => {
			if (store.colorLinks[k] === base) {
				store.commitColors((colors, links) => {
					delete links[k];
					colors[k] = input.value;
					document.documentElement.style.setProperty(`--${k}`, input.value);
				});
				dot.classList.remove('active');
				input.classList.remove('is-linked');
			} else {
				if (store.colorLinks[k]) dots[store.colorLinks[k]]?.classList.remove('active');
				store.commitColors((colors, links) => {
					links[k] = base;
					applyLinkedColor(store, k);
				});
				dot.classList.add('active');
				input.classList.add('is-linked');
			}
			checkReset();
		});
		dots[base] = dot;
		dotsWrap.appendChild(dot);
	}

	const input = makeColorInput(store, k, false);
	if (store.colorLinks[k]) input.classList.add('is-linked');
	input.addEventListener('input', () => {
		if (!store.colorLinks[k]) return;
		dots[store.colorLinks[k]]?.classList.remove('active');
		store.commitColors((_colors, links) => { delete links[k]; });
		input.classList.remove('is-linked');
		checkReset();
	});

	const resetBtn = document.createElement('button');
	resetBtn.className = 'color-reset-btn'; resetBtn.title = 'Reset to default'; resetBtn.textContent = '↺';
	const checkReset = (): void => {
		// We need BASE_LINKS here — read from store's config via colorLinks default
		resetBtn.style.opacity = store.colorLinks[k] === DEFAULT_LINKS[k] ? '0' : '';
	};
	checkReset();
	resetBtn.addEventListener('click', () => {
		if (store.colorLinks[k]) dots[store.colorLinks[k]]?.classList.remove('active');
		const defaultLink = DEFAULT_LINKS[k];
		store.commitColors((_colors, links) => {
			if (defaultLink) { links[k] = defaultLink; applyLinkedColor(store, k); }
			else { delete links[k]; }
		});
		if (defaultLink) { dots[defaultLink]?.classList.add('active'); input.classList.add('is-linked'); }
		else input.classList.remove('is-linked');
		checkReset();
	});

	wrap.append(dotsWrap, input, resetBtn);
	return wrap;
}

export function buildColorPanelContent(store: Store, themeKeys: string[]): void {
	while (colorPanel.children.length > 1) colorPanel.lastChild!.remove();
	for (const k of Object.keys(colorInputs)) delete colorInputs[k];

	const baseRow = document.createElement('div'); baseRow.className = 'color-base-row';
	for (const k of BASE_COLORS) {
		const swatch     = document.createElement('div'); swatch.className = 'color-swatch';
		const yamlVal    = store.state.theme?.[k] as string | undefined;
		const defaultVal = yamlVal ? resolveColor(yamlVal) : (DEFAULT_BASE_VALUES[k] ?? '#000000');
		const input      = makeColorInput(store, k, true);
		const resetBtn   = document.createElement('button');
		resetBtn.className = 'color-reset-btn'; resetBtn.title = 'Reset to default'; resetBtn.textContent = '↺';
		const checkReset = (): void => { resetBtn.style.display = store.themeColors[k] === defaultVal ? 'none' : ''; };
		checkReset();
		input.addEventListener('input', checkReset);
		resetBtn.addEventListener('click', () => {
			store.commitColors((colors, links) => {
				colors[k] = defaultVal;
				document.documentElement.style.setProperty(`--${k}`, defaultVal);
				input.value = defaultVal;
				for (const [ck, base] of Object.entries(links)) {
					if (base === k) applyLinkedColor(store, ck);
				}
			});
			checkReset();
		});
		const lbl    = document.createElement('label'); lbl.textContent = BASE_LABELS[k] ?? k;
		const lblRow = document.createElement('div'); lblRow.style.cssText = 'display:flex;align-items:center;gap:3px;';
		lblRow.append(lbl, resetBtn);
		swatch.append(input, lblRow);
		baseRow.appendChild(swatch);
	}
	colorPanel.appendChild(baseRow);

	const variants = document.createElement('div'); variants.className = 'color-variants';
	variants.appendChild(document.createElement('div'));
	const darkHdr  = document.createElement('div'); darkHdr.className  = 'color-col-title'; darkHdr.textContent  = 'Dark';
	const lightHdr = document.createElement('div'); lightHdr.className = 'color-col-title'; lightHdr.textContent = 'Light';
	variants.append(darkHdr, lightHdr);
	const panelLabel = document.createElement('div'); panelLabel.textContent = 'Surface'; panelLabel.style.cssText = 'font-size:13px;';
	variants.append(panelLabel, makeVariantControls(store, 'panel-dark'), makeVariantControls(store, 'panel-light'));

	for (let i = 0; i < DARK_COLORS.length; i++) {
		const label = document.createElement('div'); label.textContent = variantLabel(DARK_COLORS[i]!); label.style.cssText = 'font-size:13px;';
		variants.append(label, makeVariantControls(store, DARK_COLORS[i]!), makeVariantControls(store, LIGHT_COLORS[i]!));
	}
	colorPanel.appendChild(variants);
}

export function buildResetSnapshot(store: Store, colorCfg: ColorConfig): UndoSnapshot {
	const resetState      = structuredClone(window.CV_DATA) as typeof store.state;
	const resetColorLinks = { ...colorCfg.BASE_LINKS };
	const resetThemeColors: Record<string, string> = {};

	for (const k of BASE_COLORS) {
		const yamlVal = resetState.theme?.[k] as string | undefined;
		resetThemeColors[k] = (yamlVal && String(yamlVal).startsWith('#')) ? yamlVal : (DEFAULT_BASE_VALUES[k] ?? '#000000');
	}
	for (const k of [...PANEL_COLORS, ...DARK_COLORS, ...LIGHT_COLORS]) {
		const link = colorCfg.BASE_LINKS[k];
		if (link) {
			resetThemeColors[k] = resetThemeColors[link] ?? '#000000';
		} else {
			const s = String(resetState.theme?.[k] ?? '');
			if (s.startsWith('#'))   resetThemeColors[k] = s;
			else if (s.startsWith('--')) resetThemeColors[k] = resetThemeColors[s.slice(2)] ?? '#000000';
			else resetThemeColors[k] = '#000000';
		}
	}
	return { state: resetState, themeColors: resetThemeColors, colorLinks: resetColorLinks };
}
