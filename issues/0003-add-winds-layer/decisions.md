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

## Open
- How the two prototypes are judged, and who decides: a report with maps and error figures for the user to choose from, or both live in the page. It sets what the first piece builds.
- Whether observed Earth winds are shown in the page (simulated, observed, difference, with an error baseline, as temperature has) or only used by scripts and tests. The prototype comparison needs the observed data either way.
- How long a wind solve may take. It is the main test the simulated atmosphere has to pass.
- Whether pressure is also shown, as a colour layer of its own.
- The Day length slider's exact range and the trusted range (the planner's estimate: 3 hours to 30 days, trusted from about 6 to 96 hours).
- The wind's unit in the legend and readout (m/s, km/h or knots), and what "arrows sized by speed" means at each zoom.
- What the later steps need from this one (rain needs wind direction, uplift and convergence; currents need wind stress), so the output is shaped for them.

## Assumed
- Winds are worked out from the twelve monthly temperature fields and the planet settings, month by month, and shown for the month on screen.
- Surface winds only (about 10 m above the ground); no upper-level winds or jet streams until a step needs them.
- Out of scope here: rain, ocean currents, storms (steps 4, 5 and 7); tidally locked planets; retrograde rotation.
