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
| re-check | correctness | low | docs | verified | open | `src/core/climate.ts:113` | The `start` option doc and the `@throws` don't say that a start whose temperature has no valid record is refused with a RangeError (since `conditionsMatch`) |
| re-check | correctness | low | test | verified | open | `src/core/climate.test.ts:117` | `changeC` is checked with `toBeLessThan(tolerance)` at lines 117 and 155, though settling is `<=` |

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
| round | coverage | low | test | verified | open | `src/core/wind/flowing.test.ts:411` | The guess tests show the same result from a warm guess but not that it takes fewer rounds; the round count is not exposed, so left (optional) |
| round | coverage | - | - | dropped | - | `src/core/temperature/baseline/earthTemperature.test.ts` | A floor for North America's annual contrast — dropped: the 0.25 K regression check already fails if it shrinks |
