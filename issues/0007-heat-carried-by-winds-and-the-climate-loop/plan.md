# Plan: heat-carried-by-winds-and-the-climate-loop

**Build model:** claude-opus-5-5 (numerical work in the temperature solver, a new loop with stopping and damping rules, and a scheduler rewrite where timing and pause races matter)

## Context

Roadmap step 3b, the first feedback into the temperature and the loop later feedbacks plug into (ocean currents in step 5, sea ice and snow in step 6). The design is under "How the layers feed back into each other" in the roadmap; this issue settles it.

### What the reads found (2026-11-18, in full in `sweeps-2026-11-18.md`)
## The Earth's temperature error by region (64 grid, today's model)
Script: `temperature-errors.ts` beside this file (run from the repo root with `node scripts/run-with-vite.mjs <path>`, about 2 s; a cold `solveTemperature` against `observedTemperature`). Global annual mean −0.1 K, RMS 3.9; land −2.1 (RMS 5.6), sea +0.7 (3.0).

| Region | Annual | January | July |
|-|-|-|-|
| W Europe | −6.5 | −3.5 | −8.7 |
| E North America | +3.6 | +10.8 | −2.4 |
| W coast North America | −4.4 | −2.1 | −6.3 |
| East Asia | −0.1 | +6.3 | −3.5 |
| Siberian interior | −2.5 | +0.6 | −2.7 |
| Central North America | −0.9 | +3.3 | −3.0 |
| N Atlantic 50–65°N | −7.7 | −5.3 | −9.0 |
| Barents/Norwegian Sea | −12.2 | −19.1 | −8.0 |
| Southern Ocean 55–70°S | +3.1 | +1.2 | +5.4 |
| Antarctica | +8.3 | +5.4 | +8.8 |
| Himalaya/Tibet | −11.9 | −12.3 | −7.3 |
| Andes | −5.6 | −5.1 | −5.9 |
| Sahara | −5.5 | −0.6 | −8.9 |
| Amazonia | +1.1 | +2.5 | −0.4 |

West-facing minus east-facing coasts, 40–60°N, simulated / observed: Europe W vs Asia E annual +0.7 / +11.5, January +2.4 / +22.9; North America W vs E annual −0.8 / +5.8, January −0.6 / +15.1. The model has almost no west–east contrast; its east coasts are 14–17 K too warm in January.

Shares of the squared error (rough): winds about 25% (mid-latitude winter land, east coasts, the missing west–east contrast); ocean about 15% (N Atlantic and Nordic seas, eastern tropical Pacific); sea ice and snow about 20%; high ground and ice sheets about 20% (Tibet and the Andes too cold, the lapse cooling too strong at height; Antarctica +8); other land about 15% (a summer cold bias over all northern land, 3–9 K).

