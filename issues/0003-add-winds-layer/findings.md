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
| re-check | correctness | low | docs | verified | fixed | `docs/winds.md:17` | "Beyond two of its spin's cells from it" is wrong: the reach is 60° counted in cells of the spin's width, about 3.5 cells at an 8-hour day |
| re-check | correctness | low | docs | verified | fixed | `docs/winds.md:154` | The search's bounds are described as "a latitude at most 90°"; they also cover two cell-width settings |
| re-check | coverage | low | test | dropped | - | `src/core/wind/solve.test.ts:274` | The winter-winds test does not assert where the low lies — dropped: it runs on the real tilted case and would fail under the rejected rule |
| re-check | coverage | low | test | dropped | - | `scripts/tune-winds.ts:139` | The script's wiring of bounds and held settings has no direct test — dropped: a console script whose parts are tested |

## piece 7c-2 · 2026-11-14 · Bands by longitude
Cost: 7 subagents · about 549,000 tokens · about 11 min

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | defect | verified | fixed | `src/core/wind/rules.ts:1527` | The two blend-latitude settings set the wrong way round made a step in the pressure; such a pair is now refused |
| round | coverage | low | test | verified | fixed | `src/core/wind/rules.ts:1233` | No test set the window's width or taper |
| round | coverage | low | test | verified | fixed | `scripts/tune/tuning.ts:192` | The swing's printout was never run with a measured swing, and the case's id was a repeated literal |
| round | coverage | low | test | verified | fixed | `src/core/wind/rules.ts:1531` | The share of local placement was tested only at 0 and 1 |
| round | correctness | low | docs | verified | fixed | `src/core/wind/rules.ts:1441` | "The same pressure at every longitude" was not exact; now "nearly the same, within about 0.03 hPa" |
| round | coverage | low | test | dropped | - | `src/core/wind/rules.ts:1015` | No local low is tested at its limit — dropped: the local lows come from the same placing whose limit is already tested |
| round | coverage | low | test | dropped | - | `src/core/wind/rules.ts:1457` | The local-bands tests use a northern continent only — dropped: nothing treats the hemispheres differently, and southern cases are tested |
| round | coverage | low | test | dropped | - | `scripts/report/oceanBands.ts:177` | A "not measured" branch of the swing is untested — dropped: the same branches are tested through the function beneath it |
| round | other | low | defect | noticed | accepted | `src/core/wind/rules.ts:1480` | Noticed by the verifier, uncertain: on a field with sharp steps in latitude the local lows run about 0.3° short of the global low even with a whole-globe window, from the interpolation between latitude bands |
| re-check | correctness | low | defect | verified | accepted | `scripts/tune-winds.ts:113` | A sweep or search of either blend-latitude setting stops with an error part-way once a value crosses the other setting, instead of skipping it |

## piece 10 · 2026-11-14 · Day length in the Planet section

No findings: the correctness, security and coverage checks each came back clean, so no verifier ran and there was no re-check.

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| manual | user | low | docs | - | fixed | `docs/winds.md:15` | The cells' width was given as proportional to (24 hours ÷ the day length)^½, upside down against the code and the table beside it; from an earlier piece, found by the builder and fixed at the user's request |

## piece 11 · 2026-11-14 · Wind under the pointer, and the unit option

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | docs | verified | fixed | `src/app/wiring.ts:344` | A sentence saying the New world dialog "hides it" had come to follow the paragraph on the wind unit, so "it" read as the unit; it now says "hides the readout", back in the readout's paragraph |
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/windKey.ts:46` | The key's speed text repeated the strip's rounding and formatting; both now use one shared `wholeSpeed` |
| round | correctness | low | test | verified | fixed | `src/app/ui/cursorReadout.ts:180` | No test pinned a calm wind on the annual average; one now pins `Annual average calm` (the wording is put to the user) |

## piece 12 · 2026-11-14 · Scalar layers made general

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | defect | verified | fixed | `src/app/ui/layerPanel.ts:789` | Latent, not reachable with one layer: if the globe refused a second layer's first field, the legend wrote the first layer's scale with the second's tick format and unit; the scale is now written by the layer the shown field belongs to |
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/cursorReadout.ts:197` | The wind line's annual-mean prefix always used the shared label, where a layer may name that summary its own way; it now takes the label of the layer on screen |
| round | coverage | low | test | dropped | - | `src/app/testing/scalarLayerFixtures.ts:89` | A wording function of the made-up test layer is never called — dropped: it is wording data in a test fixture, and the same path is tested for the month summary |

