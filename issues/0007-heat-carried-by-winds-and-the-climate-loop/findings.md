# Findings: heat-carried-by-winds-and-the-climate-loop

## piece 1 · 2026-11-18 · The wind's flowing part

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | defect | verified | fixed | `src/core/wind/flowing.ts:149` | `removeConvergence` didn't check each edge's two entries are negatives; a lopsided input ran 12 rounds and threw a misleading "not found" |
| round | correctness | low | docs | verified | fixed | `src/core/wind/flowing.ts:142` | Tolerance is of the input's rms flow, but the docstring read as the result's |
| round | docs | low | docs | verified | fixed | `docs/winds.md:72` | Said heat is carried by the flowing part, though nothing calls it yet |
| round | docs | low | docs | verified | fixed | `docs/development.md:55` | No row for `wind/flowing.ts`; the `grid/vector.ts` row lacked edge flows |
| round | correctness | - | docs | verified | fixed | `src/core/wind/flowing.test.ts:187` | Comment called a uniform eastward wind a solid body's turning |
| round | coverage | - | test | verified | fixed | `src/core/wind/flowing.test.ts:117` | Solid-body rotation tested only about +Z; added a cube-corner axis |
| round | coverage | - | test | verified | fixed | `src/core/wind/flowing.test.ts:149` | "A tenth left at any grid size" tested only at 64; now 64 and 128 (and "an eighth", 0.13 measured at 64, 128, 256) |
| round | coverage | - | test | verified | fixed | `src/core/wind/flowing.test.ts` | "Not changed" input contract untested |
| round | correctness | - | cleanup | verified | fixed | `src/core/grid/vector.ts:1250` | `FLUX_SCRATCH` get-or-create written twice |
| round | correctness | medium | - | dropped | - | `src/core/wind/flowing.ts:170` | Use a skew-corrected edge flux in the potential's flows so a converging wind comes back as zero — dropped: out of scope and an enhancement; plan says subtract with the existing symmetric solver, and the heat step needs only zero net flow, which holds |
| round | correctness | - | - | dropped | - | `src/core/grid/vector.ts:904` | Table of opposite sides instead of the repeated search — dropped: would refactor code this piece didn't touch |
| round | security | - | - | dropped | - | `src/core/grid/vector.ts:905` | Unbounded side-search loop on asymmetric neighbours — dropped: same pattern as existing loops, grids are built in-library |
| round | coverage | - | - | dropped | - | `src/core/wind/flowing.test.ts:219` | Assert the zonal-mean eastward wind changes little — dropped: optional, correlation and rms ratio already check the pattern |
| round | - | - | docs | noticed | fixed | `src/core/wind/flowing.ts:131` | The leftover is nearer an eighth (0.13) than a tenth |
| re-check | correctness | low | docs | verified | fixed | `src/core/wind/flowing.ts:168` | "to ten millionths of the input's rms flow" can be misread as 10 × 1e-6; should read "a ten-millionth" (1e-7) |

