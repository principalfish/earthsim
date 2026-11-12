# Resume: add-seasonal-temperature-layer-and-planet-controls

_Updated 2026-11-12, with piece 8 built and waiting for its manual review._

## Where it stands

- Pieces 1 to 7 of 13 are committed and pushed: `8390675`, `0c19852`, `4a1e290`, `1445e44`, `ff500c7`, `533ef95`, `fd8e21f`. Branch `claude/add-seasonal-temperature-layer-and-planet-controls-f645fa`, draft PR #4, GitHub issue #3.
- Piece 7 was committed on 2026-11-12 after the user's second manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 8 and starts it only on the user's go-ahead.
- Pieces 8 to 13 each have a manual review: relay an approval only when the user's words say they tried it.

## Pending with the user

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
