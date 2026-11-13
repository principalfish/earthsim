# Resume: add-winds-layer

## Where it stands

- State `planned` (check: `grep '"state"' "$(python3 ~/.claude/lib/planner.py path 3)/meta.json"`). GitHub issue #5. No branch, no builder, no PR yet.
- `issue.md` is approved and carries the `## Plan` checklist; `plan.md` has 15 pieces, with a stop after piece 6 for the user's choice of wind model (pieces 7 onward are written for the rules model and get revised after the choice).
- `decisions.md` is complete apart from the one item below.

## Pending with the user

Asked 2026-11-13:

1. **Which proposed manual reviews to keep.** Proposed for pieces 4, 5, 6 (the wind report), 9 (arrows), 10 (Day length slider), 11 (pointer strip and unit), 12 (the refactor, to see nothing changed), 13 (Pressure), 14 (Earth comparison), 15 (streaks). Pieces 1, 2, 3, 7 and 8 have none. Remove the `Manual review:` line from any piece the user drops.
2. **Whether to start the builder.** Before starting, give the next-stage briefing for piece 1 (its one decision: none expected; its risk: NOAA's server was unreachable on 2026-11-13, and the wind and pressure files are unconfirmed, so piece 1 may stop with a question). Also raise the builder's model: `models.md` says builder sessions start on `claude-sonnet-5-5` (the "Builder on Sonnet" experiment is on), while issue 0002's builder ran on `claude-fable-5-2` with Opus implementation subagents; ask which the user wants.

Next: on the answers, edit `plan.md` for the kept reviews, save, start the builder as a linked session (`/planner`'s "Starting the builder"), track its session, and update the issue's checklist status line.

## Groundwork (from the code on `main`, 2026-11-13)

- **Grid:** `getGrid(n)` gives cell centres (unit vectors), areas and four neighbours per cell across cube faces (`src/core/grid.ts:482`); `edgeGeometry` gives edge lengths and centre distances (`grid.ts:761`). There are no gradient, divergence or tangent-vector helpers: winds need them.
- **Temperature result:** `months`, twelve `Float32Array` of near-surface air in °C on the world's grid (`src/core/temperature.ts:397`). The land mask, ice and sea-level temperatures are internal. `coarsenWorld` and `refineField` (scalar only) can be reused to solve on a coarser grid.
- **Planet settings:** five, no rotation or day length (`src/core/planet.ts:17-71`). `parsePlanet` requires every key (`src/core/serialize.ts:234`), so a new setting needs a default for files saved without it. `isMeasuredEarth` compares every setting, and a temperature start is reused only on an exact settings match, so a rotation change would force a temperature re-solve unless that is handled.
- **Worker:** stateless, one worker per service, no cancel message (the page ends and restarts the worker). A winds kind needs entries in `SimResults`, `SimExtras`, `KINDS`, `PAYLOADS`, `COMPUTE`, `BUFFERS` (`src/core/protocol.ts`, `src/worker/handle.ts`), and needs the temperature months sent in or the winds worked out inside the temperature request.
- **Page:** one exclusive layer (`LAYERS` in `src/app/view.ts:11`), one data texture slot of one value per cell (`src/app/globe/material.ts:837`), legend and cursor readout written for temperature. Nothing draws arrows, lines or particles, and the globe renders only on change (`src/app/globe/renderer.ts:371`), so moving streaks need a render loop.
- **Observed data:** the temperature file's build, reader and comparison (`scripts/build-observed-temperature.ts`, `src/core/observed.ts`, `src/core/compare.ts`) are scalar; observed winds need a signed two-component encoding.
