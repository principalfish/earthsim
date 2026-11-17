# Findings: core-folders-by-component-page-folders-by-role

## piece 1 · 2026-11-17 · The core in component folders

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | verified | fixed | `scripts/docs/climate-process.py:286` | Comment names `src/core/temperature.ts`, now `temperature/temperature.ts` (also raised by correctness) |
| round | docs | low | docs | verified | fixed | `docs/development.md:82` | `wind/observedWind.ts` row says `vector.ts`; it is now `grid/vector.ts` |
| round | coverage | low | test | dropped | - | `scripts/update-earth-temperature-baseline.ts:34` | `BASELINE_FILE` not asserted by a test — dropped: a literal path; a test needs an export and a change beyond import paths |
