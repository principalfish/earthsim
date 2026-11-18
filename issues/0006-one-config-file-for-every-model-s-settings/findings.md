# Findings: one-config-file-for-every-model-s-settings

## piece 1 · 2026-11-18 · The temperature's settings in config.ts

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | docs | verified | fixed | `src/core/temperature/temperature.ts:165` | TEMPERATURE_MODEL's doc said the entries are listed in `config.md`, which does not exist until piece 3 |
| round | correctness | low | docs | verified | fixed | `src/core/temperature/temperature.ts:77` | TemperatureModel's remarks still pointed to TEMPERATURE_MODEL for where the values start from |
| round | correctness | low | docs | verified | fixed | `src/core/config.ts:559` | The doc comments on correctionPasses and guessIterations gave reasons the old code never gave, with nothing measured behind them |
| round | coverage | low | test | verified | fixed | `src/core/config.test.ts:98` | The non-finite check was tested only on a group entry, not on the constants |
| round | security | - | - | - | - | - | Clean |
| re-check | correctness | low | docs | verified | fixed | `src/core/config.ts:9` | Two comments still said `config.md` is generated, before it exists |

## piece 2 · 2026-11-18 · The winds' settings in config.ts, and the tuning list

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | docs | - | fixed | `docs/winds.md:210` | "the entries marked for the tuning search are the ones `tuned` takes" could be read as the `tuned` field |
| round | correctness | low | cleanup | - | fixed | `src/core/wind/rules.ts:81` | The four moved constants keep full doc comments with no note that the value now comes from the config |
| round | security | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | Clean |

## piece 3 · 2026-11-18 · config.md, written from the config

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | cleanup | - | fixed | `scripts/write-config-doc.ts:322` | The count sentence was plural whatever the count |
| round | correctness | low | cleanup | - | fixed | `scripts/write-config-doc.ts:314` | `parts` joined a two-item array with an empty string |
| round | correctness | low | cleanup | - | fixed | `scripts/write-config-doc.test.ts:132` | The drift test's failure did not say how to fix it |
| round | correctness | low | docs | - | fixed | `docs/winds.md:210` | The sentence chained two colons |
| round | correctness | low | docs | - | fixed | `README.md:38` | The README's docs table did not list the new page |
| round | coverage | low | test | - | fixed | `scripts/write-config-doc.ts:62` | The line-break replacement in a cell was never exercised |
| round | coverage | low | test | - | fixed | `scripts/write-config-doc.ts:44` | The number-form boundaries and zero were untested |
| round | coverage | low | test | - | accepted | `scripts/write-config-doc.ts:161` | `main`'s write path and the missing-file branch are untested: a thin wrapper the drift test covers in effect |
| round | security | - | - | - | - | - | Clean |
| round | docs | - | - | - | - | - | Clean |
| re-check | correctness | low | cleanup | - | fixed | `scripts/write-config-doc.ts:128` | The verb did not agree with a count of one |

## piece 4 · 2026-11-18 · The "Model settings" screen

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | defect | - | fixed | `src/app/ui/panel/modelSettings.ts:175` | Switching tabs kept the body's scroll position, so the next tab opened part-way down |
| round | correctness | low | docs | - | fixed | `docs/development.md:124` | The ui rows did not list the screen or the new button |
| round | correctness | low | docs | - | fixed | `docs/user-guide.md:368` | "globe showing at its edges" is wrong in a narrow window |
| round | correctness | low | test | - | fixed | `src/app/ui/modelSettings.test.ts:173` | Hard-coded counts of 23 and 40 broke whenever a setting was added |
| round | correctness | nit | cleanup | - | fixed | `src/app/ui/panel/settingsPanel.ts:36` | ui/panel imported from ui/ for a title; the screen moved to ui/panel beside the New world dialog |
| round | coverage | low | test | - | fixed | `src/app/ui/modelSettings.ts:215` | The default parent (document.body) was untested |
| round | coverage | low | test | - | fixed | `src/app/ui/modelSettings.ts:171` | The Close button's autofocus was not asserted |
| round | coverage | low | test | - | fixed | `src/app/ui/modelSettings.test.ts:131` | Same hard-coded counts |
| round | coverage | low | test | - | accepted | `src/app/main.ts:224` | Two lines of glue in the untested bootstrap, each end tested separately |
| round | docs | low | docs | - | fixed | `docs/development.md:125` | Same as the ui rows above |
| round | security | - | - | - | - | - | Clean |

