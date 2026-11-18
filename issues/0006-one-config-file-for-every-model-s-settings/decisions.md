# Decisions: one config file for every model's settings

The user's brief (2026-11-18): "Plan 3d", roadmap step 3d in `investigations/2026-11-10-simulator-design-and-roadmap.md`. From the user, 2026-11-14: "remind me of the parameters we are fine tuning at the moment. these probably need to be easily editrable and documented"; "both, but ultimately structured to expand to all"; "maybe as a follow up to the folders refactor (or as part of it) we can make a config.ts which is referenced in wind/ and temp/", "with a config.md beside it"; chose "One config.ts + config.md" as "Its own step after the folders".

## Settled
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

- Manual reviews kept for piece 4 (the screen) and piece 5 (the diagram against the PDF's first page). The user: "Piece 4: the screen (Recommended),Piece 5: the diagram (Recommended)" (2026-11-18)
- The builder runs the pieces straight through: each piece is committed and pushed after its review round and light re-check, verified findings are fixed rather than left open, and choices the plan does not settle are made by the builder, recorded in `plan.md` Notes as "Decided by the builder" and listed at the end; it still stops for the two manual reviews, and for anything that changes a value, departs from the ledger, touches shared state or cannot be undone, or a check it cannot pass. The user: "Straight through, stop for manual reviews" (2026-11-18)

- The builder starts, and with it piece 1 (the temperature's settings in `config.ts`), with no decisions open. The user: "Start it" (2026-11-18)

- Piece 4 approved after the user tried the screen in a browser (the builder could not). The user: "Tried it, approve" (2026-11-18)

## Open
- None.

## Assumed
- The value objects keep today's key order whatever the grouping, since the tuning script and tests rely on it; if a group order would change it, the order is kept explicitly.
- `config.ts` is a leaf: it imports nothing from the models, so no import cycle can form. Values the models share today (`GREENHOUSE_FACTOR`, used by `planet.ts` too, and the exchange solver's iteration cap) move into it, and their old homes read them from there.
- The temperature run's own defaults (`DEFAULT_MAX_YEARS` 60, `DEFAULT_TOLERANCE_K` 0.05) stay as run options in `temperature.ts`: they set how long a run goes, not how the model behaves.
- `config.md` is written by a new npm command (`npm run docs:config`) and checked by a Vitest test that compares the committed page with what the command would write, as the winds baseline test already does; `docs/temperature.md` and `docs/winds.md` point to it.
- The core's `index.ts` also exports `TEMPERATURE_CONFIG` and `WIND_CONFIG`.
- Verification: the values come out identical (a test pins each value object against today's literal values), the Earth temperature baseline is unchanged, the Earth's wind figures are the same bit for bit, and the tuning script lists the same 14 names.
- The config screen reads the same `TEMPERATURE_CONFIG` and `WIND_CONFIG` that the models and `config.md` use, so the three can never disagree.
- Removing the PDF also removes its rows in `README.md` and `docs/development.md` (the climate-process section and its run command), and the Python venv instructions that only it needed.
