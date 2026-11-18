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
