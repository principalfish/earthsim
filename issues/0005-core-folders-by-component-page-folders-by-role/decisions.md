# Decisions: core folders by component, page folders by role

The user's brief (2026-11-17): "lets /planner refactor 3a", roadmap step 3a in `investigations/2026-11-10-simulator-design-and-roadmap.md`.

## Settled
- A pure move: no behaviour change, checked by the existing tests and both Earth baselines (temperature and winds) printing unchanged. From the roadmap.
- Core layout, agreed by the user 2026-11-13 ("layout looks good for core"): `grid/` (grid, vector, coarsen, quantile); `world/` (world, generate, noise, brush, history, stats, serialize); `planet/` (planet, star, insolation); `earth/` (earth, observedGrid); `temperature/` (temperature, exchange, observed, baseline/); `wind/` (as it is, plus observedWind); left flat: index, protocol, compare; `testing/` stays.
- Page layout, agreed by the user 2026-11-13 ("Yes, add it"): the page stays organised by role; `globe/` and `ui/` stay; top-level files go to `editing/` (appState, sculpt, undo), `saving/` (storage, autosave, startup), `layers/` (layers, view, refresh, workerService, playback, earthData, observedData); left flat: main, wiring, panelMemory, styles.css.
- The worker stays as it is (three small files). From the roadmap.
- Planned through `/planner refactor`, not `/quick-build`. The user: "lets /planner refactor 3a" (2026-11-17)

## Open
- Where the files added since the layout was agreed go: core `baseline/earthWinds` (the layout put `baseline/` under `temperature/`), `temperatureCoarse.test.ts`, `temperatureGuess.test.ts`; page `scalarLayer`, `units`, `preferences`.
- Whether `ui/` (26 files after 3c) stays flat or splits.
- Whether splitting the largest files (`ui/layerPanel.ts` 1,440 lines, `globe/material.ts` 1,064, `scalarLayer.ts` 1,017, `wiring.ts` 953) is in this issue.
- Whether `scripts/` (about 20 top-level files) is in scope.

## Assumed
