# Findings: add-winds-layer

## piece 9 · 2026-11-14 · The Winds switch and arrows on the globe
Cost: 8 subagents · about 471,000 tokens (one cut-off run unknown) · about 13 min (one cut-off run unknown)

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | coverage | low | test | verified | fixed | `src/app/globe/wind.ts:210` | The fallback search in `arrowPatches` could not be reached and had no test |
| round | correctness | low | cleanup | verified | fixed | `src/app/globe/wind.ts:521` | `glslFloat` and `glslColour` were copies of those in `material.ts` |
| round | correctness | low | docs | verified | fixed | `src/app/styles.css:849` | The `.globe-overlays` comment left out the key; doc comments in `layerPanel.ts` ran past the wrap width |
| round | correctness | low | docs | verified | fixed | `src/app/ui/windKey.ts:21` | The key's top arrow is drawn at the cap but was labelled a plain "10 m/s" |
| re-check | correctness | low | docs | verified | accepted | `src/app/ui/layerPanel.ts:453` | A doc comment left ragged by the rewrap ("It stops when" alone on its line) |

## piece 7b · 2026-11-14 · The yardstick: a ninth case and three literature checks
Cost: 6 subagents · about 418,000 tokens · about 7 min

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | defect | verified | fixed | `scripts/report/page.ts:266` | A quotation ran into the note after it with no full stop |
| round | correctness | low | defect | verified | fixed | `scripts/report/summary.ts:210` | The strongest easterly showed "0.0" for a near-calm beside "0 of 10" easterly bands |
| round | correctness | low | defect | verified | fixed | `scripts/report/summary.ts:316` | The tropical cell's edge was interpolated across skipped weak bands, up to several degrees off the true turn |
| round | correctness | low | docs | verified | fixed | `scripts/report/literature.ts:239` | "about 25° … about 15°, that is 0.59": the ratio did not follow from the rounded readings |
| round | coverage | low | test | verified | fixed | `scripts/report/summary.ts:527` | The "the Earth's edge is not measured" branch and a fault on a day-length case were untested |
| round | coverage | low | test | verified | fixed | `scripts/report/page.test.ts:216` | The tilt tables were rendered with no rows in the page test |
| round | coverage | low | test | verified | fixed | `scripts/report/page.test.ts:260` | Quotations were checked only against their own data, so a changed quotation would pass |
| round | coverage | low | test | verified | fixed | `scripts/report/summary.ts:186` | The "a hemisphere's mean is not measured" branch was untested |
| round | other | medium | defect | noticed | open | `reports/winds/index.html` | The ocean world tilted 60° comes out almost calm in the model (winds within 0.2 m/s, 0.9 hPa of pressure spread), unlike Ferreira et al.'s westerlies and trades at 90°; a result for piece 7c, not a fault in this piece |
