# Decisions: Add winds layer

Step 3 of the roadmap (`investigations/2026-11-10-simulator-design-and-roadmap.md`).

## Settled
- Purpose is worldbuilding: believable results and a fast-running simulation beat fidelity (2026-11-10)
- The user wants to be able to alter the rotation rate, as well as the tilt and the star (2026-11-10)
- One issue per build step; this issue is step 3, winds (2026-11-10)
- Architecture as built: the model in the pure `src/core`, run in a Web Worker; the page draws it on the globe (2026-11-10)
- The wind model is chosen after a prototype of both candidates: a first piece builds rough versions of (a) rules plus a pressure map and (b) a simulated atmosphere, and compares them with the real Earth's winds before one is chosen. The user: "Prototype both first" (2026-11-13) **Superseded 2026-11-13:** only the rules model was prototyped; see the last Settled line.
- Rotation becomes a planet setting in this step, as a Day length slider in hours (Earth 24) with a wide range, and a "results are rough" warning outside the range the wind rules are trusted for. The user: "Day length, wide range" (2026-11-13)
- Winds are drawn by a Winds switch, like Sunlight, as arrows over whichever colours are showing (Terrain or Temperature), sized by wind speed; moving streaks come as a last piece of this issue. The user: "Arrows first, streaks later" (2026-11-13)
- Winds only read the temperature in this step; they do not carry heat or change it. Heat carried by winds is for a later step. The user: "No, winds only read it" (2026-11-13)

- The prototypes are judged from a report: a script runs both on the Earth and on invented worlds and writes pictures of the January and July winds beside the real Earth's, with error figures and solve times; the user picks from it. Nothing in the page changes until a model is chosen. The user: "A report with maps and figures" (2026-11-13)
- The page shows observed Earth winds: on an untouched Earth the winds can be simulated or observed, with error figures and a committed baseline guarded by a test. The user: "Yes, in the page" (2026-11-13)
- No time limit is set for a wind solve in advance; the report shows each model's time beside its quality and the user weighs them. The user: "Decide from the report" (2026-11-13)
- Pressure is shown too, as a third colour layer beside Terrain and Temperature, with its own colours, legend and pointer readout. The user: "Yes, a Pressure layer" (2026-11-13)

