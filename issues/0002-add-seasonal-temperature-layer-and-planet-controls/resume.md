# Resume: add-seasonal-temperature-layer-and-planet-controls

_Updated 2026-11-12, after piece 4 was committed._

## Where it stands

- Pieces 1 to 4 of 11 are committed and pushed: `8390675`, `0c19852`, `4a1e290`, `1445e44`. Branch `claude/add-seasonal-temperature-layer-and-planet-controls-f645fa`, draft PR #4, GitHub issue #3.
- The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`, on `claude-opus-5-5`) is stopped after piece 4, as planned, and starts piece 5 only on the user's word relayed from the planner chat.
- From piece 5 on, the normal per-piece pauses apply (review before each commit, go-ahead before each piece) unless the user asks for another run-through. Pieces 6 to 11 have manual reviews.

## Pending with the user (put to them 2026-11-12)

1. **Recalculation trigger:** only while the temperature layer is showing (builder's and planner's recommendation), or always.
2. **Progress indicator:** years-done progress from the worker (new protocol work in piece 5), or a plain "calculating" marker.
3. **256 worlds solved on the 128 grid** with height cooling applied at full resolution (about five times faster at 256; changes the settled "own grid" decision). Not built; the user decides whether it goes into this issue, a later one, or nowhere.
4. **Deviations in piece 4 to accept or question:** outgoing heat in emissivity form on a kelvin state where the plan said linear; new file `src/core/exchange.ts`; the result carries a resumable state; sea ice lowers ocean heat capacity and land has its own spreading rate; "converged" leaves answers within about 0.2 K of the repeating year; `scripts/earth/cells.test.ts` counts differing cells in one assertion.
5. **Trust band for the sunlight note (piece 8):** builder suggests 0.85 to 1.25 times Earth's sunlight; the real edge moves with greenhouse strength.

Checkpoint 4 in `plan.md` is ticked by the builder for the code; its last clause (the user has chosen the trigger) is true only once item 1 is answered. Record the answers in `decisions.md` and `plan.md` Notes, then give the piece 5 briefing.

## Figures from piece 4 (`npm run time:temperature`, Node, one thread)

Cold / warm after a small terrain edit / warm after sea level +10 m, seconds:
- Earth 64: 0.96 / 0.25 / 0.64; 128: 4.46 / 1.22 / 3.09; 256: 22.00 / 5.71 / 15.21
- Generated 64: 1.08 / 0.45 / 0.66; 128: 5.07 / 1.96 / 2.80; 256: 24.61 / 9.44 / 13.84

Earth error, simulated minus observed, kelvin: annual mean -0.15, RMS 3.93; January +0.27 / 4.45; July -0.40 / 4.80; worst month April -1.08 / 6.49. Poles too warm going into winter (Arctic November +16 K), northern mid-latitudes 2 to 3.5 K cold, southern 2 to 4.5 K warm, seasons about 20% weak.

## For piece 5's briefing

- The worker must not take `model` or `maxYears` from a message; it passes the previous result as `start` and transfers the twelve months plus three state arrays (about 28 MB at 256).
- The page keeps the last completed result (with its state) to start the next solve from; terminating a running solve loses that solve's state.
- Planet values go through `normalisePlanet`; the untested `startStatistics` decision moves into tested code (carried R1+R3 from issue 0001).
- Slow cases to expect: sea-level changes take 3 years even warm; small planet edits gain little from a warm start.

## Notes

- The source data file's `license` attribute is worded more weakly than the CC0 statement on NOAA PSL's dataset record; the README quotes the record.
- Known failure mode: a builder can stall after a Claude Code restart or a usage limit, idle with uncommitted work; message it to carry on.
