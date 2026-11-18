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
- **The sea-ice stand-in follows the sea temperature:** the sea becomes icy as it nears freezing (about −1.8 °C), and the ice then cuts the sea off from the air, so the air above can get very cold while the sea stays at freezing; land keeps the air-driven stand-in; real sea ice is still step 6. The user asked "We don't have sea ice yet?" and, after the stand-in was explained, chose "The sea temperature (Recommended)" (2026-11-18)
- **The Temperature layer stays the air's** everywhere, compared with the observed air temperature as now; the sea's own is on the new Sea temperature layer. The user: "The air's, as today (Recommended)" (2026-11-18)
- **Nine pieces** (plan.md), with the page split over two; manual reviews at pieces 8 (the Sea temperature layer) and 9 (the Currents overlay and the finished model). The user: "Pieces 8 and 9 (Recommended)" (2026-11-18)
- **The builder runs straight through, as in 3b:** commit and push after each piece's review round and light re-check (with the verifier), fix verified findings, record "Decided by the builder" choices and list them at the end; it stops for the manual reviews of pieces 8 and 9, the overturning rule choice (piece 7), a region getting clearly worse, the loop not settling within the cap, a data source that can't be reached or shipped, and anything beyond the plan. Re-check findings the verifier upholds come to the user unfixed. The user: "Straight through, as 3b (Recommended)" (2026-11-18)
- **OISST licence accepted as enough to ship:** no explicit public-domain or CC0 text; NOAA PSL asks for acknowledgement, and NOAA's ERDDAP record for the same product says "may be used and redistributed for free"; both quoted in docs/data.md. Piece 1's four re-check findings (the renormalisation test, the development.md rows, the downloadRetry cancel, a comment wrap) are fixed in piece 2's commit. The user: "Accept, fix all four" (2026-11-18)

## Open

## Assumed

- **Air–sea exchange:** a physical bulk value (sensible, latent and long-wave together, of order 15–30 W/m²/K), with its source in the config entry; the air over the sea keeps the air's own heat store.
- **Upwelling's cold water:** a physical estimate of the water below the mixed layer, chosen by the builder with its source and measured against Peru, Benguela, California and the Canaries.
- **The overturning rule on invented maps:** the builder measures two or three candidate rules on the Earth and the generated worlds and stops for the user to choose before it ships, as 3b's piece 4 did.
- **Gyre details left to the builder, measured:** the friction that sets the western boundary current's width per grid size, island constants (the island rule), the circumpolar channel's clamp, the equatorial floor on the Coriolis term, and which grid the gyres are solved on.
- **The loop:** if it does not settle within the 8-pass cap at physical values, the builder measures options and stops for the user, as in 3b.
- **`ui/layerPanel.ts` grows** with the two new entries before the deferred split.

