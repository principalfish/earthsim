# Ocean currents carrying heat, with a sea temperature of its own

After step 3b the winds carry heat, but the sea does not move. On the Earth the North Atlantic and Nordic seas come out 4–11 °C too cold (18 °C in January off Norway), which leaves western Europe and Scandinavia 6–9 °C too cold, while the cold-current coasts (Peru, Benguela, the eastern tropical Pacific) are 4–5 °C too warm. The west–east coast contrast is still a quarter to a third of the observed.

The sea gets a temperature of its own, beside the air's, with its top 60 m exchanging heat with the air above it; the model's sea-ice stand-in follows the sea's temperature, so ice cuts the sea off from a cold winter sky. Ocean currents are worked out each month from the winds: wind-driven gyres solved around any coastline (with strong currents along each basin's western side), cold water brought up where the wind pushes coastal water offshore, and a simple overturning that takes heat from a basin's tropics to its open polar end. They carry the sea's heat in the climate loop, so each pass is temperature, winds, then currents.

The page gains a Sea temperature layer, compared with observed sea temperatures, and a Currents overlay drawn with arrows like the winds, compared with observed drifter currents; the new settings appear in the config and on the Model settings screen. Settings start from physical values and are checked against the Earth by region; retuning waits for step 6b.

Not included: real sea ice (step 6), rain (step 4), the deep ocean beyond the overturning's heat term, and retuning other settings.

## Plan

_2026-11-19 · 2 of 9 pieces done · now: piece 3 in progress_

- [x] **1/9 Observed sea temperatures and currents** · `5354dc1`
  The observed sea temperatures (OISST) and drifter currents, built into shipped data files with their loaders.
- [x] **2/9 The sea's own temperature** · `e585ffc`
  Sea cells get a temperature of their own beside the air's, exchanging heat with it; the ice stand-in follows the sea.
- [ ] **3/9 Grid corners** · in progress
  A shared corner index on the globe's grid, with exact flows from corner values and a solve that holds each coast.
- [ ] **4/9 Wind-driven gyres** · not started
  Monthly gyres from the winds on any coastline, with strong currents on each basin's western side.
- [ ] **5/9 Currents carry the sea's heat in the loop** · not started
  Each pass becomes temperature, winds, currents; the sea's heat moves along the currents.
- [ ] **6/9 Upwelling** · not started
  Cold water comes up where the wind pushes coastal water offshore, and at the equator.
- [ ] **7/9 The overturning** · not started
  Heat taken from a basin's tropics to its open polar end; candidate rules measured, you choose.
- [ ] **8/9 The worker, the store and the Sea temperature layer** · not started
  A Sea temperature layer with a Difference view against the observed.
- [ ] **9/9 The Currents overlay, and the finished model's docs** · not started
  Current arrows on the sea, with the observed drifter currents to compare; the diagram and guide updated.
