# Decisions: Add winds layer

Step 3 of the roadmap (`investigations/2026-11-10-simulator-design-and-roadmap.md`).

## Settled
- Purpose is worldbuilding: believable results and a fast-running simulation beat fidelity (2026-11-10)
- The user wants to be able to alter the rotation rate, as well as the tilt and the star (2026-11-10)
- One issue per build step; this issue is step 3, winds (2026-11-10)
- Architecture as built: the model in the pure `src/core`, run in a Web Worker; the page draws it on the globe (2026-11-10)
- The wind model is chosen after a prototype of both candidates: a first piece builds rough versions of (a) rules plus a pressure map and (b) a simulated atmosphere, and compares them with the real Earth's winds before one is chosen. The user: "Prototype both first" (2026-11-13)
- Rotation becomes a planet setting in this step, as a Day length slider in hours (Earth 24) with a wide range, and a "results are rough" warning outside the range the wind rules are trusted for. The user: "Day length, wide range" (2026-11-13)
- Winds are drawn by a Winds switch, like Sunlight, as arrows over whichever colours are showing (Terrain or Temperature), sized by wind speed; moving streaks come as a last piece of this issue. The user: "Arrows first, streaks later" (2026-11-13)
- Winds only read the temperature in this step; they do not carry heat or change it. Heat carried by winds is for a later step. The user: "No, winds only read it" (2026-11-13)

- The prototypes are judged from a report: a script runs both on the Earth and on invented worlds and writes pictures of the January and July winds beside the real Earth's, with error figures and solve times; the user picks from it. Nothing in the page changes until a model is chosen. The user: "A report with maps and figures" (2026-11-13)
- The page shows observed Earth winds: on an untouched Earth the winds can be simulated or observed, with error figures and a committed baseline guarded by a test. The user: "Yes, in the page" (2026-11-13)
- No time limit is set for a wind solve in advance; the report shows each model's time beside its quality and the user weighs them. The user: "Decide from the report" (2026-11-13)
- Pressure is shown too, as a third colour layer beside Terrain and Temperature, with its own colours, legend and pointer readout. The user: "Yes, a Pressure layer" (2026-11-13)

## Open
- The Day length slider's exact range and the trusted range (the planner's estimate: 3 hours to 30 days, trusted from about 6 to 96 hours).
- The wind's unit in the legend and readout (m/s, km/h or mph).
- Whether the Pressure layer also gets the Earth comparison (observed and difference), as temperature has and winds will.
- Which cases the prototype report shows besides the real Earth (spin, tilt, generated and extreme worlds).
- Whether the issue is split in two, now that it holds a prototype, a new planet setting, observed data, arrows, a Pressure layer and moving streaks.

## Assumed
- Winds and pressure are worked out from the twelve monthly temperature fields and the planet settings, month by month, and shown for the month on screen. On Annual average the arrows show the year's mean wind; on the other temperature summaries they stay on the month last on screen, as the sun does.
- Surface winds only (about 10 m above the ground) and pressure at sea level; no upper-level winds or jet streams until a step needs them.
- A change of Day length recalculates the winds and pressure only; the temperature does not depend on it and is not solved again.
- Winds and pressure are calculated only while the Winds switch is on or the Pressure layer is chosen, as temperature is only while it shows; they need a current temperature, so switching them on works the temperature out first.
- The output is shaped for the later steps: each month's wind as eastward and northward speeds per cell, and the pressure, from which rain (step 4) can take convergence and uplift and currents (step 5) the wind's push on the sea.
- While Winds is on in Terrain view, the month controls show there, as they do for Sunlight.
- Out of scope here: rain, ocean currents, storms (steps 4, 5 and 7); heat carried by winds; tidally locked planets; retrograde rotation.
