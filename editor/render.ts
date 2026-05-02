import { state, LABELS, t, updateLabels } from './app-state';
import { persist } from './history';
import { normalizeInterests, normalizeLinks, normalizeExperience, normalizeEducation } from './normalize';
import { setupEditable } from './text-edit';
import { getPath } from './paths';
import { makeStringList } from './lists';
import { renderPhoto } from './photo';
import { setupConnectEdit } from './links';
import { renderExperienceTimeline, renderEducationTimeline } from './timeline';
import { updateYamlModalIfOpen } from './yaml';

type FieldTuple = [getter: () => Element | null, path: string, placeholderKey: string];

const FIELD_MAP: FieldTuple[] = [
	[() => document.querySelectorAll('.main-info .title')[0] ?? null, 'title_before_name', 'title'],
	[() => document.querySelector('h1'),                              'name',              'full_name'],
	[() => document.querySelectorAll('.main-info .title')[1] ?? null, 'title_after_name',  'title'],
	[() => document.querySelector('.position'),                       'position',          'job_position'],
	[() => document.querySelector('.contact-list div:nth-child(1) span'), 'location', 'location'],
	[() => document.querySelector('.contact-list div:nth-child(2) span'), 'phone',    'phone'],
	[() => document.querySelector('.contact-list div:nth-child(3) span'), 'email',    'email'],
	[() => document.querySelector('.additional-info section:first-child p'), 'description', 'description'],
];

function renderStatic(): void {
	for (const [getter, path, placeholderKey] of FIELD_MAP) {
		const el = getter() as HTMLElement | null;
		if (!el) continue;
		if (!el.classList.contains('cv-field')) {
			setupEditable(el, path, placeholderKey);
		} else {
			el.dataset['placeholderKey'] = placeholderKey;
			el.setAttribute('data-placeholder', t(placeholderKey));
			const v = getPath(state as Record<string, unknown>, path);
			el.innerHTML = '';
			if (v != null && v !== '') el.textContent = Array.isArray(v) ? v.join(' ') : String(v);
		}
	}
}

function renderInterests(): void {
	const section = document.querySelector<HTMLElement>('.additional-info section:nth-child(2)');
	if (!section) return;
	let interestsEl = section.querySelector<HTMLElement>('.badge-list');
	if (!interestsEl) {
		const p = section.querySelector('p');
		if (!p) return;
		interestsEl = document.createElement('div');
		interestsEl.className = 'badge-list';
		p.replaceWith(interestsEl);
	}
	makeStringList(interestsEl,
		() => state.interests,
		v  => { state.interests = v; },
		() => normalizeInterests(),
		'interest',
	);
}

export function render(): void {
	if (!state.language || !LABELS[state.language]) state.language = 'en';
	normalizeInterests(); normalizeLinks(); normalizeExperience(); normalizeEducation();
	renderStatic();
	renderPhoto();
	renderInterests();
	setupConnectEdit();
	renderExperienceTimeline();
	renderEducationTimeline();
	updateLabels();
	updateYamlModalIfOpen();
}
