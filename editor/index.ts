import { STORAGE_KEY } from './storage';
import { Store } from './store';
import { injectStyles } from './styles';
import { initColors } from './colors';
import { initTimelines } from './timeline';
import { render, updateLabels } from './render';
import { renderExperienceTimeline, renderEducationTimeline } from './timeline';
import { setupConnectEdit } from './links';
import { renderPhoto } from './photo';
import { setupToolbar } from './toolbar';
import { storePhotoData } from './idb';
import { loadUndoHistory } from './persistence';
import { loadStacks, updateUndoButtons } from './history';
import { updateYamlModal } from './yaml';
import type { CVState } from './types';

injectStyles();

const saved = localStorage.getItem(STORAGE_KEY);
const initialState: CVState = saved
	? (JSON.parse(saved) as CVState)
	: structuredClone(window.CV_DATA);
if (!initialState.language) initialState.language = 'en';

const store = new Store(initialState);

const colorCfg = initColors(store);

store.setRenderer(render);
store.registerSection('experience', renderExperienceTimeline);
store.registerSection('education',  renderEducationTimeline);
store.registerSection('links',      setupConnectEdit);
store.registerSection('photo',      renderPhoto);
store.registerSection('interests',  s => { render(s); });

store.addObserver(s => updateYamlModal(s, colorCfg));
store.addObserver(s => updateLabels(s.state.language));

initTimelines(store);
setupToolbar(store, colorCfg);

render(store);
store.setLastSaved(store.snapshot());

const stacks = loadUndoHistory();
if (stacks) loadStacks(stacks);
updateUndoButtons();

if (store.state.photo?.startsWith('data:')) {
	storePhotoData(store.state.photo).then(ref => {
		store.commit(s => { s.photo = ref; }, null);
		renderPhoto(store);
	});
}
