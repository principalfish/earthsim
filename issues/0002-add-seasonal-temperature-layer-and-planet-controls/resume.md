# Resume: add-seasonal-temperature-layer-and-planet-controls

_Updated 2026-11-12, with piece 6 built and waiting for its manual review._

## Where it stands

- Pieces 1 to 5 of 11 are committed and pushed: `8390675`, `0c19852`, `4a1e290`, `1445e44`, `ff500c7`. Branch `claude/add-seasonal-temperature-layer-and-planet-controls-f645fa`, draft PR #4, GitHub issue #3.
- The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`, on `claude-opus-5-5`) has built piece 6 (uncommitted in its worktree, HEAD still `ff500c7`; checks pass and the analysis loop is clean) and has sent its review request. It commits only on the user's approval relayed with their words, after their ramp choice, when it removes the losing ramp and the Ramp A | B switch.
- Pieces 6 to 11 each have a manual review: relay an approval only when the user's words say they tried it.

## Pending with the user (put to them 2026-11-12)

Piece 6's review request is with the user: built, uncommitted (HEAD `ff500c7`, 23 files). Waiting on, after they try it on their own dev server (http://localhost:5176/, served from the builder's worktree):
1. The manual review (eight steps in the builder's request: Earth at 64 and 256, Temperature layer, seams, coastline, legend, Terrain round trip, sculpting, two workers and statistics staying responsive).
2. The ramp: A (dark blue through red to pale yellow) or B (blue, white, red; white sits mid-range, about -8 °C on Earth, and the builder offers to pin it at 0 °C). If B wins, change the plan's Tests line for piece 6 (no "monotonic in lightness").
3. Approval of the diff and the commit message. Relay approval only when their words say they tried it; then the builder removes the losing ramp and the A | B switch and commits.
Also told to the user: the legend's 28 px gap when current; the first-year bar may not show; ramp A is mostly yellow to orange on a July Earth; a speckle in Terrain view on a world exactly at sea level, which predates this issue (not touched).

Still to raise later: after piece 8, solving 256 worlds on the 128 grid ("Decide after piece 8"); at piece 8, the trust band for the sunlight note (builder suggests 0.85 to 1.25 times Earth's sunlight).

## Figures

Node, one thread, seconds, cold / warm after a small terrain edit / warm after sea level +10 m:
- Earth 64: 0.96 / 0.25 / 0.64; 128: 4.46 / 1.22 / 3.09; 256: 22.00 / 5.71 / 15.21
- Generated 64: 1.08 / 0.45 / 0.66; 128: 5.07 / 1.96 / 2.80; 256: 24.61 / 9.44 / 13.84

Browser worker (headless Edge 157, production build, generated world), cold: 64 1.13 s, 128 6.23 s, 256 28.65 s; warm re-solve at 256 6.67 s; a fresh worker's set-up about 0.5 s at 256; the browser is 17 to 26% slower than Node.

Earth error, simulated minus observed, kelvin: annual mean -0.15, RMS 3.93; January +0.27 / 4.45; July -0.40 / 4.80; worst month April -1.08 / 6.49.

## From piece 5, for later pieces

- `createWorkerService` in `src/app/workerService.ts` runs both services; `client.latest` is gone. Requests are copied, results transferred.
- The wiring sets `temperature.setShowing(true)` at start-up; piece 6's layer picker takes that over, and passes the layer store to the layer panel and legend.
- The store gives `status` (`empty`, `calculating`, `current`, `outOfDate`, `unavailable`), `result` and `progress` (`yearsDone`, `maxYears`, `changeK`, `toleranceK`, `estimatedYearsLeft`, null when unknown).
- Piece 8's `setPlanet` must call `state.notifyPlanetChange()`.
- The wait before a temperature request is 400 ms. Switching the layer off mid-solve lets the solve finish and keeps its result.
- Not yet checked by hand in the page: two worker instances, one request about 0.4 s after an edit, statistics staying responsive during a solve. Piece 6's manual review covers them.

## Notes

- The user has their own `npm run dev` server running in the builder's worktree. The builder once tried to stop it as a leftover; the permission system refused and nothing was stopped. The user was told on 2026-11-12. Builders must leave it alone.
- The source data file's `license` attribute is worded more weakly than the CC0 statement on NOAA PSL's dataset record; the README quotes the record.
- Known failure mode: a builder can stall after a Claude Code restart or a usage limit, idle with uncommitted work; message it to carry on.