## piece 13 · 2026-11-14 · The Pressure layer

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | defect | verified | fixed | `src/app/scalarLayer.ts:497` | Choosing Pressure before there was a temperature (a fresh page, a new world) left the legend on "Not calculated yet" through the temperature's solve, since the winds are not asked for until there is one; it now says "Calculating" while the temperature the winds wait for is being worked out |
| round | correctness | low | defect | dropped | - | `src/app/scalarLayer.ts:410` | The scale's centre takes in values that are not numbers, where the fit skips them — dropped: the winds' solve refuses a temperature that is not finite, so the pressure never holds such a value |
| round | other | low | docs | noticed | accepted | `docs/user-guide.md` | Noticed by the verifier: the strip's example `Annual average 1,013 hPa` is the user's stated wording, where the Earth's own mean in the model is 1,011 hPa; it reads only as an example |

## piece 14a · 2026-11-14 · The Earth comparison for pressure and winds

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | defect | verified | fixed | `src/app/ui/layerPanel.ts:970` | The key has one status line, and the line about the observed winds (loading, or could not be loaded) took it ahead of where the winds themselves stand, so after a failed fetch the key could not say "Calculating", "Out of date" or "Winds unavailable"; the winds' own status now comes first |
| manual | user | low | docs | - | fixed | `src/app/scalarLayer.ts:548` | Pressure's month caption read "July sea-level pressure" where the temperature's reads "air temperature in July"; reordered to "Sea-level pressure in July, hPa" (and "Simulated…", "Observed…" to match) at the user's request |

## piece 14b · 2026-11-14 · The Earth baseline for winds and pressure

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | defect | verified | fixed | `scripts/baselineUpdate.ts:186` | A figure that became `null` (not a number) dropped out of the script's report, so it could say "The baseline is unchanged." after rewriting the file; the report now names every figure that moved in either direction |
| round | correctness | medium | test | verified | fixed | `scripts/update-earth-winds-baseline.test.ts:329` | A test demanded that a fresh solve match the committed file exactly, which would fail the suite on any change of a figure, an improvement included, against the baseline's own rule; it now tests the committed file's text, and the fresh solve is checked through the tolerances only |
| round | correctness | low | cleanup | verified | accepted | `src/core/baseline/earthWinds.test.ts:41` | The test's own solve of the Earth repeats the script's; they cannot share code as they stand, since `src/core` is type-checked without Node and the script imports it (the temperature's baseline has the same repeat) |
| round | coverage | low | test | verified | fixed | `scripts/update-earth-winds-baseline.ts:429` | The script's refusal of an unknown argument had no test; one added. The file reading and writing wrappers stay untested, as thin wrappers |
| re-check | correctness | low | test | verified | fixed | `scripts/update-earth-winds-baseline.test.ts:17` | The test writes the committed file's figures again to compare the text, and would throw a confusing error on a file holding `null` for a figure that is not a number (a file the script may write; the suite would be failing then anyway, through the baseline's own test) |
| re-check | correctness | low | test | verified | fixed | `scripts/update-earth-winds-baseline.test.ts:12` | A test named for the script reporting the committed file unchanged only shows the file parses, which another test already shows; nothing in the suite now shows the script would report unchanged after a fresh solve (dropped on purpose in the round; run by hand) |
| re-check | correctness | low | docs | verified | fixed | `scripts/baselineUpdate.ts:9` | A comment says "unchanged" is printed when the text is the file's as it was; it is printed when every figure is the same, formatting aside |
| re-check | other | low | test | noticed | fixed | `src/core/baseline/earthWinds.test.ts:145` | Noticed by the verifier: the core test's check of the file's form would throw on a `null` figure in the same way, and mostly repeats the script test's |

## piece 15 · 2026-11-14 · Moving streaks

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | high | defect | verified | fixed | `src/app/globe/streaks.ts:976` | With Streaks chosen, the last trails stayed on the globe, frozen, once their winds were gone: after Winds was turned off, after Arrows then Winds off then Streaks again, and after a new world on the same grid (confirmed in a browser) |
| round | correctness | low | cleanup | verified | fixed | `src/app/globe/streaks.ts:349` | A module-level cache of the cells' frames repeated the one the core already keeps for each grid |
| round | coverage | low | test | dropped | - | `src/app/globe/renderer.ts:418` | The renderer's swap between drawing arrows and drawing streaks is untested — dropped: the renderer has never had unit tests (WebGL does not run under the test environment); the swap is thin, the loop's rule and the loop are tested, and each state was looked at in a browser |
| re-check | correctness | low | cleanup | verified | fixed | `src/app/globe/renderer.ts:174` | A doc comment line added with the fix runs to about 120 columns where its neighbours wrap near 76 (a nit, as the check and the verifier both rate it) |
| re-check | other | low | cleanup | noticed | fixed | `src/app/globe/renderer.ts` | Noticed by the verifier: the renderer builds a small view object and a camera-position array each frame while the streaks run, there before the fixes |

