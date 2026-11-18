# Decisions: ocean-currents-carrying-heat-into-the-climate-loop

## Settled

- Step 5 of the roadmap, ocean currents, comes next, before step 4 (rainfall) and before the 3a follow-up (the deeper `layerPanel`/`wiring` splits), which is deferred until before step 4. The user: "Skip to step 5", then "Plan step 5" (2026-11-18)
- From the roadmap (2026-11-10 and 2026-11-18): currents are wind-driven gyres solved from the wind field around coastlines, deep circulation skipped at first; they feed heat back into temperature through the climate loop step 3b built (one pass: temperature, winds, currents, then back); retuning the whole loop waits for step 6b; believable and fast beats faithful.
- **Physics in scope:** wind-driven gyres, coastal upwelling (cold water brought up where the wind pushes coastal water offshore), and a simple overturning heat term (some heat taken from a basin's tropics and given to its open polar end), as separate pieces measured one at a time; the rule for which basins get the overturning on invented maps is a guess, measured before it ships. The user: "Gyres + upwelling + overturning (Recommended)" (2026-11-18)
- **The gyre is solved on grid corners:** a shared corner index across the cube's faces, with the gyre's flow pattern (streamfunction) solved there, so the flows are exact (nothing leaks onto land, nothing piles up). The user: "Add grid corners (Recommended)" (2026-11-18)
- **The sea gets a temperature of its own:** a sea-surface temperature beside the air's over sea cells, exchanging heat with it; currents carry the sea's. The user: "Separate sea temperature" (2026-11-18). Saved worlds hold no climate (`src/core/world/serialize.ts`), so no saved file changes.
- **Judged by physics, then a sanity check:** settings start from physical values; the builder measures the Earth by region and the coast contrasts and stops for the user if a region gets clearly worse; no chasing the Earth's figures until step 6b. The user: "Physics, then a sanity check (Recommended)" (2026-11-18)

## Open

- What the separate sea temperature changes: the order of pieces (sea temperature first?), pass 1 no longer today's model, the air–sea exchange, what the Temperature layer shows over the sea.
- Sea ice with a sea temperature: which temperature decides the ice share.

- Monthly or yearly currents.
- What is shown: a currents layer (arrows like the winds), a sea-temperature view, an Earth comparison; observed data and its licence.
- The loop: settling with a second feedback within the 8-pass cap.

## Assumed

