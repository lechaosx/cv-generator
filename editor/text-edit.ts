export type OnCommit = (value: unknown, e?: FocusEvent) => void;

export function placeCaretAtPoint(x: number, y: number): void {
	let range: Range | undefined;
	if (document.caretRangeFromPoint) {
		range = document.caretRangeFromPoint(x, y) ?? undefined;
	} else {
		const pos = document.caretPositionFromPoint?.(x, y);
		if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); range.collapse(true); }
	}
	if (range) { const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); }
}

export function activateOnInteract(el: HTMLElement): void {
	function enterEdit(x?: number, y?: number): void {
		el.contentEditable = 'true';
		el.focus();
		if (x != null && y != null) placeCaretAtPoint(x, y);
	}
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

export function setupEditable(
	el: HTMLElement,
	value: unknown,
	placeholderKey: string,
	onCommit: OnCommit,
): void {
	const hasValue = value != null && (Array.isArray(value)
		? (value as unknown[]).some(x => String(x).trim())
		: String(value).trim() !== '');
	const immediate = !hasValue;

	el.contentEditable = immediate ? 'true' : 'false';
	el.draggable = false;
	el.classList.add('cv-field');
	el.dataset['placeholderKey'] = placeholderKey;

	el.innerHTML = '';
	const text = Array.isArray(value) ? (value as string[]).join(' ') : (value != null ? String(value) : '');
	if (text.trim()) el.textContent = text;

	if (!immediate) activateOnInteract(el);

	el.addEventListener('focus', () => { el.dataset['before'] = el.textContent ?? ''; });
	el.addEventListener('blur', e => {
		if (!immediate) el.contentEditable = 'false';
		const newValue: unknown = el.textContent?.trim() ?? '';
		if (!newValue) el.innerHTML = '';
		onCommit(newValue, e);
	});
	el.addEventListener('keydown', e => {
		if (e.key === 'Escape') { el.textContent = el.dataset['before'] ?? ''; el.blur(); }
		else if (e.key === 'Enter' && !e.shiftKey && !el.matches('p')) { e.preventDefault(); el.blur(); }
	});
}
