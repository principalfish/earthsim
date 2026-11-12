# Resume: add-seasonal-temperature-layer-and-planet-controls

_Updated 2026-11-12, with piece 9 committed and piece 10 waiting for its briefing and the user's go-ahead._

## Where it stands

- Pieces 1 to 9 of 13 are committed and pushed: `8390675`, `0c19852`, `4a1e290`, `1445e44`, `ff500c7`, `533ef95`, `fd8e21f`, `63364cf`, `140a260`. Branch `claude/add-seasonal-temperature-layer-and-planet-controls-f645fa`, draft PR #4, GitHub issue #3.
- Piece 9 was committed on 2026-11-12 after the user's manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 10 and starts it only on the user's go-ahead.
- Piece 8 was committed on 2026-11-12 after the user's manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 9 and starts it only on the user's go-ahead.
- Piece 7 was committed on 2026-11-12 after the user's second manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 8 and starts it only on the user's go-ahead.
- Pieces 8 to 13 each have a manual review: relay an approval only when the user's words say they tried it.

## Pending with the user

Nothing. Piece 9 is committed and pushed (`140a260`). The user started piece 10, the planet panel, on 2026-11-12 ("Start it") with: rough note "Sunlight and greenhouse"; undo "No, reset button only". The builder stops with a review request before committing; lead the review briefing with the manual review (each slider in turn on an Earth world in Temperature view; tilt 0 removes the seasons; the note at the extremes; a refresh restores the settings), report the measured band and whether the combined measure worked, and relay approval only when the user's words say they tried it. Then: value under the cursor (11; ask where the readout should go now that sections collapse and the legend moves over the globe), Earth comparison (12), the sun (13), collapsible panel sections and the legend over the globe (14, added 2026-11-12 at the user's request; planned, manual review confirmed), the all-pieces recap, `/review self`, `/publish`. The plan has 14 pieces; commit titles from piece 10 use `piece <n>/14`.

Nothing. The user approved piece 9 on 2026-11-12 after the manual review ("Tried it, approve"); the builder commits and pushes it, then stops with a look-ahead for piece 10, the planet panel. Then: tick piece 9, brief piece 10 (its manual review was confirmed at planning, "Keep all five"; defaults to raise from the plan's Notes: logarithmic sliders for brightness and distance, a reset-to-Earth button, planet changes not undoable with Ctrl+Z; and where the "results are rough" note starts, the builder suggesting 0.85 to 1.25 times Earth's sunlight), and ask before it starts.

**Piece 9's review request:** built, uncommitted (HEAD `63364cf`, 19 files). The user tries it on their own dev server (http://localhost:5176/; reload so the worker reloads): Earth at 256 in Temperature (first result in about 5 s, was 29), sharp mountains, smooth coasts with no two-by-two blocks, no seams along cube edges or at the eight corners (about 35° north and south at longitudes 45, 135, -45, -135), narrow land in Seasonal range, a tapped island at 128 dropping out, the same at 128, then a sea-level drag and a stroke. Relay approval only when their words say they tried it. Results told to them: Node cold Earth 0.85 s at 128 (4.62 before) and 3.40 s at 256 (21.04); browser page first result 5.0 s at 256 and 1.9 s at 128; coarse against full 0.098 K RMS and 1.36 K worst cell at 128, 0.065 and 0.92 at 256; main Earth error table moved by at most 0.06 K; the three derived figures still move by 0.2 K (accepted); the structured stencil gained under 5% and was removed; the coarse first guess gained 5 to 10% and was kept; the builder has not itself judged the look at coasts and cube edges. After the commit: brief the planet panel (10) and raise the trust band for the sunlight note.

