# Plan: one-config-file-for-every-model-s-settings

**Build model:** claude-opus-5-5 (the models must read identical numbers through a new structure, with frozen identity and key order kept, and the screen and diagram are new UI)

## Context

Roadmap step 3d, widened by the user to include a read-only screen and the removal of the climate-process PDF.

### How the settings are held today (a read on 2026-11-18)
- **Temperature** (`src/core/temperature/temperature.ts:85-248`): `type TemperatureModel` has 18 fields, each with a field doc giving its meaning and unit; sources and tuning sit apart, in one `@remarks` list on `TEMPERATURE_MODEL`. Values: diffusivity 0.55, landDiffusivity 0.35, oceanHeatCapacity 2.5e8, landHeatCapacity 1e7, seaIceHeatCapacity 1e7, lapseRate 6.5e-3, greenhouseFactor (`GREENHOUSE_FACTOR`, from `planet.ts`, which also uses it), albedo 0.27, albedoPoleward 0.078, landAlbedoExtra 0, iceAlbedo 0.62, iceStartC 0, iceFullC -10, then the solver's: stepsPerMonth 2, solverToleranceK 5e-3, solverMaxIterations (`EXCHANGE_MAX_ITERATIONS`, the default in `exchange.ts`), terrainDriftLimitK 0.25, correctionRefineK 1. `TEMPERATURE_MODEL` is `Object.freeze`d. A run overrides the whole object through `solveTemperature(world, { model })`; `assertModel` iterates `Object.keys(TEMPERATURE_MODEL)`; `annualBalance`, `lapseCooling`, `coolingDrift` and `refineMonths` default to it. Only tests pass a model. The run's own defaults `DEFAULT_MAX_YEARS` (60) and `DEFAULT_TOLERANCE_K` (0.05) are options, not model settings.
- **Winds** (`src/core/wind/rules.ts:122-698`): a private `DEFAULT_VALUES` of 36 entries, each with one doc comment (meaning with the unit in prose, an optional `@remarks` with references, then free-text tuning status: "Not tuned.", "A guess, not tuned.", "Started at X; tuned by hand to Y"). `WindSettings = Readonly<typeof DEFAULT_VALUES>`; `DEFAULT_WIND_SETTINGS = Object.freeze({...DEFAULT_VALUES})`; `WIND_SETTING_NAMES` comes from its key order. `windSettings(overrides)` returns the same frozen default object when nothing is overridden (its identity is tested), checks names and finiteness, and requires `localBandsGlobalFromDeg > localBandsFullToDeg`. A run overrides through `solveWinds(…, { settings })` with a `Partial<WindSettings>`.
- **Constants beside them:** physical (`STEFAN_BOLTZMANN`, `ZERO_CELSIUS_K`), limits (`MAX_YEARS_LIMIT`, `MAX_STEPS_PER_MONTH`, `MAX_SOLVER_ITERATIONS`, `MIN`/`MAX_STEP_SECONDS`), grid sizes (`PROFILE_BANDS`, `TABLE_STEP_DEG`, `LOCAL_BAND_SECTORS`) stay. Chosen ones that move: `REFERENCE_PRESSURE_HPA` (1011), `EARTH_CELL_WIDTH_DEG`, `FULL_BANDS_EASE_CELLS` ("A guess, not tuned"), and the private `MIN_DAMPING_SHARE`, `CORRECTION_PASSES`, `GUESS_*`, `SLOWEST_SHRINK_TRUSTED`; the builder sorts any other constant by the same rule (chosen vs physical or structural) and lists its calls. `AIR_DENSITY_KG_M3` is the builder's call by that rule.
- **Names:** `planet.ts`'s `TEMPERATURE_SETTINGS` is the five planet fields the temperature reads (type `TemperatureSetting`); `WIND_SETTING_NAMES` exists. The core exports `TEMPERATURE_MODEL` and its constants (pinned in `index.test.ts`); the rules constants only through `solve.ts` re-exports.
- **Who overrides:** `scripts/tune/command.ts` hand-lists `TUNED_SETTINGS` (14 names); `SETTING_BOUNDS` is derived from `WIND_SETTING_NAMES`; `tune-winds.ts` prints `DEFAULT_WIND_SETTINGS`. The worker and page never override; `handle.test` proves a stray `model` is ignored. Tests override by spreads.
- **The PDF** (`docs/climate-process.pdf`, drawn by `scripts/docs/climate-process.py`, 1,219 lines): page 1 is the climate process diagram (inputs, the loop of temperature, pressure, winds and currents, feedbacks into the temperature, the settled state and what is worked out from it, the layers, what sits outside the loop, a legend); the pages after are the settings as Python `Setting(name, value, controls, raising, lowering, source, tuned)` rows in titled groups (temperature 3 groups, the last numerical; winds 8). This text is the source for each entry's `what`, `raising`, `lowering` and `source`. `README.md:42` and `docs/development.md:35`, `:48`, `:160` refer to it.
- **Drift-test pattern:** `scripts/update-earth-winds-baseline.test.ts` checks that regenerating gives "the very text the file holds".
- **Hard parts:** two defaults are shared (`GREENHOUSE_FACTOR`, `EXCHANGE_MAX_ITERATIONS`); both value objects are frozen and their identity and key order are relied on; `rules.ts` imports `temperature.ts`, so `config.ts` must import neither.

