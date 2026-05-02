declare const DEBUG: boolean;

export function assert(condition: unknown, msg: string): asserts condition {
	if (DEBUG && !condition) throw new Error(`Assert: ${msg}`);
}

export function defined<T>(val: T | null | undefined, msg: string): T {
	if (DEBUG && val == null) throw new Error(`Assert defined: ${msg}`);
	return val as T;
}
