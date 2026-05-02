import { ensureRef, resolvePhotoRef, storePhotoData, photoCache } from './idb';
import { PHOTO_REF_PREFIX } from './storage';
import type { Store } from './store';

export const PHOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
	<circle cx="50" cy="50" r="50" fill="var(--white)"/>
	<circle cx="50" cy="38" r="18" fill="var(--light)"/>
	<ellipse cx="50" cy="90" rx="30" ry="22" fill="var(--light)"/>
</svg>`;

export function attachImageDrop(el: HTMLElement | HTMLInputElement, onResult: (value: string, name?: string) => void): void {
	el.classList.add('drop-target');
	el.ondragenter = e => { e.preventDefault(); e.stopPropagation(); el.classList.add('dropping'); };
	el.ondragover  = e => { e.preventDefault(); e.stopPropagation(); };
	el.ondragleave = e => { if (!el.contains(e.relatedTarget as Node)) el.classList.remove('dropping'); };
	el.ondrop = e => {
		e.preventDefault(); e.stopPropagation();
		el.classList.remove('dropping');
		const file = e.dataTransfer?.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = () => onResult(reader.result as string, file.name);
			reader.readAsDataURL(file);
			return;
		}
		const fromUriList = (e.dataTransfer?.getData('text/uri-list') ?? '')
			.split(/\r?\n/).find(l => l && !l.startsWith('#'));
		const url = (fromUriList ?? e.dataTransfer?.getData('text/plain') ?? '').trim();
		if (url) onResult(url);
	};
}

let dragActiveTimer: ReturnType<typeof setTimeout>;
document.addEventListener('dragover', () => {
	document.body.classList.add('drag-active');
	clearTimeout(dragActiveTimer);
	dragActiveTimer = setTimeout(() => document.body.classList.remove('drag-active'), 100);
}, true);
document.addEventListener('drop', () => {
	clearTimeout(dragActiveTimer);
	document.body.classList.remove('drag-active');
});

export async function commitPhoto(store: Store, value: string, name?: string): Promise<void> {
	const ref = await ensureRef(value, name);
	store.commit(s => { s.photo = ref; }, ['photo']);
}

export async function renderPhoto(store: Store): Promise<void> {
	const photoDiv = document.querySelector<HTMLElement>('.photo');
	if (!photoDiv) return;
	photoDiv.style.cursor = 'pointer';
	photoDiv.title = 'Click to edit photo, or drop an image';
	photoDiv.onclick = () => openPhotoEdit(store);
	attachImageDrop(photoDiv, (value, name) => commitPhoto(store, value, name));
	const ref = store.state.photo;
	if (!ref) { photoDiv.innerHTML = PHOTO_SVG; return; }
	const record = await resolvePhotoRef(ref);
	if (store.state.photo !== ref) return;
	if (!record?.data) { photoDiv.innerHTML = PHOTO_SVG; return; }
	const img = document.createElement('img');
	img.alt = ''; img.width = 400;
	img.onerror = () => { photoDiv.innerHTML = PHOTO_SVG; };
	img.src = record.data;
	photoDiv.innerHTML = '';
	photoDiv.appendChild(img);
}

function refToDisplay(ref: string): string {
	if (!ref) return '';
	if (!ref.startsWith(PHOTO_REF_PREFIX)) return ref;
	const hash = ref.slice(PHOTO_REF_PREFIX.length);
	return photoCache.get(hash)?.name ?? hash;
}

export function openPhotoEdit(store: Store): void {
	const modal = document.createElement('div');
	modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;';
	modal.innerHTML = `
		<div style="background:var(--panel-dark);border:1px solid var(--light);border-radius:8px;padding:24px;width:min(500px,90vw);display:flex;flex-direction:column;gap:12px;color:var(--text-dark);font-family:var(--condensed-font);">
			<strong>Photo URL</strong>
			<input type="url" id="photo-url" placeholder="https://..." style="padding:6px;border-radius:4px;border:1px solid var(--border-dark);background:#0a0a0e;color:#ccc;font-family:var(--mono-font);font-size:12px;">
			<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
				<button id="photo-reset" title="Reset to default" style="background:none;border:none;color:inherit;cursor:pointer;opacity:.5;font-size:18px;padding:0;line-height:1;">↺</button>
				<div style="display:flex;gap:8px;">
					<button id="photo-cancel" style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:#444;color:white;font-family:var(--condensed-font);">Cancel</button>
					<button id="photo-apply" style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;background:var(--button-dark);color:var(--button-text-dark);font-family:var(--condensed-font);">Apply</button>
				</div>
			</div>
		</div>`;
	document.body.appendChild(modal);
	document.body.classList.add('photo-modal-open');

	const urlEl    = modal.querySelector<HTMLInputElement>('#photo-url')!;
	let pendingRef = store.state.photo ?? '';
	let typedMode  = false;

	resolvePhotoRef(pendingRef).then(() => { urlEl.value = refToDisplay(pendingRef); });
	urlEl.value = refToDisplay(pendingRef);
	urlEl.focus();
	urlEl.addEventListener('input', () => { typedMode = true; });

	attachImageDrop(urlEl, async (value, name) => {
		typedMode  = false;
		pendingRef = value.startsWith('data:') ? await storePhotoData(value, name) : value;
		urlEl.value = refToDisplay(pendingRef);
	});

	const close = () => { document.body.classList.remove('photo-modal-open'); modal.remove(); };
	const apply = () => {
		close();
		if (typedMode) commitPhoto(store, urlEl.value.trim());
		else if (pendingRef !== store.state.photo) commitPhoto(store, pendingRef);
	};

	urlEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
	modal.querySelector('#photo-apply')!.addEventListener('click', apply);
	modal.querySelector('#photo-reset')!.addEventListener('click', () => {
		pendingRef = window.CV_DATA?.photo ?? '';
		typedMode  = false;
		resolvePhotoRef(pendingRef).then(() => { urlEl.value = refToDisplay(pendingRef); });
		urlEl.value = refToDisplay(pendingRef);
	});
	modal.querySelector('#photo-cancel')!.addEventListener('click', close);
	modal.addEventListener('click', e => { if (e.target === modal) close(); });
}
