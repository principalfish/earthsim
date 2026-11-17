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

- Layout A (mock-ups and the script that draws them: `investigations/2026-11-15-layer-controls-mockups/`): icon tiles always visible down the left edge of the globe's area, the colour layers as one choice and the overlays (Winds, Sunlight, Grid) as toggles below; in a narrow window the labels drop and only the icons stay. Chosen from three drawn mock-ups (A left edge, B along the top, C one tile and a tray). The user: "A, left edge (Recommended)" (2026-11-15)
- As drawn in the chosen mock-up, and not objected to: Show and the Earth comparison sit beside the layer tiles at the top when Temperature or Pressure is on; Pause is in the top-right corner; the one info box is bottom-right; the month timeline with Play runs along the bottom; the side panel keeps World, View (relief and sea level), Planet, Tools and Statistics, gains Settings and loses Layers. To confirm with the full ledger.
- Settings is a section of the side panel, opening and closing like the others. The user: "A side-panel section" (2026-11-15)
- The icons are drawn for the project as small SVGs kept in the repo, with no icon library. The user: "Drawn for the project" (2026-11-15)
- Local `main` is level with `origin/main` (the merged winds, 302d9d3): the user said "Yes, fast-forward it", and it was already there (2026-11-15)

- Units, as proposed: metric is °C, hPa, m/s, m and km; imperial is °F, inHg, mph, ft and mi. Each quantity (temperature, pressure, wind speed, heights and depths, distances) has an override under the main choice; wind speed's also offers km/h and knots, temperature's also offers kelvin. Latitude and longitude, day and year length and percentages are the same in both. A legend's scale is re-rounded for the unit, so its ticks are round numbers in that unit. The user: "Yes, as proposed" (2026-11-15)
- The units reach the read-outs (legend, info box, Statistics, Planet read-outs) and the controls (Sea level, brush size and strength, the New world dialog). Sliders keep their metric steps underneath and show the converted value. The user: "Read-outs and controls" (2026-11-15)
- On an untouched Earth one Simulated, Observed or Difference control at the top applies to whatever is showing: the colour layer and the winds switch together, and Difference shows the layer's difference with the simulated winds. Observed winds can no longer be mixed with a simulated layer. The user: "One control for both" (2026-11-15)
- The browser remembers the chosen layer, each layer's Show, and the Winds, Sunlight and Grid toggles, so the page reopens as it was left. The month still starts on July. The user: "Remember them" (2026-11-15)

- Streaks is the starting choice except where the system asks for reduced motion, where it starts on Arrows; either can be chosen in Settings. The user: "Arrows if reduced motion" (2026-11-15)
- The ledger is complete; the issue and plan follow. The user: "That's everything" (2026-11-15)

- Manual reviews: all seven proposed are kept, for pieces 1, 2, 3, 4, 5, 9 and 10. The user: "Keep all seven" (2026-11-15)

- The dock's two headings read "Layers" (over Terrain, Temperature, Pressure) and "Overlays" (over Winds, Sunlight, Grid). The user: "Layers and Overlays" (2026-11-15)
- For manual reviews the user runs their own dev server from the builder's worktree; the planner gives the worktree's path at each review, and the builder leaves no server running. The user: "I'll run my own" (2026-11-15)
- The builder starts on piece 1. The user: "Start it" (2026-11-15)

