# Plan: core-folders-by-component-page-folders-by-role

**Build model:** claude-opus-5-5 (the splits move code across files where closures, shader text and import order have to survive unchanged; the pure moves (pieces 1-3) are mechanical and run on claude-sonnet-5-5)

## Context

A refactor with no behaviour change, roadmap step 3a. The simulation core (`src/core/`) is mostly flat: about 25 source files, with `wind/`, `baseline/` and `testing/` as the only folders. The page (`src/app/`) has about 20 files at its top level, `globe/`, `testing/`, and a flat `ui/` of 26 files after step 3c. Four files have grown past 900 lines: `ui/layerPanel.ts` (1,440), `globe/material.ts` (1,064), `scalarLayer.ts` (1,017) and `wiring.ts` (953). More layers are coming (rain, ocean currents, ice, storms, tectonics), each adding files.

### How the code is wired today
- The page, the worker and the scripts import the core only through `src/core/index.ts`, with three exceptions: `scripts/update-earth-temperature-baseline.ts`, `scripts/update-earth-winds-baseline.ts` and `scripts/update-earth-winds-baseline.test.ts` import `src/core/baseline/*` directly, and both update scripts write their JSON beside the baseline module (`earthTemperature.json`, `earthWinds.json`), so the written path must follow the move. Page and worker tests also import `core/testing/temperatureFixtures` and `core/testing/windFixtures`, which stay where they are.
- The page's files import each other directly, so the page moves rewrite many import lines.
- The TypeScript projects split by folder: `tsconfig.core.json` includes `src/core` (no browser types), `tsconfig.app.json` includes `src/app` plus two worker files, `tsconfig.worker.json` `src/worker`, `tsconfig.scripts.json` `scripts`. Moving within those folders keeps every file in its project.
- `docs/development.md` has folder tables for `src/core/` and `src/app/`; `docs/winds.md:117` names `src/core/baseline/earthWinds.json`.

### What a read of each large file found (2026-11-17)
- **`globe/material.ts`:** constants (54-119), height ramps (121-149), GLSL helpers (151-200), `ELEVATION_GLSL` (202-390), `RELIEF_GLSL` and `VERTEX_GLSL` (392-432), `FRAGMENT_GLSL` (434-735), the uniforms and `createGlobeMaterial` (737-840), `createCellTexture` (842-893), the layer functions (895-1012), sunlight (1014-1064). No mutable module state; every uniform is made inside `createGlobeMaterial`. A split needs no signature change; `ELEVATION_GLSL` becomes exported from its own file but not from the entry point. Under `moduleResolution: bundler`, `'./material'` resolves to `material/index.ts`, so its 11 importers need not change. The shader strings must come out byte-identical, tabs included. Doc links that cross the new files (`{@link NIGHT_BRIGHTNESS}`) need type imports or rewording, or Biome flags the import as unused. `material.test.ts` is 735 lines, split by its `describe` blocks; its `glslFunction` and `SAMPLING_FUNCTIONS` helpers are shared.
- **`scalarLayer.ts`:** types (63-295), unit helpers (368-468), temperature (296-366, 470-570), pressure (572-774), the registry (776-842), the caption (844-889), the year and scale fitting (891-1017). No mutable module state and no cycle once `summaryOf` and `offersSummary` sit with the types. It imports `fitRange`, `cellWeights`, `formatTick` and `MIN_FITTED_SPAN_C` (and their siblings) from `ui/legend.ts`; `legend.ts` imports only types back. `formatInUnit` must become exported between the new files (not from the entry point); nothing needs a new signature. 20 files import it (12 tests, plus `testing/scalarLayerFixtures.ts`). Its 852-line test uses only the public API.
- **`ui/layerPanel.ts`:** public types (95-348), internal types, the `OBSERVED_*` constants and `kept` (350-481), a 180-line doc comment (483-661), then about 17 closure `let`s (662-725) that the rest reads and writes. Already pure: `differenceOf` and `figuresOf` (inside 727-873). Everything else (the layer and winds targets, `update`, observed loading, playback) touches the closure state, so moving it out needs new signatures: a design change, not in this issue. Its test file is 4,380 lines in 19 `describe`s, using only the public API; its shared helpers sit at about lines 114-312, 1601-1664 and 2440; its `layerCaption` tests (about 2227-2255) cover `scalarLayer`.
- **`wiring.ts`:** imports (11-89), the parts' types (91-374, about 285 lines), `sunlightStyleFor` (376-391, pure), a 147-line doc comment on `startPage` (393-539), then `startPage` (541-952), whose middle (593-832) is a web of forward references through closures. Only the types (and `sunlightStyleFor`) move without a design change. `wiring.test.ts` (3,980 lines, 153 tests) imports six of its types and runs everything through `startPage`.