### Settled (from `decisions.md`, in full)
- One `src/core/config.ts` with a section per model, which `temperature/` and `wind/` read their numbers from; each later model adds its section there. From the roadmap and the user (2026-11-14).
- Each setting carries its value, its unit, one line on what it does, where its starting value comes from (an observed figure, a published figure with its source, or a guess), and whether and against what it was tuned. From the roadmap.
- A `src/core/config.md` beside it, written from `config.ts` by an npm command, with a test that fails when the committed page differs, so it cannot drift; the models' docs point to it; solver settings listed apart from physical ones. From the roadmap.
- No value changes: the Earth temperature baseline unchanged and the Earth's wind figures the same bit for bit; both models stay overridable for a run as now; the page and its workers never override. From the roadmap.

- Each setting in `config.ts` is an entry as data, `{ value, unit, what, source, tuned }`, in a titled group; the models build their plain values from it, so `TEMPERATURE_MODEL` and `DEFAULT_WIND_SETTINGS` keep their names, keys, key order and frozen identity, and `config.md` is generated from the data with no parsing of comments. The user: "Entries as data (Recommended)" (2026-11-18)
- What moves into `config.ts`: the 18 temperature and 36 wind settings, plus the constants beside them that are chosen rather than physical or structural (the reference pressure, the ones marked "a guess, not tuned", the private `GUESS_*` starting values); physical constants (Stefan-Boltzmann, 0 °C in kelvin), grid sizes (`PROFILE_BANDS`, `TABLE_STEP_DEG`, `LOCAL_BAND_SECTORS`) and safety limits (`MAX_YEARS_LIMIT`, `MAX_STEPS_PER_MONTH`, `MAX_SOLVER_ITERATIONS`, the step-length bounds) stay where they are. The user: "Settings + setting-like (Recommended)" (2026-11-18)
- `config.ts` marks which settings are tunable (with any bounds); `scripts/tune` reads its list from there instead of its hand-written `TUNED_SETTINGS`, and the same 14 names come out, so tuning runs are unchanged; step 6b reads the same marks. The user: "Mark it in config (Recommended)" (2026-11-18)
- The climate-process PDF (`scripts/docs/climate-process.py`) is out of scope and keeps its own hand-kept table. The user: "Leave the PDF by hand" (2026-11-18)

- The long reasoning and references in today's doc comments stay as a doc comment above each entry in `config.ts`, for whoever edits it; the entry's fields stay short (`what`, a one-line `source`, `tuned`) and `config.md` shows only those. The user: "Doc comment on the entry (Recommended)" (2026-11-18)
- The sections are `TEMPERATURE_CONFIG` and `WIND_CONFIG`; the models' value objects keep their names (`TEMPERATURE_MODEL`, `DEFAULT_WIND_SETTINGS`), so no caller changes. The user: "TEMPERATURE_CONFIG, WIND_CONFIG (Recommended)" (2026-11-18)
- Grouped as the climate-process PDF groups them: temperature in its 3 groups, winds in its 8, the solver's numerical settings apart from the physical ones. The user: "As the process PDF does (Recommended)" (2026-11-18)

