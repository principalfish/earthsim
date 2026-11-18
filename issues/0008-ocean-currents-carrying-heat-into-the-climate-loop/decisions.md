# Decisions: ocean-currents-carrying-heat-into-the-climate-loop

## Settled

- Step 5 of the roadmap, ocean currents, comes next, before step 4 (rainfall) and before the 3a follow-up (the deeper `layerPanel`/`wiring` splits), which is deferred until before step 4. The user: "Skip to step 5", then "Plan step 5" (2026-11-18)
- From the roadmap (2026-11-10 and 2026-11-18): currents are wind-driven gyres solved from the wind field around coastlines, deep circulation skipped at first; they feed heat back into temperature through the climate loop step 3b built (one pass: temperature, winds, currents, then back); retuning the whole loop waits for step 6b; believable and fast beats faithful.

## Open

- How the currents are found (a linear Stommel-style gyre solve on the sea cells, rules by basin and latitude, or something else).
- The North Atlantic: leave the deep overturning out, or add a simple northward heat term.
- Monthly or yearly currents.
- How the currents' heat enters the temperature (the mixed layer carried along the currents with 3b's advection step, or otherwise).
- What is shown: a currents layer (arrows like the winds), a sea-temperature view, an Earth comparison; observed data and its licence.
- How the result is judged: the Earth's error by region and the coast contrasts, with targets fixed before building.
- The loop: settling with a second feedback within the 8-pass cap.

## Assumed

