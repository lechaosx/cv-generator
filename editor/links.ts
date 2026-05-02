import { state, t } from './app-state';
import { persist } from './history';
import { normalizeLinks } from './normalize';
import { enableDragSort, dragOnlyOutsideText } from './drag-sort';
import { activateOnInteract } from './text-edit';

type LinkEntry = { platform: string; url: string };

function stateLinks(): LinkEntry[] {
	return state.links as LinkEntry[];
}

export function setupConnectEdit(): void {
	const additionalInfo = document.querySelector<HTMLElement>('.additional-info');
	if (!additionalInfo) return;

	let section = additionalInfo.querySelector<HTMLElement>('.connect');
	if (!section) {
		section = document.createElement('section');
		section.className = 'connect';
		section.innerHTML = `<h2 class="section-header" data-label="connect">${t('connect')}</h2>`;
		const cvGen = additionalInfo.querySelector('.cv-gen');
		additionalInfo.insertBefore(section, cvGen ?? null);
	}

	function renderLinks(): void {
		section!.querySelectorAll('.edit-link-row').forEach(el => el.remove());
		section!.querySelectorAll('a').forEach(a => (a as HTMLElement).style.display = 'none');
		stateLinks().forEach((_, idx) => section!.appendChild(makeRow(idx)));
	}

	function makeRow(idx: number): HTMLElement {
		const link    = stateLinks()[idx]!;
		const isEmpty = !((link.platform ?? '').trim() || (link.url ?? '').trim());

		const row = document.createElement('div');
		row.className = 'edit-link-row';
		row.style.cssText = 'display:flex;gap:6px;align-items:center;';
		if (!isEmpty) { row.dataset['dragIdx'] = String(idx); row.draggable = true; dragOnlyOutsideText(row); }

		const pEl = document.createElement('span');
		pEl.contentEditable = !(link.platform ?? '').trim() ? 'true' : 'false';
		pEl.draggable = false;
		pEl.textContent = link.platform;
		pEl.style.cssText = 'min-width:60px;font-weight:bold;';
		pEl.dataset['placeholderKey'] = 'platform';
		pEl.setAttribute('data-placeholder', t('platform'));
		if ((link.platform ?? '').trim()) activateOnInteract(pEl);

		const sep = document.createElement('span');
		sep.textContent = '·'; sep.style.opacity = '.4';

		const uEl = document.createElement('span');
		uEl.contentEditable = !(link.url ?? '').trim() ? 'true' : 'false';
		uEl.draggable = false;
		uEl.textContent = link.url;
		uEl.style.cssText = 'flex:1;';
		uEl.dataset['placeholderKey'] = 'url';
		uEl.setAttribute('data-placeholder', t('url'));
		if ((link.url ?? '').trim()) activateOnInteract(uEl);

		let saveTimer: ReturnType<typeof setTimeout>;
		const scheduleSave = () => {
			clearTimeout(saveTimer);
			saveTimer = setTimeout(() => {
				if (document.activeElement === pEl || document.activeElement === uEl) return;
				const entry = stateLinks()[idx];
				if (!entry) return;
				entry.platform = pEl.textContent?.trim() ?? '';
				entry.url      = uEl.textContent?.trim() ?? '';
				normalizeLinks();
				persist();
				renderLinks();
			}, 100);
		};

		pEl.addEventListener('blur', () => { if ((link.platform ?? '').trim()) pEl.contentEditable = 'false'; scheduleSave(); });
		uEl.addEventListener('blur', () => { if ((link.url ?? '').trim()) uEl.contentEditable = 'false'; scheduleSave(); });
		[pEl, uEl].forEach(el => {
			el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
		});

		row.append(pEl, sep, uEl);
		return row;
	}

	if (!section.dataset['dragInited']) {
		section.dataset['dragInited'] = '1';
		enableDragSort(section, '.edit-link-row',
			stateLinks,
			v => { state.links = v; },
			() => { normalizeLinks(); persist(); renderLinks(); },
		);
	}

	renderLinks();
}
