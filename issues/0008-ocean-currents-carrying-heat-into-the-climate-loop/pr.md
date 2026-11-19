# feat: ocean currents carrying heat, with a sea temperature of its own

After step 3b the winds carry heat, but the sea does not move. On the Earth the North Atlantic and Nordic seas come out 4–11 °C too cold (18 °C in January off Norway), which leaves western Europe and Scandinavia 6–9 °C too cold, while the cold-current coasts (Peru, Benguela, the eastern tropical Pacific) are 4–5 °C too warm. The west–east coast contrast is still a quarter to a third of the observed.

The sea gets a temperature of its own, beside the air's, with its top 60 m exchanging heat with the air above it; the model's sea-ice stand-in follows the sea's temperature, so ice cuts the sea off from a cold winter sky. Ocean currents are worked out each month from the winds: wind-driven gyres solved around any coastline (with strong currents along each basin's western side), cold water brought up where the wind pushes coastal water offshore, and a simple overturning that takes heat from a basin's tropics to its open polar end. They carry the sea's heat in the climate loop, so each pass is temperature, winds, then currents.

The page gains a Sea temperature layer, compared with observed sea temperatures, and a Currents overlay drawn with arrows like the winds, compared with observed drifter currents; the new settings appear in the config and on the Model settings screen. Settings start from physical values and are checked against the Earth by region; retuning waits for step 6b.

Not included: real sea ice (step 6), rain (step 4), the deep ocean beyond the overturning's heat term, and retuning other settings.

Closes #15

Progress: the plan checklist on #15.

<!-- For /publish: the final text's "Known limits" comes from the roadmap's "Step 5: left for later steps" section (kept current per piece): Pacific regions and the Europe–Asia contrast for 6b; landDiffusivity not re-derived; equatorial upwelling off (Ekman floor); weak currents (monthly mean stress), Drake, no equatorial currents, Panama at 64; the sea's loss not growing with its temperature; upwelling depth figures unchecked; polar summers for step 6; the slowdown (+46% at 64, +74% at 256). -->