- Scope widened: the page gains a config screen that shows every setting and lets the user edit them, while `config.ts` stays editable by hand (and by Claude) as the source; the screen carries all the explanations the climate-process PDF has (what each setting controls, what raising or lowering it does, where its value comes from), and the PDF and its script (`scripts/docs/climate-process.py`) are removed. This reverses "the PDF is out of scope" and "the page and its workers never override". The user: "as part of this can we make a new config screen which displays all these settings and allows me to edit them. this should n ot stop you from editing t hem too! / this screen should have all the explanations that are in the pdf too / we can then ditch the p[df and associated script" (2026-11-18)
- Each entry therefore also carries the PDF's per-setting text, `raising` and `lowering`, as data, since the screen shows them; the long reasoning with references stays as a doc comment.

- The config screen is a full-page overlay, opened by a "Model settings" button in Settings, with a tab per model and its groups inside; the globe stays visible at the edges, and Close returns. The user: "Full-page overlay (Recommended)" (2026-11-18)
- The climate process diagram is redrawn as an SVG at the top of the config screen; the Python script and the PDF go entirely. The user: "On the config screen (Recommended)" (2026-11-18)
- `config.md` stays, generated from the config with its drift test, so the settings can be read on GitHub without running the page. The user: "Keep it, generated (Recommended)" (2026-11-18)

- The config screen is read-only for now: it shows every setting with its explanations, and settings are changed by editing `config.ts` in a chat. No `settings.json`, no saving from the page, and the page and its workers still never override the models' settings. This narrows the earlier "allows me to edit them". The user: "ok for now lets not make it editable to make this simpler - keep as ts if you wish. we edit through chats here. just having the screen to reference is enough" (2026-11-18)

