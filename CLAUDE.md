# CLAUDE.md

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full layer diagram, data flow, and Store API.

## Build

```bash
nix run nixpkgs#nodejs -- node_modules/.bin/tsc --noEmit   # type-check
npm run build                                               # production build
npm run serve                                               # dev server on :9001
```

## Rules

**State is owned by `Store`.** Never mutate `store.state` directly. All mutations go through `store.commit()` or `store.commitColors()`. Never cast `Readonly<CVState>` away.

**Normalize functions are pure.** `normalize.ts` functions take values and return values — no global reads or writes. `normalizeAll` is called inside every `store.commit`.

**UI components do not import `store`, `history`, or `persistence`.** Layers 0–2 (`text-edit`, `lists`, `timeline`, `links`, `drag-sort`) receive data and callbacks as parameters only. If a module needs to trigger persistence, it does so through a callback injected from above.

**No import cycles.** If adding an import would create a cycle, the module boundaries are wrong. Either the modules need merging, or a third module should own the shared dependency.

**Side effects belong in `store.commit`.** Normalize, persist, and render all happen there. Nothing outside the store calls `saveState` or directly triggers a re-render.

## Patterns

**Committing a change from a UI component:**
```typescript
store.commit(s => { s.interests = newValue; });          // full re-render
store.commit(s => { s.interests = newValue; }, ['interests']); // section only
store.commit(s => { s.interests = newValue; }, null);    // persist only, no render
```

**Adding a section renderer:**
```typescript
// render.ts
export function renderMySection(store: Store): void { ... }

// index.ts
store.registerSection('my-section', renderMySection);

// commit call site
store.commit(s => { ... }, ['my-section']);
```

**Editable field in a new section:**
```typescript
setupEditable(el, entry.fieldName, 'placeholder_key', (v) =>
    store.commit(s => { s.mySection[idx]!.fieldName = v as string; })
);
```

**Editable string list:**
```typescript
makeStringList(
    container,
    () => store.state.mySection,
    v => store.commit(s => { s.mySection = v; }),           // focus leaves → full commit
    v => store.commit(s => { s.mySection = v; }, null),     // focus stays → persist only
    'placeholder_key',
);
```
