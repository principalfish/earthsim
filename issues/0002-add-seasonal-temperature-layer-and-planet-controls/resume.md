# Resume: add-seasonal-temperature-layer-and-planet-controls

_Updated 2026-11-12, with piece 13 committed and the builder stopped before piece 14._

## Where it stands

- Pieces 1 to 13 of 14 are committed and pushed: `8390675`, `0c19852`, `4a1e290`, `1445e44`, `ff500c7`, `533ef95`, `fd8e21f`, `63364cf`, `140a260`, `90889e2`, `a85c004`, `fa10b57`, `a698c5a`. Branch `claude/add-seasonal-temperature-layer-and-planet-controls-f645fa`, draft PR #4, GitHub issue #3.
- Piece 13 was committed on 2026-11-12 after the user's manual review on their Mac ("Approve as it is"; "looks good on mac too"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 14 and starts it only on the user's go-ahead.
- Piece 12 was committed on 2026-11-12 after the user's manual review ("looks great, tried it approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 13 and starts it only on the user's go-ahead.
- Piece 11 was committed on 2026-11-12 after the user's manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 12 and starts it only on the user's go-ahead.
- Piece 10 was committed on 2026-11-12 after the user's manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 11 and starts it only on the user's go-ahead.
- Piece 9 was committed on 2026-11-12 after the user's manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 10 and starts it only on the user's go-ahead.
- Piece 8 was committed on 2026-11-12 after the user's manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 9 and starts it only on the user's go-ahead.
- Piece 7 was committed on 2026-11-12 after the user's second manual review ("Tried it, approve"). The builder (session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e`) has stopped with its look-ahead for piece 8 and starts it only on the user's go-ahead.
- Pieces 8 to 13 each have a manual review: relay an approval only when the user's words say they tried it.

## Pending with the user

Nothing. The user approved piece 13, the sun in the scene, on 2026-11-12 after reviewing it on their Mac ("Approve as it is"; "looks good on mac too"). The builder commits and pushes it, then stops with a look-ahead for piece 14, the last piece: collapsible panel sections and the legend over the globe. Then: tick piece 13, brief piece 14 (manual review confirmed; raise how the 364 px cursor strip and the legend share the bottom edge in a narrow globe area, and whether a section opens by itself when something in it becomes relevant), and ask before it starts. After piece 14: the all-pieces recap, `/review self`, `/publish`.

Reaching the dev server from the user's other machines: WSL has an SSH server on port 2222 and the user's own way is an SSH tunnel (their `tunnel.ps1` on another Windows machine; the planner gave them the Mac equivalent on 2026-11-12). The temporary Caddy route to port 5176 at http://192.168.1.148/ is still in place; the planner offered to remove it once the tunnel is in use.

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
