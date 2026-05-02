export function dragOnlyOutsideText(el: HTMLElement): void {
	el.addEventListener('mousedown', e => {
		el.draggable = !(e.target as Element).closest('[contenteditable="true"]');
	});
	el.addEventListener('mouseup', () => { el.draggable = true; });
}

export function enableDragSort<T>(
	container: HTMLElement,
	itemSelector: string,
	getList: () => T[],
	setList: (list: T[]) => void,
	onChange: () => void,
	axis: 'v' | 'h' = 'v',
): void {
	let dragKey: string | null   = null;
	let dropTarget: { key: string; before: boolean } | null = null;

	function removeLine(): void { document.getElementById('drop-line')?.remove(); }

	function showLine(targetEls: Element[], before: boolean): void {
		removeLine();
		const first = targetEls[0]!.getBoundingClientRect();
		const last  = targetEls[targetEls.length - 1]!.getBoundingClientRect();
		const line  = document.createElement('div');
		line.id = 'drop-line';
		line.style.cssText = 'position:absolute;background:var(--light);z-index:9999;pointer-events:none;border-radius:1px;';
		if (axis === 'h') {
			const x = before ? first.left : last.right;
			line.style.left   = (x + scrollX - 1) + 'px';
			line.style.top    = (first.top + scrollY) + 'px';
			line.style.width  = '2px';
			line.style.height = (first.bottom - first.top) + 'px';
		} else {
			const y = before ? first.top : last.bottom;
			line.style.left   = (first.left + scrollX) + 'px';
			line.style.top    = (y + scrollY - 1) + 'px';
			line.style.width  = (last.right - first.left) + 'px';
			line.style.height = '2px';
		}
		document.body.appendChild(line);
	}

	container.addEventListener('dragstart', e => {
		const item = (e.target as Element).closest(itemSelector) as HTMLElement | null;
		if (!item?.dataset['dragIdx'] || !container.contains(item)) return;
		e.stopPropagation();
		dragKey = item.dataset['dragIdx'];
		container.querySelectorAll(`${itemSelector}[data-drag-idx="${CSS.escape(dragKey)}"]`)
			.forEach(el => el.classList.add('dragging'));
		e.dataTransfer!.effectAllowed = 'move';
		e.dataTransfer!.setData('text/plain', '');
	});

	container.addEventListener('dragover', e => {
		if (dragKey == null) return;
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer!.dropEffect = 'move';
		const target = (e.target as Element).closest(itemSelector) as HTMLElement | null;
		if (!target?.dataset['dragIdx'] || !container.contains(target) || target.dataset['dragIdx'] === dragKey) {
			removeLine(); dropTarget = null; return;
		}
		const rect   = target.getBoundingClientRect();
		const before = axis === 'h'
			? e.clientX < rect.left + rect.width / 2
			: e.clientY < rect.top  + rect.height / 2;
		const targetEls = [...container.querySelectorAll(`${itemSelector}[data-drag-idx="${CSS.escape(target.dataset['dragIdx']!)}"]`)];
		if (!targetEls.length) return;
		showLine(targetEls, before);
		dropTarget = { key: target.dataset['dragIdx']!, before };
	});

	container.addEventListener('dragleave', e => {
		if (!container.contains(e.relatedTarget as Node)) { removeLine(); dropTarget = null; }
	});

	container.addEventListener('drop', e => {
		if (dragKey == null) return;
		e.preventDefault(); e.stopPropagation();
		if (dropTarget && dropTarget.key !== dragKey) {
			const fromIdx = +dragKey;
			const toIdx   = +dropTarget.key;
			let insertAt  = toIdx + (dropTarget.before ? 0 : 1);
			if (fromIdx < insertAt) insertAt--;
			const list = [...getList()];
			const [moved] = list.splice(fromIdx, 1);
			list.splice(insertAt, 0, moved!);
			setList(list);
		}
	});

	container.addEventListener('dragend', e => {
		if (dragKey == null) return;
		e.stopPropagation();
		container.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
		removeLine();
		dragKey = null; dropTarget = null;
		onChange();
	});
}
