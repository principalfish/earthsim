# Decisions: Add winds layer

Step 3 of the roadmap (`investigations/2026-11-10-simulator-design-and-roadmap.md`). The discussion has not started: on 2026-11-13 the user asked for the README to be rewritten first ("before starting the analysis, can you quickly update the readme to be more human readable and less verbose! split into different documents if needed"), then the winds analysis.

## Settled
- Purpose is worldbuilding: believable results and a fast-running simulation beat fidelity (2026-11-10)
- The user wants to be able to alter the rotation rate, as well as the tilt and the star (2026-11-10)
- One issue per build step; this issue is step 3, winds (2026-11-10)
- Architecture as built: the model in the pure `src/core`, run in a Web Worker; the page draws it on the globe (2026-11-10)

## Open
- How the winds are modelled: scaling rules that lay out the wind bands from rotation rate and temperature contrast plus land-sea pressure contrasts (the roadmap's proposal), or a simple dynamic atmosphere. It sets the cost, the risk and how far non-Earth planets can be trusted.
- Rotation rate (or day length) as a planet setting: its range, and what the page says outside the range the wind rules are trusted for.
- What is shown: surface winds only or also pressure; arrows, streamlines or moving particles; over which colours; monthly like temperature.
- Whether winds feed back into temperature in this step (heat carried by the winds), or only read it.
- Whether the Earth comparison gets observed winds, and an error baseline, as temperature has.
- What the later steps need from this one (rain needs wind direction, uplift and convergence; currents need wind stress), so the output is shaped for them.

## Assumed
- Winds are worked out from the twelve monthly temperature fields and the planet settings, month by month.
- Out of scope here: rain, ocean currents, storms (steps 4, 5 and 7).
