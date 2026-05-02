export const PHOTO_REF_PREFIX = 'idb:';
export const PHOTO_DB         = 'cv-edit';
export const PHOTO_STORE      = 'photo';

const urlParams  = new URLSearchParams(location.search);
export const seed       = urlParams.get('seed');
const tokenInUrl = urlParams.get('token');

if (seed && tokenInUrl) {
	localStorage.setItem(`cv-token:${seed}`, tokenInUrl);
	urlParams.delete('token');
	history.replaceState({}, '', location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : ''));
}

export const editUrl  = urlParams.get('url');
export const stateKey = seed ?? (editUrl ? `url:${editUrl}` : location.host);
export const token    = seed ? localStorage.getItem(`cv-token:${seed}`) : null;

export const STORAGE_KEY = `cv-edit:${stateKey}`;
export const COLORS_KEY  = `cv-edit-colors:${stateKey}`;
export const LINKS_KEY   = `cv-edit-links:${stateKey}`;
export const UNDO_KEY    = `cv-edit-undo:${stateKey}`;
