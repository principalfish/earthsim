# Decisions: heat carried by winds, and the climate loop

The user's brief (2026-11-18): "Plan 3b", roadmap step 3b in `investigations/2026-11-10-simulator-design-and-roadmap.md`, after the user reordered the climate steps as "3b, then 5, then 4" (2026-11-18): this step builds the loop that step 5's ocean currents plug into.

## Settled
- The climate loop's purpose: the first feedback into the temperature (heat carried by the winds), and the loop that later feedbacks (ocean currents in step 5, ice and snow in step 6) plug into. Heat carried by winds should give mild west coasts and cold east coasts at mid-latitudes, and set how far inland the sea's influence reaches. From the roadmap.
- The climate is already worked out after every change, with Pause, since step 3c (issue 0004); this step keeps that.
- Retuning waits for step 6b: note what moves (`lowShiftGain`, `thermalHpaPerK` should come back towards their natural values when the temperature improves), do not chase the Earth's figures here. The user, 2026-11-14 ("Leave it for later") and the roadmap.
- Winds too strong on slow spinners is a rule to fix in step 6b, not here. The user, 2026-11-14: "Leave it for later".
- Ocean currents are step 5, after this one; rain and Köppen zones are step 4, after step 5. The user, 2026-11-18: "3b, then 5, then 4".
- The models' settings live in `src/core/config.ts` (step 3d), so any new setting goes there with its explanations, and appears on the Model settings screen and in `config.md`.

- What the reads found is in `sweeps-2026-11-18.md` beside this file: winds explain about a quarter of the Earth's temperature error (the missing west–east coast contrast, east coasts 14–17 K too warm in January); the rest is ocean, sea ice and snow, high ground and ice sheets, and a summer cold bias over northern land.
- Scope: the loop and heat carried by winds only. The too-strong cooling with height (Tibet about 12 K too cold) and Antarctica too warm (about 8 K) are recorded for step 6b, not fixed here; the Earth figures will move only modestly. The user: "Winds and loop only (Recommended)" (2026-11-18)
- The temperature solver takes heat carried by the wind as a separate step each time-step (an operator split): today's symmetric solve stays as it is, and a cheap step moves heat downwind. The user: "Separate wind step (Recommended)" (2026-11-18)
- The new setting for how strongly the wind carries heat (in effect the depth of air that moves it) starts from a physical estimate and is checked against the Earth's west–east coast contrast landing in a believable range (observed about 11 K, western Europe against East Asia, 40–60°N); only this new setting is set, nothing else is retuned. The user: "Physics, then a sanity check (Recommended)" (2026-11-18)
- The page shows each pass: the first pass (today's temperature and winds) appears at once, each later pass replaces it as it lands, and the status says which pass it is on; Pause lets the pass under way finish, then stops, and resume carries on from there. The user: "Show each pass (Recommended)" (2026-11-18)

- Heat is carried by the wind's flowing part only: before carrying heat, the converging part of each month's surface wind is removed (one quick solve per month with the existing solver), so heat is moved around and never made. The converging air rises and takes its heat away, which a surface-only model cannot follow. The user: "Use the wind's flowing part (Recommended)" (2026-11-18)
- The loop stops when no cell's monthly temperature changes by more than 0.1 °C between passes, with a cap of 6 passes; if a pass overshoots, only half its change is applied. The user: "0.1 °C, at most 6 passes (Recommended)" (2026-11-18)
- One climate request: the loop lives in the core as one function, the worker runs it and reports each pass, and the page's separate temperature and wind requests become one climate request with one scheduler. About 190 test sites change. The user: "One climate request (Recommended)" (2026-11-18)
- Both Earth baselines are re-recorded with the new figures, shown in the review, and the west–east coast contrast becomes a figure of its own in the temperature baseline, so a later step cannot quietly lose it. The user: "Re-record, add the coast contrast (Recommended)" (2026-11-18)

## Open
- None.

## Assumed
- Day length enters the temperature only through the winds (their turning and band widths); the heat exchange between neighbours does not change with it. The temperature's start record and the day-length tests change accordingly.
- The first pass is today's temperature and winds unchanged, so a world with no wind effect looks as it does now; each later pass feeds the previous pass's winds into the temperature.
- Warm starts come only from a settled result, never from a pass shown on the way.
- A new world or an edit during the loop stops it and starts again, as a new solve does today; Pause lets the pass under way finish.
- The settled wind heat carries the winds' own baseline and comparison forward; the winds are re-solved from the final temperature each pass.
- The status line names the pass ("Refining climate (pass 2)"); the progress bar does not drop back to 0 between passes.
- New settings (the heat-carrying depth, the loop's 0.1 °C and 6 passes, the half-step on overshoot) go in `config.ts` with their explanations, so they appear on the Model settings screen and in `config.md`; the climate process diagram's "Built today" line is updated.
- Two loops, nested: the wind's heat goes in inside the temperature's existing time-stepping (each step, a downwind step after today's exchange solve, with that pass's monthly winds held fixed), and the winds are re-solved only between passes, in the new outer climate loop. Each pass after the first is a warm-started temperature solve (usually about one model year) plus a winds solve. Answers the user's question "are doing this within the existing loops, or as a separate set of loops after each temp lopo?" (2026-11-18).
