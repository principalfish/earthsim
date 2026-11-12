# Resume: add-seasonal-temperature-layer-and-planet-controls

_Updated 2026-11-12, with piece 7 built and waiting for its manual review._

## Where it stands

- Pieces 1 to 6 of 11 are committed and pushed: `8390675`, `0c19852`, `4a1e290`, `1445e44`, `ff500c7`, `533ef95`. Branch `claude/add-seasonal-temperature-layer-and-planet-controls-f645fa`, draft PR #4, GitHub issue #3.
- Piece 6 was committed on 2026-11-12 after the user's manual review ("Tried it, ramp A"). Piece 7 was started on the user's "Start it" and is built, uncommitted in the builder's worktree (HEAD still `533ef95`); checks pass and the analysis loop is clean. The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has sent its review request and commits only on the user's approval relayed with their words.
- Pieces 7 to 11 each have a manual review: relay an approval only when the user's words say they tried it.

## Pending with the user

1. **Piece 7 is not approved.** The user's manual review on 2026-11-12 found two problems, in their words: "i dont think season range is working - or perhaps it needs a finer scale" and "bug - i think - 1. sculpt land - temp calc looks right 2. lower sea level - temp calc looks right? 3. raise sea level back to normal - showing -20 as max temp". Their screenshots: seasonal range shows Siberia deep purple and Africa, Arabia and India white on a 0 to 48 scale; after the sea-level round trip the September legend runs about -135 to -12 °C with the whole globe frozen (highest point 12,000 m, a sculpted peak north of the Caspian). The builder was asked to diagnose both with numbers and report options, changing no behaviour yet. The planner's unverified hypothesis for the freeze: lowering the sea level tips the model into its frozen state and the warm start carries it back, so the result depends on the history of edits. Asked of the user: roughly how far they lowered the sea level. When the builder reports: put the diagnosis and options to the user (how the result is made to depend only on the world; the seasonal range's scale and ramp; optionally fitting the scale to an area percentile so one peak does not stretch it), then relay their choices.
2. **The speed-up piece is decided and not yet planned.** The user: "let us also implement the speed up ideas"; scope "All four"; "Yes, 128 too" (every world above 64 solves one grid coarser). It goes in as a new piece right after piece 7; pieces 8 to 11 become 9 to 12. Write it into `plan.md` and the issue checklist once the builder's diagnosis of the freeze is in, because the freeze fix and the warm-start fallback stand-in are the same design; then brief the user on it before it starts. The user lowered the sea level by "Thousands of metres" in the freeze sequence; the builder has been told.

Still to raise later: at piece 8, the trust band for the sunlight note (builder suggests 0.85 to 1.25 times Earth's sunlight). Unrelated follow-up the builder noticed: in Terrain view a world exactly at sea level shows speckled land and sea colours (predates this issue; the user was told, nothing decided).

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
