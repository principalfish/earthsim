# feat: heat carried by winds, and the climate loop

Before this change, heat spread evenly between neighbouring cells, so a west coast and an east coast at the same latitude got the same climate. On the Earth the real west coasts at 40–60°N are about 11 K warmer than the east coasts across Europe and Asia (23 K in January), and the model gave almost none of that.

**The winds now carry heat, and the climate is a loop.** Each pass solves the temperature, then the winds from it. The next pass solves the temperature again with heat carried along those winds (implicit upwind, operator-split, heat conserved exactly), then new winds. Pass 1 is today's model bit for bit. The loop stops when the area-weighted rms change between passes is at most 0.1 °C, with a cap of 8 passes. A pass that overshoots the one before is applied at half strength. Only the part of the wind that flows across the surface carries heat (`src/core/wind/flowing.ts`). It is found on the 64 grid for any world and carried up to 128 or 256, so no heat is made where winds converge. Ocean currents and ice will plug into this loop in later steps.

**Settings.** The new `windHeatCapacity` is 1.2e6 J/m²/K, about a kilometre of air. At the old wind response of 3 hPa/K the loop did not settle on the Earth or the generated worlds. So `thermalHpaPerK` is brought down now to its physical value, 0.7, instead of waiting for the tuning step (`lowShiftGain` still waits). Both settings appear in `config.md` and on the Model settings screen. The process diagram shows what is built and what is planned.

**Results on the Earth (64 grid):**
- **Temperature error:** the annual rms is down from 3.93 to 3.66 K, January from 4.45 to 4.06 K, and the coldest month from 5.19 to 4.61 K.
- **West–east contrast:** it now has the right sign but is still well short:
  - Europe W against Asia E is 2.9 K annual and 7.8 K in January. Observed: 11.5 and 22.9.
  - North America W against E is 0.0 and 3.5 K. Observed: 5.8 and 15.1.
- **Winds:** slightly better. The vector error is down from 3.82 to 3.61 m/s, and the share with the right direction is up from 60.9% to 61.2%. The pressure error is slightly worse, up from 7.09 to 7.19 hPa, because the land highs and lows are weaker at 0.7.
- **Baselines:** both are re-recorded through the loop. The temperature baseline gains the coast contrast as a figure of its own.

**Speed:**
- **From nothing:** 4 passes, about 8 s at 64 and 27 s at 256.
- **After an edit:** the loop carries on from the last settled climate and takes 2 passes, about 3 s at 64.
- **Measuring it:** `npm run time:climate` gives the full timings.

**The page and the worker.** One `climate` request replaces the separate temperature and winds requests, and the worker sends each pass as it lands. One scheduler on the page replaces the two:
- **What you see:** the globe shows the first pass at once, then each refinement. The status reads "Calculating climate", then "Refining climate (pass n)". Pressure and Winds always come from the same pass as the temperature on screen.
- **Pause:** it lets the pass under way finish, shows it, then stops. Resume continues from that pass, or from the last settled climate if the world changed while paused.
- **The pass cap:** the 8-pass cap counts afresh for each request.

**Known limits, accepted:**
- **Converging wind:** a purely converging wind comes back as about an eighth of itself rather than zero, because of the two-point couplings on skewed cube cells. Each cell's net outflow is still zero, so the leftover carries heat but makes none.
- **Strong feedback:** the half-step only stops a pass from growing on the one before. It does not damp an oscillation at a stronger feedback, and the setting's entry says so. The shipped settings settle in 4 to 5 passes.

**Not included:**
- ocean currents and rain;
- retuning the other settings;
- the cooling with height over Tibet, and Antarctica (both noted for the tuning step).

**Review.**
- **Per piece:** each of the six pieces had a review round (correctness, security, coverage, docs), a verifier and a light re-check. The re-check findings were fixed in two small commits (`35a6a00`, `a406070`) and in piece 6 itself.
- **Self review** (all five checks, verifier on Opus): five findings, all fixed in `c5061bf`. The one that matters is that a climate carried on after an edit now settles from its second pass at the earliest. Before, a local edit moved the global change by less than the tolerance, so the edited region never saw the winds of its own new temperature. Its light re-check found four wording and test-name points, fixed in `32fd146`.
- **Checks:** security and common-mistakes came back clean, and the verifier dropped two findings. Nothing was skipped. Changed-line coverage is 98%: the uncovered lines are defensive throws and the entry file that starts the real worker.

**Check by hand:**
1. Open the Earth with Temperature on, and watch the passes land and settle.
2. Compare January with today: western Europe should be milder, and East Asia and eastern North America colder.
3. Press Pause and Resume during a refinement, and sculpt during one.

The piece 6 manual review covered these.

Closes #13
