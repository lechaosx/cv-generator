# Architecture

## Stack

- **Frontend**: TypeScript compiled with esbuild, vanilla DOM, no framework
- **Backend**: Python/Flask, Jinja2 templates, diskcache, Gunicorn
- **Infrastructure**: Docker Compose, Caddy reverse proxy, GitHub Actions

The editor (`editor/`) is a fully client-side TypeScript application. The backend serves the initial HTML (with CV data injected as `window.CV_DATA`) and handles YAML persistence for seeded CVs.

---

## Layer diagram

Dependencies point strictly upward. No layer imports from a layer above it.

```
── Layer 0: Pure leaves ──────────────────────────────────
   types · paths · storage · drag-sort · idb · styles
   assert · log

── Layer 1: Pure utilities ───────────────────────────────
   labels       LABELS constant + t(key, lang): string
   normalize    pure: (value[]) => value[] — no side effects

── Layer 2: Pure UI components ───────────────────────────
   text-edit    setupEditable(el, value, ph, onCommit)
   lists        makeStringList(el, get, onCommit, onPersist, ph)
   timeline     initTimelines(store) / renderExperienceTimeline(store) / renderEducationTimeline(store)
   links        setupConnectEdit(store)

── Layer 3: Infrastructure ───────────────────────────────
   persistence  localStorage read/write only
   history      undo/redo stack management only
   photo        idb + Store

── Layer 4: Orchestration ────────────────────────────────
   store        single owner of CVState + themeColors + colorLinks
   render       render(store: Store) — rebuilds DOM from store state

── Layer 5: Feature modules ──────────────────────────────
   colors       color panel UI, wired to store.commitColors()
   yaml         export/import modal, wired to store
   toolbar      toolbar UI, wired to store

── Layer 6: Entry ────────────────────────────────────────
   index        wiring only — creates Store, connects all modules
```

---

## Key principles

### Single mutable owner

`Store` (in `store.ts`) is the only thing that holds mutable state. Nothing else mutates state directly. All state is read via `store.state` (typed as `Readonly<CVState>`).

```typescript
// Correct
store.commit(s => { s.interests = newInterests; });

// Wrong — bypassing the owner
(store.state as CVState).interests = newInterests;
```

### Pure functions

Functions in layers 0–2 take inputs as parameters and return outputs. They do not read or write any global state.

`normalize.ts` functions are pure transformations. `normalizeTimeline` also coerces YAML entries (resolves `company ?? institution ?? organization` → `organization`) — normalization is the boundary where raw external data is cleaned up.

### Empty string, not null/undefined

Text fields use `''` as the null object. `null`/`undefined` are handled at the boundary (normalization) and do not appear in the internal data model. This avoids optional-field handling throughout the codebase.

### Explicit passing — no implicit global reads

If a function needs state or a commit callback, it receives them as parameters. Modules in layers 0–2 have no knowledge of `Store`, `history`, or `persistence`.

### Side effects at outer layers

`persist()`, `render()`, and undo-stack pushes happen inside `store.commit()` only. UI components (layers 1–2) call their `onCommit` callback and nothing else.

### No import cycles

The dependency graph is a strict DAG. The three latent cycles that previously existed (render↔history, render↔yaml, colors↔history) were caused by `history.ts` doing orchestration work. They are gone: `history.ts` only manages the stack and never calls render.

---

## Data flow

### Normal edit

```
User types in a contentEditable field
  → setupEditable blur handler fires
  → calls onCommit(newValue)
  → caller calls store.commit(s => { s.field = newValue; }, sections?)
  → store: mutate → normalizeAll → _persist() → _doRender(sections)
  → _persist(): push to undo stack, saveState to localStorage
  → _doRender(): calls full render(store) or named section renderers
```

### Selective re-render

`store.commit` accepts an optional `sections` parameter:
- `undefined` — full `render(store)` call
- `string[]` — only the named section renderers run (registered via `store.registerSection`)
- `null` — no render (persist + normalize only; used for within-container edits)

### Startup

The `Store` constructor calls `normalizeAll` on the initial state before the first render. This ensures ghost draft entries exist and all fields are in canonical form without requiring a first user interaction.

### Undo/redo

```
store.undo() / store.redo()
  → history.popUndo() / popRedo() returns a snapshot
  → store._applySnapshot(): restore state, themeColors, colorLinks
  → _applyThemeCss(): update CSS variables
  → _colorRebuilder?.(): rebuild color panel inputs
  → _renderer(store): full re-render
  → saveState(): persist restored state
```

