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

## Open
- The shape of the layer controls: always-visible icon tiles, or one tile that opens a tray as Google Maps does; and where.
- The month controls' place: the user leans to the bottom ("maybe at the bottom"). Where the Show choice and the Earth comparison sit beside them.
- Automatic calculation: whether the winds and pressure are always worked out with the temperature or only when shown; whether there is a pause control; what happens while sculpting and when the page opens.
- The one box: whether the value under the pointer joins it or stays a strip of its own; where the calculating status goes.
- Units: which quantities (temperature, pressure, wind speed, heights and depths, distances, areas); what imperial means for each; where the override is; whether sliders and the Planet section follow; whether it is part of this issue or its own.
- Where the settings section lives: a section of the side panel, or a button in the main view.
- Winds' own options (Arrows or Streaks; Simulated or Observed) and where they go.
- What is left of the Layers and View sections in the side panel.
- The icons: drawn for the project, or from an icon library (a new dependency).
- Narrow windows.
- Whether local `main` is fast-forwarded to `origin/main` (the merged winds) before a builder branches from it.

## Assumed
- Nothing in a world file changes; the browser's remembered choices (open sections, wind unit, arrows or streaks) carry over, and the units join them.
- No change to the models in `src/core`: what changes is the page, and when the page asks the workers for results.
