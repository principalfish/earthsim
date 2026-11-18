# Decisions: ocean-currents-carrying-heat-into-the-climate-loop

## Settled

- Step 5 of the roadmap, ocean currents, comes next, before step 4 (rainfall) and before the 3a follow-up (the deeper `layerPanel`/`wiring` splits), which is deferred until before step 4. The user: "Skip to step 5", then "Plan step 5" (2026-11-18)
- From the roadmap (2026-11-10 and 2026-11-18): currents are wind-driven gyres solved from the wind field around coastlines, deep circulation skipped at first; they feed heat back into temperature through the climate loop step 3b built (one pass: temperature, winds, currents, then back); retuning the whole loop waits for step 6b; believable and fast beats faithful.
- **Physics in scope:** wind-driven gyres, coastal upwelling (cold water brought up where the wind pushes coastal water offshore), and a simple overturning heat term (some heat taken from a basin's tropics and given to its open polar end), as separate pieces measured one at a time; the rule for which basins get the overturning on invented maps is a guess, measured before it ships. The user: "Gyres + upwelling + overturning (Recommended)" (2026-11-18)
- **The gyre is solved on grid corners:** a shared corner index across the cube's faces, with the gyre's flow pattern (streamfunction) solved there, so the flows are exact (nothing leaks onto land, nothing piles up). The user: "Add grid corners (Recommended)" (2026-11-18)
- **The sea gets a temperature of its own:** a sea-surface temperature beside the air's over sea cells, exchanging heat with it; currents carry the sea's. The user: "Separate sea temperature" (2026-11-18). Saved worlds hold no climate (`src/core/world/serialize.ts`), so no saved file changes.
- **Judged by physics, then a sanity check:** settings start from physical values; the builder measures the Earth by region and the coast contrasts and stops for the user if a region gets clearly worse; no chasing the Earth's figures until step 6b. The user: "Physics, then a sanity check (Recommended)" (2026-11-18)
- **Sea temperature first:** piece 1 adds the sea's own temperature and the air–sea exchange, with no currents, measured against observed sea temperatures; then the corner grid and gyres, upwelling, overturning, and the page, each measured on its own. The first climate pass is no longer today's model bit for bit, and both baselines are re-recorded. The user: "Sea temperature first (Recommended)" (2026-11-18)
- **On screen:** a Sea temperature layer (colour map, with Difference against observed sea temperatures, OISST v2 1991–2020 1°, public domain) and a Currents overlay drawn with arrows like the winds (compared with the drifter climatology, CC-BY, credited in docs/data.md). The user: "Sea temp layer + currents overlay (Recommended)" (2026-11-18)
- **Monthly currents:** 12 gyre solves a pass, following the winds; cost measured in the piece. The user: "Monthly (Recommended)" (2026-11-18)

## Open

- Sea ice with a sea temperature: which temperature decides the ice share (the user asked "We don't have sea ice yet?": explained the stand-in, asked again).
- What the Temperature layer shows over the sea once there are two temperatures (the air's, as today, compared with the observed air temperature).
- The air–sea exchange strength (a physical bulk value expected).
- The loop: settling with a second feedback within the 8-pass cap.

## Assumed

