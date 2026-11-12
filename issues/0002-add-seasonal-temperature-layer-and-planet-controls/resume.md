# Resume: add-seasonal-temperature-layer-and-planet-controls

_Updated 2026-11-12, with all 14 pieces committed and the issue in review._

## Where it stands

- All 14 pieces are committed and pushed: `8390675`, `0c19852`, `4a1e290`, `1445e44`, `ff500c7`, `533ef95`, `fd8e21f`, `63364cf`, `140a260`, `90889e2`, `a85c004`, `fa10b57`, `a698c5a`, `d0f873a`. Branch `claude/add-seasonal-temperature-layer-and-planet-controls-f645fa`, draft PR #4, GitHub issue #3.
- Piece 14 was committed on 2026-11-12 after the user's manual review ("Tried it, approve"). The state is review. The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped; its worktree and dev dependencies are kept for the review's fixes. Next: the all-pieces recap, `/review self`, `/publish`.
- Piece 13 was committed on 2026-11-12 after the user's manual review on their Mac ("Approve as it is"; "looks good on mac too"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 14 and starts it only on the user's go-ahead.
- Piece 12 was committed on 2026-11-12 after the user's manual review ("looks great, tried it approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 13 and starts it only on the user's go-ahead.
- Piece 11 was committed on 2026-11-12 after the user's manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 12 and starts it only on the user's go-ahead.
- Piece 10 was committed on 2026-11-12 after the user's manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 11 and starts it only on the user's go-ahead.
- Piece 9 was committed on 2026-11-12 after the user's manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 10 and starts it only on the user's go-ahead.
- Piece 8 was committed on 2026-11-12 after the user's manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 9 and starts it only on the user's go-ahead.
- Piece 7 was committed on 2026-11-12 after the user's second manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 8 and starts it only on the user's go-ahead.
- Pieces 8 to 13 each have a manual review: relay an approval only when the user's words say they tried it.

## Pending with the user (put to them 2026-11-12)

**Self review 01 is done; the user is choosing which findings to fix.** `reviews/01-2026-11-12.md` has the nine verified findings (all low; no high or medium), the three dropped and one noticed. Groups put to the user: guards (C1 the baseline test passing on NaN figures; C2 `notifyPlanetChange` public), duplication (D1 month names four times; D2 two scripts not using the shared data-file readers; D3 `highestPoint` repeating `directionToLatLon`), documentation (Y1 README's core file list; Y2 a garbled doc sentence; Y3 two undocumented exported types), a test (V1 `flatten` untested), and whether to include the noticed N1 (`isNotFound` copied between two scripts). The planner recommended fixing all nine. Also offered: re-running the Sonnet checks with a stricter brief, since they were light passes. Next: record the choice in the review file, send the chosen findings to the builder for its Review fixes step (it pauses for the user's approval of the fixes through this chat, then commits and pushes), re-run the checks that raised them on the new diff with a fresh verifier, then update the review file, the index, the issue's plan checklist ("Review fixes (round 1)") and suggest `/publish`.

Nothing yet. The user asked for the whole-branch review on 2026-11-12 ("run the review on opus / sonnet"). It is running in the planner chat over `main...claude/add-seasonal-temperature-layer-and-planet-controls-f645fa` at `d0f873a`: 13 fresh check subagents, because the diff (130 files, about +35,000 lines) is too large for one per check. Correctness on Opus in three parts (core and worker; app state, wiring and scripts; panels and globe), security on Opus over the whole branch's trust boundaries, and coverage, style and common-mistakes on Sonnet in the same three parts. The common-mistakes agents were told not to edit the guides and to report candidates. Their shared brief, the plan context and the branch coverage report are in the planner chat's scratchpad under `review-0002/`. Next: collect all 13 reports, spawn a fresh Opus verifier with every raw finding, write the review to `reviews/NN-<date>.md` (`planner.py next-review`), present the verified and dropped findings, and have the user pick which to fix; the builder applies them. If the chat was interrupted before the reports came back, re-run the checks.

All 14 pieces are committed and pushed; the head is `d0f873a`, the state is `review`, draft PR #4 is open at that head. The all-pieces recap has been given. Waiting on the user to run `/review self add-seasonal-temperature-layer-and-planet-controls` in this chat (the builder keeps its worktree for the review's fixes, and has the whole-branch coverage figures: 97%, 66 of 3,182 changed lines not run, all with accepted reasons). Then `/publish`; merging is the user's.

