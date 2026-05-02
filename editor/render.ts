import type { Store } from './store';
import { t, LABELS } from './labels';
import { setupEditable } from './text-edit';
import { makeStringList } from './lists';
import { renderPhoto } from './photo';
import { setupConnectEdit } from './links';
import { renderExperienceTimeline, renderEducationTimeline } from './timeline';
import type { CVState } from './types';

type FieldDef = [getter: () => Element | null, field: keyof CVState, placeholderKey: string];

const FIELD_MAP: FieldDef[] = [
	[() => document.querySelectorAll('.main-info .title')[0] ?? null, 'title_before_name', 'title'],
	[() => document.querySelector('h1'),                              'name',              'full_name'],
	[() => document.querySelectorAll('.main-info .title')[1] ?? null, 'title_after_name',  'title'],
	[() => document.querySelector('.position'),                       'position',          'job_position'],
	[() => document.querySelector('.contact-list div:nth-child(1) span'), 'location', 'location'],
	[() => document.querySelector('.contact-list div:nth-child(2) span'), 'phone',    'phone'],
	[() => document.querySelector('.contact-list div:nth-child(3) span'), 'email',    'email'],
	[() => document.querySelector('.additional-info section:first-child p'), 'description', 'description'],
];

function renderStatic(store: Store): void {
	for (const [getter, field, ph] of FIELD_MAP) {
		const el = getter() as HTMLElement | null;
		if (!el) continue;
		const v = store.state[field];
		if (!el.classList.contains('cv-field')) {
			setupEditable(el, v, ph, (newVal) => {
				store.commit(s => {
					(s as Record<string, unknown>)[field as string] =
						ph === 'description' ? (newVal ? [newVal as string] : []) : newVal;
				});
			});
		} else {
			el.dataset['placeholderKey'] = ph;
			el.innerHTML = '';
			if (v != null && v !== '') el.textContent = Array.isArray(v) ? v.join(' ') : String(v);
		}
	}
}

function renderInterests(store: Store): void {
	const section = document.querySelector<HTMLElement>('.additional-info section:nth-child(2)');
	if (!section) return;
	let el = section.querySelector<HTMLElement>('.badge-list');
	if (!el) {
		const p = section.querySelector('p');
		if (!p) return;
		el = document.createElement('div');
		el.className = 'badge-list';
		p.replaceWith(el);
	}
	makeStringList(
		el,
		() => store.state.interests,
		v => store.commit(s => { s.interests = v; }, ['interests']),
		v => store.commit(s => { s.interests = v; }, null),
		'interest',
	);
}

export function updateLabels(language: string): void {
	document.querySelectorAll<HTMLElement>('[data-label]').forEach(el => {
		el.textContent = t(el.dataset['label']!, language);
	});
	document.querySelectorAll<HTMLElement>('[data-placeholder-key]').forEach(el => {
		el.setAttribute('data-placeholder', t(el.dataset['placeholderKey']!, language));
	});
	document.documentElement.lang = language;
	const ls = document.getElementById('lang-select') as HTMLSelectElement | null;
	if (ls && ls.value !== language) ls.value = language;
}

export function render(store: Store): void {
	if (!store.state.language || !LABELS[store.state.language]) {
		store.commit(s => { s.language = 'en'; }, null);
	}
	renderStatic(store);
	renderPhoto(store);
	renderInterests(store);
	setupConnectEdit(store);
	renderExperienceTimeline(store);
	renderEducationTimeline(store);
	updateLabels(store.state.language);
}
