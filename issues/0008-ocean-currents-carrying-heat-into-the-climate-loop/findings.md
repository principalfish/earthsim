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

## piece 4 · 2026-11-19 · Wind-driven gyres

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | defect | verified | fixed | `src/core/ocean/basins.ts:194` | An all-land world has one coast and no sea, so its kind stayed undefined and `createGyreSolver` threw; `findBasins` now returns the held-still shape |
| round | correctness | low | defect | verified | fixed | `src/core/ocean/gyres.ts:654` | A solver passed in was not checked for rotation (wrong beta and Ekman f); now a RangeError |
| round | coverage | low | test | verified | fixed | `src/core/ocean/gyres.ts:734` | The non-convergence throw was untested; test added (tolerance 1e-300) |
| round | coverage | low | test | verified | fixed | `src/core/ocean/gyres.ts:367` | The length-mismatch branch of `sameValues` was untested; test added |
| round | correctness | low | docs | verified | fixed | `basins.ts:305`, `config.md:184` | "Leaves no more islands than that" is false (a lagoon island); wording softened |
| round | docs | low | docs | verified | fixed | `README.md:36`, `README.md:42`, `docs/user-guide.md:375` | No Ocean row; the settings row and the user guide claimed the page lists every setting |
| round | docs | low | docs | verified | fixed | `src/core/ocean/gyres.ts:58` | Header said 15 to 20 ms a month at 64; the cost table says 21 to 25 ms (14 to 17 warm) |
| round | correctness | low | docs | verified | fixed | `src/core/ocean/gyres.ts:700` | Ekman transport nonzero over seas held still while the docs say they are held still; now zero there (a planet with no land keeps it) |
| round | coverage | low | test | verified | fixed | `src/core/ocean/gyres.test.ts:397` | "Keeps the solver it built" would pass if rebuilt every call; rewritten without timing |
| round | security | - | - | dropped | - | `maxIslands` | No upper bound: self-inflicted slowdown in a local app, informational |
| round | docs | low | docs | dropped | - | `docs/development.md:42` | Still true for temperature and wind |
| round | security | - | - | - | - | - | Clean otherwise |
| re-check | coverage | low | test | verified | accepted | `src/core/ocean/basins.test.ts:106` | The documented cap rule (an island in a flowed-over island's lagoon can add one more) is untested; optional ring-island test |
| re-check | docs | low | docs | verified | deferred to piece 5 | `docs/ocean.md:47`, `src/core/ocean/gyres.ts:64`, `:109` | "built once for a world's land (and settings)" omits the rotation rate, which now invalidates the kept solver |
| re-check | correctness | - | - | - | - | - | Clean |
| manual | planner | - | - | - | - | piece 4 re-check findings | Decided by the planner chat under the user's "make your own decisions!": the three "rotation" wording nits are fixed in piece 5's commit; the ring-island test is accepted as it is |

## piece 5 · 2026-11-19 · Currents carry the sea's heat

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | cleanup | verified | fixed | `src/worker/handle.ts:98` | `passBuffers` and `copyOfPass` left out the currents (a full result structured-cloned every pass, about 14 MB at 64); now transferred and copied like the winds (also raised by security) |
| round | coverage | low | test | verified | accepted | `src/core/temperature/temperature.ts:1785` | `solved = false` when the sea's sweeps do not converge is untested; no cheap input reaches it (an eastward band at 1e6 m and random recirculating flows both converge); the advector's cap is tested at `advection.test.ts:246` and the line passes the result on; accepted by the coverage re-check |
| round | correctness | low | docs | verified | fixed | `temperature.ts:1871` | `CarriedSea` and its constant sat between `correctYearEnd`'s doc block and the function |
| round | docs | low | docs | verified | fixed | `docs/ocean.md:57` | "The heat they carry" section above the boundary-current table, which fell under it |
| round | docs | low | docs | verified | fixed | `config.ts:244`, `:249`, `:590` | landDiffusivity read against the sea's new 0.48; climateMaxPasses left out the currents and said three or four passes |
| round | docs | low | docs | verified | fixed | `advection.ts:6`, `docs/temperature.md:78` | Module doc still said capacity "of the air", broken wrap; "took 3" narrated history |
| round | coverage | low | test | verified | fixed | `src/app/layers/refresh.ts:451`, `temperature.ts:2133` | The start without currents and the non-array flows refusal were untested; tests added |
| round | correctness | low | cleanup | verified | fixed | `climate.ts:288`, `temperature.ts:2590` | `assertMonths` repeated `assertStart`'s loop; "carried" named two things, now `crossedCells`, `seaCurrents`, `CrossedSea` |
| round | correctness | low | cleanup | dropped | - | `advection.ts:200` | Zero capacity with a flow in is unenforced: `assertCurrents` refuses flows across land, the only zero-capacity sea cell |
| round | correctness | info | cleanup | dropped | - | `advection.ts:211` | "Bit for bit" differs by an ulp: the old sweeps also started inactive cells at storage times T over storage |
| round | docs | low | docs | dropped | - | `processDiagram.ts:514`, `README.md:11`, `:19` | Status text says currents are planned: piece 9 rewrites the docs for the finished model |
| round | security | - | - | - | - | - | Clean |
| re-check | coverage | low | test | verified | deferred to piece 6 | `src/worker/handle.test.ts:209`, `:296` | The worker test's blank world has no coast, so its currents are all zero: a miswired copy (east into north) would pass, and "the first pass arrived whole" only tests lengths; compare the first pass with the core's, or raise a few cells above sea level (also raised by correctness) |
| re-check | docs | low | docs | verified | deferred to piece 6 | `src/worker/handle.ts:57`, `protocol.ts:17`, `:168`, `client.ts:56`, `layers.ts:170`, `:178`, `:187`, `refresh.ts:499`, `:561` | Comments say a pass or start carries "temperature and winds"; it carries the currents too |
| re-check | docs | low | docs | verified | deferred to piece 6 | `src/core/climate.ts:365` | "about a year of solving each" against the 5 years of pass 2 in `docs/temperature.md:78` |
| re-check | correctness | nit | cleanup | verified | deferred to piece 6 | `src/core/climate.ts:372` | A sentence missing a verb and uneven rewraps |
| re-check | docs | low | docs | dropped | - | `docs/ocean.md` "What it costs" | 0.17-0.20 s for a year from a 5% different start against 0.05 s a pass in the loop: plausible, no contradiction |
| re-check | security | - | - | - | - | - | Clean |
| manual | planner | - | - | - | - | piece 5 re-check findings | Decided by the planner chat under the user's "make your own decisions!": all four are fixed in piece 6's commit (the worker test gets a world with a coast and asserts its currents are non-zero; the comments say the currents are carried too; `climate.ts:365` gives pass 2's years; `climate.ts:372` gets its verb) |

## piece 6 · 2026-11-19 · Upwelling

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | defect | verified | fixed | `src/core/ocean/upwelling.ts:156` | Each edge's direction was the chord between cell centres, not the edge's outward normal: across the cube seams a flow with no divergence gave a false upwelling up to about 70% of a coastal signal (reproduced at 64 and 256; 400-560 of about 1500 seam cells above 20% at 64); now `edgeFlows` (great-circle normals), summed over driven neighbours; tests for a coast on the 45 E seam and for solid-body transport about three axes giving zero; pieces 3, 4 and 5 probed for the same defect: none had it |
| round | docs | low | docs | verified | fixed | `docs/ocean.md:96` | The new "What it gets wrong" took the bare anchor and two links in `docs/temperature.md` meant for the gyres' section; renamed "What upwelling gets wrong" |
| round | coverage | low | cleanup | verified | fixed | `temperature.ts:1552` | `seaStep`'s optional `deepK` relaxed the sea toward 0 K when `upwelling` was given alone; now required with it (union type) |
| round | docs | low | docs | verified | fixed | `docs/temperature.md:84` | Quoted upwelling timings the script did not measure; `scripts/time-climate.ts` times it now |
| round | coverage | low | test | verified | fixed | `temperature.ts:2331` | The `typeof rates` arm of the refusal message was untested |
| round | correctness | low | cleanup | verified | fixed | `temperature.ts:1662`, `upwelling.ts:117` | Month interpolation repeated (now `monthsAround`); the sea water heat capacity worked out again (now imported) |
| round | docs | low | docs | verified | fixed | `README.md:42`, `docs/ocean.md:3`, `upwelling.ts:22` | Ocean row omitted upwelling; a doubled "and"; a ragged header wrap |
| round | security | - | - | - | - | - | Clean |
| re-check | correctness | low | defect | verified | accepted | `src/core/ocean/upwelling.ts:264` | `edgeFlows` reads a 4-cell line (9/16, 9/16, -1/16, -1/16) and a land or still-sea outer cell has zero transport, so the offshore edge of a coast cell carries 17/16 of a uniform transport (+6.25%), 18/16 (+12.5%) in a channel two cells wide: coastal upwelling overstated by that; documenting it is the cheap fix, a local edge evaluation counting a land outer cell as the near cell's value is exact for a uniform field but more work (the shared `edgeFlows` must not change) |
| re-check | docs | low | docs | verified | deferred to piece 7 | `docs/ocean.md:75` | Still says the transport crosses each edge as "the mean of the two cells' transports"; it is `edgeFlows`' cubic across the great-circle normal |
| re-check | docs | low | cleanup | verified | deferred to piece 7 | `src/core/ocean/upwelling.ts:12` | A short line left by the header rewrap |
| re-check | coverage | low | test | verified | accepted | `src/core/temperature/advection.ts:281` | `monthsAround` is tested only through `interpolateFlows` (12 months); optional direct test with 3 months |
| re-check | security | - | - | - | - | - | Not re-run (clean in the round) |
| manual | planner | - | - | - | - | piece 6 re-check findings | Decided by the planner chat under the user's "make your own decisions!": the roughly 6% coastal overstatement is documented in the module head and not fixed (left for the retune in step 6b); the stale edge-geometry line and the short header line are fixed in piece 7's commit; the optional `monthsAround` test is accepted as it is |
