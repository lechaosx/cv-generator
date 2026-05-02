export function getPath(obj: Record<string, unknown>, path: string): unknown {
	return path.split('.').reduce((o: unknown, k) => {
		if (o == null || typeof o !== 'object') return undefined;
		return (o as Record<string, unknown>)[isNaN(+k) ? k : +k];
	}, obj);
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
	const parts = path.split('.');
	let cur: Record<string, unknown> = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const k = parts[i]!;
		cur = cur[isNaN(+k) ? k : +k] as Record<string, unknown>;
	}
	const last = parts.at(-1)!;
	cur[isNaN(+last) ? last : +last] = value;
}
