# Findings: ocean-currents-carrying-heat-into-the-climate-loop

## piece 1 · 2026-11-18 · Observed sea temperatures and currents

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | docs | verified | fixed | `docs/development.md:143` | `observedGdalRun.ts` table row had a stale third cell, breaking the table (also raised by docs) |
| round | correctness | low | docs | verified | fixed | `scripts/earth/regrid.ts:76`, `docs/data.md:209` | Date-line wording wrong: the two fine cells either side of 180° land in different 1° cells |
| round | docs | low | docs | verified | fixed | `docs/data.md:197` | Currents coverage bullet gave the source's extent, not the committed file's (rows 10–162) |
| round | correctness | low | cleanup | verified | fixed | `scripts/build-observed-sea-temperature.ts:85` | `--verify-with-gdal` ran before the layout check |
| round | security | low | defect | verified | fixed | `scripts/downloadRetry.ts:85` | Body buffered in full before the size cap when there is no Content-Length |
| round | correctness | low | cleanup | verified | fixed | `src/core/ocean/observed.ts:582` | Vector interpolation duplicated `observedWind`'s; now a shared sampler |
| round | coverage | low | test | verified | fixed | `scripts/earth/oceanSource.test.ts` | Untested refusal messages (latitudes, mask shape, mask longitudes, number of times) |
| round | coverage | low | test | verified | fixed | `scripts/earth/regrid.test.ts` | South edge of the row mapping untested |
| round | correctness | nit | cleanup | verified | fixed | `scripts/observedBuild.ts:19` | Shared helper imported `SubsetSource` from the ocean-specific module |
| round | correctness | nit | cleanup | verified | fixed | `src/app/layers/observedData.ts:133` | Doc-comment line not re-wrapped |
| round | correctness | low | cleanup | dropped | - | `src/core/ocean/observed.ts:532` | Sampler signature `(grid, data)` differs from the neighbours — dropped: the plan named `observedSeaTemperatureOn(grid, …)` |
| round | correctness | low | cleanup | dropped | - | `scripts/oceanGdalRun.ts` | Near-copy of `observedGdalRun.ts` — dropped: both already share `gdalCheck.ts` |
| round | correctness | nit | cleanup | dropped | - | `scripts/earth/oceanSource.ts:26` | Own `MONTHS = 12` — dropped: matches `observedSource.ts:63` |
| round | coverage | low | test | dropped | - | `scripts/observedBuild.ts` | `readSubsetSource`/`forgetSubset` untested — dropped: thin I/O wiring, like the existing `readObservedSource` |
| re-check | correctness | medium | test | verified | fixed | `src/core/earth/observedVectors.test.ts:30` | The renormalisation test passes without renormalisation (also raised by coverage) |
| re-check | docs | low | docs | verified | fixed | `docs/development.md:75` | `src/core/` table lacks rows for `earth/observedVectors.ts` and `ocean/observed.ts`; the `wind/observedWind.ts` row still names `grid/vector.ts` for the vector sampling |
| re-check | security | low | defect | verified | fixed | `scripts/downloadRetry.ts:86` | A rejected `cancel()` replaces `DownloadRefused`, so an over-cap download is retried |
| re-check | correctness | nit | cleanup | verified | fixed | `scripts/earth/regrid.ts:78` | Ragged comment wrap (also raised by docs) |
| re-check | coverage | low | test | dropped | - | `src/core/earth/observedVectors.test.ts` | One-component NaN, zero-weight point and north-component checks untested — dropped: the check asked for no fix |
| manual | user | - | - | - | fixed | piece 1's four re-check findings | The user: "Accept, fix all four" (fixed in piece 2's commit) |