### Settled (from `decisions.md`, in full)
- A pure move: no behaviour change, checked by the existing tests and both Earth baselines (temperature and winds) printing unchanged. From the roadmap.
- Core layout, agreed by the user 2026-11-13 ("layout looks good for core"): `grid/` (grid, vector, coarsen, quantile); `world/` (world, generate, noise, brush, history, stats, serialize); `planet/` (planet, star, insolation); `earth/` (earth, observedGrid); `temperature/` (temperature, exchange, observed, baseline/); `wind/` (as it is, plus observedWind); left flat: index, protocol, compare; `testing/` stays.
- Page layout, agreed by the user 2026-11-13 ("Yes, add it"): the page stays organised by role; `globe/` and `ui/` stay; top-level files go to `editing/` (appState, sculpt, undo), `saving/` (storage, autosave, startup), `layers/` (layers, view, refresh, workerService, playback, earthData, observedData); left flat: main, wiring, panelMemory, styles.css.
- The worker stays as it is (three small files). From the roadmap.
- Planned through `/planner refactor`, not `/quick-build`. The user: "lets /planner refactor 3a" (2026-11-17)

- Files added since the layout was agreed: in the core, the baselines split per model (`temperature/baseline/earthTemperature.*`, `wind/baseline/earthWinds.*`) and `temperatureCoarse.test.ts` and `temperatureGuess.test.ts` into `temperature/`; in the page, a new `settings/` folder for what the browser remembers (`preferences`, `units`, `panelMemory`, so `panelMemory` no longer stays flat), and `scalarLayer` into `layers/`. The user: "As proposed (Recommended)" (2026-11-17)
- `ui/` splits in two along the line 3c drew: `ui/main/` for what sits over the globe (mainView, layerDock, topBar, timeline, infoBox, pauseButton, legend, cursorReadout, comparison, windKey) and `ui/panel/` for the side panel's sections and the New world dialog; shared pieces (fields, icons, section, layerPanel) stay at `ui/`. This replaces the 2026-11-13 "ui/ stays as it is". The user: "Split in two (Recommended)" (2026-11-17)
- The four largest files are split in this issue, still with no behaviour change: `ui/layerPanel.ts` (1,440 lines), `globe/material.ts` (1,064), `scalarLayer.ts` (1,017), `wiring.ts` (953). The user: "Split all four" (2026-11-17)
- `scripts/` is out of scope: only the import paths the move breaks are updated. The user: "Out of scope (Recommended)" (2026-11-17)

- How the four large files split, from a read of each (2026-11-17). `globe/material.ts` and `scalarLayer.ts` split fully, with no signature changes: `material` into about nine files in `globe/material/` behind an `index.ts` that keeps its exports, so none of its importers change, with the shader text byte-identical; `scalarLayer` into about seven files in `layers/scalar/` (spec, inUnit, temperature, pressure, registry, caption, yearScale) behind an `index.ts`. `ui/layerPanel.ts` and `wiring.ts` move out only what moves unchanged (types, constants, already-pure helpers such as `differenceOf` and `figuresOf`): about 1,030 and 650 lines left. The deeper splits, which pass shared state into new functions, are a design change and become a roadmap follow-up. The user: "Pure parts only (Recommended)" (2026-11-17)
- The scale-fitting code `scalarLayer` borrows from `ui/legend.ts` (`fitRange`, `cellWeights`, `formatTick`, `MIN_FITTED_SPAN_C` and their siblings) moves into `layers/scalar/`, so `layers/` does not depend on `ui/`; the legend imports it from there. The user: "Move it to layers/ (Recommended)" (2026-11-17)
- Moves first, then splits: the pure folder moves (core, then page) land first, each a commit git reads as renames, and each large file is then split in its final home. The user: "Moves first (Recommended)" (2026-11-17)

