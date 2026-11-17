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

## Open
- How each of the four large files splits, and into what.
- Whether the moves or the splits come first.

## Assumed