## piece 2 · 2026-11-19 · The sea's own temperature

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | medium | docs | verified | fixed | `docs/development.md:64` | The `config.ts` row said 22 settings; `config.md` says 25 |
| round | correctness | low | defect | verified | fixed | `src/core/temperature/temperature.ts:1782` | `correctYearEnd` counted the sea's whole yearly change though the shift reaches the sea only by `seaFollows`; now weighted by it (Earth figures unchanged) |
| round | coverage | low | test | verified | fixed | `src/core/temperature/temperature.test.ts:658` | No full solve with `airSeaExchange` 0; added (fails on the unweighted code) |
| round | correctness | low | cleanup | verified | fixed | `src/worker/handle.ts:81` | `temperatureBuffers` and `copyOfPass` left out `seaMonths`, `seaTemperatureK`, `seaPreviousK` |
| round | docs | low | docs | verified | fixed | `src/core/config.test.ts:35` | Comment narrated the edit's history |
| round | docs | low | docs | verified | fixed | `src/core/config.ts:336`, `docs/temperature.md:47`, `docs/winds.md:114` | "Before the sea had a temperature of its own" comparisons (changelog that rots); the config.ts one also reached `config.md` |
| round | correctness | nit | cleanup | verified | fixed | `temperature.ts:1389`, `earthTemperature.ts:13`, `protocol.ts:369`, `temperatureFixtures.ts:21` | Comment lines not re-wrapped after edits |
| round | coverage | low | test | verified | fixed | `scripts/downloadRetry.test.ts` | The new `.catch(() => {})` on a rejecting cancel was untested; two tests added |
| round | correctness | nit | cleanup | dropped | - | `temperature.ts:1612` | `share` comment should name the first-order step — dropped: it already says "a backward-difference step" |
| round | security | - | - | - | - | - | Clean |
| re-check | docs | low | docs | verified | deferred to piece 5 | `docs/temperature.md:30`, `src/core/temperature/temperature.ts:41` | "solved exactly as it was before the sea had a temperature of its own" is history; say a world with no sea is solved with the air alone and gives the single-temperature answer |
| re-check | docs | low | docs | verified | deferred to piece 5 | `src/core/temperature/temperature.test.ts:527` | Test title and comment tell history; word as fact |
| re-check | docs | low | docs | verified | deferred to piece 5 | `scripts/tune/tuning.test.ts:85` | Parentheticals "(… before the sea had one)" keep old figures as history; delete |
| re-check | docs | low | docs | verified | deferred to piece 5 | `docs/winds.md:47` | Figures "as it was before the sea had a temperature of its own" come from an earlier model; restate with current figures or drop |
| re-check | docs | low | docs | verified | deferred to piece 5 | `docs/winds.md:114` | Figures "measured before the sea had a temperature of its own"; restate with current figures or drop |
| re-check | coverage | low | test | verified | accepted | `src/core/temperature/temperature.test.ts:658` | Only `seaFollows` 0 and about 1 are tested; the partial case is covered through the Earth baseline (optional mid-exchange test) |
| re-check | coverage | low | test | verified | accepted | `scripts/downloadRetry.test.ts` | A retryable status (503) with a failing cancel is untested; same catch as the 404 test (optional) |
| re-check | docs | low | docs | noticed | deferred to piece 5 | `docs/temperature.md:28` | "until ocean currents carry the sea's" looks ahead and goes stale when piece 5 lands; update it in piece 5 |
| re-check | docs | low | docs | dropped | - | `config.ts:1518`, `winds.md:49` | "as before" wording predates this change |
| re-check | correctness | - | - | - | - | - | Clean |
| manual | user | - | - | - | - | piece 2 re-check findings | The user: "Wording with piece 5" (the wording rows and the `docs/temperature.md:28` look-ahead are fixed in piece 5's commit); the two optional tests are accepted as they are and not added |

## piece 3 · 2026-11-19 · Grid corners

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | coverage | low | test | verified | fixed | `src/core/grid/sparse.ts:617` | BiCGSTAB breakdown exit never run; test added (identity matrix, x = 1e200), singular 2x2 test tightened |
| round | correctness | low | docs | verified | fixed | `src/core/grid/corners.ts:505` | Comment on side orientation backwards (code right; all six faces are left-handed) |
| round | correctness | low | docs | verified | fixed | `src/core/grid/corners.ts:270`, `:1362` | `guess` docs said a net coast's guess is read at its first corner but the last won; the loop now runs backwards |
| round | correctness | low | defect | verified | fixed | `src/core/grid/corners.ts:1175` | A sea piece with only net coasts is singular; now documented (no connectivity check) |
| round | docs | low | docs | verified | fixed | `docs/development.md:61` | `corners.ts` table row a paragraph long, duplicating the header; cut to one clause, timings moved into the header |
| round | security | low | defect | verified | fixed | `src/core/grid/corners.ts:1111`, `sparse.ts:346` | Dense coarsest level: memory grows with the square of the net coasts (about 800 MB for 10^4); documented |
| round | correctness | low | cleanup | verified | accepted | `src/core/grid/grid.ts:492` | `neighbourTable` is public through `export *` but only tests use it; left: hiding it needs about 30 explicit grid.ts names in index.ts, which breaks the `export *` convention (the builder's reason, for the user) |
| round | docs | low | docs | dropped | - | `corners.ts:1` | Timings missing from the header: dropped as stated, folded into the table-row finding |
| round | coverage | low | test | dropped | - | `corners.ts:453`, `:777` | Internal-invariant throws: accepted, cannot fire on a valid grid |
| round | security | - | - | - | - | - | Clean otherwise |
| re-check | coverage | medium | test | verified | deferred to piece 4 | `src/core/grid/corners.ts:1383`, `corners.test.ts:642` | No test pins that a net coast takes its first corner's guess; overwrite all but the first island corner with 1e6 and expect 0 iterations (also raised by correctness) |
| re-check | docs | low | docs | verified | deferred to piece 4 | `src/core/grid/corners.ts:226`, `:1129`, `sparse.ts:374` | "singular and the solve reports converged: false" is stated as certain; a consistent right-hand side can still converge; soften |
| re-check | correctness | - | - | - | - | - | Clean |
| re-check | security | - | - | - | - | - | Clean |
| manual | planner | - | - | - | - | piece 3 findings | Decided by the planner chat under the user's "make your own decisions!": the first-guess test and the "may fail to converge" wording are fixed in piece 4's commit; `neighbourTable` stays public for the builder's reason |