For the review, from the builder: look first at `src/app/ui/layerPanel.ts`, `src/core/temperature.ts` with `src/core/coarsen.ts`, `src/app/wiring.ts`, the shader text in `src/app/globe/material.ts` and `src/app/globe/sun.ts`, `src/app/layers.ts` and `src/app/refresh.ts`, the README end to end, and names that changed late. Never checked by hand or only in Edge: Firefox; screen readers; touch and high-density screens; blocked storage in a real browser; the production build since piece 9; importing a pre-issue world file in the page.

Open follow-ups, nothing decided: a fixed-scale option (a frozen planet is drawn in much the same colours as a warm one); the Terrain speckle on a world wholly at sea level (predates this issue); the build's 500 kB chunk warning (predates this issue); whether to widen `coverage-changed.sh` to `scripts/`.

Nothing. The user approved piece 14, the last piece, on 2026-11-12 after the manual review ("Tried it, approve"). The builder commits and pushes it, sets the state to review and sends the all-pieces-done note with the whole-branch coverage report. Then: tick piece 14, give the all-pieces recap (each piece and its commit, deviations and decisions along the way, known limits and follow-ups, what was never checked by hand), and suggest `/review self add-seasonal-temperature-layer-and-planet-controls` in this chat, then `/publish`. Merging is the user's.

**Piece 14's review request (collapsible panel sections and the legend over the globe), the last piece:** built, uncommitted (HEAD `a698c5a`, 27 files). The user tries it from their Mac through their SSH tunnel at http://localhost:5176, in a private window: only World open; the headings World, Layers, View, Planet, Tools · Move, Statistics; each section by mouse and by Enter and Space; Tab skipping closed sections; "Tools · Raise" when closed; ticking Sunlight opening Layers; the legend at the globe's bottom right with Layers closed; sculpting and turning under the legend; a reload restoring the sections; the strip moving above the legend in a narrow window. Relay approval only when their words say they tried it. Told to them: an opening made by Sunlight is remembered like a click; the sun shows dimly behind the legend and the strip in the bottom corners; in a 620 px window the two overlays cover the lower part of the globe; nothing was checked on the Mac. After approval the builder commits, pushes and sets the state to review; then give the all-pieces recap and suggest `/review self add-seasonal-temperature-layer-and-planet-controls`, then `/publish`.

Nothing. Piece 13 is committed and pushed (`a698c5a`). The user started piece 14, the last piece (collapsible panel sections and the legend over the globe), on 2026-11-12 ("Start it") with: "Yes, open Layers" (ticking Sunlight opens Layers) and "Only Tools" (the closed Tools heading shows the active tool). The builder stops with a review request before committing; lead the review briefing with the manual review (a private window; only World open; the order World, Layers, View, Planet, Tools, Statistics; each section by mouse and keyboard; reload; the legend at the bottom right with Layers closed; sculpting under it; a narrow window), and relay approval only when the user's words say they tried it. After it is committed: the all-pieces recap, then suggest `/review self add-seasonal-temperature-layer-and-planet-controls`, then `/publish`; merging is the user's.

Nothing. The user approved piece 13, the sun in the scene, on 2026-11-12 after reviewing it on their Mac ("Approve as it is"; "looks good on mac too"). The builder commits and pushes it, then stops with a look-ahead for piece 14, the last piece: collapsible panel sections and the legend over the globe. Then: tick piece 13, brief piece 14 (manual review confirmed; raise how the 364 px cursor strip and the legend share the bottom edge in a narrow globe area, and whether a section opens by itself when something in it becomes relevant), and ask before it starts. After piece 14: the all-pieces recap, `/review self`, `/publish`.

Reaching the dev server from the user's other machines: WSL has an SSH server on port 2222 and the user's own way is an SSH tunnel (their `tunnel.ps1` on another Windows machine; the planner gave them the Mac equivalent on 2026-11-12). The temporary Caddy route at http://192.168.1.148/ was removed on 2026-11-12 at the user's word ("Yes, remove it"); manual reviews from the Mac now go through the tunnel to http://localhost:5176 (check the dev server's port before quoting it).

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