## The temperature solver
- Balance per cell: `C dT/dt = (1−α)Q − εσT⁴ + Σ D·w_k(T_k−T)/A` (`temperature.ts:10`); edge coupling the mean of the land/sea diffusivities times the edge weight, equal from both sides (`:741`). Two steps a month, BDF2 with T⁴ linearised about 2T−T⁻ (`:1174-1226`). PCG preconditioned by one V-cycle (forward Gauss–Seidel, coarse correction, backward sweep, Cholesky at n = 2) (`exchange.ts:197, 276, 474, 488`), stopping at rᵀz ≤ tol²Σm, tol 5e-3 K, at most 200 iterations (`:528`); `conserve` shifts x so Σmx = Σb (`:551, 562`). First guess a Newton annual balance (`:840`); year loop `solveOnGrid` (`:1709`) with `correctYearEnd` up to 4 passes, stopping below 0.05 K. Worlds of 128 and 256 are solved one grid coarser and refined back.
- Relies on symmetry: CG and its error estimate (SPD), the symmetric V-cycle and Cholesky, `coarsen`'s symmetry assertion and the coupling check (`exchange.ts:400`), and `conserve` (flux form only). The surface wind is strongly divergent (friction drives it into lows), so a flux-form advection creates heat; advective form breaks the shift; projecting out the divergence first is one fix.
- The winds: 12 monthly east/north fields in m/s at cell centres on the world's grid (one surface level, compared with observed 10 m winds, typically 5–10 m/s). Edge normals and cubic edge values exist in `grid/vector.ts`. Coefficient u·n × edge length × c_p·ρ·H; with the full column (~1e7 J/m²K) the cell Péclet number is about 0.35 against D at 64, so H needs a setting.
- Day length is excluded from the temperature today (`planet.ts:98`, the start record, `temperature.test.ts:775`); it would enter through the winds (Coriolis and band width).
- Cost (Earth, from nothing): 64 in 0.8–0.9 s (4 years), 256 (solved on 128) 3.6 s; warm start 1 year, 0.21 s and 1.0 s; winds 0.58 s and 0.95 s. A loop pass is about 0.8 s at 64 and 2 s at 256; 3–5 passes about 3–4 s and 6–10 s. A nonsymmetric solver costs about 2× per iteration.
- Scheme options: implicit upwind in the main solve (stable, monotone, most accurate; a new nonsymmetric solver, coarsening and conservation work); explicit sub-steps (Courant about 40 on land, 40–170 sub-steps, slow at 128); operator split (keep the SPD solve, add a cheap implicit upwind solve; medium effort; first order in time unless Strang-split).
- Pinned by tests: Earth values to 0.01 K (`temperature.test.ts:279`), the baseline JSON, day-length independence (`:744-775`), N/S symmetry (`:497`), coarse-vs-full limits, exchange conservation.