- Piece 1 approved after the user tried it, with the dock made to scroll when the window is too short for it (the builder's option b, over leaving it clipped or dropping to icons). The user: "Tried it, approve, scroll" (2026-11-15)

- The one comparison source is kept across compared layers: going from Temperature on Observed or Difference to Pressure (or back) keeps that choice, and the new layer's observed data is fetched at the switch. The user: "Keep the choice" (2026-11-15)
- Piece 2 starts. The user: "Start it" (2026-11-15)
- Commits follow the conventional-commit format of `git.md` as changed on 2026-11-15 13:40 (`feat(<slug>): piece <n>/<total> — <summary>`) from piece 2 on; piece 1's commit (6278b72), pushed four minutes after the change, keeps the older form. The PR is titled `feat: move layers and overlays into the main view`.

- The builder session runs on Opus (`claude-opus-5-5`) from its next turn; it had inherited Fable (`claude-fable-5-2`) from this chat's model when started. The user: "downgrade the builder to opus" (2026-11-15)

- Piece 2 approved after the user tried it, with the three standing user-guide wording findings about failed fetches (lines 185, 262, 161) fixed first. The user: "Tried it, fix all" (2026-11-15)

- The timeline's month is a real range input styled as the track, with the twelve month letters as labels above it, hidden from screen readers; clicking a letter sets that month; the input's value text names the month, so the keyboard and screen readers work as today. The user: "Letters over a slider" (2026-11-15)
- A stored `earth_sim.panel.layers` entry is left in storage and never read (the builder's recommended option; no user decision asked). (2026-11-15)
- Piece 3 starts. The user: "Start it" (2026-11-15)

- Piece 3 approved after the user tried it. The user: "Tried it, approve" (2026-11-15)

- In a window too short for the one info box, the top bar and the corner are drawn above the info region, so no control is ever covered; the box's top tucks under the top bar and its top line may be hidden. The user: "Box tucks under top bar" (2026-11-15)
- Piece 4 starts. The user: "Start it" (2026-11-15)

- The info box has no winds block: the key's sample arrows ("5 m/s", "10+ m/s"), its "Surface wind" caption and the streaks line ("Faster, longer streaks are stronger winds") go, since arrows and streaks explain themselves and the pointer block gives the wind's speed. The user: "lets get rid of the wind part of the pop up box - its clear what arrows and streaks mean and ther aw speed is visible lower down so that info box i sireelvant" (2026-11-15)
- The comparison's two wind lines ("Off by … on average", "Direction right on …% of the map") stay, shown only on the untouched Earth while Winds is on, as two plain lines in the box under the legend's figures, with their tooltips. The winds' status and the observed winds' loading and failure lines go on the one status line, as planned. The user: "Keep them as two lines" (2026-11-15)

- The legend drops its end labels ("−35 and below", "30 and above", and the same on Pressure and every other legend): the colour bar and its ticks stay, and values beyond the ends still take the end colours. The user: "remove -35 and below and 30 and above from this. its out of place and not necessary" (2026-11-15). This reverses issue 0002's legend ends.
- The two wind comparison lines become one, prefixed "Wind:", on one line in the box: "Wind: off by 9.5 mph · 58% correct direction" (the planner's wording from the user's suggestion; "on average" dropped to fit; the tooltip keeps each figure's full definition). The user: "the wind data needs to be prefixed by Wind: and fit on one line. maybe just say 58% correct direction" (2026-11-15)

- The wind comparison line ("Wind: off by … · …% correct direction") is removed from the info box too: it does not belong in a pointer tool. It may live somewhere else later, recorded as a roadmap follow-up. The user: "actually remove the wind correct % / direction - its not applicable to a mouse over tool. ,aybe it lives somewhere but not for now" (2026-11-15)
- The pointer block is written in one or two lines joined by " · ": the place (position · height or depth), then the values (the layer's value · the wind), e.g. "1.7° N, 49.1° E · 4,628 m deep" and "28 °C · 15 mph S". The layer's value drops its month ("July 28 °C" becomes "28 °C"), and the wind's direction becomes a compass abbreviation ("from the south" becomes "S", "from the north-east" "NE"). The user: "all of these can be concatted into 1 or 2 lines separated by some suitable delimiter. remove July from the temp text, and from the south -> S in the wind text" (2026-11-15). This reverses issue 0003's pointer wording.

- Piece 4 approved after the user tried it, with the standing test finding (two redundant cases in `cursorReadout.test.ts`) fixed first. The user: "Tried it, fix it" (2026-11-15)

- Piece 5 started on the user's go-ahead: "Start it" (2026-11-16). In a narrow window Pause shows its icon alone, with "Pause" / "Resume" as its tooltip and accessible name (the builder's choice, stated in the briefing; the user did not object).

- Piece 5 approved after the user tried it, with three review findings fixed first: (1) Pause keeps its pressed state but its accessible name stays fixed at "Pause"; only the visible word and tooltip change to "Resume" (option b; this refines the narrow-window note above); (2) the status-table row in `docs/temperature.md` reworded to match the box; (3) the two unreachable wordings in `ui/legend.ts` removed. The user: "Tried it, fix all, B" (2026-11-16)

- Piece 6 started on the user's go-ahead after a pause: "pauise", then "resume" (2026-11-17). Each layer keeps its own stored Show, as the plan says ("each layer's Show"); a new world keeps the chosen layer and resets the month and source, as today.

- Piece 6 approved, with the guide line at `docs/user-guide.md:107` fixed first to "but never the month or the comparison". The user: "Approve, fix it" (2026-11-17). Piece 6 has no manual review in the plan, so no try was needed.

- Piece 7 started on the user's go-ahead, with the builder's two calls as stated in the briefing: in Settings, "Winds drawn as" comes first, then "Wind speed"; and the test that a change reaches the info box is dropped, since the box has shown neither the wind style nor its unit since piece 4 (the style is tested reaching the globe and the stored preference, the unit reaching the pointer's read-out). The user: "Start it" (2026-11-17)

- Piece 7 approved as reviewed. The user: "Approve" (2026-11-17). Piece 7 has no manual review in the plan, so no try was needed.

- The old stored wind speed unit carries over as the wind speed override whatever it is, m/s included, then the old entry is removed. A stored m/s therefore stays m/s under Imperial; the user chose this over dropping a stored m/s (option b). The user: "Keep all, start it" (2026-11-17)
- Piece 8 started on the user's go-ahead, with the builder's four calls as stated in the briefing: Settings order "Winds drawn as", then Units (Metric or Imperial switch, then Temperature, Pressure, Wind speed, Heights and depths, Distances); the old entry migrates once and is removed; tests cover the pointer's wind only, since the wind key no longer exists; all five overrides show, four taking effect in piece 9. The user: "Keep all, start it" (2026-11-17)

- Piece 8 approved, with both re-check findings fixed first: (1) deleting the wind speed override also deletes the old wind entry, so it cannot come back over "As the system" on a browser that can delete but not save, with a test; (2) the doc comment at `preferences.ts:105` reworded to say the old entry is removed only once the override is saved. The user: "Approve, fix both" (2026-11-17). Piece 8 has no manual review in the plan.

- Piece 9's per-unit scale settings, as the builder proposed: minimum fitted span 2 °C, 4 °F, 2 K, 10 hPa, 0.3 inHg; seasonal range tick step 5 °C, 10 °F, 5 K; difference half-span ±20 °C, ±40 °F, ±20 K, ±20 hPa, ±0.6 inHg; difference tick step 10 °C, 20 °F, 10 K, 10 hPa, 0.3 inHg. The open doc nit at `preferences.ts:122` (`setUnitOverride` not saying that "As the system" for wind speed also removes the old entry) is fixed in piece 9. The user: "Start it" (2026-11-17)

- Piece 9 approved after the user ran it (they reported trying the units in the app: "the instances of km in the raise tool dont show miles when i selet miles", which is piece 10's), with both re-check findings fixed first: (1) `isDifferenceView` counts only views fitted from zero, and the test that accepted a month-style or centred view marked as a difference is flipped; (2) its doc says the values are spans, which convert by scale alone. The user: "ok approve and fix as you suggest" (2026-11-17)

- Piece 10 started on the user's go-ahead, with the builder's two calls as stated in the briefing: the New world hints read "about 95 / 45 / 25 mi cells", rounded to the nearest 5 like the km figures; the brush radius shows whole miles (100–3,000 km in 50 km steps reads about 62–1,864 mi in steps of about 31, so no two steps share a figure). Brush strength follows the height unit (m/s or ft/s of land), not the wind unit. The user: "Start it" (2026-11-17)

- Piece 10 approved after the user tried it, with the re-check finding fixed first: the two checks for the removed checkbox class in `viewPanel.test.ts` (lines 81 and 109) are dropped. The user: "Tried it, fix it" (2026-11-17)

## Open
- None.

## Assumed
- Nothing in a world file changes; the browser's remembered choices (open sections, wind unit, arrows or streaks) carry over, and the units join them.
- No change to the models in `src/core`: what changes is the page, and when the page asks the workers for results.
- Pausing is not remembered: the page always opens running and solves the restored world at once. While paused, the results on screen are marked out of date and the status says Paused; a new world made while paused stays unsolved until Pause is released. Told to the user 2026-11-15, not objected to.
- Without Pause, an edit is followed by a solve after the same short wait as today (a little under half a second after a stroke ends).
- One status for the whole solve, in the info box, replaces the legend's and the wind key's own.
- With one comparison control: on Terrain with Winds on it offers Simulated or Observed only; with nothing to compare it is hidden; any edit removes it, as today. The comparison choice is not remembered.
- The stored wind speed unit carries over as the wind speed override. A stored choice of Arrows is kept; Streaks is the start only where nothing is stored.
- Phone-sized screens stay out of scope, as today; "narrow" is a narrow desktop window. Told to the user 2026-11-15, not objected to.
- Every tile is a real button with a tooltip naming it, and works from the keyboard. Told to the user 2026-11-15, not objected to.
- The View section keeps relief exaggeration and sea level. The rule that ticking Sunlight or Winds opens the Layers section goes, with the section.
- `docs/user-guide.md` is rewritten for the new layout.
- In the pointer block the summary names go with the month ("Annual average 7 m/s from the north-east" becomes "7 m/s NE"; "Seasonal range 12 °C" becomes "12 °C"), since the legend's caption names the view; the short marks stay at the end of their value: "calm", "observed", "out of date". Not asked; stated to the user 2026-11-15.
