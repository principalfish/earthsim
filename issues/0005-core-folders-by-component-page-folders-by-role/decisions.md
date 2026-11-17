# Decisions: core folders by component, page folders by role

The user's brief (2026-11-17): "lets /planner refactor 3a", roadmap step 3a in `investigations/2026-11-10-simulator-design-and-roadmap.md`.

## Settled
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

- The builder starts, and with it piece 1 (the core in component folders), with no decisions open and no manual reviews in the plan. The user: "Start it" (2026-11-17)

- Piece 1 approved as reviewed, with the light re-check of its two one-path doc fixes skipped as the builder proposed. The user: "Approve" (2026-11-17)

- Piece 2 started, with no decisions open. The user: "Start it" (2026-11-17)

## Open
- None.

## Assumed
- Verification for every piece: lint, typecheck, every test, the build, and both Earth baselines printing unchanged; the material split also compares the shader strings before and after, byte for byte.
- Imports from the core keep going through `core/index`; new folders with an entry point (`globe/material/`, `layers/scalar/`) get an `index.ts`, so their importers change only by the folder move.
- `docs/development.md`'s folder tables, and any doc naming a moved path, follow each piece. The roadmap gets a follow-up for the deeper `layerPanel` and `wiring` splits.
- `ui/layerPanel.ts` stays at `ui/` and imports from `ui/main/` and `ui/panel/`; a parent folder importing its children is the expected direction.
