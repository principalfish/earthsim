# Resume: add-winds-layer

## Where it stands

- State `planned`, moving to `building` when the builder's first update is ingested (check: `grep '"state"' "$(python3 ~/.claude/lib/planner.py path 3)/meta.json"`). GitHub issue #5. No PR yet: open the draft PR once piece 1 is pushed.
- The builder was started on 2026-11-13: session `local_861b5031-c368-4a88-b7a4-71e71ea962f6` ("builder: add-winds-layer", name `b-add-winds-layer`), on piece 1 with the user's go-ahead ("Start it"). It runs on the planner chat's model with Opus implementation subagents ("Same as last time"). Find its worktree and branch with `planner.py ingest 3` and `meta.json`'s `local` list.
- `plan.md` has 15 pieces, ten with a manual review (4, 5, 6, 9, 10, 11, 12, 13, 14, 15; "Keep all ten"), and a stop after piece 6 for the user's choice of wind model: pieces 7 onward are written for the rules model and the planner revises them after the choice.

## Pending with the user

Nothing. Next: when the builder reports, `planner.py ingest 3`, check `git log main..<branch>`, and relay as `/planner`'s "Relaying for the builder" says. Piece 1 may stop with a question: NOAA's download server did not answer on 2026-11-13, so the wind and pressure files are unconfirmed.

Relay an approval of a manual-review piece only when the user's words say they tried it.

## Groundwork (from the code on `main`, 2026-11-13)

- **Grid:** `getGrid(n)` gives cell centres (unit vectors), areas and four neighbours per cell across cube faces (`src/core/grid.ts:482`); `edgeGeometry` gives edge lengths and centre distances (`grid.ts:761`). There are no gradient, divergence or tangent-vector helpers: winds need them.
- **Temperature result:** `months`, twelve `Float32Array` of near-surface air in °C on the world's grid (`src/core/temperature.ts:397`). The land mask, ice and sea-level temperatures are internal. `coarsenWorld` and `refineField` (scalar only) can be reused to solve on a coarser grid.
- **Planet settings:** five, no rotation or day length (`src/core/planet.ts:17-71`). `parsePlanet` requires every key (`src/core/serialize.ts:234`), so a new setting needs a default for files saved without it. `isMeasuredEarth` compares every setting, and a temperature start is reused only on an exact settings match, so a rotation change would force a temperature re-solve unless that is handled.
- **Worker:** stateless, one worker per service, no cancel message (the page ends and restarts the worker). A winds kind needs entries in `SimResults`, `SimExtras`, `KINDS`, `PAYLOADS`, `COMPUTE`, `BUFFERS` (`src/core/protocol.ts`, `src/worker/handle.ts`), and needs the temperature months sent in or the winds worked out inside the temperature request.
- **Page:** one exclusive layer (`LAYERS` in `src/app/view.ts:11`), one data texture slot of one value per cell (`src/app/globe/material.ts:837`), legend and cursor readout written for temperature. Nothing draws arrows, lines or particles, and the globe renders only on change (`src/app/globe/renderer.ts:371`), so moving streaks need a render loop.
- **Observed data:** the temperature file's build, reader and comparison (`scripts/build-observed-temperature.ts`, `src/core/observed.ts`, `src/core/compare.ts`) are scalar; observed winds need a signed two-component encoding.
