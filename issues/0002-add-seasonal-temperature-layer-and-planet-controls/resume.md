# Resume: add-seasonal-temperature-layer-and-planet-controls

_Updated 2026-11-12, after piece 5 was committed._

## Where it stands

- Pieces 1 to 5 of 11 are committed and pushed: `8390675`, `0c19852`, `4a1e290`, `1445e44`, `ff500c7`. Branch `claude/add-seasonal-temperature-layer-and-planet-controls-f645fa`, HEAD `ff500c7`, state `building`, draft PR #4, GitHub issue #3.
- The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`, implementation on `claude-opus-5-5`) has stopped after piece 5 and waits for the user's go-ahead before piece 6.
- Next: piece 6, "Temperature layer on the globe" (first manual review). From piece 6 on, the normal per-piece pauses apply (review before each commit, go-ahead before each piece) unless the user asks for another run-through.

## Pending with the user

- The go-ahead for piece 6, with the choices in its briefing: the layer shows July until the month slider exists; how the years-done progress is drawn; whether the layer picker starts on Terrain (so nothing is calculated until Temperature is chosen) or on Temperature.
- Still to raise at piece 8: the trust band for the sunlight note (builder suggests 0.85 to 1.25 times Earth's sunlight), and solving 256 worlds on the 128 grid ("Decide after piece 8").

## Decision history

- 2026-11-12, after piece 4: trigger "Only while showing"; progress "Years done"; the 128-grid solve for 256 worlds "Decide after piece 8"; piece 4's deviations "Accept all six"; piece 5 "Start, commit when clean". Recorded in `decisions.md`.

## Figures

Piece 4, Node, one thread (`npm run time:temperature`); cold / warm after a small terrain edit / warm after sea level +10 m, seconds:
- Earth 64: 0.96 / 0.25 / 0.64; 128: 4.46 / 1.22 / 3.09; 256: 22.00 / 5.71 / 15.21
- Generated 64: 1.08 / 0.45 / 0.66; 128: 5.07 / 1.96 / 2.80; 256: 24.61 / 9.44 / 13.84

Piece 5, a real browser worker (headless Edge 157, production build, generated world, minimum of 3 runs):
- Cold solve: 1.13 s at 64, 6.23 s at 128, 28.65 s at 256 (5 years each).
- A fresh worker's set-up: about 0.09 s, 0.03 s and 0.5 s. Terminate and restart at 256: 29.98 s to the new answer.
- Warm re-solve at 256: 6.67 s (1 year). Posting the 28 MB start: 0.02 s.

Earth error, simulated minus observed, kelvin: annual mean -0.15, RMS 3.93; January +0.27 / 4.45; July -0.40 / 4.80; worst month April -1.08 / 6.49.

## For piece 6's briefing

- The store is `createLayerStore(reportError)` in `src/app/layers.ts`: `store.temperature` is `{ status, result, progress }`, with `addListener`. Status is `empty`, `calculating`, `current`, `outOfDate` or `unavailable`; a previous result stays on hand while calculating or out of date.
- Progress is `{ yearsDone, maxYears, changeK, toleranceK, estimatedYearsLeft }`; the estimate is null when the solver cannot tell and is rough in the first year or two.
- The wiring sets `temperature.setShowing(true)` at start-up; the layer picker must take that over (`setShowing(false)` on Terrain).
- The wiring hands the store to the temperature part only; piece 6 needs it passed to the layer panel and legend too.
- Not yet checked by hand in the page: two worker instances, one request about 0.4 s after an edit, statistics responsive during a solve.

## Notes

- The source data file's `license` attribute is worded more weakly than the CC0 statement on NOAA PSL's dataset record; the README quotes the record.
- Known failure mode: a builder can stall after a Claude Code restart or a usage limit, idle with uncommitted work; message it to carry on.