## piece 5 · 2026-11-18 · The climate process diagram on the screen, and the PDF removed

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | defect | verified | fixed | `src/app/styles.css:1372` | The panel and diagram grids had no `min-width: 0`, so the diagram's minimum width could make the whole panel scroll sideways in a narrow window |
| round | correctness | low | defect | verified | fixed | `src/app/ui/panel/processDiagram.ts:697` | `aria-labelledby` named both the title and the long description, so the description became the accessible name |
| round | correctness | low | defect | verified | fixed | `src/app/styles.css:1355` | At the 40rem minimum the drawing shrank to about 6px text, against the comment's claim |
| round | correctness | low | cleanup | verified | accepted | `src/app/ui/panel/processDiagram.ts:512` | The PDF's title and subtitle are not carried over; the tab name and an intro stand for them |
| round | correctness | low | test | verified | fixed | `src/app/ui/panel/processDiagram.test.ts:23` | Box kind, label tone, size, weight and the sea-ice box's voice, and the heads' class and path were not asserted |
| round | correctness | low | docs | verified | fixed | `src/app/ui/panel/modelSettings.ts:123` | A stale comment on the generic panel builder |
| round | correctness | nit | docs | verified | fixed | `src/app/ui/panel/modelSettings.ts:161` | `@param options` left out `diagram`; the tablist's aria-label no longer fit |
| round | correctness | nit | cleanup | verified | fixed | `src/app/ui/panel/processDiagram.ts:666` | The arrow heads were 9 units; the PDF's are about 6 |
| round | correctness | nit | cleanup | verified | accepted | `src/app/ui/panel/processDiagram.ts:592` | The sea ice lines sit at 288.5 and 276.5 where the PDF put 288 and 276, from the generic centring; not visible |
| round | coverage | low | test | verified | fixed | `src/app/ui/panel/processDiagram.test.ts:433` | A counts-only test claimed more than it showed; dropped |
| round | coverage | low | test | verified | fixed | `src/app/ui/panel/processDiagram.ts:513` | The introduction was never asserted |
| round | coverage | - | - | dropped | - | - | Built and to-come marks exist only as the two status lines — dropped: the PDF marked them the same way and a test asserts the lines |
| round | docs | low | docs | verified | fixed | `src/app/ui/panel/processDiagram.ts:12` | "as the diagram was first drawn" and the same in `docs/development.md:36` pointed at a removed file |
| round | docs | low | docs | verified | fixed | `src/app/ui/panel/settingsPanel.ts:140` | The comment on the button said the screen only lists the settings |
| round | docs | low | cleanup | verified | fixed | `.gitattributes:2` | The `*.pdf binary` rule was dead with no PDF left |
| round | security | - | - | - | - | - | Clean |

## review 01 · 2026-11-18

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | verified | fixed | `src/app/ui/panel/processDiagram.test.ts:18` | Test comments and constant names point at the deleted PDF |
| round | common-mistakes | low | docs | verified | fixed | `src/core/wind/rules.ts:81` | Use-site doc comments repeat the config entries' reasoning, value and status (also `temperature.ts:1336`) |
| round | correctness | low | cleanup | verified | fixed | `scripts/tune/command.ts:17` | Groups-to-entries flattening repeated in four places, with casts |
| round | common-mistakes | low | cleanup | verified | fixed | `src/core/config.ts:47` | `ConfigBounds` duplicates `SettingBounds` |
| round | correctness | nit | cleanup | verified | fixed | `src/app/ui/panel/processDiagram.ts:153` | `DIAGRAM_LOOP.title`/`.note` never read; text copied in the labels |
| round | common-mistakes | nit | docs | verified | fixed | `scripts/tune/command.ts:23` | `TUNED_SETTINGS` doc hand-lists the 14 names |
| round | common-mistakes | nit | docs | verified | fixed | `src/core/config.ts:72` | Garbled `ConfigSection.name` doc |
| round | docs | nit | docs | verified | fixed | `README.md:42` | Model settings row too long |
| round | common-mistakes | nit | cleanup | verified | fixed | `src/app/wiring.ts:400` | `endStroke` + `readout.clear` pair copied |
| round | common-mistakes | nit | test | verified | fixed | `src/core/config.test.ts:385` | `formatConfigValue` edge cases tested twice |
| round | docs | - | - | dropped | - | `src/core/config.md` | Missing backticks on names in prose — dropped: only the Setting column is backticked |
| round | security | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | Clean: 99% of 249 changed lines; 2 glue lines accepted |
| re-check | correctness | low | docs | verified | open | `src/app/ui/panel/processDiagram.test.ts:21` | The rewritten header comment has a 131-character line |
| re-check | correctness | low | docs | verified | open | `src/core/temperature/temperature.ts:1358` | The edited `estimateYearsLeft` remark has a 101-character line |
| re-check | docs | low | docs | verified | open | `src/core/temperature/temperature.ts:1338` | `SLOWEST_SHRINK_TRUSTED`'s doc says "shrank by less" without saying than what |
| re-check | common-mistakes | low | cleanup | verified | open | `src/app/ui/panel/modelSettings.test.ts:57` | Groups-plus-constants flattening left in two tests (also `scripts/write-config-doc.test.ts:59`) where `entriesOf` is not used |
| re-check | correctness | - | cleanup | noticed | open | `src/core/config.ts:114` | `entriesOf<K>` casts to the caller's K unchecked, so the casts moved rather than went |
| re-check | common-mistakes | - | cleanup | dropped | - | `scripts/write-config-doc.ts:94` | `settingsIn` as a wrapper — dropped: two callers, a clear name |
| re-check | common-mistakes | - | docs | dropped | - | `src/core/temperature/temperature.ts:622` | Over-long line — dropped: outside the change, a template literal in code |
| re-check | common-mistakes | - | docs | dropped | - | `src/app/ui/panel/processDiagram.test.ts:263` | Over-long line — dropped: not changed here, 77 characters |