---

## Store API

```typescript
// Read (readonly — never cast away)
store.state: Readonly<CVState>
store.themeColors: Readonly<Record<string, string>>
store.colorLinks:  Readonly<Record<string, string>>

// CV mutation — normalizes, persists, renders
store.commit(mutate: (s: CVState) => void, sections?: string[] | null): void

// Color mutation — persists only (CSS applied by caller)
store.commitColors(mutate: (colors, links) => void): void

// Undo / redo / full replace (e.g. yaml import)
store.undo(): void
store.redo(): void
store.replace(snap: UndoSnapshot): void

// Registration (called once in index.ts)
store.setRenderer(fn): void
store.registerSection(name, fn): void
store.setColorRebuilder(fn): void
store.addObserver(fn): void          // called after every commit
store.initColorState(colors, links): void
store.setColorConfig(themeKeys, baseLinks): void
```

---

## Color system

Three parallel objects owned by `Store`:
- `state.theme` — raw YAML values (`#hex` or `--var-name`)
- `themeColors` — resolved hex values for every theme key
- `colorLinks` — maps variant keys to base keys (e.g. `panel-dark → dark`)

`initColors(store)` in `colors.ts` reads the CSS stylesheet to discover base colors and variant keys, then resolves initial values and registers them with the store. Color mutations go through `store.commitColors()`, which persists but does not re-render (the color panel UI updates CSS variables directly for performance).

---

## Timeline entries

Both `experience` and `education` use the shared `TimelineEntry` type:

```typescript
interface TimelineEntry {
    title: string;
    organization: string;  // canonical; old YAML keys company/institution are coerced on load
    department: string;    // canonical; old YAML key subinstitution is coerced on load
    start_month: string; start_year: string;
    end_month: string;   end_year: string;
    description: string | string[];
    badges: string[];
}
```

Backward compatibility lives only at the two normalization boundaries:
- **Python** (`normalize_cv` in `app.py`): called by `load_cv`, remaps `company`/`institution` → `organization` and `subinstitution` → `department` before the data reaches the template or `window.CV_DATA`.
- **TypeScript** (`normalizeTimeline` in `normalize.ts`): same coercion for data coming from localStorage or YAML import.

After normalization, `organization` and `department` are the only field names used anywhere — in the template, editor, and export.

`materializeEntry(store, section, idx, el)` in `timeline.ts` is the single render function for both sections. `section` only selects the right state slice (`s.experience` vs `s.education`); it no longer influences field names or placeholder labels.

The Jinja template uses a `render_timeline` macro for both sections, reading only `entry.organization` and `entry.department`.

---

## HTML semantics

The CV template (`server/templates/cv.html`) is semantic HTML readable without CSS:
- `<figure>` for photo, `<header>` for name/contact, `<address>` for contact list
- `<article>` per timeline entry — CSS `display: contents` makes each article transparent to the grid layout while keeping the semantic grouping
- The two-column `.timeline` grid has two sets of selectors: `article > :first-child` / `article > :last-child` for view mode (template-rendered), and `.timeline-entry:nth-child(2n+1)` / `:nth-child(2n)` for edit mode (JS-created divs)
- `<time>` for dates, `<ul>/<li>` for badges and interests
- `<a href="tel:">` / `<a href="mailto:">` links in view mode only — omitted in edit mode to prevent navigation while editing
- Decorative SVG icons carry `aria-hidden="true"`, injected by `get_icon()` in `app.py`
- `address { font-style: normal }` resets the browser default italic on `<address>`

### Edit-mode placeholders

Handled entirely by the CSS `[data-placeholder]:empty::before` mechanism. `setupEditable` always clears `innerHTML` and sets `data-placeholder-key`; `updateLabels` resolves that to a translated `data-placeholder` attribute. No server-rendered placeholder elements exist — the legacy `span.placeholder` approach has been removed.

---

## Adding a new CV section

1. Add fields to `CVState` in `types.ts`; use `string` not `string | undefined` for text fields
2. Add a `normalizeX(v: T[]): T[]` pure function in `normalize.ts`; call it in `normalizeAll()`
3. Add a `renderX(store: Store): void` function in `render.ts` or a new module; call it in `render()`
4. Optionally register it as a named section in `index.ts` via `store.registerSection`
