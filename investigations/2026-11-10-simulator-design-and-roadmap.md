# Simulator design and roadmap

The whole-simulator design for earth_sim and the nine-step build order, so each step's issue can draw on it. Only the items under "Decided by the user" are settled; everything else is a proposal to be confirmed when its step is planned.

## Decided by the user (2026-11-10)

- Purpose is worldbuilding: believable, not research-grade. Broad strokes and a fast-running simulation beat fidelity.
- Resolution much coarser than 10 km cells is fine.
- A browser app.
- Tectonics: the user draws the plates and sets their motion; plates are not auto-generated.
- The user wants to alter rotation rate, axial tilt and the star.
- Grid: cubed sphere.
- Architecture: TypeScript; the simulation is a pure library with no browser dependency, run in a Web Worker; Three.js draws the globe; no server, static files only; worlds saved by file export and import.
- Tooling: npm, Vite, Vitest, Biome, `tsc`.
- One issue per build step, starting with step 1.
- A biome map is a step of its own, before plate tectonics (added 2026-11-13). It is what most worldbuilders want from the tool: what grows where, not the climate fields themselves.
- The simulation must be pauseable, with the user able to edit the map while it is paused; a run continues from the edited state. The main thread holds the editable, authoritative world and the worker computes from copies of it, which is what makes this possible.

- Fine tuning against the Earth waits until every part of the climate loop is in (added 2026-11-14): "i also think we probably shouldn't spend too much time trtying to make everything fit earth perfectly until all processing pieces are in. as we could fine tune one then find a later stage changes things". Until then each step gets its model right in kind, records what it gets wrong, and keeps an Earth baseline only as a guard against getting worse. A tuning pass over the whole loop comes once heat carried by winds, ocean currents and sea ice are built (see the status table).

## Proposed, not yet confirmed

### Time
- Simulate a seasonal cycle (monthly steps, repeated for a few years until it settles) rather than an annual mean, so tilt matters and Köppen climate zones can be output.
- Three timescales: climate (years to equilibrium), ice sheets (about 10 kyr), tectonics (Myr). Climate is re-solved as a snapshot every few Myr of drift, not run continuously.
- GPU compute (WebGPU) is not needed at around 25k cells. The pure core keeps that option open, and could run under Node for batch runs.

### How each feature would be modelled

| Feature | Approach | Difficulty |
|-|-|-|
| Temperature | Energy balance (sunlight, albedo, heat diffusion) with elevation correction | Easy |
| Winds | Scaling rules deriving the band layout from rotation rate and temperature contrast, plus land-sea pressure contrasts. A two-layer dynamic atmosphere is the more general alternative, harder to stabilise and tune | Medium |
| Ocean currents | Wind-driven gyres solved from the wind field around coastlines; deep circulation skipped at first | Medium |
| Rainfall | Moisture carried along the winds, raining out on uplift and mountains | Medium |
| Tropical storms | A diagnostic map from sea temperature, latitude and wind shear, not simulated storms | Easy |
| Biome map | Each cell's biome (rainforest, savanna, desert, steppe, forest, taiga, tundra, ice) classified from its monthly temperature and rainfall, drawn in natural map colours. Builds on the Köppen zones from step 4 | Easy |
| Glaciation | Snowfall minus melt, simple ice flow, albedo feedback into temperature | Medium |
| Continental drift | Rigid plates rotating on the sphere with rules for collision, subduction and rifting. The hardest part to make look right. Reference: "Procedural Tectonic Planets" (Cortial et al., 2019) | Hard |

