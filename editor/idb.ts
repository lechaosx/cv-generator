import type { PhotoRecord } from './types';
import { PHOTO_DB, PHOTO_STORE, PHOTO_REF_PREFIX } from './storage';

export const photoCache = new Map<string, PhotoRecord>();

function openPhotoDB(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(PHOTO_DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(PHOTO_STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror   = () => reject(req.error);
	});
}

async function idbGet(key: string): Promise<PhotoRecord | null> {
	try {
		const db = await openPhotoDB();
		return await new Promise(resolve => {
			const req = db.transaction(PHOTO_STORE, 'readonly').objectStore(PHOTO_STORE).get(key);
			req.onsuccess = () => resolve(req.result as PhotoRecord | null ?? null);
			req.onerror   = () => resolve(null);
		});
	} catch { return null; }
}

async function idbPut(key: string, value: PhotoRecord): Promise<void> {
	try {
		const db = await openPhotoDB();
		db.transaction(PHOTO_STORE, 'readwrite').objectStore(PHOTO_STORE).put(value, key);
	} catch (e) { console.warn('IndexedDB photo write failed:', e); }
}

export async function hashString(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return Array.from(new Uint8Array(buf))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('')
		.slice(0, 24);
}

export async function storePhotoData(dataUrl: string, name?: string): Promise<string> {
	const hash   = await hashString(dataUrl);
	const record = { data: dataUrl, name: name ?? `image-${hash.slice(0, 8)}` };
	if (!photoCache.has(hash)) {
		photoCache.set(hash, record);
		await idbPut(hash, record);
	}
	return PHOTO_REF_PREFIX + hash;
}

export async function resolvePhotoRef(ref: string): Promise<PhotoRecord | null> {
	if (!ref) return null;
	if (!ref.startsWith(PHOTO_REF_PREFIX)) return { data: ref, name: '' };
	const hash = ref.slice(PHOTO_REF_PREFIX.length);
	if (photoCache.has(hash)) return photoCache.get(hash)!;
	const record = await idbGet(hash);
	if (record) photoCache.set(hash, record);
	return record;
}

export async function ensureRef(value: string, name?: string): Promise<string> {
	if (!value) return '';
	if (value.startsWith('data:')) return storePhotoData(value, name);
	return value;
}
