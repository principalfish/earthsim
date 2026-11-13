# Resume: add-winds-layer

## Where it stands

- State `investigating` (check: `python3 ~/.claude/lib/planner.py path 3` and `meta.json`). No branch, no builder, no GitHub issue yet.
- The discussion has started: the brief was played back and the first four questions put to the user on 2026-11-13. `decisions.md` holds the ledger.
- The README rewrite the user asked for first is committed on `main` as `abbf20d` (quick build, not pushed).

## Pending with the user

Four questions, asked 2026-11-13, each with the planner's recommendation:

1. **How the winds are worked out:** rules plus a pressure map (recommended: bands set by rotation and by where the planet is hottest, plus highs and lows over warm and cold land and sea, winds derived from the pressure), a simulated atmosphere, or prototype both first.
2. **Rotation as a planet setting in this step:** day length in hours with a wide range and a "results are rough" warning (recommended), a narrow trusted range only, or not in this step.
3. **How winds are drawn:** static arrows over the current colours, moving streaks, or arrows first and streaks as a later piece (recommended).
4. **Whether winds change the temperature in this step:** no, they only read it (recommended), or yes, winds carry heat.

Still to ask after those: observed Earth winds for a comparison and error baseline; whether pressure is shown as a colour layer; the wind units in the legend and readout.

## Groundwork (from the code on `main`, 2026-11-13)

- **Grid:** `getGrid(n)` gives cell centres (unit vectors), areas and four neighbours per cell across cube faces (`src/core/grid.ts:482`); `edgeGeometry` gives edge lengths and centre distances (`grid.ts:761`). There are no gradient, divergence or tangent-vector helpers: winds need them.
- **Temperature result:** `months`, twelve `Float32Array` of near-surface air in °C on the world's grid (`src/core/temperature.ts:397`). The land mask, ice and sea-level temperatures are internal. `coarsenWorld` and `refineField` (scalar only) can be reused to solve on a coarser grid.
- **Planet settings:** five, no rotation or day length (`src/core/planet.ts:17-71`). `parsePlanet` requires every key (`src/core/serialize.ts:234`), so a new setting needs a default for files saved without it. `isMeasuredEarth` compares every setting, and a temperature start is reused only on an exact settings match, so a rotation change would force a temperature re-solve unless that is handled.
- **Worker:** stateless, one worker per service, no cancel message (the page ends and restarts the worker). A winds kind needs entries in `SimResults`, `SimExtras`, `KINDS`, `PAYLOADS`, `COMPUTE`, `BUFFERS` (`src/core/protocol.ts`, `src/worker/handle.ts`), and needs the temperature months sent in or the winds worked out inside the temperature request.
- **Page:** one exclusive layer (`LAYERS` in `src/app/view.ts:11`), one data texture slot of one value per cell (`src/app/globe/material.ts:837`), legend and cursor readout written for temperature. Nothing draws arrows, lines or particles, and the globe renders only on change (`src/app/globe/renderer.ts:371`), so moving streaks need a render loop.
- **Observed data:** the temperature file's build, reader and comparison (`scripts/build-observed-temperature.ts`, `src/core/observed.ts`, `src/core/compare.ts`) are scalar; observed winds need a signed two-component encoding.
