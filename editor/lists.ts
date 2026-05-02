import { enableDragSort } from './drag-sort';
import { placeCaretAtPoint, activateOnInteract } from './text-edit';

export function makeStringList(
	container: HTMLElement,
	get: () => readonly string[],
	onCommit:  (values: string[]) => void,
	onPersist: (values: string[]) => void,
	placeholderKey: string,
): void {
	function render(): void {
		container.innerHTML = '';
		get().forEach((item, i) => {
			const isNonEmpty = !!(item && String(item).trim());
			const wrap = document.createElement('span');
			wrap.className = 'drag-item';
			wrap.style.cssText = 'display:inline-flex;align-items:baseline;gap:2px;';
			if (isNonEmpty) { wrap.dataset['dragIdx'] = String(i); wrap.draggable = true; }

			const el = document.createElement('span');
			el.textContent = item;
			el.contentEditable = isNonEmpty ? 'false' : 'true';
			el.draggable = false;
			el.dataset['placeholderKey'] = placeholderKey;

			if (isNonEmpty) {
				const enterEdit = (x?: number, y?: number): void => {
					wrap.draggable = false;
					el.contentEditable = 'true';
					el.focus();
					if (x != null && y != null) placeCaretAtPoint(x, y);
				};
				el.addEventListener('dblclick', e => {
					if (el.contentEditable === 'true') return;
					e.stopPropagation(); e.preventDefault();
					enterEdit(e.clientX, e.clientY);
				});
				let pressTimer: ReturnType<typeof setTimeout>;
				el.addEventListener('touchstart', e => {
					if (el.contentEditable === 'true') return;
					const touch = e.touches[0];
					pressTimer = setTimeout(() => { e.preventDefault(); enterEdit(touch?.clientX, touch?.clientY); }, 500);
				}, { passive: false });
				el.addEventListener('touchmove',  () => clearTimeout(pressTimer));
				el.addEventListener('touchend',   () => clearTimeout(pressTimer));
			}

			el.addEventListener('blur', e => {
				if (isNonEmpty) { el.contentEditable = 'false'; wrap.draggable = true; }
				const next = [...get()];
				next[i] = el.textContent?.trim() ?? '';
				if (!container.contains(e.relatedTarget as Node)) {
					onCommit(next);
				} else {
					onPersist(next);
				}
			});
			el.addEventListener('keydown', e => {
				if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
				if (e.key === 'Escape') { el.textContent = item; el.blur(); }
			});

			wrap.appendChild(el);
			container.appendChild(wrap);
		});
	}

	if (!container.dataset['dragInited']) {
		container.dataset['dragInited'] = '1';
		enableDragSort(container, '.drag-item', get, onCommit, 'h');
	}
	render();
}