### Assumed
- The value objects keep today's key order whatever the grouping, since the tuning script and tests rely on it; if a group order would change it, the order is kept explicitly.
- `config.ts` is a leaf: it imports nothing from the models, so no import cycle can form. Values the models share today (`GREENHOUSE_FACTOR`, used by `planet.ts` too, and the exchange solver's iteration cap) move into it, and their old homes read them from there.
- The temperature run's own defaults (`DEFAULT_MAX_YEARS` 60, `DEFAULT_TOLERANCE_K` 0.05) stay as run options in `temperature.ts`: they set how long a run goes, not how the model behaves.
- `config.md` is written by a new npm command (`npm run docs:config`) and checked by a Vitest test that compares the committed page with what the command would write, as the winds baseline test already does; `docs/temperature.md` and `docs/winds.md` point to it.
- The core's `index.ts` also exports `TEMPERATURE_CONFIG` and `WIND_CONFIG`.
- Verification: the values come out identical (a test pins each value object against today's literal values), the Earth temperature baseline is unchanged, the Earth's wind figures are the same bit for bit, and the tuning script lists the same 14 names.
- The config screen reads the same `TEMPERATURE_CONFIG` and `WIND_CONFIG` that the models and `config.md` use, so the three can never disagree.
- Removing the PDF also removes its rows in `README.md` and `docs/development.md` (the climate-process section and its run command), and the Python venv instructions that only it needed.

## Approach

`config.ts` holds data, the models derive from it. A small helper (`valuesOf(section)`) flattens a section's groups into a plain frozen object in a fixed key order; `TEMPERATURE_MODEL` and `DEFAULT_WIND_SETTINGS` become `valuesOf(TEMPERATURE_CONFIG)` and `valuesOf(WIND_CONFIG)` (or the model's own mapping where a type needs it), so every caller, override path, freeze and key order stays. A test pins each value object, key by key and in order, against a literal copy of today's values, written before the move, so a value cannot change unnoticed.

Each entry: `{ value, unit, what, raising, lowering, source, tuned, tunable? }`, where `tuned` is `null` or a short phrase saying against what (from the PDF's "Tuned against the Earth" and the doc comments' "Started at X; tuned to Y"), and `tunable` (with optional bounds) marks what `scripts/tune` may search. The long reasoning with references stays as a doc comment above the entry.

`config.md` and the screen both read the sections, so they show the same thing. The screen is a read-only overlay built from DOM elements like the page's other panels; the diagram is an SVG built in code, like the icons.

Rejected:
- **Values plus doc comments, parsed for `config.md`:** the generator would depend on comment wording.
- **One `CONFIG` object:** two named sections read more plainly at each call site.
- **An editable screen and a `settings.json`:** the page is static files with no server, and the user chose to edit `config.ts` through chats.
- **Keeping the PDF:** it repeats every setting by hand; the screen and `config.md` replace it.

## Pieces

1. The temperature's settings in `config.ts`
   - Files: new `src/core/config.ts` and `config.test.ts`; `src/core/temperature/temperature.ts`, `src/core/temperature/exchange.ts`, `src/core/planet/planet.ts` (where the shared defaults are read), `src/core/index.ts` and `index.test.ts`; `docs/development.md` (the core table).
   - What: Create `config.ts` with the entry type, the group type, `valuesOf`, and `TEMPERATURE_CONFIG` in the PDF's three groups, the numerical one apart. Each of the 18 settings gets its value, unit, `what`, `raising`, `lowering`, `source` and `tuned`, from the PDF's rows and the field docs and `@remarks`; the long reasoning goes in a doc comment on the entry. `GREENHOUSE_FACTOR`'s and the exchange iteration cap's values move into it, and `planet.ts` and `exchange.ts` read them from there, with their exported names kept. `TEMPERATURE_MODEL` becomes the frozen values of `TEMPERATURE_CONFIG`, same keys, same order. Any chosen temperature constant beside them moves in too, under the same rule as the winds'. `config.ts` imports nothing from the models.
   - Functions: `valuesOf`; `TEMPERATURE_CONFIG`; `TEMPERATURE_MODEL` (now derived).
   - Depends on: none.
   - Acceptance: `TEMPERATURE_MODEL` deep-equals a literal of today's 18 values in today's key order and is frozen; `GREENHOUSE_FACTOR` and `EXCHANGE_MAX_ITERATIONS` are unchanged; the Earth temperature baseline prints unchanged; no import cycle; every check passes.
   - Tests: `TEMPERATURE_MODEL` against the literal (values and key order) and frozen; every entry has a non-empty `what`, `raising`, `lowering`, `source` and a `unit`, and a finite `value`; the groups hold every key once; `valuesOf` keeps order and freezes; the existing temperature tests and the baseline test pass untouched.

2. The winds' settings in `config.ts`, and the tuning list
   - Files: `src/core/config.ts` and its test; `src/core/wind/rules.ts`, `src/core/wind/solve.ts` (re-exports), `src/core/wind/model.ts` if it holds chosen constants; `scripts/tune/command.ts` and its test; `src/core/index.ts`; `docs/development.md`.
   - What: Add `WIND_CONFIG` in the PDF's eight groups, the 36 settings with every field from the PDF and the doc comments, the long `@remarks` as doc comments on the entries. Move in the chosen constants beside them (`REFERENCE_PRESSURE_HPA`, `EARTH_CELL_WIDTH_DEG`, `FULL_BANDS_EASE_CELLS`, `MIN_DAMPING_SHARE`, `CORRECTION_PASSES`, the `GUESS_*`, `SLOWEST_SHRINK_TRUSTED`, and any other by the rule), in a group of their own or beside the setting they belong to, read from there by the code under their current names. `DEFAULT_WIND_SETTINGS` becomes the frozen values of the 36, same keys and order; `WindSettings`, `WIND_SETTING_NAMES` and `windSettings` keep their behaviour, including returning the same frozen object when nothing is overridden. Mark the 14 tuned settings `tunable` (with any bounds the tuning script now applies), and have `scripts/tune` read its list from `WIND_CONFIG`.
   - Functions: `WIND_CONFIG`; `DEFAULT_WIND_SETTINGS` (now derived); `TUNED_SETTINGS` (now derived).
   - Depends on: 1.
   - Acceptance: `DEFAULT_WIND_SETTINGS` deep-equals a literal of today's 36 values in today's key order and is frozen; every moved constant keeps its value; `TUNED_SETTINGS` lists the same 14 names in the same order; the Earth's wind figures are the same bit for bit (the winds baseline test passes untouched); every check passes.
   - Tests: as piece 1 for the winds; `TUNED_SETTINGS` equals today's literal list; `windSettings()` with no overrides still returns `DEFAULT_WIND_SETTINGS` itself; the existing wind, solve and tuning tests pass untouched.

3. `config.md`, written from the config
   - Files: new `scripts/write-config-doc.ts` (or a name in the scripts' pattern) and its test, `package.json` (`docs:config`), new `src/core/config.md`, `docs/temperature.md`, `docs/winds.md` (`:210` names `DEFAULT_WIND_SETTINGS` in `rules.ts`), `docs/development.md`, `README.md` (its docs table, if it lists docs).
   - What: An npm command, `npm run docs:config`, writes `src/core/config.md` from `TEMPERATURE_CONFIG` and `WIND_CONFIG`: per model, per group, a table of setting, value with unit, what it controls, raising, lowering, where it comes from, and whether tuned; the solver's settings apart; in the project's Markdown style. A test compares the committed page with what the command would write and fails on any difference, as the winds baseline test does. The models' docs point to `config.md` for their settings.
   - Functions: the writer and its formatter.
   - Depends on: 2.
   - Acceptance: `npm run docs:config` writes the committed `config.md` exactly; changing any entry makes the drift test fail; the docs point to it; every check passes.
   - Tests: the drift test; the formatter's output for a small made-up section (value with unit, a tuned and an untuned row, the solver group apart, a `|` in a text escaped).

4. The "Model settings" screen
   - Files: new `src/app/ui/modelSettings.ts` (or under `ui/panel/` if it reads better) and its test, `src/app/ui/panel/settingsPanel.ts` (the button), `src/app/wiring.ts` or `main.ts` (opening it), `src/app/styles.css`, `docs/user-guide.md` (Settings → Model settings).
   - What: A "Model settings" button in Settings opens a read-only full-page overlay: a title, a tab per model (Temperature, Winds), and in each tab its groups with every setting as a row or card showing its name, value with unit, what it controls, what raising and lowering it do, where it comes from, and a "Tuned" mark with what against. Close (button and Escape) returns; focus moves into the overlay and back to the button; the page behind is out of reach while it is open, as with the New world dialog. It reads `TEMPERATURE_CONFIG` and `WIND_CONFIG`, so it shows what the models use. Fits a narrow window by stacking; long text wraps.
   - Functions: `createModelSettings(options)` with `open`/`close`; the Settings panel's new button.
   - Depends on: 2.
   - Acceptance: every entry of both sections appears once in its tab and group, with every field; the screen changes nothing (no override reaches the models); open and close work by mouse and keyboard; the page reads as before when it is closed.
   - Tests: the button opens it; both tabs list every setting of their section in group order with every field; switching tabs; Close and Escape close it and return focus to the button; while open, the page behind is inert; it holds no input that changes a setting.
   - Manual review: open Settings → Model settings in a wide and a narrow window, read a few settings in each tab, switch tabs, close with Escape. How: the user runs `npm run dev` themselves from the builder's worktree, whose path the planner gives them; the builder leaves no server running for it.

5. The climate process diagram on the screen, and the PDF removed
   - Files: new `src/app/ui/processDiagram.ts` (or beside the screen) and its test, the screen from piece 4, `src/app/styles.css`; removed `scripts/docs/climate-process.py` and `docs/climate-process.pdf`; `README.md` (its row for the PDF), `docs/development.md` (the climate-process section, its run command, its row in the `scripts/` table, and the Python setup it alone needed), any other doc naming the PDF.
   - What: Redraw the PDF's first page as an SVG built in code at the top of the screen (above the tabs, or as its own first tab if that reads better at narrow widths): the inputs, the loop of temperature, pressure, winds and currents with its feedbacks, the settled state and what is worked out from it, the layers, what sits outside the loop, the legend, and which parts are built and which are to come, as the PDF shows. Its colours follow the page's theme. Then delete the PDF and its script, and every reference to them.
   - Functions: `createProcessDiagram()`.
   - Depends on: 4.
   - Acceptance: the diagram shows every box, arrow and label the PDF's first page has, and marks what is built and what is to come; no file in the repo names `climate-process.py` or `climate-process.pdf`; every check passes.
   - Tests: the SVG has a node for each box and an edge for each arrow the PDF draws, with their labels; the built and to-come marks; nothing in the repo refers to the removed files (a grep in the review, not a test).
   - Manual review: open the Model settings screen and compare the diagram with the PDF's first page (open `docs/climate-process.pdf` from `main` before it is gone), in a wide and a narrow window. How: the user runs `npm run dev` themselves from the builder's worktree; the builder leaves no server running.

## Checkpoints
- [x] 1. The temperature's settings in `config.ts`
- [x] 2. The winds' settings in `config.ts`, and the tuning list
- [x] 3. `config.md`, written from the config
- [ ] 4. The "Model settings" screen
- [ ] 5. The climate process diagram on the screen, and the PDF removed

## Verification

After every piece: `npm run check`, `npm run typecheck`, `npm test`, `npm run build`. Both Earth baselines must print unchanged at every piece (their tests run in `npm test`); pieces 1 and 2 also pin the value objects against literals of today's values. Changed-lines coverage with `project.md`'s Coverage command.

Docs: `config.md` (generated) and pointers to it in `docs/temperature.md` and `docs/winds.md`; the screen in `docs/user-guide.md`; `docs/development.md`'s tables for the new files; the PDF's mentions removed from `README.md` and `docs/development.md`.

## Notes

### How the pieces run (2026-11-18)
- Straight through, as the user chose: commit and push each piece after its review round and light re-check, fix every verified finding, record each choice the plan leaves open under its piece as "Decided by the builder", and list them all at the end. Stop for the manual reviews of pieces 4 and 5, and for anything that changes a value, departs from the settled ledger, touches shared state or cannot be undone, or a check that cannot be made to pass.

### Piece 1: the temperature's settings in `config.ts` (committed 279f599, 2026-11-18)

Decided by the builder:
- The plan's Context lists `MIN_DAMPING_SHARE`, `CORRECTION_PASSES`, the `GUESS_*` pair and `SLOWEST_SHRINK_TRUSTED` among the winds' constants, but they live in `temperature.ts`, so they moved in this piece, as the `constants` of `TEMPERATURE_CONFIG` (`minDampingShare`, `correctionPasses`, `guessIterations`, `guessChangeK`, `slowestShrinkTrusted`), under their old private names.
- A section is `{ name, groups, constants }`: `groups` are what `valuesOf` flattens into the model's value object (so `TEMPERATURE_MODEL` keeps its 18 keys); `constants` is one group the code reads directly through `constantsOf`, which a run cannot override. Piece 2 puts the winds' chosen constants there too.
- `defineSection` is generic over its literal groups, so `valuesOf`'s key set is inferred and the compiler checks `TEMPERATURE_MODEL`'s `TemperatureModel` type against the config's keys; it also deep-freezes the section and refuses a duplicate name or a non-finite value.
- An entry's `unit` is the value's true unit (`lapseRate` 6.5e-3 K/m, where the PDF says 6.5 K/km); dimensionless values get a word ('fraction', 'factor', 'passes', 'iterations') so the unit is never empty.
- `tuned` is a phrase for the PDF's four tuned settings (`landDiffusivity`, `albedo`, `albedoPoleward`, `iceAlbedo`); the PDF's "Not tuned." became `null`. The PDF's `source` text had its "Not tuned." dropped and, where it was bare, a source named (Trenberth et al. for `greenhouseFactor`, ICAO for `lapseRate`) from the old `@remarks`.
- The five fixed choices had no PDF rows, so their `what`, `raising` and `lowering` are written from the code and its doc comments, with `source: 'Chosen.'`.
- Stay in code: `DEFAULT_MAX_YEARS`, `DEFAULT_TOLERANCE_K` (run options), `MIN_TEMPERATURE_K` (physical), `MAX_START_K` and the `MAX_*` limits (safety), `SUNLIGHT_STEP_DEG` and the 64-grid threshold (grid structure).
- `TEMPERATURE_CONFIG` is typed const-generic, so a reader of one group's literal type cannot read `numerical` without annotating it as `ConfigSection` (the test and the later screen do that).
- The long `@remarks` bullets moved to doc comments above their entries; `TEMPERATURE_MODEL`'s doc now points to `TEMPERATURE_CONFIG`. `docs/development.md` line 53 (the PDF's settings pages, "a future `src/core/config.md`") is left for pieces 3 and 5.
- Review: correctness, security, coverage and the verifier raised four verified findings, all fixed; the re-check raised one wording leftover, fixed. Changed-lines coverage 100% on the tracked files; `config.ts` is tested directly.

### Piece 2: the winds' settings in `config.ts`, and the tuning list (committed 181cb39, 2026-11-18)

Decided by the builder:
- The wind entries were generated, not retyped: `what`, `raising`, `lowering` and `source` come verbatim from the PDF script's `WIND` rows (so the screen and `config.md` carry the PDF's text), the 8 groups are the PDF's, and each old doc comment sits unchanged above its entry (apart from `{@link X}` turned into backticks, since config.ts imports nothing). The PDF's trailing "Not tuned." sentences were dropped from `source`.
- `tuned` is non-null for the PDF's eleven tuned settings only, with a phrase of what each was tuned against, from its doc comment. The five set by hand for other reasons (`earthContrastK`, `poleTaperDeg`, `sideContrastK`, `wideSummerFromShare`, `wideSummerToShare`) stay `null`, as the PDF has them; their `source` says what was done.
- `tunable` became two optional entry fields, `bounds` ({above, atMost}, on all 36) and `searchOrder` (1 to 14, on the fourteen the tuning script searches). The order is kept explicit because `TUNED_SETTINGS` lists them in an order that differs from the config's, and the acceptance asks for the same names in the same order. `SETTING_BOUNDS` is the entries' bounds, identical to the old name rule for all 36 (a test pins it); `TUNED_SETTINGS` is the entries with a `searchOrder`, sorted.
- Chosen constants that moved, as the `constants` group of `WIND_CONFIG`: `REFERENCE_PRESSURE_HPA` (1011), `AIR_DENSITY_KG_M3` (1.2, a rounded-down choice rather than the physical 1.225), `EARTH_CELL_WIDTH_DEG` (30) and `FULL_BANDS_EASE_CELLS` (0.25). They keep their names and exports in `rules.ts`, read from `constantsOf(WIND_CONFIG)`. Stayed: `PROFILE_BANDS`, `TABLE_STEP_DEG`, `LOCAL_BAND_SECTORS`, `ZONAL_BANDS` (grid sizes), `DIRECTION_MIN_SPEED_M_PER_S` and `DIRECTION_TOLERANCE_DEG` (how the error figures are scored, not the model), `RADIUS_M`, `PASCALS_PER_HPA`, `RADIANS_PER_DEGREE` (physical or unit). Their `what`, `raising`, `lowering` are written from how `rules.ts` uses them, and a reviewer confirmed them.
- Units: degrees are '°', and dimensionless ones are named by kind ('share', 'power', 'ratio', 'factor', 'slope', 'cells').
- Their doc comments in `rules.ts` stay, with a line saying the value is read from `WIND_CONFIG`, so the config entry and the code comment cannot be mistaken for one another.
- Review: correctness, security and coverage ran; security and coverage were clean; correctness checked all 36 values, orders, texts, bounds and search orders by script and raised two low findings (a doc sentence in `docs/winds.md` that could be misread; the four constants' comments not saying where the value is read from), both fixed. I did not run the verifier or a re-check on the two doc-only fixes, as every finding was fixed anyway and nothing was left to rule on. Changed-lines coverage 100%.

### Piece 3: `config.md`, written from the config (committed 34ab717, 2026-11-18)

Decided by the builder:
- The writer is `scripts/write-config-doc.ts` (export `configDocText`, `CONFIG_DOC_SECTIONS`, `main`), run as `npm run docs:config` through `run-with-vite.mjs`, with the drift test in `scripts/write-config-doc.test.ts`. The page is `src/core/config.md`; the winds baseline pattern (the test compares the committed file with what the command would write) is followed.
- Layout: a title and how to read it, then a section per model (`## Temperature`, `## Winds`) with an intro line, a count sentence (settings, physical against solver, how many tuned, how many fixed choices), a table per group (Setting, Value, What it controls, Raising it, Lowering it, Where it comes from, Tuned), the numerical groups after the physical ones (the config orders them so), and the section's fixed choices last as their own group. `Tuned` is the entry's phrase or "No".
- Values print with their unit as the config holds it (`0.0065 K/m`, `20°`), numbers of 1e6 and over or under 1e-3 in `2.5e8` form; dimensionless ones print with their kind word (`0.27 fraction`, `4 ratio`).
- Pointers: `docs/temperature.md` and `docs/winds.md` link to the page; `docs/development.md` lists the command, the script and the page; the README docs table gained a "Model settings" row, which is a link to a file outside `docs/` and so a small departure from "one line per docs file".
- Review: security, docs clean; correctness raised five low findings (singular/plural in the count sentence, a clumsy join, no hint in the drift test's failure, a sentence with two colons, README row), coverage three (a line break in a text, number-form boundaries, `main`'s write path), all fixed except `main`'s write path and the missing-file branch, accepted as a thin wrapper over `writeFileSync` that the drift test and `npm run docs:config` exercise. The re-check raised one more singular/plural wording, fixed. Scripts are outside the coverage tool, so coverage is judged from the tests.

### Piece 4: the "Model settings" screen (built, awaiting the manual review, 2026-11-18)

Decided by the builder:
- The screen is `src/app/ui/panel/modelSettings.ts` (not `ui/`), beside the New world dialog it follows; the plan allowed either.
- It is a native `<dialog>` opened with `showModal()`, as the New world dialog is, so the inert background, the focus trap, Escape and the focus return to the opening button are the browser's own, not rebuilt. Close has `autofocus`. A backdrop click does not close it (not asked for).
- Tabs follow the ARIA tabs pattern: a `tablist` of `button`s with `role="tab"`, roving `tabindex`, left and right arrows (wrapping), Home and End moving and selecting at once, and each panel `role="tabpanel"` labelled by its tab. Tab choice is not remembered between openings. Another tab starts at the top of the body.
- A setting is a card: name (monospace), value with unit (`formatConfigValue`, moved into `src/core/config.ts` so the screen and `config.md` write values identically), a "Tuned" mark when tuned, and a label and text for What it controls, Raising it, Lowering it, Where it comes from, and Tuned against (tuned ones only). Each model's panel lists its groups, then its fixed choices as a last group.
- Opening it follows the New world dialog's wiring: `PageParts.openModelSettings`, `SettingsPanelOptions.onModelSettings`, and in `wiring.ts` it first ends a sculpt stroke and clears the cursor readout. Nothing on it reaches the models: it holds no input, select or text area, only buttons, and reads the frozen config.
- Layout: the dialog is up to 72rem wide and the window's height less a margin, with a fixed header, intro and tabs and a scrolling body; from 48rem up each card's texts sit beside their labels, and under 40rem it fills the window with no margin. Colours use the page's tokens.
- The Model settings button sits last in the Settings section, under the units.
- The diagram's place (piece 5) is left to that piece: the body is the tab panels only.
- Not verified in a real browser: this environment has no browser and the Chrome extension was not connected, so open/close, Escape, focus return, inertness and the layout at both widths are for the manual review. The tests use the stand-in document, which has no dialogs, and say only what they show.
- Review: security clean; correctness, coverage and docs raised low findings (above), all fixed except one accepted (the two glue lines in `main.ts`).
