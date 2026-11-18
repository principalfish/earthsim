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

## Open
- The names (`TEMPERATURE_SETTINGS` in `planet.ts` already means the five planet fields the temperature reads).
- Where the long references and reasoning in today's doc comments go.
- How the settings are grouped.

## Assumed