- Tests split along with the source: `material`'s and `scalarLayer`'s tests one file per new source file (shared GLSL helpers to `testing/`); the tests of whatever moves out of `layerPanel` and `wiring` go with it; `layerPanel.test.ts` (4,380 lines) also splits by theme into five files (core, month, comparison, winds, units) with a shared stage helper in `testing/`, the `layerCaption` tests moving to the scalar tests; `wiring.test.ts` stays whole as the guard that the page still starts the same. The user: "sorry yes split tests along source", then "Split by theme (Recommended)" (2026-11-17)

### Assumed
- Verification for every piece: lint, typecheck, every test, the build, and both Earth baselines printing unchanged; the material split also compares the shader strings before and after, byte for byte.
- Imports from the core keep going through `core/index`; new folders with an entry point (`globe/material/`, `layers/scalar/`) get an `index.ts`, so their importers change only by the folder move.
- `docs/development.md`'s folder tables, and any doc naming a moved path, follow each piece. The roadmap gets a follow-up for the deeper `layerPanel` and `wiring` splits.
- `ui/layerPanel.ts` stays at `ui/` and imports from `ui/main/` and `ui/panel/`; a parent folder importing its children is the expected direction.

## Approach

Moves first, then splits, so each large file is split once, in its final home, and every move commit is one git reads as renames.