### How the layers feed back into each other (proposed 2026-11-13, to confirm when step 3b is planned)
Through step 3 the layers are a one-way chain: temperature, then winds from it. The proposal for the feedbacks is a loop of separate solvers run in sequence and repeated until it settles, not one simultaneous solve (which is what a full climate model does: slow, and hard to keep stable).
- **One pass, in order of what depends on what:** (1) temperature, from sunlight and the surface, plus the heat the previous pass's winds and currents carried and its ice and snow cover; (2) winds from the temperature; (3) ocean currents from the winds; (4) rain and snow from the winds and temperature; (5) sea ice and snow cover; then back to (1).
- **The first pass** has no carried heat, so it is the temperature model as step 2 built it.
- **Stop** when the temperature changes by less than a small amount (say 0.1 °C) between passes. The feedbacks are corrections, so a few passes are expected; that is an estimate, not measured.
- **Cost:** each pass is about one full set of solves; the temperature solver's warm start makes later passes cheaper. The page can show the first pass at once and refine in the background.
- **Oscillation:** apply only part of each correction per pass if the loop flips back and forth.
- **Ice has two stable answers** (ice reflects sunlight, which cools, which grows ice), so the result can depend on where the solve starts. Starting from the previous answer gives the world a memory.
- **Slow things stay outside the loop:** ice sheets and plates step forward in time, with the loop re-run as a snapshot.
- **Layers stop being independent:** once winds feed back, showing the temperature means running the loop, so it becomes one climate solve in the worker, not one request per layer.
- **Work everything out, show what is chosen** (the user's direction, 2026-11-14: "once we select temperature we basically may as well turn on every other layer as they all get calculated at that point? in fact its the entire purpose of the sim so you may as well immediately calculate it"): from step 3b the climate is solved automatically after every change to the world, whichever layers are on screen, and choosing a layer only chooses what is drawn. To settle when 3b is planned: a pause control (the simulation must be pauseable, decided 2026-11-10), so sculpting need not pay for a solve after every stroke; showing the first pass at once and refining in the background; and whether the cheap downstream maps (rain, storm zones, biomes) are worked out with every solve or on first view. Until 3b, step 3 keeps what it built: the temperature and the winds are solved only while something shows them.
- **What the layers need for it:** each stays a pure function of its inputs (step 3's wind model takes a world and its temperatures); the temperature gains an optional "heat carried in" input, and stops ignoring day length.

### Planet parameters
- Axial tilt: exact geometry for sunlight by latitude and season. High confidence.
- Star brightness and orbit distance set incoming energy; star mass sets year length. High confidence.
- Rotation rate sets wind band width and count, ocean gyre strength and storm formation. Medium confidence.
- Limits: the wind scaling rules are only trusted for roughly Earth-like rotation (perhaps a quarter to four times Earth's rate; that range is a guess). Tidally locked planets need a different wind pattern. Tilts above about 54 degrees make the wind rules guesswork, although temperature stays right. Both are candidates for later extensions.

## Build order

Each step adds a viewable map layer and gets its own issue.

1. Globe, grid, and sculpting land and elevation
2. Sunlight and seasonal temperature
3. Winds
4. Moisture, rainfall and Köppen zones
5. Ocean currents, feeding heat back into temperature
6. Ice sheets and sea ice
7. Tropical storm zones
8. Biome map
9. Plate tectonics and time stepping

Added since (see the status table): 3c, the layers brought into the main view; 3a, the core and page folders; and 3b, heat carried by winds and the climate loop; all between steps 3 and 4, in that order. Also 10, an optional simulated atmosphere, after step 9.

## Status and carried-over items (as of 2026-11-13)

Keep this section current when a step is merged.

| Step | Status | Issue |
|-|-|-|
| 1 Globe, grid and sculpting | Done, merged 2026-11-11 | 0001, GitHub #1, PR #2 |
| 2 Sunlight and seasonal temperature | Done, merged 2026-11-13 | 0002, GitHub #3, PR #4 |
| 3 Winds | Building | 0003, GitHub #5, PR #6 |
| 3c Layers in the main view, out of the side panel | Not started; next after step 3 merges, before 3a | |
| 3a Core folders by component, page folders by role (refactor, no behaviour change) | Not started; after step 3 merges, before step 4 | |
| 3b Heat carried by winds, and the climate loop | Not started; after 3a. Could instead open step 5; decide when planned | |
| 4 Moisture, rainfall and Köppen zones | Not started | |
| 5 Ocean currents | Not started | |
| 6 Ice sheets and sea ice | Not started | |
| 6b Tune the whole climate loop against the Earth | Not started; after steps 3b, 5 and 6, when every part of the loop is in | |
| 7 Tropical storm zones | Not started | |
| 8 Biome map | Not started | |
| 9 Plate tectonics and time stepping | Not started | |
| 10 A simulated atmosphere (optional) | Deferred from step 3 by the user, 2026-11-13 | |

### Step 3c: layers in the main view, out of the side panel
The user, 2026-11-14: "i think we will do a separate UI piece to bring out layers from the side entirely - it lives in the main UI i think", and chose it as a step of its own right after winds merges ("New step after winds merges").
- **Why:** the side panel's Layers section picks one colour layer, and step 3 puts the Winds switch in View beside Sunlight, though winds are an overlay, not lighting. More layers and overlays are coming (pressure in step 3, rainfall, ocean currents, storms), so they move out of the panel into the main view together.
- **Design it around "everything is worked out; the view only chooses what to show"** (see "How the layers feed back into each other"): the layer controls pick what is drawn, and one status covers the whole climate solve, with the pause control.
- **What it covers, to settle when planned:** the colour layer (Terrain, Temperature, Pressure, later rainfall and more) and the overlays (Winds and its streaks, later ocean currents), each overlay with its own small options (the wind unit); what stays in the panel (World, View with relief, sea level, grid and Sunlight, Planet, Tools, Statistics); the month controls, the legend and the wind key; narrow windows.
- **Order:** before 3a, which moves the page's files into role folders, so the UI is rearranged once and the files then moved once; 3a should place whatever new files 3c adds.
- **Meanwhile:** step 3 keeps its planned places (the Winds switch and, in piece 11, the Wind speed option in View; streaks beside the Winds switch).

### Step 3a: core folders by component, page folders by role
`src/core/` is flat today, except `src/core/wind/`, which step 3 started because it holds several models. With five more layers to come, a flat folder would pass 40 files, so the core moves into one folder per component in one refactor, between steps 3 and 4. It is a pure move: no behaviour change, checked by the existing tests and the temperature baseline. It waits for step 3's merge because that branch edits the files that would move.
- **Small blast radius:** the page, the worker and the scripts import the core only through `src/core/index.ts`, except one script that imports `baseline/earthTemperature`. So the move rewrites the core's own imports and tests, and that one script.
- **Core layout, agreed by the user 2026-11-13 ("layout looks good for core"):**
  - `grid/`: `grid`, `vector`, `coarsen`, `quantile` (grid maths every layer shares)
  - `world/`: `world`, `generate`, `noise`, `brush`, `history`, `stats`, `serialize`
  - `planet/`: `planet`, `star`, `insolation`
  - `earth/`: `earth`, `observedGrid` (reading the Earth data files)
  - `temperature/`: `temperature`, `exchange`, `observed`, `baseline/`
  - `wind/`: as step 3 leaves it, plus `observedWind`
  - left flat: `index`, `protocol`, `compare`; `testing/` stays
- Each later step (rain, ocean, ice, storms, tectonics) then starts its own folder.
- **Page (`src/app/`), in the same refactor, agreed by the user 2026-11-13 ("Yes, add it"):** the page stays organised by role, not by simulation layer, since its legend, layer panel and pointer readout serve every layer. `globe/` and `ui/` stay as they are; the 17 top-level files go into three role folders:
  - `editing/`: `appState`, `sculpt`, `undo`
  - `saving/`: `storage`, `autosave`, `startup`
  - `layers/`: `layers`, `view`, `refresh`, `workerService`, `playback`, `earthData`, `observedData` (and later layers' observed-data fetchers)
  - left flat: `main`, `wiring`, `panelMemory`, `styles.css`
  - Unlike the core, the page's files import each other directly, so this touches more import lines; still mechanical.
- **Worker (`src/worker/`):** left as it is (three small files). Split the handlers into `worker/handlers/` only if `handle.ts` grows unwieldy as layers are added.
- **Watch file size:** `globe/material.ts` (1,035 lines) and `ui/layerPanel.ts` (1,013) grow with every layer. Step 3's piece 12 (scalar layers made general) is where to keep a new layer a data entry rather than more code in them.
- Probably `/quick-build` once the layout is agreed, since it is one mechanical commit; `/planner refactor` if the layout needs discussion.

### Step 3b: heat carried by winds, and the climate loop
The first feedback into temperature, and the loop that later feedbacks (ocean currents, ice) plug into; design under "How the layers feed back into each other". Today heat spreads evenly between neighbouring cells, so west and east coasts get the same climate; winds carrying heat should give mild west coasts and cold east coasts at mid-latitudes, and set how far inland the sea's influence reaches.
- **First job when planning it:** look at the Earth difference map region by region, to see how much of the error sits where winds would help (mid-latitude west and east coasts) and how much where they would not (the North Atlantic, sea-ice edges, high ground).
- **Retuning waits for step 6b** (the user's decision above): note here what moves, do not chase the Earth's figures. **Two wind settings to revisit then:** step 3's rules model makes up for the temperature model's weak seasons and weak land and sea contrasts with `LOW_SHIFT_GAIN` (2.5, where 1 is the plain rule: it pushes the equatorial low further from the equator than the warmest latitude) and `THERMAL_HPA_PER_K` (3 hPa a kelvin, where the physics suggests about 0.7). When the temperature improves here, and again with ocean currents, both should come back towards their natural values; retune them and reset the winds baseline.
- **Known costs:** the temperature solver relies on heat exchange being symmetric between neighbours, which carrying heat with the wind is not, so it needs a different method; the temperature starts to depend on day length; the worker's one-request-per-layer design becomes one climate solve.

### Step 10 (optional): a simulated atmosphere
Step 3 planned to prototype two wind models and choose. After the rules prototype (step 3, piece 5) the user deferred the simulated one to here: "ok lets maybe defer the simulated atmosphere til the end of the roadmap - if you are confident it will take so long to solve then its not worth doing here yet", then "Yes, defer it". Step 3 builds the rules model.
- **What it would be:** a fluid layer (or two) on the grid, driven by the temperature and stepped forward until its averages settle; a month's winds are an average over many simulated days.
- **Why deferred:** estimated, not measured, at 10 to 60 s per simulated month on the 64 grid, so minutes per world against half a second for the rules model; and inside the climate loop the winds are solved several times per pass.
- **What was learnt before deferring:** one thermally driven layer makes trades and monsoons but no mid-latitude westerlies; those need weather systems, so either seeded stirring where the temperature changes fastest with latitude (a published approach, Vallis and colleagues 2004, cited from memory) or two layers. Explicit stepping on the cubed sphere may need extra damping at seams and corners.
- **What it would buy:** patterns that come from the physics, so pressure bands that differ by longitude and unusual planets need no new rules; weather, which the storm step could use.
- **What could make it worthwhile:** running it on the graphics card (WebGPU), a coarser grid, or starting each month from the last. The wind report from step 3 (`npm run report:winds`, eight or nine cases, error figures against the observed Earth, three checks against published studies) is the yardstick to judge it by.

### What step 2 built that later steps rely on
- **Planet settings on the world:** axial tilt, the star's brightness and mass, the orbit's distance and the greenhouse strength, saved with the world. A note in the Planet panel warns when they are outside the range the temperature model is trusted for.
- **Monthly temperature fields** for the twelve months, solved in a Web Worker only while the Temperature layer shows. A world finer than 64 cells per face edge is solved on the grid one step coarser and carried back, so coasts are smoothed over about one coarse cell.
- **Earth comparison:** on an untouched Earth preset the layer shows simulated, observed or difference. It was built so each later step can add its own observed layer.
- **Earth error baseline:** annual mean −0.15 °C and RMS 3.93 °C at 64, committed in `src/core/baseline/earthTemperature.json`, with a test that fails if the figures get worse. The model's constants were tuned against the observed Earth when the solver was built (step 2, piece 4); they were not tuned again when the comparison was added. Step 3's winds only read the temperature and do not change it (the user's choice, 2026-11-13). Heat carried by winds (step 3b) and above all ocean currents (step 5) are expected to improve it, most of all the seasonal figures (monthly RMS 3.6 to 6.5 °C, coldest month 5.2 °C, against 3.9 °C for the annual average); re-run `npm run baseline:temperature` when a step changes the temperature.

### Left out of step 2, to pick up in a later step
- **Rotation rate** is not yet a planet setting. Step 3 needs it: it sets the width and number of the wind bands.
- **Orbit eccentricity.**
- **A flat map view.**
- **Real ice sheets:** step 2 only brightens cold surfaces; step 6 replaces that.

### Open follow-ups, nothing decided
- A fixed temperature scale option: the scale is fitted to each world, so a frozen planet is drawn in much the same colours as a warm one.
- With Sunlight on, the sun can be hard to find in the scene (accepted as it is for now).
- Terrain speckle on a world wholly at sea level (predates step 2).
- The build's 500 kB chunk warning (predates step 2).
- Whether the changed-lines coverage tool should also measure `scripts/`.
- Two small code notes from the step 2 review: a doc comment above the `MONTH_NAMES` re-export in `src/app/view.ts` that attaches to nothing; `cellLatitudes` in `src/core/insolation.ts` and a longitude in `src/core/observed.ts` repeating the `directionToLatLon` arithmetic with no test tying them together.
- Never tried by hand: Firefox, screen readers, touch and high-density screens, the production build since the solver speed-ups, and opening a world file saved before step 2 in the page.

## Prior art

Listed from memory, not searched, so possibly incomplete or out of date: SimEarth (Maxis, 1990; the closest in spirit, with drift, climate and biomes on one planet, but a game with its own rules rather than a tool for drawing a world); ExoPlaSim (a real climate model used by worldbuilders; offline, no ocean currents); ROCKE-3D, MITgcm, cGENIE (research models, hard to set up); Tectonics.js (browser tectonics with crude climate); Songs of the Eons and Undiscovered Worlds (rule-based climate); GPlates (real-Earth plate reconstruction, not a forward simulator). None is known to do the whole thing interactively.
