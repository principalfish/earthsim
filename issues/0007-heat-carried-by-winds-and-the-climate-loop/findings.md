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
| re-check | correctness | low | docs | verified | open | `src/core/wind/flowing.ts:168` | "to ten millionths of the input's rms flow" can be misread as 10 × 1e-6; should read "a ten-millionth" (1e-7) |
