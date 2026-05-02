export function warn(msg: string, ...args: unknown[]): void {
	console.warn(`[cv-editor] ${msg}`, ...args);
}