Nothing. The user accepted the 0.2 K shift in the three derived Earth figures on 2026-11-12 ("Accept"). Piece 9 is built and uncommitted: (a) and (b) in, the coarse first guess kept, the structured stencil measured and removed. Review round 1 found a geometry defect in the interpolation beside cube edges (verified, being fixed) and eight small items; every bound is re-measured after the fix. The builder was told to carry on to the review request if the derived figures still move by about 0.2 K or less, and to stop and report if any moves by 0.3 K or more or a bound fails. Then: the review briefing, leading with the manual review (the coarser solve's look at 128 and 256), with the before-and-after timing table in Node and in a browser worker; relay approval only when the user's words say they tried it. After piece 9: the planet panel (10), where the trust band for the sunlight note is raised.

**Piece 9, builder's question.** Parts (a) and (b) are built, uncommitted, and every acceptance bound passes (coarse against full: Earth 128 0.098 K RMS and 1.36 K worst cell, Earth 256 0.065 and 0.92; cold Earth in Node 0.83 s at 128 from 4.62 and 3.68 s at 256 from 21.04; main Earth error table moved by at most 0.06 K) except, on one reading, "Earth error figures within 0.1 K of piece 4's": three derived figures in the timing script's secondary tables moved by 0.2 K (northern land July less January at 128 from 18.2 to 18.4 and at 256 from 17.9 to 18.1, towards the observed 22.4; 80 to 90° N in November, simulated less observed, from +16.2 to +16.4, away from it), from smoothing at coasts. Asked of the user: accept (read the bound as the main error table; builder's and planner's recommendation) or not (the only lever is interpolating land and sea separately, which the assessment found worse). The builder measures (c) and (d) meanwhile and holds its review request for the answer.

Nothing. The user started piece 9 on 2026-11-12 ("Start it"; manual review "Keep it"; scope "All four", "Yes, 128 too"). The builder stops with a review request before committing, or earlier if an acceptance bound fails (it then reports the figures; the choice may include keeping 128 worlds on their own grid). Lead the review briefing with the manual review (the coarser solve's look at 128 and 256: speed, sharp mountains, no blocky coasts, no seams, a small island and a narrow land bridge), give the timing table before and after, and relay approval only when the user's words say they tried it. After piece 9: the planet panel (10), where the trust band for the sunlight note is raised.

Piece 8 is committed and pushed (`63364cf`). The piece 9 briefing has been given. Waiting on: whether to keep piece 9's proposed manual review (the coarser solve's look at 128 and 256), and the go-ahead to start. Set by the planner from the builder's look-ahead and told to the user: the rough guess and its 50 K fallback are removed outright (the drift limit replaces them); interpolation is carried across cube edges; sea-level temperature is interpolated without regard to land and sea (the assessment found a coast-aware version worse); a coarse cell is land by its area-mean elevation, so islands and land bridges narrower than a coarse cell vanish from the solve; months-only starts are dropped; if an acceptance bound fails the builder reports the figures and stops. The builder thinks the 2 K worst-cell bound is the likeliest to fail, at coasts, and more so for 128 worlds on the 64 grid.

Nothing. The user approved piece 8 on 2026-11-12 after the manual review ("Tried it, approve"); the builder commits and pushes it, then stops with a look-ahead for piece 9. Then: tick piece 8, brief piece 9 (solver speed-ups: "All four", "Yes, 128 too"; confirm its proposed manual review of the coarser solve's look), and ask before it starts.

**Piece 8's review request:** built, uncommitted (HEAD `fd8e21f`, 13 files). The user repeats their freeze sequence on their own dev server (http://localhost:5176/; reload so the worker reloads): Earth at 64, Temperature, sculpt a tall mountain, sea level to -6,000 m (the world freezes, as the model says it should), back to 0 m (the legend and colours return to what they were), one more stroke (a quick one-year re-solve). Relay approval only when their words say they tried it. Told to them: every sea-level change is now a fresh solve (about 25 to 29 s at 256 until piece 9); a new refusal of worlds with sea level outside ±12,000 m; the test suite is about 8 s slower. After the commit: brief piece 9 and confirm its proposed manual review.

Nothing. The user confirmed the drift limit with the corrected figures on 2026-11-12 ("Keep 0.25 K"; about 83 seconds of default brushing on land between fresh solves). Piece 8 is built and uncommitted; the builder finishes its fixes and review checks, then sends the review request. Lead the review briefing with the manual review (sculpt a mountain, sea level down by thousands of metres and back to 0 m, temperatures return), and relay approval only when the user's words say they tried it.

**Confirm or change the drift limit.** The user chose "0.25 K" on the builder's figure of "about 25 ordinary land strokes", which was wrong: it counted a 1,000 km patch raised 1,000 m, not a brush stroke. Measured with the page's default brush (500 km, 1,000 m/s) on land, drift is 0.003 K per second of brushing, so 0.25 K is about 83 seconds of brushing between fresh solves (about 80 one-second dabs, 28 three-second strokes, 17 five-second ones); 0.1 K is about 33 s and 1 K about 330 s. Bigger brushes reach it far sooner (1,000 km: about 20 s; the largest and strongest: every stroke). Average stroke at 64 stays 0.26 to 0.29 s at 0.25 K, and 0.27 to 0.34 s at 0.1 K. The planner put the corrected figures to the user and asked whether to keep 0.25 K. The limit stays 0.25 K unless they say otherwise; piece 8's fixes carry on.

Nothing. The user chose the drift limit on 2026-11-12 ("0.25 K"). Piece 8 is built and uncommitted; the builder runs its analysis loop and then sends the review request. Lead the review briefing with the manual review (sculpt a mountain, sea level down by thousands of metres and back to 0 m, temperatures return), and relay approval only when the user's words say they tried it.

Known limit, told to the user and left alone: when a stroke tips a partly frozen world to wholly frozen, that one result can be far off (44 K in the builder's test); the next solve corrects it.

After piece 8: brief piece 9 (solver speed-ups: "All four", "Yes, 128 too"; confirm its proposed manual review). Then the planet panel (10), cursor readout (11), Earth comparison (12), the sun (13).

Still to raise later: at the planet panel (now piece 10), the trust band for the sunlight note (builder suggests 0.85 to 1.25 times Earth's sunlight). Known model weakness, told to the user, nothing decided: seasonal range is low in deserts and mid-latitude oceans. Unrelated follow-up the builder noticed: in Terrain view a world exactly at sea level shows speckled land and sea colours (predates this issue; nothing decided).

## Figures

Node, one thread, seconds, cold / warm after a small terrain edit / warm after sea level +10 m:
- Earth 64: 0.96 / 0.25 / 0.64; 128: 4.46 / 1.22 / 3.09; 256: 22.00 / 5.71 / 15.21
- Generated 64: 1.08 / 0.45 / 0.66; 128: 5.07 / 1.96 / 2.80; 256: 24.61 / 9.44 / 13.84

Browser worker (headless Edge 157, production build, generated world), cold: 64 1.13 s, 128 6.23 s, 256 28.65 s; warm re-solve at 256 6.67 s; a fresh worker's set-up about 0.5 s at 256; the browser is 17 to 26% slower than Node.

Earth error, simulated minus observed, kelvin: annual mean -0.15, RMS 3.93; January +0.27 / 4.45; July -0.40 / 4.80; worst month April -1.08 / 6.49.

## From pieces 5 and 6, for later pieces

- `createWorkerService` in `src/app/workerService.ts` runs both services. Requests are copied, results transferred.
- The store gives `status` (`empty`, `calculating`, `current`, `outOfDate`, `unavailable`), `result` and `progress`.
- The layer picker owns `temperature.setShowing`; the page opens on Terrain and solves nothing until Temperature is chosen.
- `src/app/view.ts` holds the view settings (`LAYERS`, `DEFAULT_LAYER`, `SHOWN_MONTH = 6`); piece 7 replaces `SHOWN_MONTH` with the month on screen. `TEMPERATURE_CAPTION` in `layerPanel.ts` names July and must follow it.
- The layer panel sends a field to the globe only when the field changes (`shown.field !== field`); a derived summary must be one array per result, kept until the next, or it is uploaded again at every store change.
- Piece 8's `setPlanet` must call `state.notifyPlanetChange()`.
- The wait before a temperature request is 400 ms. Switching the layer off mid-solve lets the solve finish and keeps its result.

## Notes

- 2026-11-12: at the user's request ("spin up an independent agent to assess ways to speed up that calculation - feed back to this chat") an independent Opus subagent of the planner chat is assessing ways to speed up the temperature solver, with measurements, in its own throwaway worktree at `ff500c7`. It changes nothing that is kept. Its full report goes to the planner chat's scratchpad (`temperature-speedup-assessment.md`); the planner chat feeds the findings back to the user and, if they are worth keeping, files them as an investigation. The build carries on meanwhile ("continue with the plan"). The findings bear on the "Decide after piece 8" question about solving 256 worlds on the 128 grid.

- The user has their own `npm run dev` server running in the builder's worktree. The builder once tried to stop it as a leftover; the permission system refused and nothing was stopped. The user was told on 2026-11-12. Builders must leave it alone.
- The source data file's `license` attribute is worded more weakly than the CC0 statement on NOAA PSL's dataset record; the README quotes the record.
- Known failure mode: a builder can stall after a Claude Code restart or a usage limit, idle with uncommitted work; message it to carry on.
