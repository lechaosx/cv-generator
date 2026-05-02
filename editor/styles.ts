export function injectStyles(): void {
	const style = document.createElement('style');
	style.textContent = `
		.cv-field { cursor: text; }
		.cv-field[contenteditable="false"] { user-select: none; }
		.cv-field:hover { outline: 1px dashed var(--border); border-radius: 2px; }

		body.drag-active:not(.photo-modal-open) .photo.drop-target img,
		body.drag-active:not(.photo-modal-open) .photo.drop-target svg,
		body:not(.photo-modal-open) input.drop-target { box-shadow: 0 0 0 2px var(--border); transition: box-shadow .15s; }
		body:not(.photo-modal-open) .photo.drop-target.dropping img,
		body:not(.photo-modal-open) .photo.drop-target.dropping svg,
		input.drop-target.dropping { box-shadow: 0 0 0 4px var(--light) !important; }

		.edit-ghost { opacity: .5; }

		[data-placeholder]:empty::before {
			content: attr(data-placeholder);
			opacity: .5;
			pointer-events: none;
		}
		.edit-ghost[data-placeholder]:empty::before { opacity: 1; }

		.cv-dates .start-part, .cv-dates .end-part { display: inline !important; }
		.cv-dates .start-month, .cv-dates .sm-sep,
		.cv-dates .end-month,   .cv-dates .em-sep   { display: inline !important; }
		.cv-dates .present-text { display: none !important; }

		#edit-toolbar {
			position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
			background: var(--panel-dark); border-top: 2px solid var(--light);
			display: flex; gap: 10px; padding: 10px 20px; align-items: center;
			font-family: var(--condensed-font); font-size: 14px; color: var(--text-dark);
		}
		#edit-toolbar button,
		#edit-toolbar select {
			padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer;
			background: var(--button-dark); color: var(--button-text-dark);
			font-family: var(--condensed-font); font-size: 14px;
		}
		#edit-toolbar button:hover, #edit-toolbar select:hover { opacity: .8; }
		#edit-toolbar button:disabled { opacity: .3; cursor: default; pointer-events: none; }
		#btn-reset { background: #5a2a2a !important; color: white !important; }
		#edit-color-panel {
			position: fixed; bottom: 52px; right: 20px; z-index: 9998;
			background: var(--panel-dark); border: 1px solid var(--light); border-radius: 8px;
			padding: 16px; display: none; flex-direction: column; gap: 12px;
			font-family: var(--condensed-font); font-size: 13px; color: var(--text-dark);
		}
		#edit-color-panel input[type=color] {
			padding: 0; border: 1px solid var(--border);
			cursor: pointer; border-radius: 4px; background: none;
		}
		.color-base-row {
			display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
		}
		.color-swatch {
			display: flex; flex-direction: column; align-items: center; gap: 4px;
		}
		.color-swatch input[type=color] { width: 44px; height: 36px; border-radius: 6px; }
		.color-swatch label { font-size: 11px; text-align: center; opacity: .75; white-space: nowrap; }
		.color-variants {
			display: grid; grid-template-columns: 1fr auto auto;
			row-gap: 5px; column-gap: 10px; align-items: center;
			border-top: 1px solid rgba(255,255,255,.15); padding-top: 10px;
		}
		.color-col-title {
			font-weight: bold; opacity: .8; font-size: 12px; text-transform: uppercase;
			letter-spacing: .05em; text-align: center;
		}
		.color-variant-controls { display: flex; align-items: center; gap: 4px; }
		.color-variant-controls input[type=color] { width: 32px; height: 24px; border-radius: 4px; flex-shrink: 0; }
		.color-reset-btn {
			flex-shrink: 0; background: none; border: none; color: inherit;
			cursor: pointer; opacity: .35; font-size: 13px; padding: 0; line-height: 1;
		}
		.color-reset-btn:hover { opacity: 1; }
		.color-link-dots { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
		.color-link-dot {
			width: 13px; height: 13px; border-radius: 50%; flex-shrink: 0;
			border: 2px solid transparent; cursor: pointer; padding: 0;
			outline: 1px solid rgba(255,255,255,.25); outline-offset: 0;
		}
		.color-link-dot.active { outline: 2px solid rgba(255,255,255,.85); outline-offset: 1px; }

		[draggable="true"].drag-item,
		[draggable="true"].edit-link-row,
		[draggable="true"].timeline-entry { cursor: grab; }
		[draggable="true"].drag-item:active,
		[draggable="true"].edit-link-row:active,
		[draggable="true"].timeline-entry:active { cursor: grabbing; }
		.drag-item > *, .edit-link-row > span { cursor: text; }
		.dragging { opacity: .4; }
	`;
	document.head.appendChild(style);
}
