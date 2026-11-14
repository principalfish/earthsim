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
| round | other | medium | defect | noticed | accepted | `reports/winds/index.html` | The ocean world tilted 60° comes out almost calm in the model (winds within 0.2 m/s, 0.9 hPa of pressure spread), unlike Ferreira et al.'s westerlies and trades at 90°; a result for piece 7c, not a fault in this piece; accepted here and carried to 7c |

## piece 7c-1 · 2026-11-14 · The tuning script and the small fixes
Cost: 7 subagents · about 567,000 tokens · about 14 min

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | other | medium | defect | - | fixed | `src/core/wind/rules.ts` | Found by the builder before the review: weakening only the last band put the winter hemisphere's bands on the Earth tilted 60° at full strength; replaced, on the user's choice, by the narrower rule |
| round | coverage | medium | test | verified | fixed | `src/core/wind/solve.test.ts` | The planned test that the tilted Earth's winter winds stay weaker than its summer's was missing |
| round | correctness | low | docs | verified | fixed | `scripts/tune/command.ts:14` | Fourteen settings were called tuned against the observed Earth; three were not |
| round | correctness | low | defect | verified | fixed | `scripts/tune/search.ts:173` | The search had no bounds, so it could propose shares above 1 |
| round | correctness | low | docs | verified | fixed | `docs/winds.md:17` | "60° of latitude from the low" overstated what the code measures |
| round | coverage | low | test | verified | fixed | `src/core/wind/rules.ts:868` | An arm reachable by an override had no test |
| round | coverage | low | test | verified | fixed | `src/core/wind/solve.test.ts:204` | On a finer world only a winds setting was overridden, not a pressure one |
| round | correctness | low | defect | verified | fixed | `scripts/tune/text.ts:79` | The "run again" line left out the held settings and rounded values |
| round | correctness | low | defect | dropped | - | `src/core/wind/rules.ts:851` | Some override values give NaN or flip the low's sign — dropped: overrides only, and the settings' remarks already say values are unchecked |
| round | coverage | low | test | dropped | - | `src/core/wind/rules.test.ts:746` | The cold limit's knee and the warm side are not asserted — dropped: the planned test is met and the warm branch is unchanged code |
| round | coverage | low | test | dropped | - | `src/core/wind/rules.test.ts:452` | "Exactly as before" at the Earth's spin is shown only as ratios — dropped: true by construction, and the check itself called it acceptable |
| re-check | correctness | low | docs | verified | open | `docs/winds.md:17` | "Beyond two of its spin's cells from it" is wrong: the reach is 60° counted in cells of the spin's width, about 3.5 cells at an 8-hour day |
| re-check | correctness | low | docs | verified | open | `docs/winds.md:154` | The search's bounds are described as "a latitude at most 90°"; they also cover two cell-width settings |
| re-check | coverage | low | test | dropped | - | `src/core/wind/solve.test.ts:274` | The winter-winds test does not assert where the low lies — dropped: it runs on the real tilted case and would fail under the rejected rule |
| re-check | coverage | low | test | dropped | - | `scripts/tune-winds.ts:139` | The script's wiring of bounds and held settings has no direct test — dropped: a console script whose parts are tested |