## piece 16 · 2026-11-15 · The climate process diagram in the docs

Reviewed by correctness and docs only, as the user chose. Correctness ran as two subagents, one on the wind model's 36 settings and one on the temperature model's 18 and the script, so that every setting's value and stated direction was compared with the code.

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | docs | verified | fixed | `scripts/docs/climate-process.py:1085` | `correctionRefineK`, Raising it: said only "a little faster, a little less exact"; raised far, large corrections skip the finer passes and overshoot, to thousands of kelvin after a big change of planet, so the effect is mixed |
| round | correctness | low | docs | verified | fixed | `scripts/docs/climate-process.py:857` | `blockingSlope`: "turns half of the wind along the slope instead" overstated it; the code takes away a share of the wind's part up or down the slope and does not redirect it |
| round | correctness | low | docs | verified | fixed | `scripts/docs/climate-process.py:682` | `localBandsFullToDeg`, Lowering it: the threshold "below about 30°" had no support in the code |
| round | correctness | low | docs | verified | fixed | `scripts/docs/climate-process.py:950` | `greenhouseFactor`: "holds back for each unit" read as 63%; outgoing heat is divided by 1 + factor × strength, so the Earth holds back about 39% |
| round | correctness | low | docs | verified | fixed | `scripts/docs/climate-process.py:1053` | `solverToleranceK` and `solverMaxIterations`, Lowering it: left out that a step which fails to solve blocks convergence, so the solve runs its full limit of years (60) before it is marked not settled |
| round | correctness | low | docs | verified | fixed | `scripts/docs/climate-process.py:1029` | `iceFullC`: "must stay below iceStartC" sat under Lowering it, though only raising it can reach that limit |
| round | docs | low | docs | verified | fixed | `docs/temperature.md:16` | "There are no winds or ocean currents yet" was false once the branch built winds; no earlier piece had touched the file |
| round | correctness | low | cleanup | verified | fixed | `scripts/docs/climate-process.py:1100` | The table's columns added up to 782 points, wider than the 781.89 it is split within; it worked only by a default of the library |
| round | correctness | low | docs | dropped | - | `scripts/docs/climate-process.py:950` | `greenhouseFactor` leaves out that the same constant sets the Planet section's warmth and trust warning — dropped: that gauge reads the constant, not the model's setting, so changing the setting does not move it |
| round | docs | low | docs | dropped | - | `docs/temperature.md:89` | The baseline is "for later steps, such as winds and ocean currents, to improve on" — dropped: winds do not yet feed back into the temperature, so they are still a later step for it |
| round | docs | low | docs | dropped | - | `README.md:40` | "How the climate is to be worked out" could read "the climate process, as a diagram" — dropped: the check itself calls the line accurate; a preference |
| round | other | low | docs | noticed | fixed | `src/core/wind/rules.ts:313` | Noticed by the wind check and the verifier, outside this piece's diff: the comment on `wideSummerFromShare` says the Earth's low lies "at most 0.40 of a cell" out, but runs show 0.51 for the global low and 0.79 for lows placed by longitude; the PDF states the figures from the runs |
| re-check | correctness | low | docs | verified | fixed | `scripts/docs/climate-process.py:682` | `localBandsFullToDeg`, Lowering it, as fixed: says the bands between the new value and 40° follow land and sea less; the code cuts the local share at every latitude from the new value up to 70° |
| re-check | docs | - | - | clean | - | `docs/temperature.md:16` | The fixed sentence is true of the app and reads right |


The user's verdict: "Read it, approve, fix both". Both open findings were fixed before the commit, with no further review round.

## review 01 · 2026-11-15 · Self review of the whole branch

All five checks, then the verifier, on `main...claude/add-winds-layer-991a60` at `e9193d9`. The user chose: "Fix 1, 2 and 4 (Recommended)".

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | defect | verified | open | `src/app/refresh.ts:757` | Switching on Winds or Pressure while the temperature is current waits the 400 ms debounce; "Not calculated yet" shows for about 0.4 s before "Calculating" |
| round | docs | low | docs | verified | open | `README.md:52` | The scripts line no longer covers baselines, the wind report or tuning |
| round | correctness | low | cleanup | verified | skipped | `src/app/refresh.ts:234` | A current answer that arrives while a newer request is held back is dropped and the same solve re-run; the result is still right |
| round | correctness | low | cleanup | verified | open | `src/app/ui/layerPanel.ts:898` | The simulated winds' summary also averages pressure, which the arrows never use; the Pressure layer averages it again |
| round | security | - | - | clean | - | - | Clean |
| round | coverage | - | - | clean | - | - | 97% of 3,123 changed lines; 83 uncovered, all with accepted reasons |
| round | common-mistakes | - | - | clean | - | - | Clean |
