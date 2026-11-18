# Decisions: one config file for every model's settings

The user's brief (2026-11-18): "Plan 3d", roadmap step 3d in `investigations/2026-11-10-simulator-design-and-roadmap.md`. From the user, 2026-11-14: "remind me of the parameters we are fine tuning at the moment. these probably need to be easily editrable and documented"; "both, but ultimately structured to expand to all"; "maybe as a follow up to the folders refactor (or as part of it) we can make a config.ts which is referenced in wind/ and temp/", "with a config.md beside it"; chose "One config.ts + config.md" as "Its own step after the folders".

## Settled
- One `src/core/config.ts` with a section per model, which `temperature/` and `wind/` read their numbers from; each later model adds its section there. From the roadmap and the user (2026-11-14).
- Each setting carries its value, its unit, one line on what it does, where its starting value comes from (an observed figure, a published figure with its source, or a guess), and whether and against what it was tuned. From the roadmap.
- A `src/core/config.md` beside it, written from `config.ts` by an npm command, with a test that fails when the committed page differs, so it cannot drift; the models' docs point to it; solver settings listed apart from physical ones. From the roadmap.
- No value changes: the Earth temperature baseline unchanged and the Earth's wind figures the same bit for bit; both models stay overridable for a run as now; the page and its workers never override. From the roadmap.

## Open
- The names (`TEMPERATURE_SETTINGS` in `planet.ts` already means something else).
- Whether the tuning script and step 6b read their list of tunable settings from `config.ts`.

## Assumed
