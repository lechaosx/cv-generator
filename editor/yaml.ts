import { state, themeColors, colorLinks } from './app-state';
import { persist } from './history';
import { isEntryEmpty } from './normalize';
import { ensureRef, resolvePhotoRef } from './idb';
import { PHOTO_REF_PREFIX } from './storage';
import { themeKeys, BASE_COLORS, DEFAULT_BASE_VALUES, DEFAULT_LINKS } from './colors';

export const TOP_ORDER = ['title_before_name', 'name', 'title_after_name', 'position', 'phone', 'email', 'location', 'description', 'interests', 'links', 'theme', 'experience', 'education', 'language', 'photo'];
export const EXP_ORDER = ['title', 'company', 'start_month', 'start_year', 'end_month', 'end_year', 'description', 'badges'];
export const EDU_ORDER = ['title', 'institution', 'subinstitution', 'start_month', 'start_year', 'end_month', 'end_year', 'description'];

export function reorderKeys<T extends Record<string, unknown>>(obj: T, order: string[]): T {
	const out: Record<string, unknown> = {};
	for (const k of order) if (k in obj) out[k] = obj[k];
	for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
	return out as T;
}

export function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v == null) continue;
		if (typeof v === 'string' && !v.trim()) continue;
		if (Array.isArray(v) && v.length === 0) continue;
		if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
		out[k] = v;
	}
	return out as Partial<T>;
}

