# Resume: add-winds-layer

## Where it stands

- State `investigating` (check: `python3 ~/.claude/lib/planner.py path 3` and `meta.json`). No branch, no builder, no GitHub issue yet.
- The discussion has started: the brief was played back and the first four questions put to the user on 2026-11-13. `decisions.md` holds the ledger.
- The README rewrite the user asked for first is committed on `main` as `abbf20d` (quick build, not pushed).

## Pending with the user

Answered on 2026-11-13 (in `decisions.md`): "Prototype both first"; "Day length, wide range"; "Arrows first, streaks later"; "No, winds only read it".

Second round, asked 2026-11-13, each with the planner's recommendation:

1. **How the prototypes are judged:** a report with maps and error figures against observed Earth winds, which the user chooses from (recommended), or both models live in the page behind a temporary switch.
2. **Observed Earth winds in the page:** yes, as temperature has, with an error baseline (recommended), or only in scripts and tests.
3. **How long a wind solve may take:** no longer than the temperature solve (recommended), or longer allowed.
4. **Pressure as a colour layer:** not in this step (recommended), or yes.

Still to settle after those: the Day length range, the wind unit, and what rain and currents need from the output.

## Groundwork (from the code on `main`, 2026-11-13)

- **Grid:** `getGrid(n)` gives cell centres (unit vectors), areas and four neighbours per cell across cube faces (`src/core/grid.ts:482`); `edgeGeometry` gives edge lengths and centre distances (`grid.ts:761`). There are no gradient, divergence or tangent-vector helpers: winds need them.
- **Temperature result:** `months`, twelve `Float32Array` of near-surface air in °C on the world's grid (`src/core/temperature.ts:397`). The land mask, ice and sea-level temperatures are internal. `coarsenWorld` and `refineField` (scalar only) can be reused to solve on a coarser grid.
- **Planet settings:** five, no rotation or day length (`src/core/planet.ts:17-71`). `parsePlanet` requires every key (`src/core/serialize.ts:234`), so a new setting needs a default for files saved without it. `isMeasuredEarth` compares every setting, and a temperature start is reused only on an exact settings match, so a rotation change would force a temperature re-solve unless that is handled.
- **Worker:** stateless, one worker per service, no cancel message (the page ends and restarts the worker). A winds kind needs entries in `SimResults`, `SimExtras`, `KINDS`, `PAYLOADS`, `COMPUTE`, `BUFFERS` (`src/core/protocol.ts`, `src/worker/handle.ts`), and needs the temperature months sent in or the winds worked out inside the temperature request.
- **Page:** one exclusive layer (`LAYERS` in `src/app/view.ts:11`), one data texture slot of one value per cell (`src/app/globe/material.ts:837`), legend and cursor readout written for temperature. Nothing draws arrows, lines or particles, and the globe renders only on change (`src/app/globe/renderer.ts:371`), so moving streaks need a render loop.
- **Observed data:** the temperature file's build, reader and comparison (`scripts/build-observed-temperature.ts`, `src/core/observed.ts`, `src/core/compare.ts`) are scalar; observed winds need a signed two-component encoding.
