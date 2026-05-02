import { state } from './app-state';
import { UNDO_KEY } from './storage';
import { injectStyles } from './styles';
import { initColors, themeKeys, BASE_LINKS, buildColorPanelContent } from './colors';
import { initHistory, setLastSaved, captureSnapshot, loadUndoHistory, updateUndoButtons } from './history';
import { initYaml } from './yaml';
import { initTimelines } from './timeline';
import { setupToolbar } from './toolbar';
import { storePhotoData } from './idb';
import { renderPhoto } from './photo';
import { persist } from './history';
import { render } from './render';

injectStyles();
initColors();
initHistory({
	baseLinks:       BASE_LINKS,
	themeKeys,
	onRender:        render,
	onRebuildColors: buildColorPanelContent,
});
initYaml({ onRender: render });
initTimelines();
setupToolbar(render);

render();
setLastSaved(captureSnapshot());
loadUndoHistory();
updateUndoButtons();

if (state.photo?.startsWith('data:')) {
	storePhotoData(state.photo).then(ref => {
		state.photo = ref;
		renderPhoto();
		setTimeout(persist, 0);
	});
}