function yamlStr(s: unknown): string {
	if (s == null || s === '') return '""';
	const str = String(s);
	if (/[:#\[\]{}"'\n\\|>]/.test(str) || str.startsWith(' ') || str.startsWith('-') || str.startsWith('!'))
		return '"' + str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
	return str;
}

export function toYaml(obj: Record<string, unknown>, indent = 0): string {
	const sp = '  '.repeat(indent);
	let out = '';
	for (const [k, v] of Object.entries(obj)) {
		if (v == null) {
			out += `${sp}${k}: ""\n`;
		} else if (typeof v === 'string') {
			out += `${sp}${k}: ${yamlStr(v)}\n`;
		} else if (Array.isArray(v)) {
			if (!v.length) {
				out += `${sp}${k}: []\n`;
			} else if (typeof v[0] !== 'object') {
				out += `${sp}${k}:\n`;
				for (const item of v) out += `${sp}  - ${yamlStr(String(item))}\n`;
			} else {
				out += `${sp}${k}:\n`;
				for (const item of v as Record<string, unknown>[]) {
					let first = true;
					for (const [ik, iv] of Object.entries(item)) {
						const prefix = first ? `${sp}  - ` : `${sp}    `;
						first = false;
						if (Array.isArray(iv))
							out += `${prefix}${ik}: [${iv.map(s => yamlStr(String(s))).join(', ')}]\n`;
						else
							out += `${prefix}${ik}: ${yamlStr(String(iv ?? ''))}\n`;
					}
				}
			}
		} else if (typeof v === 'object') {
			out += `${sp}${k}:\n`;
			out += toYaml(v as Record<string, unknown>, indent + 1);
		}
	}
	return out;
}

export async function buildExport(): Promise<Record<string, unknown>> {
	const out = structuredClone(state) as Record<string, unknown> & typeof state;

	if (out.photo?.startsWith(PHOTO_REF_PREFIX)) {
		const r = await resolvePhotoRef(out.photo);
		out.photo = r?.data ?? '';
	}

	const head = (arr: unknown[]) => { while (arr?.length && isEntryEmpty(arr[0])) arr.shift(); };
	head(out.experience); head(out.education);
	if (Array.isArray(out.interests)) out.interests = out.interests.filter(s => s && String(s).trim());
	if (Array.isArray(out.experience)) {
		for (const job of out.experience) job.badges = (job.badges ?? []).filter((s: unknown) => s && String(s).trim());
	}

	if (Array.isArray(out.links)) {
		const dict: Record<string, string> = {};
		for (const { platform, url } of out.links as Array<{ platform: string; url: string }>) {
			const p = (platform ?? '').trim();
			const u = (url ?? '').trim();
			if (p && u) dict[p] = u;
		}
		if (Object.keys(dict).length) out.links = dict;
		else delete (out as Record<string, unknown>)['links'];
	}

	const theme: Record<string, string> = {};
	for (const k of themeKeys) {
		const v    = themeColors[k]!;
		const link = colorLinks[k];
		if (BASE_COLORS.includes(k) && v === DEFAULT_BASE_VALUES[k]) continue;
		if (link) {
			if (DEFAULT_LINKS[k] === link) continue;
			theme[k] = `--${link}`;
		} else {
			theme[k] = v;
		}
	}
	if (Object.keys(theme).length) out.theme = theme;
	else delete (out as Record<string, unknown>)['theme'];

	if (Array.isArray(out.experience)) out.experience = out.experience.map(e => stripEmpty(reorderKeys(e as unknown as Record<string, unknown>, EXP_ORDER))) as unknown as typeof out.experience;
	if (Array.isArray(out.education))  out.education  = out.education.map(e => stripEmpty(reorderKeys(e as unknown as Record<string, unknown>, EDU_ORDER))) as unknown as typeof out.education;
	return stripEmpty(reorderKeys(out as Record<string, unknown>, TOP_ORDER)) as Record<string, unknown>;
}

let renderCallback: (() => void) | null = null;
let yamlModal: HTMLElement | null       = null;

export function initYaml(callbacks: { onRender: () => void }): void {
	renderCallback = callbacks.onRender;
}

export function updateYamlModalIfOpen(): void {
	if (!yamlModal) return;
	buildExport().then(o => {
		const ta = yamlModal?.querySelector('textarea');
		if (ta) ta.value = toYaml(o);
	});
}

export function openYamlModal(): void {
	if (yamlModal) return;
	buildExport().then(yaml => {
		yamlModal = document.createElement('div');
		yamlModal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;';
		yamlModal.innerHTML = `
			<div style="background:var(--panel-dark);border:1px solid var(--light);border-radius:8px;padding:24px;width:min(700px,90vw);display:flex;flex-direction:column;gap:12px;">
				<div style="display:flex;justify-content:space-between;align-items:center;color:var(--text-dark);font-family:var(--condensed-font);">
					<strong>YAML</strong>
					<div style="display:flex;gap:8px;align-items:center;">
						<button id="modal-reset" title="Reset to default" style="background:none;border:none;color:inherit;cursor:pointer;opacity:.5;font-size:18px;padding:0;line-height:1;">↺</button>
						<button id="modal-apply" style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:var(--button-dark);color:var(--button-text-dark);font-family:var(--condensed-font);">Apply</button>
						<button id="modal-copy"  style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:var(--button-dark);color:var(--button-text-dark);font-family:var(--condensed-font);">Copy</button>
						<button id="modal-close" style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:#444;color:white;font-family:var(--condensed-font);">✕</button>
					</div>
				</div>
				<textarea spellcheck="false" style="font-family:var(--mono-font);font-size:12px;background:#0a0a0e;color:#ccc;border:1px solid var(--border-dark);border-radius:4px;padding:12px;height:60vh;resize:none;width:100%;"></textarea>
				<div id="yaml-error" style="color:#e07070;font-family:var(--mono-font);font-size:12px;display:none;white-space:pre-wrap;"></div>
			</div>`;
		const textarea = yamlModal.querySelector('textarea')!;
		const errEl    = yamlModal.querySelector<HTMLElement>('#yaml-error')!;
		textarea.value = toYaml(yaml);
		document.body.appendChild(yamlModal);

		yamlModal.querySelector('#modal-reset')!.addEventListener('click', () => {
			const defaultData = structuredClone(window.CV_DATA ?? {}) as Record<string, unknown>;
			if (Array.isArray(defaultData['experience'])) {
				defaultData['experience'] = (defaultData['experience'] as Record<string, unknown>[]).map(e => stripEmpty(reorderKeys(e, EXP_ORDER)));
			}
			if (Array.isArray(defaultData['education'])) {
				defaultData['education'] = (defaultData['education'] as Record<string, unknown>[]).map(e => stripEmpty(reorderKeys(e, EDU_ORDER)));
			}
			textarea.value = toYaml(stripEmpty(reorderKeys(defaultData, TOP_ORDER)) as Record<string, unknown>);
		});

		yamlModal.querySelector('#modal-apply')!.addEventListener('click', async () => {
			try {
				const parsed = window.jsyaml.load(textarea.value);
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('YAML must be a mapping');
				const p = parsed as Record<string, unknown>;
				if (p['photo']) p['photo'] = await ensureRef(p['photo'] as string);
				for (const k of Object.keys(state)) delete (state as Record<string, unknown>)[k];
				Object.assign(state, p);
				persist();
				errEl.style.display = 'none';
				renderCallback?.();
			} catch (e) {
				errEl.textContent = String((e as Error).message ?? e);
				errEl.style.display = 'block';
			}
		});

		yamlModal.querySelector('#modal-copy')!.addEventListener('click', e => {
			navigator.clipboard.writeText(textarea.value);
			const btn = e.currentTarget as HTMLButtonElement;
			btn.textContent = 'Copied!';
			setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
		});

		const close = () => { yamlModal!.remove(); yamlModal = null; };
		yamlModal.querySelector('#modal-close')!.addEventListener('click', close);
		yamlModal.addEventListener('click', e => { if (e.target === yamlModal) close(); });
	});
}

export async function submitPreview(): Promise<void> {
	const out   = await buildExport();
	const form  = document.createElement('form');
	form.method = 'POST'; form.action = '/preview'; form.target = '_blank';
	const input = document.createElement('input');
	input.type = 'hidden'; input.name = 'data'; input.value = JSON.stringify(out);
	form.appendChild(input);
	document.body.appendChild(form);
	form.submit();
	form.remove();
}