## piece 2 · 2026-11-18 · Heat carried by the wind, in the temperature solve

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | verified | fixed | `docs/development.md:72` | No row for `temperature/advection.ts`; the `temperature.ts` row didn't mention winds |
| round | docs | low | docs | verified | fixed | `docs/temperature.md:25` | "Several degrees milder/colder" didn't match the measured January changes (+2.4, +4.1, −4.6, −12.8 K) |
| round | docs | low | docs | verified | fixed | `docs/temperature.md:25` | "About half as long again" had no measurement; measured 1.6–2 times |
| round | correctness | low | docs | verified | fixed | `src/core/temperature/advection.ts:17` | Header promised "no new extreme" but the closing heat-fixing shift can pass the start's range by up to the tolerance |
| round | correctness | low | docs | verified | fixed | `src/core/config.ts:307` | Setting text called a heat capacity a depth |
| round | coverage | low | test | verified | fixed | `src/core/temperature/advection.test.ts:175` | Sweep-cap path untested; added (converged false, 200 sweeps, heat exact) |
| round | coverage | low | test | verified | fixed | `src/core/temperature/temperature.ts:1281` | The clamp before advection had no test reaching it; added a coldest-world solve with winds |
| round | docs | low | docs | verified | fixed | `src/core/temperature/temperature.ts:1` | Module header omitted the advection step |
| round | correctness | medium | - | dropped | - | `src/core/temperature/advection.ts:209` | Stop test is the last sweep's change, may stop short in slow loops — dropped: measured on real Earth flows at 64 (Jan and Jul, 1.2e6 and 6e6, tolerance 5e-3 and 0.05) against a 1e-13 reference, the error left is at most 1.05 times the tolerance |
| round | correctness | - | - | dropped | - | `src/core/temperature/advection.ts:138` | `setFlows` re-checks finiteness each step — dropped: exported API whose doc promises the RangeError; a few reads a step |
| round | correctness | - | - | dropped | - | `src/core/temperature/temperature.ts` | Flows on the solve grid differ from the plan (the solve coarsening them) — dropped: recorded builder decision; piece 3 settles the helper |
| round | docs | - | - | dropped | - | `docs/winds.md:72` | "Is to be carried" reads as future work — dropped: accurate, the page doesn't yet feed winds to the temperature |
| re-check | correctness | low | docs | verified | fixed | `docs/temperature.md:23` | "Flows are interpolated between the months' as the sunlight is" is wrong: sunlight is evaluated at each step's end, only the flows are interpolated |
| re-check | correctness | low | docs | verified | fixed | `src/core/temperature/advection.ts:19` | The closing shift is "within the sweeps' tolerance" only when they converge; at the 200-sweep cap nothing bounds it |
| re-check | coverage | low | test | verified | fixed | `src/core/temperature/temperatureWinds.test.ts:186` | The coldest-world assertion `> -273.15` can't fail (this world's coldest month is about 35 K); the air floor is 1.35 K, not 2.7 K, so the comment is wrong too |
| re-check | correctness | low | docs | verified | fixed | `docs/temperature.md:23` | "Makes no new extreme" has no caveat (to within the solver's tolerance) |
| re-check | docs | low | docs | verified | fixed | `docs/winds.md:190` | "The winds do not change the temperature" should add that the page does not yet give the temperature the winds |
| manual | user | low | docs | - | fixed | `docs/temperature.md`, `src/core/` | The user chose to fix the six open re-check nits of pieces 1 and 2 now ("Fix them now", 2026-11-18): one commit of its own |

## piece 3 · 2026-11-18 · The climate loop in the core

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | coverage | medium | test | verified | fixed | `src/core/climate.test.ts:313` | "The half-step damps a forced oscillation" was tested only as arithmetic; now a case (generated world, 8e5, 4 passes) shows the pass after a damped one changes less than the same pass left whole |
| round | correctness | low | defect | verified | fixed | `src/core/climate.ts:318` | Strict `<` settled test departed from the ledger's "no more than 0.1 °C"; now `<=`, with docs and test |
| round | correctness | low | docs | verified | fixed | `src/core/config.ts` | "The Earth settles within about four" held only at a tenth of the starting setting; now says so |
| round | correctness | low | cleanup | verified | fixed | `src/core/climate.ts:221` | `suits` compared records with JSON.stringify; now `conditionsMatch` from temperature.ts, shared with the solve's own start check |
| round | docs | low | docs | verified | fixed | `docs/temperature.md:25` | Nothing said `flowingPartForSolve` and `grid/flows.ts` find the flows on the solve grid; added in temperature.md, winds.md and development.md |
| round | correctness | low | docs | verified | fixed | `src/core/climate.ts:171` | A damped result keeps the raw pass's yearsRun, converged and finalChangeK; documented |
| round | coverage | low | test | verified | fixed | `src/core/climate.test.ts:150` | `suits` branches untested (no record; another planet setting); added |
| round | coverage | low | test | verified | fixed | `src/core/climate.test.ts:316` | The damped state's previousK blend and carried-over fields not asserted; added |
| round | correctness | - | docs | verified | fixed | `src/core/config.md:11` | "N for the solver" counted the loop group; the label is now "numerical" |
| round | correctness | low | - | dropped | - | `src/core/climate.ts:311` | Overshoot needs a strictly growing change; equal or slowly decaying changes aren't damped — dropped: the ledger says "grows rather than shrinks"; damping equal changes would be an enhancement |
| round | docs | - | - | dropped | - | `src/core/config.ts:486` | "Below about 0.05 the temperature's own tolerance sets the limit" unsupported — dropped: the temperature solve stops a year at DEFAULT_TOLERANCE_K = 0.05 |
| round | coverage | - | - | dropped | - | `src/core/climate.test.ts` | "A test planet" no-wind case — dropped: the setting at zero is tested, which meets the plan |
| round | - | medium | defect | noticed | open | `src/core/climate.ts:311` | At the shipped capacity the half-step stops some passes from growing but does not bring the oscillation down; whether the loop settles there rests on the damping (see the notes, and piece 4's table) |
| re-check | correctness | low | docs | verified | fixed | `src/core/climate.ts:113` | The `start` option doc and the `@throws` don't say that a start whose temperature has no valid record is refused with a RangeError (since `conditionsMatch`) |
| re-check | correctness | low | test | verified | fixed | `src/core/climate.test.ts:117` | `changeC` is checked with `toBeLessThan(tolerance)` at lines 117 and 155, though settling is `<=` |

## piece 4 · 2026-11-18 · The setting's value, and the baselines

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | docs | verified | fixed | `src/core/config.ts:296` | The `windHeatCapacity` entry still called 1.2e6 a placeholder; now its physical source and its coast-contrast check |
| round | docs | low | docs | verified | fixed | `src/core/config.ts:1799` | `coldLimitK` said 3 hPa/K gives 75 hPa, the Earth's record; now 17.5 at 0.7 and 75 at 3 |
| round | docs | low | docs | verified | fixed | `docs/temperature.md:25` | A one-pass figures paragraph at thermal 3 contradicted the new section; dropped, with "to start with" |
| round | correctness | low | docs | verified | fixed | `scripts/tune/tuning.ts:79` | The tuning and report scripts work from the temperature without winds; a note in the script's listing and header and in docs/winds.md says so, and that a search raising `thermalHpaPerK` needs the loop looked at again |
| round | docs | low | docs | verified | fixed | `docs/winds.md:142` | Figures measured at 3 before the loop were unlabelled; labelled |
| round | docs | - | docs | verified | fixed | `docs/winds.md:174` | The list of what is still to come named heat carried by the winds, now built |
| round | coverage | low | test | verified | fixed | `src/core/climate.test.ts:150` | Nothing told the rms rule from the old max rule; the carry-on test now asserts the largest change is above the tolerance while the rms is within it |
| round | docs | - | cleanup | verified | fixed | `src/core/wind/baseline/earthWinds.ts:11` | A reflowed header line was over-long |
| round | coverage | low | test | verified | fixed | `src/core/wind/flowing.test.ts:411` | The guess tests show the same result from a warm guess but not that it takes fewer rounds; the round count is not exposed, so left (optional) |
| round | coverage | - | - | dropped | - | `src/core/temperature/baseline/earthTemperature.test.ts` | A floor for North America's annual contrast — dropped: the 0.25 K regression check already fails if it shrinks |
| re-check | docs | low | docs | verified | fixed | `docs/temperature.md:49` | "The loop's three settings are in the Model settings" now sits after the new coast section; belongs at the end of the loop's bullets |
| re-check | docs | low | docs | verified | fixed | `docs/temperature.md:47` | "A quarter to a third of the observed" (also in the `windHeatCapacity` source in config.ts and config.md:22) is wrong for North America's year, 0.0 against 5.8 K; true of the other three figures |
| re-check | correctness | low | docs | verified | fixed | `src/core/config.ts:1750` | `warmLimitK`'s "at most 18 hPa deep" assumes 3 hPa/K; about 4 hPa at 0.7 (and config.md:134) |
| re-check | correctness | low | docs | verified | fixed | `docs/winds.md:220` | The tuning-script paragraph reads as though the What-it-gets-wrong figures were at 0.7; they were at 3 |

## piece 5 · 2026-11-18 · One climate request in the worker

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | docs | verified | fixed | `src/worker/handle.ts:59` | The remark said a climate uses only the start's state and winds; it also uses the temperature's months, record and the day length |
| round | docs | low | docs | verified | fixed | `src/worker/handle.ts:178` | "Nothing else reports progress" — a climate reports each year of each pass with its pass |
| round | docs | low | docs | verified | fixed | `src/worker/handle.ts:170` | An error thrown by `onPass` also ends the computation; the doc named only `onProgress` |
| round | coverage | low | test | verified | fixed | `src/app/layers/workerService.test.ts:297` | The overtaken call had only `onPass`; the `onProgress` filter was never checked |
| round | correctness | low | cleanup | verified | fixed | `src/core/protocol.ts:280` | `isClimateStartShaped` repeated the state and record checks; now reuses `isTemperatureStartShaped` |
| round | correctness | - | cleanup | verified | fixed | `src/core/protocol.ts:347` | The climate error string hard-coded "twelve"; now `${MONTHS_PER_YEAR}` |
| round | correctness | - | cleanup | dropped | - | `src/worker/handle.ts:111` | `copyOfPass` copies the pressure arrays too — dropped: skipping 12 small copies isn't worth one pass message mixing copied and transferred arrays |
| round | coverage | - | - | dropped | - | `src/worker/testing/fakeWorker.ts:76` | The stand-in's pass route is reachable only through a full climate on the fake — dropped: helper-only line; the real handler's pass path is covered in handle.test.ts |
| re-check | correctness | low | cleanup | verified | fixed | `src/worker/handle.ts:180` | The reworded `handleRequest` remark left one comment line 130 characters long mid-paragraph; re-wrap |
| manual | user | low | docs | - | fixed | `src/core/`, `docs/` | The user chose to fix the eight open nits of pieces 3–5 now ("Fix them now", 2026-11-18): one commit of its own |

## piece 6 · 2026-11-18 · The page: one scheduler, passes shown as they land

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | defect | verified | fixed | `src/app/layers/refresh.ts:560` | After Pause stopped the loop at pass n, Resume asked at pass 1: the status went back to "Calculating climate" and the bar dropped; now the pass reached is kept and the resumed request reads "Refining climate (pass n+1)" with a full bar (the 8-pass limit counts afresh per request) |
| round | coverage | low | defect | verified | fixed | `src/app/layers/layers.ts:527` | `setPass(..., last)` with pass 1 the last left null progress and the bar went indeterminate; now keeps the last progress, with a test that fails on a null after a number |
| round | docs | low | docs | verified | fixed | `docs/winds.md:9` | Said the winds are worked out in a worker of their own; now with the temperature, in each climate pass |
| round | docs | low | docs | verified | fixed | `docs/temperature.md:93` | The info box table had no "Climate unavailable" row; reworded |
| round | correctness | low | cleanup | verified | fixed | `src/app/layers/layers.ts:148` | The old per-layer store methods had no production caller; deleted, ~190 test references moved to the climate methods (helpers in `testing/climateStore.ts`), two untrue comments fixed |
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/main/legend.ts:290` | `progressLine` and `yearProgress` unreachable now the box always says the climate line first; dropped with their tests |
| round | correctness | low | cleanup | verified | fixed | `src/app/layers/scalar/pressure.ts:152` | The `windsStatus` special case was redundant; removed |
| round | correctness | - | cleanup | verified | fixed | `src/app/wiring.ts:174` | Over-long comment lines re-wrapped (wiring.ts, layerPanel.ts) |
| round | correctness | - | - | dropped | - | `src/app/layers/refresh.ts:559` | The raw `world.planet` day length — dropped: appState normalises the planet, and `suits` would only set a start aside |
| round | coverage | - | - | dropped | - | `src/app/main.ts:189` | The entry file that starts a real Worker is not run by any test — dropped: accepted |
| re-check | coverage | medium | test | verified | fixed | `src/app/layers/refresh.test.ts:1337` | The bar test skips a null bar after a number (`if (content.bar === null) continue`), so it cannot fail on a bar that goes unknown; only the last entry is asserted full |
| re-check | correctness | low | test | verified | fixed | `src/app/layers/refresh.test.ts:1354` | The pass numbering's reset after a world change or reset while paused is not asserted (three tests check only where the request starts; add `store.temperature.pass` is 1) |
| re-check | docs | low | docs | verified | fixed | `src/app/layers/refresh.ts:548` | The doc comment of `stop` has `@param pass` but no `@param solved` |
| manual | user | - | - | - | fixed | `src/app/layers/refresh.test.ts`, `refresh.ts` | After the manual review of piece 6 the user asked for the three re-check findings to be fixed ("Tried it, fix all", 2026-11-18) |

## review 01 · 2026-11-18

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | defect | verified | fixed | `src/core/climate.ts:356` | After an edit a warm start's pass 1 carries heat along the pre-edit winds; a local sculpt moves the global rms by under 0.1 °C, so the loop settles at pass 1 and the edited region never sees winds of its own new temperature |
| round | carried over | low | defect | verified | fixed | `src/core/climate.ts:311` | The half-step on overshoot does not damp the oscillation at stronger feedback (old 3 hPa/K); cannot arise with shipped settings. Raised as medium in the piece reviews; the verifier set it low |
| round | coverage | low | cleanup | verified | fixed | `src/worker/handle.ts:213` | The `pass === undefined` arms (also `src/app/layers/refresh.ts:588`) are dead: only the climate reports progress, always with a pass |
| round | docs | low | docs | verified | fixed | `src/core/temperature/temperature.ts:268` | `TemperatureStart` remark "the temperature does not depend on it" (day length) now ambiguous |
| round | docs | - | docs | verified | fixed | `docs/temperature.md:36` | About ten measured timings that will go out of date |
| round | correctness | low | - | dropped | - | `src/app/layers/refresh.ts:574` | Raw `world.planet.dayLengthHours` vs the clamped one in `suits()` — dropped: `world.planet` is always normalised and files reject out-of-limits settings |
| round | docs | low | - | dropped | - | `docs/development.md:69` | The `planet/planet.ts` row doesn't say the climate record carries the day length — dropped: accurate as written |
| round | coverage | - | - | - | - | coverage | 98% of changed lines (746/756); reasons accepted for flows.ts:95, flowing.ts:247, 263, temperature.ts:1346, main.ts:189-190, handle.ts:193, testing/climateStore.ts:23; rejected for handle.ts:213 and refresh.ts:588 (remove, finding 3) |
| re-check | docs | low | docs | verified | open | `src/app/ui/main/infoBox.test.ts:421` | The test name "as for a climate carried on that settles at once" describes a case that can no longer happen; rename (when the first pass is the last, as at a cap of one pass) |
| re-check | docs | low | docs | verified | open | `src/core/config.ts:501` | At a cap of one pass nothing settles and no start is kept; the `climateMaxPasses` entry (and the TemperatureStart doc) doesn't say so; regenerate config.md |
| re-check | docs | low | docs | verified | open | `docs/temperature.md:81` | A resumed run's first pass can't settle, so it may take one more pass than a run never paused; add a clause (and in climate.ts's settled comment) |
| re-check | docs | - | cleanup | verified | open | `src/core/temperature/temperature.ts:269` | The reworded doc line is 84 characters; re-wrap |
