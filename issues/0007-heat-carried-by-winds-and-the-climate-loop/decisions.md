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

## Open
- The loop's shape: the roadmap's proposal (separate solvers in sequence, repeated until the temperature changes by less than about 0.1 °C; damping if it oscillates) is to be confirmed, with a cap on passes.
- Heat conservation with a converging surface wind: carrying heat with the wind as it is would create heat where the wind converges into lows.
- Where the loop runs: one climate request with the loop in the core (the read's recommendation) or the page driving two requests.
- What the Earth comparison and the baselines do: the temperature baseline will move.
- How day length enters the temperature (only through the winds, or also elsewhere).

## Assumed
