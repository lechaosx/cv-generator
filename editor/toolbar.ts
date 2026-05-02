import type { Store } from './store';
import type { ColorConfig } from './colors';
import { colorPanel, buildColorPanelContent, buildResetSnapshot } from './colors';
import { buildExport, openYamlModal, submitPreview } from './yaml';
import { LABELS } from './labels';
import { seed, token } from './storage';
import { updateUndoButtons } from './history';

export function setupToolbar(store: Store, colorCfg: ColorConfig): void {
	const toolbar = document.createElement('div');
	toolbar.id = 'edit-toolbar';
	toolbar.innerHTML = `
		<button id="btn-undo" title="Undo (Ctrl+Z)">↩</button>
		<button id="btn-redo" title="Redo (Ctrl+Y)">↪</button>
		<button id="btn-reset">Reset</button>
		<select id="lang-select" title="Language">
			${Object.keys(LABELS).map(code => `<option value="${code}">${({ en: 'English', cs: 'Čeština' } as Record<string, string>)[code] ?? code}</option>`).join('')}
		</select>
		<button id="btn-colors">🎨 Colors</button>
		<span style="flex:1"></span>
		<button id="btn-export">📋 YAML</button>
		<button id="btn-preview">Preview</button>
	`;
	document.body.appendChild(toolbar);
	document.body.style.paddingBottom = toolbar.offsetHeight + 'px';

	if (seed) setupSharePanel(toolbar);
	if (seed && token) setupSaveButton(toolbar, store, colorCfg);
	else setupForkButton(toolbar, store, colorCfg);

	buildColorPanelContent(store, colorCfg.themeKeys);
	document.body.appendChild(colorPanel);

	document.getElementById('btn-colors')!.addEventListener('click', () => {
		colorPanel.style.display = colorPanel.style.display === 'flex' ? 'none' : 'flex';
	});
	document.getElementById('btn-undo')!.addEventListener('click', () => store.undo());
	document.getElementById('btn-redo')!.addEventListener('click', () => store.redo());
	document.getElementById('btn-preview')!.addEventListener('click', () => submitPreview(store, colorCfg));
	document.getElementById('btn-export')!.addEventListener('click', () => openYamlModal(store, colorCfg));

	const langSelect = document.getElementById('lang-select') as HTMLSelectElement;
	langSelect.value = store.state.language;
	langSelect.addEventListener('change', () => {
		store.commit(s => { s.language = langSelect.value; });
	});

	document.getElementById('btn-reset')!.addEventListener('click', () => {
		store.replace(buildResetSnapshot(store, colorCfg));
	});

	document.addEventListener('keydown', e => {
		if ((document.activeElement as HTMLElement)?.getAttribute('contenteditable') === 'true') return;
		if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); store.undo(); }
		if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); store.redo(); }
	});

	updateUndoButtons();
}

function setupSharePanel(toolbar: HTMLElement): void {
	const roUrl = `${location.origin}/?seed=${encodeURIComponent(seed!)}`;
	const rwUrl = token ? `${location.origin}/edit?seed=${encodeURIComponent(seed!)}&token=${encodeURIComponent(token)}` : null;

	const sharePanel = document.createElement('div');
	sharePanel.id = 'share-panel';
	sharePanel.style.cssText = `
		position:fixed; bottom:52px; right:20px; z-index:9998;
		background:var(--panel-dark); border:1px solid var(--light); border-radius:8px;
		padding:16px; display:none; flex-direction:column; gap:10px;
		font-family:var(--condensed-font); font-size:13px; color:var(--text-dark); min-width:340px;
	`;
	sharePanel.appendChild(makeShareRow('View only', roUrl));
	if (rwUrl) sharePanel.appendChild(makeShareRow('Edit (keep private)', rwUrl));
	document.body.appendChild(sharePanel);

	const btnShare = document.createElement('button');
	btnShare.id = 'btn-share'; btnShare.textContent = 'Share';
	toolbar.appendChild(btnShare);

	btnShare.addEventListener('click', () => {
		sharePanel.style.display = sharePanel.style.display === 'flex' ? 'none' : 'flex';
	});
	document.addEventListener('click', e => {
		if (!sharePanel.contains(e.target as Node) && e.target !== btnShare) sharePanel.style.display = 'none';
	});
}

function makeShareRow(label: string, url: string): HTMLElement {
	const row = document.createElement('div'); row.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
	const lbl = document.createElement('span'); lbl.textContent = label;
	lbl.style.cssText = 'opacity:.6; font-size:11px; text-transform:uppercase; letter-spacing:.05em;';
	const controls = document.createElement('div'); controls.style.cssText = 'display:flex; gap:6px; align-items:center;';
	const input    = document.createElement('input');
	input.readOnly = true; input.value = url;
	input.style.cssText = 'flex:1; padding:4px 6px; border-radius:4px; border:1px solid var(--border-dark); background:#0a0a0e; color:#ccc; font-family:var(--mono-font); font-size:11px;';
	const btn = document.createElement('button'); btn.textContent = 'Copy';
	btn.addEventListener('click', () => {
		navigator.clipboard.writeText(url);
		btn.textContent = '✓';
		setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
	});
	controls.append(input, btn);
	row.append(lbl, controls);
	return row;
}

function setupSaveButton(toolbar: HTMLElement, store: Store, colorCfg: ColorConfig): void {
	const btnSave = document.createElement('button');
	btnSave.id = 'btn-save'; btnSave.textContent = 'Save';
	toolbar.appendChild(btnSave);

	btnSave.addEventListener('click', async () => {
		btnSave.disabled = true;
		try {
			const out  = await buildExport(store, colorCfg);
			const resp = await fetch(`/save?seed=${encodeURIComponent(seed!)}&token=${encodeURIComponent(token!)}`, {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify(out),
			});
			btnSave.textContent = resp.ok ? '✓ Saved' : '✗ Failed';
		} catch {
			btnSave.textContent = '✗ Error';
		} finally {
			btnSave.disabled = false;
			setTimeout(() => { btnSave.textContent = 'Save'; }, 2000);
		}
	});
}

function setupForkButton(toolbar: HTMLElement, store: Store, colorCfg: ColorConfig): void {
	const btnFork = document.createElement('button');
	btnFork.id = 'btn-fork'; btnFork.textContent = 'Fork';
	toolbar.appendChild(btnFork);

	btnFork.addEventListener('click', async () => {
		btnFork.disabled = true;
		try {
			const out  = await buildExport(store, colorCfg);
			const resp = await fetch('/fork', {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify(out),
			});
			if (resp.ok) {
				const { url } = await resp.json() as { url: string };
				location.href = url;
			} else {
				btnFork.textContent = '✗ Failed';
				setTimeout(() => { btnFork.textContent = 'Fork'; btnFork.disabled = false; }, 2000);
			}
		} catch {
			btnFork.textContent = '✗ Error';
			setTimeout(() => { btnFork.textContent = 'Fork'; btnFork.disabled = false; }, 2000);
		}
	});
}
