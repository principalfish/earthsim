# Decisions: heat carried by winds, and the climate loop

The user's brief (2026-11-18): "Plan 3b", roadmap step 3b in `investigations/2026-11-10-simulator-design-and-roadmap.md`, after the user reordered the climate steps as "3b, then 5, then 4" (2026-11-18): this step builds the loop that step 5's ocean currents plug into.

## Settled
- The climate loop's purpose: the first feedback into the temperature (heat carried by the winds), and the loop that later feedbacks (ocean currents in step 5, ice and snow in step 6) plug into. Heat carried by winds should give mild west coasts and cold east coasts at mid-latitudes, and set how far inland the sea's influence reaches. From the roadmap.
- The climate is already worked out after every change, with Pause, since step 3c (issue 0004); this step keeps that.
- Retuning waits for step 6b: note what moves (`lowShiftGain`, `thermalHpaPerK` should come back towards their natural values when the temperature improves), do not chase the Earth's figures here. The user, 2026-11-14 ("Leave it for later") and the roadmap.
- Winds too strong on slow spinners is a rule to fix in step 6b, not here. The user, 2026-11-14: "Leave it for later".
- Ocean currents are step 5, after this one; rain and Köppen zones are step 4, after step 5. The user, 2026-11-18: "3b, then 5, then 4".
- The models' settings live in `src/core/config.ts` (step 3d), so any new setting goes there with its explanations, and appears on the Model settings screen and in `config.md`.

## Open
- The first job: how much of the Earth's temperature error sits where winds would help (mid-latitude west and east coasts, continental interiors) and how much where they would not (the North Atlantic, sea-ice edges, high ground).
- The loop's shape: the roadmap's proposal (separate solvers in sequence, repeated until the temperature changes by less than about 0.1 °C, the first pass as today, damping if it oscillates) is to be confirmed.
- How the temperature solver takes heat carried one way (today it relies on symmetric exchange between neighbours), and the day-length dependence that comes with it.
- How the worker changes from one request per layer to one climate solve, and what the page shows while the loop refines (the first pass at once, then refined).
- What the Earth comparison and the baselines do: the temperature baseline is expected to move; whether that is checked against a target or simply re-recorded.

## Assumed
