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