1. The core moves into its component folders, then the page's top-level files into role folders, then `ui/` into `ui/main/` and `ui/panel/`. Each is `git mv` plus import edits and nothing else; each file's body is unchanged apart from its import lines (and, for the baseline update scripts, the path they write to).
2. The two files that split fully (`scalarLayer`, with the legend's fitting code; `material`) split behind an `index.ts` that re-exports their current public surface, so importers change only by path.
3. `layerPanel` and `wiring` move out only what moves unchanged, re-exported from the original file, so `main.ts`, `wiring.ts` and the tests keep their imports.

Tests move with their source: a test file sits beside the file it covers, and a split source's tests split the same way. Shared test helpers go to `src/app/testing/`.

Rejected:
- **Splitting first, moving after:** each split file would then move again, doubling the churn on the biggest files.
- **Deeper splits of `layerPanel` and `wiring`** (the targets, observed requests, lighting, new-world and restore helpers with explicit state): they change function signatures and the order parts are made in, so they are a design change with its own review. They become a roadmap follow-up.
- **Leaving the fitting code in the legend:** `layers/` would then depend on `ui/`.
- **`ui/` left flat** (the 2026-11-13 layout): 26 files, with 3c having drawn a clear line between the main view and the panel.
- **Grouping `scripts/`:** out of scope; only the imports the move breaks change.
- **Splitting `wiring.test.ts`:** it stays whole as the guard that the page still starts the same.

## Pieces

1. The core in component folders
   - Model: claude-sonnet-5-5
   - Files: everything under `src/core/` except `index.ts`, `protocol.ts`, `compare.ts` and `testing/`; `src/core/index.ts` (its re-export paths); `scripts/update-earth-temperature-baseline.ts`, `scripts/update-earth-winds-baseline.ts`, `scripts/update-earth-winds-baseline.test.ts`; `docs/development.md` (the `src/core/` table); `docs/winds.md:117`.
   - What: Move, with `git mv`, into:
     - `grid/`: `grid`, `vector`, `coarsen`, `quantile`;
     - `world/`: `world`, `generate`, `noise`, `brush`, `history`, `stats`, `serialize`;
     - `planet/`: `planet`, `star`, `insolation`;
     - `earth/`: `earth`, `observedGrid`;
     - `temperature/`: `temperature`, `exchange`, `observed`, and the tests `temperatureCoarse.test.ts` and `temperatureGuess.test.ts`;
     - `temperature/baseline/`: `earthTemperature.ts`, `.json`, `.test.ts`;
     - `wind/`: as it is, plus `observedWind`;
     - `wind/baseline/`: `earthWinds.ts`, `.json`, `.test.ts`.
     `index`, `protocol`, `compare` and `testing/` stay where they are. Each test moves with its source. Rewrite the core's own imports and `index.ts`'s re-exports; nothing outside the core imports anything but `core/index`, `core/testing/*` and the baselines. The two baseline update scripts import from, and write their JSON to, the new baseline folders.
   - Functions: none; import paths only, and the baseline scripts' output path.
   - Depends on: none.
   - Acceptance: `src/core/` holds only `index.ts`, `protocol.ts`, `compare.ts` and the folders above; every check passes; `git diff -M --stat main` shows each moved file as a rename; both baselines print unchanged; `npm run baseline:temperature` and `npm run baseline:winds` would write to the new paths (checked by reading the path they compute, not by running them against the data).
   - Tests: no test changes beyond import paths; the whole suite passes; the baselines' own tests (`temperature/baseline/earthTemperature.test.ts`, `wind/baseline/earthWinds.test.ts`) pass from their new folders; `scripts/update-earth-winds-baseline.test.ts` passes with its new import.

2. The page's top-level files in role folders
   - Model: claude-sonnet-5-5
   - Files: the top-level files of `src/app/` and everything that imports them (`globe/`, `ui/`, `testing/`, `wiring.ts`, `main.ts`, `src/worker/client.ts` if it imports any); `docs/development.md` (the `src/app/` table).
   - What: Move, with `git mv` and each test with its source:
     - `editing/`: `appState`, `sculpt`, `undo`;
     - `saving/`: `storage`, `autosave`, `startup`;
     - `layers/`: `layers`, `view`, `refresh`, `workerService`, `playback`, `earthData`, `observedData`, `scalarLayer`;
     - `settings/`: `preferences`, `units`, `panelMemory`.
     `main.ts`, `wiring.ts`, `styles.css`, `globe/`, `ui/` and `testing/` stay. Rewrite every import the move breaks, including `index.html`'s or `main.ts`'s reference to `styles.css` if any, and Vite's entry if it names a moved file.
   - Functions: none; import paths only.
   - Depends on: 1.
   - Acceptance: `src/app/` holds at its top only `main.ts`, `wiring.ts`, `wiring.test.ts`, `styles.css` and folders; every check passes; the moves read as renames; the built page loads (the build succeeds and `vite build` reports the same entry).
   - Tests: no test changes beyond import paths; the whole suite passes.

3. `ui/` split into the main view and the panel
   - Model: claude-sonnet-5-5
   - Files: everything under `src/app/ui/` and its importers; `docs/development.md` (the `ui/` row).
   - What: Move, with `git mv` and each test with its source:
     - `ui/main/`: `mainView`, `layerDock`, `topBar`, `timeline`, `infoBox`, `pauseButton`, `legend`, `cursorReadout`, `comparison`, `windKey`;
     - `ui/panel/`: `panelSections`, `worldPanel`, `dateLine` (the date line under the world's description), `viewPanel`, `planetPanel`, `toolPanel`, `statsPanel`, `settingsPanel`, `newWorldDialog`;
     - left at `ui/`: `fields`, `icons`, `section`, `layerPanel`.
     Rewrite the imports.
   - Functions: none; import paths only.
   - Depends on: 2.
   - Acceptance: `ui/` holds only `fields`, `icons`, `section`, `layerPanel` (and their tests) and the two folders; every check passes; the moves read as renames.
   - Tests: no test changes beyond import paths; the whole suite passes.

4. The scalar layers split, with the legend's fitting code
   - Files: `src/app/layers/scalarLayer.ts` and `.test.ts` (removed), new `src/app/layers/scalar/` (`index.ts`, `spec.ts`, `inUnit.ts`, `temperature.ts`, `pressure.ts`, `registry.ts`, `caption.ts`, `yearScale.ts`, `fit.ts`, and a test per file), `src/app/ui/main/legend.ts` and its test (the fitting code and its tests leave), `src/app/testing/scalarLayerFixtures.ts`, the importers of both; `docs/development.md`.
   - What: Split `scalarLayer.ts` into `layers/scalar/`:
     - `spec.ts`: the types, `summaryOf`, `offersSummary`;
     - `inUnit.ts`: the unit helpers (`formatWhole`, `formatInUnit`, `layerUnit`, `metricUnit`, `toLayerUnit`, `metricRange`, `isDifferenceView`); not named `units.ts`, to avoid a clash with `settings/units.ts`;
     - `temperature.ts` and `pressure.ts`: each layer's constants, texts, observed loader and spec;
     - `registry.ts`: `SPECS`, `LAYERS`, `scalarLayerOf`, `loadLayerObserved`;
     - `caption.ts`: `layerCaption`;
     - `yearScale.ts`: `LayerYear`, `scaleKey`, `yearSummaries`, `yearField`, `fitSummaryScale`.
     Move the scale fitting from `ui/main/legend.ts` (`fitRange`, `fitRangeCentred`, `fitRangeFromZero`, `cellWeights`, `formatTick`, `legendTicks` if the fitting needs it, `MIN_FITTED_SPAN_C` and the constants they use) into `layers/scalar/fit.ts`; the legend imports them from there. `index.ts` re-exports exactly today's public surface of `scalarLayer.ts`; `formatInUnit` and anything else made visible between the new files is not re-exported. Importers change only from `scalarLayer` to `scalar` (the folder's `index.ts`). Code bodies move unchanged; only imports and `export` keywords change.
   - Functions: none changed; `formatInUnit` gains an `export`.
   - Depends on: 3.
   - Acceptance: `layers/scalar/` holds the new files, none over about 300 lines; no file under `layers/` imports from `ui/`; `scalarLayer.ts` is gone; every check passes; both baselines unchanged.
   - Tests: `scalarLayer.test.ts` splits by its `describe` blocks, one test file per source file (temperature, pressure with `windsStatus` and `meanOfMonths`, registry, inUnit, caption, yearScale); the legend's fitting tests move to `fit.test.ts`; each test's body is unchanged; the test count across the suite is the same before and after.

5. The globe's material split
   - Files: `src/app/globe/material.ts` and `material.test.ts` (removed), new `src/app/globe/material/` (`index.ts`, `constants.ts`, `glsl.ts`, `heightRamps.ts`, `relief.glsl.ts`, `shaders.ts`, `globeMaterial.ts`, `cellTexture.ts`, `layer.ts`, `sunlight.ts`, and a test per file), new `src/app/testing/glsl.ts` (the shared `glslFunction` and `SAMPLING_FUNCTIONS` helpers), importers only if they must change; `docs/development.md`.
   - What: Split `material.ts` into `globe/material/` along the parts above: constants and `drawnSeaLevel`; `RampStop` and the GLSL helpers; the land and ocean height ramps; `ELEVATION_GLSL` and `RELIEF_GLSL`; the vertex and fragment shaders; the uniform types and `createGlobeMaterial`; `createCellTexture`; `prepareLayer`, `showLayer`, `replaceLayer`; the sunlight style and setters. `index.ts` holds the module doc and re-exports exactly today's public surface; `ELEVATION_GLSL` is exported from its own file only. Shader template strings are copied whole, tabs kept. Doc links that cross files are kept working with type imports or reworded.
   - Functions: none changed.
   - Depends on: 3.
   - Acceptance: every exported shader string (`VERTEX_GLSL`, `FRAGMENT_GLSL`, `RELIEF_GLSL`, and each GLSL helper's output for the ramps) is byte-identical before and after, checked by a throwaway script whose output is reported in the review request and which is not committed; `material.ts` is gone and its 11 importers resolve to `material/index.ts` unchanged; every check passes.
   - Tests: `material.test.ts` splits by its `describe` blocks, one test file per source file, with the shared helpers in `testing/glsl.ts`; each test body unchanged; the suite's test count unchanged; the wind and streaks tests untouched.

6. The layer panel's types, constants and pure helpers moved out, and its tests split
   - Files: `src/app/ui/layerPanel.ts`, new `src/app/ui/layerPanel/` (`types.ts`, `internal.ts`, `figures.ts`), `src/app/ui/layerPanel.test.ts` and the new test files, new `src/app/testing/layerPanelStage.ts`, `src/app/layers/scalar/caption.test.ts`; `docs/development.md`.
   - What: Move out of `layerPanel.ts`, unchanged: the public types (`LayerControls`, `LayerPanelOptions`, `ShownLayer`, `ShownWinds`, `LayerPanel`) into `ui/layerPanel/types.ts`; the internal types, the `OBSERVED_*` constants and `kept` into `internal.ts`; `differenceOf` and `figuresOf`, already pure, into `figures.ts`. `layerPanel.ts` keeps `createLayerPanel` and its closure state and re-exports the public types, so its importers don't change. Split `layerPanel.test.ts` by theme into `layerPanel.test.ts` (the core, stored view, grid, what the globe shows, the info box, key wording, another layer), `layerPanel.month.test.ts` (month, playing, sunlight, summaries), `layerPanel.comparison.test.ts` (comparison, one source), `layerPanel.winds.test.ts` and `layerPanel.units.test.ts` (pressure, units, inHg), with the shared helpers in `testing/layerPanelStage.ts`; the `layerCaption` tests move to `layers/scalar/caption.test.ts`. The array and range identities the panel relies on (the `kept` maps, "sent once") and `update`'s `try`/`finally` order are untouched, since `update` stays.
   - Functions: none changed.
   - Depends on: 4.
   - Acceptance: `layerPanel.ts` is about 1,030 lines; no function in it changed signature; every check passes; the suite's test count unchanged.
   - Tests: each moved test body unchanged; `figures.ts`'s two helpers keep their existing tests (moved to `figures.test.ts` if they are tested directly, else covered through the panel as today); the five panel test files each pass alone and together.

7. The page wiring's types moved out
   - Files: `src/app/wiring.ts`, new `src/app/wiring/parts.ts` (and `lighting.ts` for `sunlightStyleFor` if it reads better apart), `docs/development.md`.
   - What: Move the parts' types (`PageGlobe`, `PageAutosaveOptions`, the stats, temperature, layer and readout options, `PageParts`) and the pure `sunlightStyleFor` out of `wiring.ts` into `wiring/` (no `index.ts`, so `./wiring` still resolves to `wiring.ts`). `wiring.ts` re-exports the types `wiring.test.ts` and `main.ts` import, so neither changes. `startPage` and its body stay as they are. The 147-line doc comment stays with `startPage`.
   - Functions: none changed.
   - Depends on: 6.
   - Acceptance: `wiring.ts` is about 650 lines; `main.ts` and `wiring.test.ts` unchanged; every check passes; files in `wiring/` import nothing from `wiring.ts`.
   - Tests: `wiring.test.ts` unchanged and passing, as the guard that the page starts the same; `sunlightStyleFor`'s cases keep running where they are.

## Checkpoints
- [x] 1. The core in component folders
- [x] 2. The page's top-level files in role folders
- [x] 3. `ui/` split into the main view and the panel
- [x] 4. The scalar layers split, with the legend's fitting code
- [x] 5. The globe's material split
- [x] 6. The layer panel's types, constants and pure helpers moved out, and its tests split
- [ ] 7. The page wiring's types moved out

## Verification

After every piece: `npm run check` (Biome), `npm run typecheck`, `npm test`, `npm run build`, and both Earth baselines printing unchanged (the baseline tests run in `npm test`). Changed-lines coverage with `project.md`'s Coverage command; moved lines keep the coverage they had.

For the moves (pieces 1-3): `git diff -M --stat main` (or against the previous piece) shows each moved file as a rename, and `git diff -M` of each shows only import lines changed. For the splits (4-7): the suite's test count is the same before and after, each moved function's body is unchanged (a `git diff --color-moved` read in the review), and piece 5's shader strings are compared byte for byte.

Docs: `docs/development.md`'s folder tables follow each piece, and any doc naming a moved path (`docs/winds.md:117`). README needs no change. No manual review: nothing the page does changes, and the build, the tests and the baselines check that; the user can still open the page from the worktree at any piece.

## Notes

- Piece 1 (2026-11-17): moves done by a script that rewrote each relative import to the file's new location, then `biome check --write` re-sorted the imports it touched (Biome sorts import lines, so some imports moved or re-wrapped; no body line changed). Both baseline update scripts now join `src/core/temperature/baseline/` and `src/core/wind/baseline/`. Changed-lines coverage: no executable lines changed, so nothing to cover. Light re-check skipped: the two fixes were one-path comment and doc edits, confirmed by grep and `biome check`.

- Piece 2 (2026-11-17): 34 files moved (17 sources and their 17 tests) by the same import-rewrite script and `biome check --write` as piece 1; 70 files had imports rewritten. Every check came back clean, so no verifier or re-check ran. Changed-lines coverage: no executable lines changed. The first coverage run failed 10 tests while three subagents shared the CPU (310 s against 67 s); alone it passed 3623 of 3623. The main JS chunk has the same size (688,409 bytes) but a different hash, because the reordered imports change the bundler's module order and so the minifier's short names; the CSS and the worker chunk are byte-identical.

- Piece 3 (2026-11-17): 38 files moved (19 sources and their tests) by the same script and `biome check --write`; 45 files had imports rewritten, and nothing but import lines changed in `src/`. The `ui/` row of `docs/development.md` became three rows (`ui/main/`, `ui/panel/`, `ui/`), reworded twice after the docs check: the first draft said the top-level files were what "the two share", which only `fields.ts` is.
  - Decided by the builder: `layerPanel.ts` stays in `ui/` as the plan says, although `ui/main/cursorReadout.ts` imports two types back from it, so `ui/` and `ui/main/` depend on each other at folder level (a type-only edge). Options: leave it (chosen; the plan settles it and the edge existed before as a file-to-file import), or move `ShownLayer` and `ShownWinds` into `ui/main/`. Piece 6 moves those types into `ui/layerPanel/types.ts` anyway, which is the place to revisit it.

- Piece 4 (2026-11-17): `scalarLayer.ts` (1,017 lines) split into `layers/scalar/` (the nine files the plan names, the longest 264 lines); the legend's fitting code (`MIN_FITTED_SPAN_C`, `FIT_TAIL_SHARE`, `ScaleUnit`, `AS_GIVEN`, `countDown`/`countUp`, `cellWeights`, `fitRange`, `fitRangeFromZero`, `fitRangeCentred`, `formatTick`) is in `fit.ts`. Code bodies are byte-identical to the originals (checked by a declaration-by-declaration comparison); `index.ts` re-exports exactly the 60 names `scalarLayer.ts` did; the suite has 3623 tests in 118 files (it was 111 files). Changed-lines coverage: 196 lines, 100%.
  - Decided by the builder: `legendTicks` and its helpers stay in the legend. The fitting does not use them, and moving them would push `fit.ts` to about 430 lines. The legend now imports nothing from `fit.ts`; `layerPanel.test.ts` imports the fitting functions from `layers/scalar/fit` (no re-export from `legend.ts`).
  - Decided by the builder: one legend `describe` ("fitting and marking a scale in a unit") mixed both kinds of test, so it split at a test boundary into "fitting a scale in a unit" (`fit.test.ts`) and "marking a scale in a unit" (`legend.test.ts`); the bodies are unchanged. A `spec.test.ts` was added for the 8-line `summaryOf` describe, to keep one test file per source file.
  - Decided by the builder: the `describe` "fitSummaryScale in a unit, on an Earth-like year" (five tests, three of them check the fitted ranges against `legendTicks`) moved whole and unchanged from `layers/scalar/yearScale.test.ts` into `ui/main/legend.test.ts`, so that no file under `layers/` imports `ui/` (the plan's acceptance, read literally, includes tests). Options: keep it where it was and read the acceptance as "no source file" (rejected: the verifier's finding was upheld), or rewrite the tests (rejected: bodies must not change). Two of the five tests (hPa, refuses another unit) do not touch the legend, so "one test file per source file" bends slightly.
  - Deviation: none from the settled ledger. The index re-exports and doc `{@link}`s needed no signature change; `index.ts` rewords `{@link TEMPERATURE_LAYER}` and `{@link PRESSURE_LAYER}` as plain text, since links do not follow re-exports.

- Piece 5 (2026-11-17): `globe/material.ts` (1,064 lines) split into `globe/material/` (index, constants, glsl, heightRamps, relief.glsl, shaders, globeMaterial, cellTexture, layer, sunlight; the longest 333 lines) with a test per file and the shared helpers in `testing/glsl.ts`. All four checks came back clean, so no verifier or re-check ran. The 12 importers are unchanged. 3623 tests before and after. Changed-lines coverage: 99%, the two missing lines being `testing/glsl.ts`'s defensive throws (accepted).
  - Shader proof (the plan's acceptance): `RELIEF_GLSL` (5,800 characters), the vertex shader (6,040), the fragment shader (16,003), `ELEVATION_GLSL` (5,546), both ramp strings and the uniform names and defaults are byte-identical before and after. The builder's throwaway script hashed them (SHA-256, output diffed clean), and the correctness check redid it independently by bundling HEAD's file beside the new folder. Nothing is committed.
  - Decided by the builder: cross-file `{@link}`s use type-only imports, which leaves a type-only import cycle (`relief.glsl.ts` to `globeMaterial.ts` to `shaders.ts` to `relief.glsl.ts`) that is erased at compile time, so there is no runtime cycle and the module-level setup order is safe. Options: keep it (chosen; the plan allows type imports, and the links to `GlobeUniforms.uElevation` and `ReliefUniforms` are useful), reword the links, or move the uniform types into their own `uniforms.ts` (a structural change for a pure-move issue). Biome's `noImportCycles` is not on.
  - Decided by the builder: `VERTEX_GLSL` and `FRAGMENT_GLSL` were private and are now exported from `shaders.ts` only, because `globeMaterial.ts` needs them; `ELEVATION_GLSL` likewise from its own file. None of the three is in the entry point.
  - Decided by the builder: the three `createGlobeMaterial` describe blocks (plain, data layer, sunlight) went to `globeMaterial.test.ts`; "the sampling of per-cell values" to `relief.glsl.test.ts`; "a data value beyond the range" and "the coastline over a data layer" to `shaders.test.ts`. `index.ts` has no test of its own.

- Piece 6 (2026-11-17): `ui/layerPanel.ts` went from 1,444 to 1,046 lines; `ui/layerPanel/types.ts` (289), `internal.ts` (166) and `figures.ts` (40) hold what moved, unchanged; the five themed test files (core 54 tests, month 40, comparison 42, winds 44, units 20) pass alone and together, the 12 shared helpers are in `testing/layerPanelStage.ts`, and the three `layerCaption` tests are in `layers/scalar/caption.test.ts`. 3623 tests before and after (130 files). Changed-lines coverage 98% over the whole branch, the missing lines being test-helper lines the old test file never ran. Light re-check skipped after the one fix: a doc-comment link reworded to backticks.
  - Decided by the builder: `differenceOf` and `figuresOf` were inside `createLayerPanel`'s closure but close over nothing of it (they use only their parameters and module-level names), so they move out as plain functions, one tab shallower. The correctness check confirmed that moving them changes no identity or order.
  - Decided by the builder: two lines in `internal.ts` (`ObservedTexts`, `OBSERVED_STATUS`) are reflowed by Biome once `export` is added; keeping them verbatim would need a separate export list. The code is the same.
  - Decided by the builder: the file header's `{@link ScalarLayerSpec}` and `{@link LayerControls}` became plain backticks, since Biome counts an import used only in a `{@link}` as unused. Links inside declarations' doc comments use type-only imports as before.
  - Decided by the builder: theme assignment followed the plan's wording ("the key's wording" stays in the core file although it concerns the wind key); the three `layerCaption` tests merged into the existing `describe('layerCaption')` in `caption.test.ts`, because Biome warns about a duplicate describe title.
  - The folder-level dependency between `ui/` and `ui/main/` noted at piece 3 is unchanged: the `ShownLayer`/`ShownWinds` types now live in `ui/layerPanel/types.ts`, and `ui/main/cursorReadout.ts` still imports them through `../layerPanel`. Moving them into `ui/main/` would change importers, so it stays a roadmap-level choice.