## The worker and the page
- Today: request kinds `temperature` and `winds` (`protocol.ts:45-92`), each on its own worker (`main.ts:190-205`); only the temperature reports progress. The winds scheduler asks when a new current temperature arrives (`refresh.ts:753-762`) and keeps its worker (grid tables). Warm start from the stored result (`:464-468`). Pause stops both; a solve under way finishes; resume catches up (`wiring.ts:469-475`, `refresh.ts:516, 779-804`). Status lines in `infoBox.ts:138-181`.
- Recommended by the read: one `climate` request with the loop in core as a pure `solveClimate(world, { start, onPass })`; one worker and one store status; the winds scheduler goes. A page-driven loop would copy about 19 MB of months each way per pass and split one loop across two schedulers. "First pass at once, then refined": a pass message carrying each pass's temperature and winds, held as provisional. Warm-start only from a converged result.
- About 190 test sites change (refresh, workerService, wiring, infoBox, layerPanel, client/handle).
- Risks: Pause mid-loop (finish the loop, or stop between passes); a new world mid-loop (killing the worker drops the winds' grid tables); a progress bar whose total is unknown.

### Settled (from `decisions.md`, in full)
- The climate loop's purpose: the first feedback into the temperature (heat carried by the winds), and the loop that later feedbacks (ocean currents in step 5, ice and snow in step 6) plug into. Heat carried by winds should give mild west coasts and cold east coasts at mid-latitudes, and set how far inland the sea's influence reaches. From the roadmap.
- The climate is already worked out after every change, with Pause, since step 3c (issue 0004); this step keeps that.
- Retuning waits for step 6b: note what moves (`lowShiftGain`, `thermalHpaPerK` should come back towards their natural values when the temperature improves), do not chase the Earth's figures here. The user, 2026-11-14 ("Leave it for later") and the roadmap.
- Winds too strong on slow spinners is a rule to fix in step 6b, not here. The user, 2026-11-14: "Leave it for later".
- Ocean currents are step 5, after this one; rain and Köppen zones are step 4, after step 5. The user, 2026-11-18: "3b, then 5, then 4".
- The models' settings live in `src/core/config.ts` (step 3d), so any new setting goes there with its explanations, and appears on the Model settings screen and in `config.md`.

- What the reads found is in `sweeps-2026-11-18.md` beside this file: winds explain about a quarter of the Earth's temperature error (the missing west–east coast contrast, east coasts 14–17 K too warm in January); the rest is ocean, sea ice and snow, high ground and ice sheets, and a summer cold bias over northern land.
- Scope: the loop and heat carried by winds only. The too-strong cooling with height (Tibet about 12 K too cold) and Antarctica too warm (about 8 K) are recorded for step 6b, not fixed here; the Earth figures will move only modestly. The user: "Winds and loop only (Recommended)" (2026-11-18)
- The temperature solver takes heat carried by the wind as a separate step each time-step (an operator split): today's symmetric solve stays as it is, and a cheap step moves heat downwind. The user: "Separate wind step (Recommended)" (2026-11-18)
- The new setting for how strongly the wind carries heat (in effect the depth of air that moves it) starts from a physical estimate and is checked against the Earth's west–east coast contrast landing in a believable range (observed about 11 K, western Europe against East Asia, 40–60°N); only this new setting is set, nothing else is retuned. The user: "Physics, then a sanity check (Recommended)" (2026-11-18)
- The page shows each pass: the first pass (today's temperature and winds) appears at once, each later pass replaces it as it lands, and the status says which pass it is on; Pause lets the pass under way finish, then stops, and resume carries on from there. The user: "Show each pass (Recommended)" (2026-11-18)

- Heat is carried by the wind's flowing part only: before carrying heat, the converging part of each month's surface wind is removed (one quick solve per month with the existing solver), so heat is moved around and never made. The converging air rises and takes its heat away, which a surface-only model cannot follow. The user: "Use the wind's flowing part (Recommended)" (2026-11-18)
- The loop stops when no cell's monthly temperature changes by more than 0.1 °C between passes, with a cap of 6 passes; if a pass overshoots, only half its change is applied. The user: "0.1 °C, at most 6 passes (Recommended)" (2026-11-18)
- One climate request: the loop lives in the core as one function, the worker runs it and reports each pass, and the page's separate temperature and wind requests become one climate request with one scheduler. About 190 test sites change. The user: "One climate request (Recommended)" (2026-11-18)
- Both Earth baselines are re-recorded with the new figures, shown in the review, and the west–east coast contrast becomes a figure of its own in the temperature baseline, so a later step cannot quietly lose it. The user: "Re-record, add the coast contrast (Recommended)" (2026-11-18)

### Assumed
- Day length enters the temperature only through the winds (their turning and band widths); the heat exchange between neighbours does not change with it. The temperature's start record and the day-length tests change accordingly.
- The first pass is today's temperature and winds unchanged, so a world with no wind effect looks as it does now; each later pass feeds the previous pass's winds into the temperature.
- Warm starts come only from a settled result, never from a pass shown on the way.
- A new world or an edit during the loop stops it and starts again, as a new solve does today; Pause lets the pass under way finish.
- The settled wind heat carries the winds' own baseline and comparison forward; the winds are re-solved from the final temperature each pass.
- The status line names the pass ("Refining climate (pass 2)"); the progress bar does not drop back to 0 between passes.
- New settings (the heat-carrying depth, the loop's 0.1 °C and 6 passes, the half-step on overshoot) go in `config.ts` with their explanations, so they appear on the Model settings screen and in `config.md`; the climate process diagram's "Built today" line is updated.
- Two loops, nested: the wind's heat goes in inside the temperature's existing time-stepping (each step, a downwind step after today's exchange solve, with that pass's monthly winds held fixed), and the winds are re-solved only between passes, in the new outer climate loop. Each pass after the first is a warm-started temperature solve (usually about one model year) plus a winds solve. Answers the user's question "are doing this within the existing loops, or as a separate set of loops after each temp lopo?" (2026-11-18).

## Approach

Build bottom up, each piece leaving the page working as today until the last two switch it over:
1. a pure function that takes a month's surface wind and returns its flowing (divergence-free) part;
2. an optional winds input to the temperature solve, applied as a separate implicit upwind step after each time-step's exchange solve; with no winds the solve is exactly today's, so every existing temperature test and the baseline still hold;
3. the loop in the core, `solveClimate`, built from the two existing solvers and the new input, with its stopping, damping and cap;
4. the new setting's value from physics, the Earth's west–east check, and both baselines re-recorded with the coast contrast added;
5. the worker and protocol: one `climate` request with a pass message;
6. the page: one scheduler in place of two, passes shown as they land, Pause between passes, the status naming the pass.

Rejected (with the user's choices): putting the winds into the main symmetric solve (a new nonsymmetric solver and its speed-ups, the most risk); many explicit sub-steps (40–170 a step, slow at 256); carrying heat with the full surface wind (makes heat where it converges); a fixed number of passes; driving the loop from the page (about 19 MB of months each way per pass, and the loop split across two schedulers); showing only the settled result.

## Pieces

1. The wind's flowing part
   - Files: new `src/core/wind/flowing.ts` and its test (or beside the winds' vector code in `src/core/grid/vector.ts` if it reads better there), `src/core/index.ts`, `docs/winds.md`.
   - What: A pure `flowingPart(grid, east, north)` that removes the converging (divergent) part of a cell-centred surface wind field on the cubed sphere, leaving a field with no net inflow or outflow at any cell: solve a Poisson equation for a potential whose gradient is the divergent part, with the existing symmetric exchange solver (`exchange.ts`), and subtract it. Works per month; the result is in the same units and layout as the winds. Includes what the temperature step will need: the face-normal flow through each cell edge, built from the edge normals and edge values in `grid/vector.ts`, summing to zero around every cell to the solver's tolerance.
   - Functions: `flowingPart`; an edge-flow helper (`edgeFlows`).
   - Depends on: none.
   - Acceptance: on any wind field, the edge flows of the result sum to zero around every cell (within tolerance) and the result is unchanged by a second application; a field that already has no divergence (a solid-body rotation) comes back as it went in; a purely converging field (all inflow to one point) comes back as zero; the Earth's July surface wind keeps its large-scale pattern (the trades and westerlies) while losing its inflow to the lows.
   - Tests: the four cases in Acceptance; idempotence; units and layout preserved; the cube's seams and corners handled (a flow across a face edge sums to zero there too).

2. Heat carried by the wind, in the temperature solve
   - Files: `src/core/temperature/temperature.ts`, `src/core/temperature/exchange.ts` only if a shared helper is needed, new `src/core/temperature/advection.ts` and its test, `src/core/config.ts` (the new setting), `src/core/config.md` (regenerated), `docs/temperature.md`.
   - What: `solveTemperature` (and the functions that default to `TEMPERATURE_MODEL`: `annualBalance`, `refineMonths`, the coarse-grid path) gains an optional `winds` input: 12 monthly edge-flow fields from piece 1, interpolated to each step as the sunlight is, and coarsened to the solve grid for worlds above 64. After each step's exchange solve, an implicit upwind step moves heat along the flows: `C (T' − T)/Δt = Σ_in F·(T_up − T')` per cell, which is an M-matrix and so stable and monotone at any step length; solved by a downwind-ordered Gauss–Seidel sweep, or the existing solver where it fits. Because the flows have no divergence, the step conserves heat exactly, and `conserve` is unchanged. One new setting in `TEMPERATURE_CONFIG`: how strongly the wind carries heat, as the depth of air that moves it (or an equivalent coefficient; the builder picks the plainer), with a placeholder physical value here and its explanation (what, raising, lowering, source); piece 4 sets its value. With no `winds` given the solve is today's exactly.
   - Functions: `solveTemperature` and `TemperatureOptions` (new `winds`); the advection step; the new config entry.
   - Depends on: 1.
   - Acceptance: with no winds, every existing temperature test and the Earth baseline pass untouched, to the same 0.01 K pins; with winds, total heat is conserved to the solver's tolerance; a uniform temperature stays uniform under any flow; a warm patch moves downwind and spreads, and further at a greater setting; a zero setting gives today's answer.
   - Tests: the Acceptance cases; the step's monotonicity (no new extremes); the coarse-grid path with winds (a 128 world solved on 64 matches a 64 world within the existing limits); the config entry and its explanations (the config tests' every-field check).

3. The climate loop in the core
   - Files: new `src/core/climate.ts` and its test, `src/core/index.ts`, `src/core/protocol.ts` (the result and start types, if the core defines them), `src/core/config.ts` (the loop's settings), `src/core/config.md` (regenerated), `src/core/planet/planet.ts` and `src/core/temperature/temperature.ts` (day length now matters through the winds: the start record and `TEMPERATURE_SETTINGS`' doc), `docs/temperature.md`, `docs/winds.md`.
   - What: A pure `solveClimate(world, { start?, onPass? })`: pass 1 solves the temperature as today (no winds) and the winds from it; each later pass solves the temperature warm-started from the last, with the previous pass's winds' flowing part, then the winds from the new temperature. It stops when no cell's monthly temperature moved by more than 0.1 °C, or after 6 passes; if a pass overshoots (the largest change grows rather than shrinks), only half its change is applied. `onPass` reports each pass's temperature and winds and whether it is settled. The loop's numbers (0.1 °C, 6 passes, the half-step) go in a new `CLIMATE_CONFIG` section (or a group of `TEMPERATURE_CONFIG`, the builder's call), with explanations. A start carries the settled temperature and winds, so a later solve warm-starts from them. The temperature now depends on day length through the winds; the start record includes it and the tests that pinned day-length independence of the temperature are changed to pin it only for the first pass.
   - Functions: `solveClimate`, `ClimateResult`, `ClimateStart`, `ClimateProgress`; the config section.
   - Depends on: 2.
   - Acceptance: the first pass equals today's temperature and winds exactly; on the Earth at 64 the loop settles within the cap and reports each pass; a world with no wind (a test planet, or the setting at zero) settles after pass 2 with today's answer; the half-step damps a forced oscillation; a warm start from a settled result settles in one pass.
   - Tests: the Acceptance cases; `onPass` order and content; the stopping rule at exactly the tolerance; the cap; the start round-trips; day length changes the settled temperature but not the first pass.

4. The setting's value, and the baselines
   - Files: `src/core/config.ts` (the setting's value, its source and its check), `src/core/config.md`, `scripts/update-earth-temperature-baseline.ts` and `scripts/update-earth-winds-baseline.ts` (solve through `solveClimate`), `src/core/temperature/baseline/earthTemperature.ts`, `.json` and test (the coast-contrast figure), `src/core/wind/baseline/earthWinds.*`, `scripts/` timing scripts (`time-temperature.ts`, `time-winds.ts`, or a new `time-climate.ts`) and `package.json`, `docs/temperature.md`, `docs/winds.md`, `docs/development.md`.
   - What: Set the heat-carrying setting from a physical estimate (the depth of the well-mixed lower atmosphere, with its source), then run the Earth and report the west–east coast contrast at 40–60°N (western Europe against East Asia, west against east North America; annual and January) against the observed (about 11 K and 6 K annual; 23 K and 15 K January). If it lands in a believable range, keep it; if it is far off, report and stop for the user rather than tune. Re-record both Earth baselines through the loop, add the coast contrast as a figure of its own with a test that fails if it shrinks, and show old and new figures in the review. Measure and report the loop's time at 64 and 256 (cold and warm).
   - Functions: the baseline modules' new figure; the timing script.
   - Depends on: 3.
   - Acceptance: the setting has a physical source in its explanation; the Earth's west–east contrast is reported and in a believable range (or the piece stops for the user); both baselines re-recorded and their tests pass; the coast contrast is pinned; timings reported.
   - Tests: the baseline tests with the new figures; the coast-contrast test; the timing script runs (not timed in tests).
   - Manual review: none (figures in the review request); the user sees the maps in piece 6.

5. One climate request in the worker
   - Files: `src/core/protocol.ts` and its test, `src/worker/handle.ts`, `client.ts`, `sim.worker.ts` and their tests, `src/app/layers/workerService.ts` and its test, `src/app/main.ts` (one worker).
   - What: Replace the `temperature` and `winds` request kinds with one `climate` request (optional start), answered by `pass` messages (each pass's temperature and winds, and whether settled) and a final result; progress within a pass as the temperature's today. One worker; a newer request still overtakes and restarts it. The winds' grid tables are built once per worker and reused across passes within a solve.
   - Functions: the protocol's climate request, pass and result messages; `handle`; the client; the climate service in `workerService.ts`.
   - Depends on: 3.
   - Acceptance: a climate request answers with each pass in order and a final settled result; a newer request overtakes an older one; a cancelled solve sends nothing after cancelling; the messages carry the months as transferable buffers.
   - Tests: the protocol round-trip; the handler's pass order; overtaking and cancelling; the client and service tests rewritten from the two kinds to one.

6. The page: one scheduler, passes shown as they land
   - Files: `src/app/layers/refresh.ts` and its test, `src/app/wiring.ts` and its test, `src/app/ui/main/infoBox.ts` and its test, `src/app/ui/layerPanel.ts` and its tests, `src/app/ui/main/legend.ts` if the progress bar changes, `src/app/ui/panel/processDiagram.ts` (the "Built today" line), `docs/user-guide.md`.
   - What: One climate scheduler replaces the temperature and wind schedulers: it asks for a climate solve after every change, as today; holds each pass as provisional and shows it at once (the temperature layer and the winds update together); warm-starts only from a settled result; on Pause lets the pass under way finish and stops, and on resume carries on from there; a new world or an edit stops the loop and starts again. The status reads "Calculating climate" for the first pass (with the temperature's progress bar) and "Refining climate (pass n)" after, with a bar that does not drop back to 0 between passes; "Paused" as today. The diagram's "Built today" line becomes: temperature, pressure and winds in a loop with heat carried by winds; and "Planned, not built" loses the loop and heat carried by winds. The user guide's status texts follow.
   - Functions: the climate scheduler in `refresh.ts`; the wiring's Pause, new-world and undo paths; `calculationContent`.
   - Depends on: 5.
   - Acceptance: on opening, the Earth appears after the first pass and refines; Pause mid-loop finishes the pass and stops, resume carries on; a sculpt stroke during a loop restarts it; the status names the pass; the winds and temperature always come from the same pass.
   - Tests: the scheduler's order, provisional and settled states, warm start only from settled, Pause between passes, resume, a new world and an edit mid-loop; the status texts; the bar's monotone progress; the wiring tests rewritten from two schedulers to one.
   - Manual review: open the page on the Earth with Temperature on; watch the status go from "Calculating climate" to "Refining climate (pass 2…)" and settle; compare January's map with today's (western Europe milder, East Asia and eastern North America colder; Difference view against the observed); press Pause during a refinement and resume; sculpt during a refinement; open the Model settings screen and check the new settings and the diagram's lines. How: the user runs `npm run dev` themselves from the builder's worktree, whose path the planner gives them; the builder leaves no server running for it.

## Checkpoints
- [x] 1. The wind's flowing part
- [x] 2. Heat carried by the wind, in the temperature solve
- [x] 3. The climate loop in the core
- [ ] 4. The setting's value, and the baselines
- [ ] 5. One climate request in the worker
- [ ] 6. The page: one scheduler, passes shown as they land

## Verification

After every piece: `npm run check`, `npm run typecheck`, `npm test`, `npm run build`, `npm run docs:config` unchanged after regenerating. Both Earth baselines must pass untouched through pieces 1–3 (piece 2 with no winds gives today's answer) and are re-recorded in piece 4, with old and new figures in that review. Changed-lines coverage with `project.md`'s Coverage command. The region-by-region error script (`temperature-errors.ts` in the issue folder) is rerun after piece 4 and its figures given in the review.

## Notes

### How the pieces run (2026-11-18)
- Straight through, as the user chose: commit and push each piece after its review round (the verifier on every finding, then a light re-check), fix every verified finding, record each choice the plan leaves open under its piece as "Decided by the builder", and list them all at the end. Stop for piece 6's manual review; for piece 4 if the Earth's west–east coast contrast is far from believable (report, don't tune); and for anything that changes behaviour beyond the plan, departs from the settled ledger, touches shared state or cannot be undone, or a check that cannot be made to pass.

### Piece 1: the wind's flowing part (2026-11-18)
Decided by the builder:
- **`flowingPart` returns edge flows only**, not also a cell-centred east/north wind (the plan said "same units and layout as the winds"). A wind rebuilt at the centres from the corrected flows keeps about a third of the original's divergence (by rms; the cubic edge values and the two-point exchange operator are not inverses), so it would look divergence-free and not be. The flows are `4 * cellCount` entries laid out like `grid.neighbours`, in m²/s on the planet's radius, antisymmetric exactly. `removeConvergence(grid, flows)` is the edge-level projection, exported so idempotence can be tested exactly.
- **A purely converging wind comes back as about an eighth of itself, not zero** (plan acceptance). The exchange solver's two-point couplings are not a consistent gradient on skewed cube cells; measured 0.13 of the rms at 64, 128 and 256 (0.32 within 0.15 rad of a corner). The net flow out of every cell is zero to 1e-7 of the input's rms flow, which is what the heat step needs; the leftover goes round, so it carries heat and makes none. A skew-corrected flux (the along-edge slope term, with the exchange solver as preconditioner of an outer iteration) would remove it, but is a bigger design and was left. The verifier dropped it as out of scope; open for the user if the leftover shows up in the maps.
- `edgeFlows(grid, vectors, radius, into)` in `grid/vector.ts` (4 per cell like `grid.neighbours`); `edgeSum` was refactored into `edgeFluxes` plus accumulation, same arithmetic and order, and `Operators` gained the side index of each edge's two ends.
- Solver constants (mass 1e-2 per unit area, each round solved to 0.1 of the largest net flow it starts from, 1e-7 target, at most 12 rounds), chosen by a measured sweep: about 60 ms per month at 64 (about 0.7 s a year of winds), 3–4 rounds. At 128 and 256 one month took 0.77 s and 3.2 s on random winds (first call included), so for finer worlds piece 3 should take the flowing part on the 64 grid and carry it to the solve grid rather than solve it there.
- Uncovered changed lines (flowing.ts, the two defensive throws: 12 rounds without reaching the tolerance; the exchange solve not converging): defensive, real winds take 3–4 rounds; accepted by the coverage check. Not reachable with finite, antisymmetric input unless flows are near the float range's ends.
- docs/winds.md says heat "is to be carried by" the flowing part; piece 2 or 3 makes it "is carried" and updates "What it leaves out" (the winds do not change the temperature) when they wire it in.

### Piece 2: heat carried by the wind, in the temperature solve (2026-11-18)
Decided by the builder:
- **The setting is `windHeatCapacity`, in J/m²/K** (the heat capacity per square metre of the air that moves the heat), not a depth in metres: it needs no air-properties constant, and sits beside the land and sea heat capacities. Placeholder 1.2e6 (about a kilometre of air at 1.2 kg/m³ and 1004 J/kg/K); piece 4 sets it from physics. 0 skips advection and gives today's solve bit for bit.
- **`winds` flows are given on the grid the world is solved on** (`solveResolution` of the world's: 64 for worlds of 64 and 128), not on the world's own grid with the solve coarsening them (the plan's wording). Coarsening by summing the flows across merged cells' edges would also be exact and keep the zero net flow, but the flows at 128 cost about 0.8 s a month to find, so the loop will find them on 64 anyway; how piece 3 gets them there is settled in piece 3 (with the timings, as the planner chat asked).
- **The step**: after each time step's exchange solve (and the clamp at 2.7 K), an implicit upwind step with the step's flows, interpolated linearly between month-mid values at the time the step ends, as the sunlight is; Gauss–Seidel, forward then back over cell index, stopping when no cell changed by the solver's tolerance in a sweep (cap 200; running out marks the solve not converged), then the heat A·C·T made exact by a uniform shift weighted by area times heat capacity. Measured against a 1e-13 reference on the Earth's flows: the error left is at most 1.05 times the tolerance. A topological ordering of the flow was not needed.
- **The first guess and the year-end correction ignore the winds**: the year loop absorbs the difference. The Earth at 64 with the default setting still converges in 4 years; the solve takes 1.6–2 times as long (0.8–0.9 s to 1.4–1.6 s). At ten times the setting (the full column, 1e7) it takes 14 years and 5.6 s, and Siberia's January comes out 20 K warmer, so the setting wants care in piece 4.
- Effect on the Earth at 64 with the model's own winds, default setting, January: western Europe +2.4 K, western North America +4.1 K, eastern North America −4.6 K, East Asia −12.8 K (from 7.6 to −8.5 °C against an observed about 1 °C: it overshoots; piece 4 judges).
- Uncovered changed line (temperature.ts, `solved = false` when a step's advection sweeps hit the cap): a defensive guard; real winds converge in a handful of sweeps, and the advector's cap path is tested directly.
- `config.test.ts`'s literal copy of the temperature values gains the new setting; docs/development.md says the temperature model has 19 settings.

### Changed 2026-11-18: piece 4 measures, then stops for the user
- The loop as agreed does not settle on the Earth at the physical strength (see decisions.md, measured in piece 3). Piece 4 now measures a grid of 2–3 strengths by 2–3 stopping rules (0.1 °C on the largest change; an average-change rule; damping every pass by half), reporting the west–east contrast (annual and January), East Asia's January, passes to settle and seconds, on the Earth and three generated worlds, and stops for the user to choose the strength and the rule before setting the value and re-recording the baselines. The user: "Measure options, then I choose (Recommended)" (2026-11-18)

### Piece 3: the climate loop in the core (2026-11-18)
Decided by the builder:
- **The loop's three settings are a group, "The climate loop" (numerical), of `TEMPERATURE_CONFIG`**, so they are fields of `TemperatureModel` (`climateToleranceC` 0.1, `climateMaxPasses` 6, `climateOvershootShare` 0.5) and show on the Model settings screen with no screen change; a new section would have needed that. `assertModel` checks them.
- **`ClimateStart` is a `Pick` of `ClimateResult`** (the temperature result with its months, state and record; the winds; the day length), so a result is a start as it stands. It is used only if its temperature's record names the world's sea level and temperature settings (`conditionsMatch`, shared with `solveTemperature`'s own check) and its day length is the world's; otherwise the climate is solved from nothing. A malformed start throws a RangeError. Day length is therefore in the climate's record, as the plan said; `TemperatureConditions` is unchanged (the temperature alone still does not depend on it).
- **A warm start's first pass** carries on from the start's state with heat carried along the start's winds and compares with the start's months, so a settled start settles in one pass (tested). A start whose temperature `solveTemperature` sets aside for terrain drift is still given the start's winds; the later passes correct them.
- **Damping**: a pass whose raw change is larger than the pass before's (strictly) is blended half-way from the pass before's applied temperature (months, `temperatureK`, `previousK`), its winds solved from the blended months; the raw change is what is reported and what the stop tests. The years run, converged flag and last year's change stay the pass's own. Settled means a change of no more than the tolerance.
- **Flows for the temperature solve** are found on the 64 grid whatever the world's resolution (`flowingPartForSolve`): the world's edge flows are summed down (`coarsenFlows`, exact, no net flow kept), the converging part taken out at 64, and for a world of 256 (solved on 128) shared back up (`refineFlows`: equal split of each coarse edge, the four inner edges of each 2×2 block the minimum-norm ones that leave no net flow). Timings, Earth at 64: a later pass about 1.6 s (temperature 0.3 s for one warm year, flowing part 0.7 s, winds 0.6 s), the first about 1.8 s; a world of 128 about 1.8 s a later pass. A 256 world was not timed. No `solveClimate` test runs 128 or 256 (the `flowingPartForSolve` and flows tests do).
- **Measured, and reported to the user (see the piece 3 report): with the starting `windHeatCapacity` 1.2e6 the Earth at 64 does not settle within 6 passes** (largest change per pass 14.2, 12.1, 8.8, 8.0, 6.2 K; the rms change 1.6, 1.1, 0.7, 0.6, 0.4 K; a few spring cell-months in Siberia keep moving; no overshoot, so the half-step never fires). At 6e5 the largest change reaches 0.5 K in 6; at 3e5 the Earth settles in 6, at 1e5 in 4. On generated worlds at 1.2e6 the loop oscillates by 13–27 K and the half-step only stops some passes growing. The tests use 1e5 for the Earth. The user chose "Measure options, then I choose" for piece 4.
- Uncovered changed line (flows.ts, the defensive throw while building the fine-to-coarse table): unreachable on the cubed-sphere grid.
