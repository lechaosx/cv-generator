# CLAUDE.md

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full layer diagram, data flow, Store API, timeline entry structure, and HTML semantics.

## Build

```bash
nix run nixpkgs#nodejs -- node_modules/.bin/tsc --noEmit   # type-check
npm run build                                               # production build
npm run serve                                               # dev server on :9001
docker compose up                                           # full stack on :80
```

## Keeping docs in sync

After any change that affects architecture, data model, conventions, or key patterns, update `ARCHITECTURE.md` and `CLAUDE.md` before finishing. If you notice drift between the docs and the code without making a change, fix it then.

Things that always warrant a doc update: adding/removing a layer or module, changing a type's canonical field names, changing normalization boundaries, changing the placeholder mechanism, changing the Store API, changing how the timeline or any shared component works.

## Rules

**State is owned by `Store`.** Never mutate `store.state` directly. All mutations go through `store.commit()` or `store.commitColors()`. Never cast `Readonly<CVState>` away.

**Normalize functions are pure.** `normalize.ts` functions take values and return values — no global reads or writes. `normalizeAll` is called inside every `store.commit` and in the `Store` constructor. `normalizeTimeline` is also where YAML coercion happens (`company`/`institution` → `organization`).

**UI components do not import `store`, `history`, or `persistence`.** Layers 0–2 (`text-edit`, `lists`, `timeline`, `links`, `drag-sort`) receive data and callbacks as parameters only. If a module needs to trigger persistence, it does so through a callback injected from above.

**No import cycles.** If adding an import creates a cycle, the module boundaries are wrong. Either the modules need merging, or a third module should own the shared dependency.

**Side effects belong in `store.commit`.** Normalize, persist, and render all happen there. Nothing outside the store calls `saveState` or directly triggers a re-render.

**Empty string, not null/undefined.** Text fields use `''` as the null object. Handle `null`/`undefined` at the normalization boundary; don't propagate optionality through the codebase.

**One placeholder mechanism.** Edit-mode field hints use only the CSS `[data-placeholder]:empty::before` approach. `setupEditable` always clears `innerHTML` and sets `data-placeholder-key`. `updateLabels` resolves it to a translated `data-placeholder` attribute. No server-rendered placeholder elements.

**SVG icons are always decorative.** `get_icon()` in `app.py` injects `aria-hidden="true"` on every fetched SVG. Never add meaningful content to icons — put it in adjacent text instead.

## Patterns

**Committing a change:**
```typescript
store.commit(s => { s.interests = newValue; });                // full re-render
store.commit(s => { s.interests = newValue; }, ['interests']); // section only
store.commit(s => { s.interests = newValue; }, null);          // persist only, no render
```

**Adding a section renderer:**
```typescript
// render.ts
export function renderMySection(store: Store): void { ... }

// index.ts
store.registerSection('my-section', renderMySection);
```

**Editable field:**
```typescript
setupEditable(el, entry.fieldName, 'placeholder_key', (v, e) =>
    store.commit(s => { s.mySection[idx]!.fieldName = v as string; }, [section])
);
```

**Editable string list:**
```typescript
makeStringList(
    container,
    () => store.state.mySection,
    v => store.commit(s => { s.mySection = v; }),        // focus leaves → full commit
    v => store.commit(s => { s.mySection = v; }, null),  // focus stays → persist only
    'placeholder_key',
);
```

**Timeline entries (experience and education share one type and one render function):**
```typescript
// Both sections use TimelineEntry { organization, department, ... }.
// Old YAML keys (company, institution, subinstitution) are coerced at load time —
// in normalize_cv (Python) and normalizeTimeline (TypeScript). Nowhere else.
// materializeEntry(store, section, idx, el) — section only selects the state slice.
```
