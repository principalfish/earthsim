# Decisions: Move layers and overlays into the main view

Step 3c of the roadmap (`investigations/2026-11-10-simulator-design-and-roadmap.md`).

## Settled
- Purpose is worldbuilding: believable results and a fast-running simulation beat fidelity (2026-11-10)
- The layers come out of the side panel into the main view, as a step of its own after winds merges. The user: "i think we will do a separate UI piece to bring out layers from the side entirely - it lives in the main UI i think"; "New step after winds merges (Recommended)" (2026-11-14)
- 3c comes before 3a (the folder refactor), so the UI is rearranged once and the files then moved once; 3a places whatever new files 3c adds (2026-11-14)
- Planned in this chat on the user's word: "ok lets plan 3c" (2026-11-15)
- The user's brief for 3c, in full (2026-11-15): "basically i want to bring layers out into the main part of the UI - with icons- somewhat like google maps / so an option to toggle between terrain / temp / pressure as it stands / when temp or pressure is viewed , an optioan tl show month / annual / range should be there, or simulated / observed / difference / the month viewer should be on the UI somewhere too - maybe at the bottom / toggles to show sunlight / winds / cell grid should be visible straight on the main UI too / the calculation for temp etc should be triggered automatically on a new world / world change as most of the UI requires it now / the info box should be merged into 1 box, depending on what is visible / we want a settings section where we can set units - go full metric / imperial with override if desired". From it:
  - The colour layer (Terrain, Temperature, Pressure) is chosen in the main view, with icons, somewhat like Google Maps.
  - With Temperature or Pressure showing, the Show choice (Month, Annual average, range and the rest) and, on the untouched Earth, Simulated, Observed or Difference are offered in the main view.
  - The month controls are in the main view too.
  - Sunlight, Winds and the cell grid are toggles in the main view. So Sunlight and the cell grid leave the View section.
  - The temperature and what follows from it are worked out automatically on a new world and after a change to the world, not only while a layer shows them.
  - The legend, the wind key and the rest of what describes the globe become one box, showing what applies to what is visible.
  - A settings section sets the units: all metric or all imperial, with an override.

- After every change to the world, everything is worked out, whatever is on screen: the temperature, then the pressure and winds. A Pause button stops the solving while sculpting and catches up when released. The user: "Everything, with a pause" (2026-11-15)
- The value under the pointer joins the one box, with the legend, the wind key and the calculating status. The user: "Join the one box" (2026-11-15)
- Units (all metric or all imperial, with overrides) are built in this issue, as its last pieces, not as an issue of their own. The user: "In this issue" (2026-11-15)
- The user wants pictures of the candidate layouts, at desktop and narrow widths, before choosing the shape of the layer controls. The user: "Show me pictures first" (2026-11-15)

- Whether the winds are drawn as arrows or streaks is a setting in the settings section too, and it starts on Streaks (it starts on Arrows today). The user: "winds shown as should be nio setting too - defaulting to streaks" (2026-11-15; read as "in settings", and as the Arrows or Streaks choice, since Streaks is one of its two values)

- Layout A: icon tiles always visible down the left edge of the globe's area, the colour layers as one choice and the overlays (Winds, Sunlight, Grid) as toggles below; in a narrow window the labels drop and only the icons stay. Chosen from three drawn mock-ups (A left edge, B along the top, C one tile and a tray). The user: "A, left edge (Recommended)" (2026-11-15)
- As drawn in the chosen mock-up, and not objected to: Show and the Earth comparison sit beside the layer tiles at the top when Temperature or Pressure is on; Pause is in the top-right corner; the one info box is bottom-right; the month timeline with Play runs along the bottom; the side panel keeps World, View (relief and sea level), Planet, Tools and Statistics, gains Settings and loses Layers. To confirm with the full ledger.
- Settings is a section of the side panel, opening and closing like the others. The user: "A side-panel section" (2026-11-15)
- The icons are drawn for the project as small SVGs kept in the repo, with no icon library. The user: "Drawn for the project" (2026-11-15)
- Local `main` was fast-forwarded to `origin/main` (the merged winds, 302d9d3) on the user's word: "Yes, fast-forward it" (2026-11-15)

## Open
- Automatic calculation: where the Pause button sits and what it shows; whether pausing is remembered; what happens when the page opens.
- The one box: where it sits, and how it lays out the legend, the key, the status and the pointer's values.
- Units: which quantities (temperature, pressure, wind speed, heights and depths, distances, areas); what imperial means for each; where the override is; whether sliders and the Planet section follow.
- Where Winds' Simulated or Observed choice goes (on the untouched Earth only).
- Narrow windows.

## Assumed
- Nothing in a world file changes; the browser's remembered choices (open sections, wind unit, arrows or streaks) carry over, and the units join them.
- No change to the models in `src/core`: what changes is the page, and when the page asks the workers for results.