- The Day length slider runs from 3 hours to 30 days, with the "results are rough" warning outside about 6 to 96 hours (the planner's estimate of where the wind rules hold, to be checked by the prototype). The user: "3 hours to 30 days" (2026-11-13)
- Wind speed can be shown in m/s, km/h or mph, chosen by an option in the page's settings; the default is m/s. The user: "option to use any of these somewhere in settings. default to m/s" (2026-11-13)
- The Pressure layer gets the Earth comparison too: on an untouched Earth it offers simulated, observed and difference with error figures. The user: "Yes" (2026-11-13)
- The prototype report shows, for both models, the real Earth in January and July and four further cases: fast and slow spin (an 8-hour and a 4-day day), tilt extremes (0° and 60°), a generated world with 30% land, and an ocean world and a one-continent world. The user chose all four (2026-11-13)

- The work stays one issue, not two. The user: "Keep one issue" (2026-11-13)

- The ledger is complete and the issue text approved. The user: "Approve, plan it" (2026-11-13)

- All ten proposed manual reviews are kept: pieces 4, 5, 6, 9, 10, 11, 12, 13, 14 and 15. The user: "Keep all ten" (2026-11-13)
- The builder runs as issue 0002's did: the builder session on the planner chat's model, implementation subagents on Opus, not on Sonnet as the models guide's experiment says. The user: "Same as last time" (2026-11-13)

- Piece 2 replaces piece 1's private east/north helper with the shared one. The user: "Yes, replace it" (2026-11-13)
- The builder's analysis loop stops once a round finds nothing above low severity, for the rest of this issue. The user: "Yes, stop at low only" (2026-11-13) **Superseded 2026-11-14:** see the one-round line below.
- Day length is one full turn of the planet: the spin rate is one turn per day length, not corrected for the year, so a change of star or orbit never changes the winds (Earth's spin comes out 0.3% slow). The user: "One full turn (Recommended)" (2026-11-13)
- Piece 3 does day length in the core and the worker protocol only; the page side of "day length alone never re-solves the temperature" goes with the slider in piece 10. The user: "With the slider, piece 10 (Recommended)" (2026-11-13)
- The wind report works out every case on the 64 grid; solve times at 64, 128 and 256 are measured on the Earth only. The user: "64 for all cases (Recommended)" (2026-11-13)
- The report draws pressure colours as a small image embedded in each SVG map (Node's built-in zlib, no new package), with coast, arrows and key as SVG on top. The user: "Small embedded image (Recommended)" (2026-11-13)
- The report's one-continent world has one continent of about 20% of the surface from about 15°S to 55°N. The user: "15°S to 55°N (Recommended)" (2026-11-13)
- When a wind model gives a value that is not a number, the report replaces that case's maps for that model with a note naming the month and field, prints a warning and carries on with the other cases (piece 5 may touch `scripts/report/run.ts` and `page.ts` for this). The user: "Note it, carry on (Recommended)" (2026-11-13)
- Each prototype is tuned only until it is right in kind: on the Earth easterly trades, westerlies and the South Asian monsoon reversal, and every other case right in kind; error figures reported without a target; what it gets wrong listed; how much tuning each had stated, so the comparison is fair. The user: "Right in kind (Recommended)" (2026-11-13)
- The piece 6 summary checks both models on the 60° tilt case against published high-tilt runs: do the westerlies and trades survive (Ferreira et al. 2014), and does the tropical belt swing far into the summer hemisphere as one broad cell (Lobo and Bordoni 2020). The user: "yes add those checks" (2026-11-13)
- The piece 6 summary also checks both models on the 8-hour and 4-day cases against published rotation-rate studies: more, narrower bands and the tropical edge near 0.6 of Earth's latitude at three times Earth's spin; a tropical cell about twice as wide at a quarter of it. The user: "yes" (2026-11-13)
- Piece 5: the "with no tilt January equals July" assertion is restored (it undoes a round 1 fix), and the smoothing's shorter reach at cube corners stays as a known limit pinned by a test, to be fixed when the wind model is chosen. The user: "Tried it, approve both" (2026-11-13)
- The simulated atmosphere is deferred to the end of the roadmap and not prototyped in this issue; the wind model is the rules model. Reason: by the builder's and the planner's estimates (unmeasured) it would take minutes per world against half a second, and the project puts a fast-running simulation first. Piece 6 is dropped; piece 7 takes over its three literature checks and the ocean world at 60° tilt, and looks at pressure bands that vary by longitude. The user: "ok lets maybe defer the simulated atmosphere til the end of the roadmap - if you are confident it will take so long to solve then its not worth doing here yet", then "Yes, defer it" (2026-11-13)
- Piece 7 is split in three: 7a the model made real (with the cube-corner fix), 7b the ninth report case and the three literature checks, 7c the improvements. The user: "Three pieces (Recommended)" (2026-11-13)
- Build order: 7a, then 8 and 9 (winds on the globe), then 7b and 7c, then 10 onward; the baseline (piece 14) comes after 7c. The planner recommended this; the builder recommended improvements first. The user: "Globe first (Recommended)" (2026-11-13)
- Every world's winds are solved on the 64 grid and refined to the world's own grid, about half a second at every size; the difference from a solve on the world's own grid is measured and stated. The user: "Always 64, refined (Recommended)" (2026-11-13)
- Refined 2026-11-13 on the builder's measurements: the costly part of the wind solve stays at 64, the pressure is refined to the world's own grid, and the winds are worked out there from each cell's own land, sea and height (within about 1 m/s of a full solve, against up to 10 m/s at coasts when the winds themselves are refined; about 1 s a year at 256). The user: "Refine the pressure (Recommended)" (2026-11-13)
- The model's improvements are judged right in kind and time-boxed (stop when the listed faults are better in kind or after about ten tuning rounds; keep a change only if no case gets worse in kind). Each Earth figure may worsen by up to 2% of its value from non-tuning changes; any trade between figures comes to the user with the numbers before it is kept. The user: "Right in kind, small margin (Recommended)" (2026-11-13)
- Piece 7c adds a soft cap on cold highs, set well above the warm cap so the Earth is unchanged, to stop runaway pressure on extreme worlds; checked on the 60° cases and a cold, distant-orbit world. The user: "yes" (2026-11-13)
- Piece 7c builds a tuning script (`npm run tune:winds`) that sweeps and searches the model's settings and prints the Earth's error figures; it proposes values and does not judge: a value is kept only if the other cases stay right in kind and the literature checks hold, to guard against overfitting to the Earth. The user: "yes definitely construct a script for 7c" (2026-11-13)
- The page side of "day length alone never re-solves the temperature" is done in piece 8, not piece 10 (this replaces the earlier "With the slider, piece 10"): a day-length change alone goes to the winds only. The user: "Do it in piece 8 (Recommended)" (2026-11-13)
- An overtaken wind solve is left to finish and its answer ignored, keeping the worker and its grid tables. The user: "Let it finish, ignore it (Recommended)" (2026-11-13)
- From piece 8's current round onward, review follows the framework's one-round rule: one round of checks and the verifier, every verified finding fixed, one light re-check by the checks that raised findings; anything the re-check verifies is not fixed but comes to the user at the review pause with the options. This replaces "stop at low only" and the user's "iterate as long as you need" for this issue. The user: "Yes, one round" (2026-11-14)
- Wind arrows are dark with a thin light edge, so they read on every colour scheme. The user: "Dark, with a light edge (Recommended)" (2026-11-14)
- Arrows keep the same size on the screen; zooming in brings more arrows at a finer spacing, in steps, and the key stays fixed. The user: "Same size, more arrows (Recommended)" (2026-11-14)
- Each arrow shows the mean wind over the patch it stands for, becoming the single cell's wind when zoomed right in. The user: "Mean over its patch (Recommended)" (2026-11-14)
- Piece 9 approved after the manual review, with the arrows as built: spacing 8° to 2°, the key as it is, the ragged doc comment accepted. The user: "ok looks good", then "Tried it, approve as is" (2026-11-14)
- Piece 7b: if a paper does not say what the plan expects, the builder stops before writing that check and the difference comes to the user. The user: "Stop and ask (Recommended)" (2026-11-14)
- Piece 7b: the two high-tilt checks read January and July; the day-length check reads the annual mean. The user: "Solstices for tilt (Recommended)" (2026-11-14)
- Piece 7b: the report keeps nine cases; no ocean worlds are added for the day-length check, and the section says continents are present. The user: "Keep nine cases (Recommended)" (2026-11-14)
- Piece 7b: whenever a paper's result cannot be read in the paper itself (abstract only, or not reached), the builder flags it to the user at once, before writing that check, and never presents it as confirmed; the report and the review request carry an access table. The user: "please flag when you can't access paper results - it is important to get this right" (2026-11-14)
- Piece 7b check (a) asks, on the 60° cases in each solstice month, for summer-hemisphere mid-latitude westerlies, easterlies in the deep tropics and weak winter-hemisphere winds, as Ferreira et al. 2014 report at 90° (and weak mid-latitude winds in both hemispheres at 54°). The user: "The fuller wording (Recommended)" (2026-11-14)
- Piece 7b check (b) rests on Lobo and Bordoni 2020's abstract, marked "abstract only" (the full text could not be reached), with Ferreira et al.'s own text cited beside it. The user: "Accept the abstract (Recommended)" (2026-11-14)
- Piece 7b check (c) adds Kaspi and Showman 2015 as the source for the cell widths, read off its Fig. 6a to about ±2°; Held and Hou 1980 stays as the steeper theory and Way et al. 2018 for the cell reaching the pole by about 16 days. The user: "Add Kaspi and Showman (Recommended)" (2026-11-14)
- The slow-end note cites Way et al. 2018 ("between 32 d and 64 d"); Salameh et al. 2018, not reached, is dropped. The user: "Cite Way, drop Salameh (Recommended)" (2026-11-14)
- Matching the papers or the Earth exactly is not the aim. 7b reports what the model shows against each paper and changes nothing to match; 7c's tuning stops when the listed faults are better in kind, when two rounds running bring no clear gain, or at ten rounds at most, and then reports what still differs. The user: "lets not get too caught up making this perfect - dont over iterate trying to match . flag results after an appropriate number of iterations" (2026-11-14)
- The Planet section's winds note also warns when the axial tilt is above 54° (where the poles get more sunlight over the year than the equator), since piece 7b found the model least like the published studies at a steep tilt; built in piece 10 with the day-length note. The user: "add that warning yes" (2026-11-14)
- Piece 7c is split in two: 7c-1 the tuning script and the small fixes, 7c-2 bands by longitude and the tuning. The user: "Two pieces (Recommended)" (2026-11-14)
- At a steep tilt the low is held at about 70°, with no forced high beyond it, instead of reaching the summer pole (this changes the 60° maps approved in piece 5; before and after to be shown). The user: "Hold it at about 70° (Recommended)" (2026-11-14)
- Only the band nearest the pole is weakened, not every band beyond the second, so a fast-spinning planet's middle bands show. The user: "Weaken only the last band (Recommended)" (2026-11-14)
- The tuning search lowers the Earth's wind difference and may not worsen the direction share or the pressure difference; trades between figures come to the user. The user: "Wind difference first (Recommended)" (2026-11-14)
- The flaky observed-temperature test gets a timeout in piece 2. The user: "Yes, fold it in" (2026-11-13)

- Piece 2 adds a direct Laplacian operator, accurate at the cube's seams. The user: "A: add it now" (2026-11-13)

- Before piece 2 is committed, its accuracy tests also measure the cells between the outermost ring and an eighth of the way into each face (where the seam stencils are used), held to the same bound as edge and corner cells. The user: "Yes, add that test" (2026-11-13)

## Open
- None.

## Assumed
- Winds and pressure are worked out from the twelve monthly temperature fields and the planet settings, month by month, and shown for the month on screen. On Annual average the arrows show the year's mean wind; on the other temperature summaries they stay on the month last on screen, as the sun does.
- Surface winds only (about 10 m above the ground) and pressure at sea level; no upper-level winds or jet streams until a step needs them.
- A change of Day length recalculates the winds and pressure only; the temperature does not depend on it and is not solved again.
- Winds and pressure are calculated only while the Winds switch is on or the Pressure layer is chosen, as temperature is only while it shows; they need a current temperature, so switching them on works the temperature out first.
- The output is shaped for the later steps: each month's wind as eastward and northward speeds per cell, and the pressure, from which rain (step 4) can take convergence and uplift and currents (step 5) the wind's push on the sea.
- While Winds is on in Terrain view, the month controls show there, as they do for Sunlight.
- Out of scope here: rain, ocean currents, storms (steps 4, 5 and 7); heat carried by winds; tidally locked planets; retrograde rotation.
- The wind unit option sits in the View section and is remembered by the browser, like which panel sections are open; it is not saved with the world.
- Pressure is shown in hectopascals (the same as millibars), with no unit option.
- The observed winds and pressure come from the same source as the observed temperature, NOAA's 20th Century Reanalysis v3 long-term monthly means: the 10 m eastward and northward winds and the mean sea-level pressure. NOT VERIFIED: NOAA's download server did not answer on 2026-11-13 (even the temperature file timed out), so the file names and folders are unconfirmed. The builder's first check; if the files are not there, come back to the user with alternatives before building on another source.
