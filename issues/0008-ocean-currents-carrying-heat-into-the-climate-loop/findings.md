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
