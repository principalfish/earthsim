# Development

Requires Node.js and npm. Run `npm install` once.

## Commands

| Command | What it does |
|-|-|
| `npm run dev` | Serve the page locally with hot reload |
| `npm run build` | Type-check, then write the static site to `dist/` |
| `npm test` | Run the unit tests once |
| `npm run check` | Lint and check formatting with Biome |
| `npm run typecheck` | Type-check every part of the source |
| `npm run build:earth` | Rebuild the Earth's elevation data from its source; see [Data](data.md) |
| `npm run build:observed-temperature` | Rebuild the Earth's observed temperature data; see [Data](data.md) |
| `npm run build:observed-winds` | Rebuild the Earth's observed winds and sea-level pressure data; see [Data](data.md) |
| `npm run build:observed-sea-temperature` | Rebuild the Earth's observed sea-surface temperature data; see [Data](data.md) |
| `npm run build:observed-currents` | Rebuild the Earth's observed surface currents data; see [Data](data.md) |
| `npm run baseline:temperature` | Write the Earth temperature baseline afresh; see below |
| `npm run baseline:winds` | Write the Earth winds baseline afresh; see [Winds](winds.md#the-earth-winds-baseline) |
| `npm run docs:config` | Write `src/core/config.md`, the list of every model's settings, from `src/core/config.ts`; a test fails when the committed page is not the one this writes |
| `npm run time:temperature` | Time the temperature solver at every resolution and print the simulated Earth's error figures, as Markdown tables. Takes a few minutes |
| `npm run time:climate` | Time the climate loop on the Earth at every resolution, pass by pass, from nothing and carried on from the settled result, and the currents' part of a pass, as Markdown tables. Takes about two minutes; see [Temperature](temperature.md#the-climate-loop) |
| `npm run time:winds` | Time a year of the Earth's winds at every resolution, as `solveWinds` solves them by default (the pressure on the 64 grid) and wholly on the world's own grid beside it, and print how far the two lie apart, as Markdown tables. Takes about half a minute; see [Winds](winds.md#the-pressure-of-finer-worlds-is-worked-out-on-the-64-grid) |
| `npm run tune:winds` | Run the wind model many times with its settings changed, on the wind report's nine cases, and print the Earth's error figures and every case's measures, as Markdown tables: a sweep of one setting, a search over several, every case for some settings, or the model run on the observed temperature; run with nothing after it to list the settings and the forms. It changes no setting; see [Winds](winds.md#the-settings-and-the-tuning-script) |
| `npm run report:winds` | Write the wind report, `reports/winds/index.html`, to open in a browser: the observed Earth's winds and sea-level pressure in January and July, the nine worlds the wind models are run on, and each registered model's maps, error figures and solve times, and its section against published studies: how each paper was read, and for three checks (winds and the pressure low at a 60° tilt, and the tropical cell and bands of wind with a faster and a slower day) the papers' words beside what the model shows. The file is not committed |

## The Earth temperature baseline

`src/core/temperature/baseline/earthTemperature.json` records how far the simulated Earth is from the observed one, so that a change to the model cannot make it worse unnoticed.

- **What it holds:** for the Earth at 64 cells per face edge solved by the climate loop, the mean and root-mean-square difference (simulated less observed, in kelvin) for the annual average, each month, the warmest month, the coldest month and the seasonal range; and the west–east coast contrasts, simulated and observed, for the year and January: western Europe against East Asia and the west of North America against its east, both at 40–60°N; and the mean and root-mean-square difference of the sea's own temperature against the observed sea-surface temperature, for the annual average and January, over the cells that are sea in both.
- **The test:** a test solves that Earth and fails, naming each figure, if any is worse than the file's by more than 0.05 K, or a simulated coast contrast is smaller than the file's by more than 0.25 K, so that a later step cannot quietly lose the winds' effect on the coasts. A figure that has improved passes.
- **When a change is meant to move the figures:** run `npm run baseline:temperature`, which rewrites the file and prints what moved, and commit the file with the change.
- **The winds follow the temperature,** so a change to the temperature model moves the Earth winds baseline too: run `npm run baseline:winds` as well; see [Winds](winds.md#the-earth-winds-baseline).

## The climate process diagram

The first tab of the Model settings screen is a diagram of how the climate is to be worked out when every part up to the biomes is built: the loop of temperature, pressure, winds and ocean currents, and what is worked out from its settled state. It is drawn as an SVG from the data in `src/app/ui/panel/processDiagram.ts`: the boxes, the arrows and the labels, in the units of a page 842 wide, with the vertical position counted up from its foot.

- **The diagram is a design,** mostly of parts not built yet. Edit the data when one of them, once built, changes it, and the "Built today" and "Planned, not built" lines under the drawing with it.
- **The settings are not in it.** Every setting of the temperature and wind models is on the screen's other tabs and in [`src/core/config.md`](../src/core/config.md), both written from `src/core/config.ts`.

## Type-checking rules

- The core is compiled without the DOM type library, and the worker with the worker's library in its place. A `document` or `window` reference in either fails `npm run typecheck`.
- The project does not depend on Node's type package, so nothing under `src/` can use a Node API. The scripts are checked against the few Node functions they call, declared by hand in `scripts/node.d.ts`.

## Source layout

### `src/core/`: the simulation

A pure library with no DOM, Three.js or worker globals.

| File | What it holds |
|-|-|
| `grid/grid.ts` | The cubed-sphere grid every layer lives on, and its table of neighbours for a grid of any size |
| `grid/coarsen.ts` | A world or a field averaged onto the grid a step coarser, and a field or a vector field carried back from it |
| `grid/vector.ts` | Vector fields on the grid, east and north at every cell, the gradient, divergence, curl, Laplacian and smoothing of fields, and what a vector field carries across every edge |
| `grid/flows.ts` | What is carried across the edges of a grid, added up onto the grid a step coarser and shared out onto the finer |
| `grid/corners.ts` | The corners of the cells, numbered once across the cube's faces; flows across the edges from a streamfunction on them; the coasts of a land mask; and the elliptic solve on the corners with one value of `ψ` along each coast |
| `grid/sparse.ts` | Sparse matrices by rows and the linear algebra the corner solve is built from: products, incomplete LU, a Galerkin multigrid cycle and BiCGSTAB |
| `grid/quantile.ts` | Area-weighted quantiles of values on the grid |
| `climate.ts` | The climate: the temperature and winds solved together in passes, each feeding the other, with its stopping and damping; see [Temperature](temperature.md#the-climate-loop) |
| `config.md` | The list of every model's settings, written from `config.ts` by `npm run docs:config` |
| `config.ts` | The models' settings as data, a section per model: each setting's value, unit, what it controls, what raising and lowering it do, where its value comes from and whether it was tuned, in titled groups; the temperature's 25 settings and the wind model's 36, each with its fixed choices beside them, and which of the wind settings a tuning search varies. The models build their value objects from it, and it imports nothing from them |
| `world/world.ts` | A world: its settings, its date and the elevation of every cell |
| `world/generate.ts`, `world/noise.ts` | Worlds with noise-shaped continents, and the seeded noise behind them |
| `world/brush.ts` | The sculpting brushes: raise, lower and smooth |
| `world/history.ts` | The history of terrain edits, for undo and redo |
| `world/stats.ts` | Summary statistics of a world's terrain |
| `world/serialize.ts` | The world file format and the checks a file must pass |
| `planet/planet.ts` | The six planet settings, their limits and Earth's values, and the five of them the temperature reads (all but the day length); the sunlight, year length, rotation rate and trust warnings that follow from them; a world's date |
| `planet/star.ts` | The star as the planet sees it: radius, surface temperature, colour, size in the sky and direction in each month |
| `planet/insolation.ts` | Sunlight by latitude and time of year, the twelve months, and each cell's latitude |
| `earth/earth.ts` | Reading the Earth data file; the Earth as a world at each resolution |
| `earth/observedGrid.ts` | What the observed files share: the one-degree grid, the checks on twelve months of it, storing a value as one byte, and bilinear interpolation onto a world's cells |
| `earth/observedVectors.ts` | Taking a vector observed on a latitude–longitude grid onto a world's cells, as 3D vectors along each point's directions east and north; shared by the observed winds and currents |
| `ocean/gyres.ts` | The wind-driven gyres: the wind's push on the sea, Stommel's gyre solved on the corners each month with an island rule and the circumpolar channel's own friction, the flows across the edges, the surface current and the Ekman transport; see [Ocean](ocean.md) |
| `ocean/basins.ts` | The seas and coasts a gyre is solved between: which coast of each sea holds its value, which are islands, the small islands the sea flows over, the enclosed seas held still, and the corners beside which the sea can flow round the globe |
| `ocean/observed.ts` | Reading the observed sea-surface temperature and surface currents files and taking them onto a world's cells |
| `temperature/observed.ts` | Reading the observed temperature file and taking it onto a world's cells |
| `temperature/temperature.ts` | The temperature model, its values read from `config.ts`, and its solve: the air's temperature everywhere and the sea's own over the sea, exchanging heat, with a year of winds to carry heat along if given; see [Temperature](temperature.md#the-seas-own-temperature) |
| `temperature/advection.ts` | Heat carried along by the winds: an implicit upwind step on the grid that keeps the heat exactly, and the flows' interpolation between months; see [Temperature](temperature.md#heat-carried-by-the-winds) |
| `temperature/exchange.ts` | Heat passed between neighbouring cells, and the multigrid-preconditioned solver for it |
| `temperature/baseline/` | The Earth temperature baseline (`earthTemperature.ts`, the figures in `earthTemperature.json`), the west–east coast contrasts it holds (`coastContrast.ts`) and its check |
| `wind/flowing.ts` | The flowing part of a wind: what it carries across every edge, with the converging part taken out so every cell has as much going in as out, and its form for the grid the temperature is solved on; see [Winds](winds.md) |
| `wind/model.ts` | The shape every wind model shares, its error figures against the observed winds and pressure, and the mean of a field by bands of latitude |
| `wind/rules.ts` | The rules wind model on a world's own grid, its settings read from `config.ts`, and its parts: sea-level pressure from zonal bands placed by the temperature and the day length plus thermal highs and lows, and the wind from it by a balance of pressure gradient, turning and friction; see [Winds](winds.md) |
| `wind/solve.ts` | The winds of a world: its input checked, the rules model's pressure worked out on the 64 grid and carried back to the world's grid, the winds from it there, and the annual mean of a year of winds |
| `wind/observedWind.ts` | Reading the observed wind and pressure files and taking them onto a world's cells, the wind as a vector, sampled with `earth/observedVectors.ts` |
| `wind/baseline/` | The Earth winds baseline (`earthWinds.ts`, the figures in `earthWinds.json`) and its check |
| `index.ts` | What the core exports |
| `protocol.ts` | The messages between the page and the worker, of two kinds: the terrain statistics and the climate (the temperature and winds solved together, which tells of each pass as it finishes) |
| `compare.ts` | One field less another, and area-weighted error figures, over every cell or only where both fields hold a value |
| `testing/` | Helpers only the tests use |

### `src/app/`: the page

| File | What it holds |
|-|-|
| `main.ts` | Makes the parts of the page and hands them over to be joined |
| `wiring.ts` | Joins the parts: which part hears of what, and in which order |
| `wiring/` | What the joining uses: the types of the parts it is given (`parts.ts`), and how the globe is lit for the layer and the Sunlight setting (`lighting.ts`) |
| `editing/appState.ts` | The world being edited, and the ways to replace it or change its planet settings |
| `editing/sculpt.ts` | Sculpting with the mouse |
| `editing/undo.ts` | Undo and redo of strokes |
| `saving/startup.ts` | Brings the saved world back, or opens the New world dialog |
| `saving/storage.ts`, `saving/autosave.ts` | The saved world in IndexedDB, export and import, and when to save |
| `layers/refresh.ts` | When to ask a worker again after the world changes, whatever is on screen; with `oneAtATime` (statistics) one request at a time, an overtaken answer ignored; the climate scheduler, which keeps each pass as it finishes, carries on only from a climate that settled, and on Pause lets the pass under way finish and stops, carrying on from it on resuming |
| `layers/workerService.ts` | The statistics and climate services, each on its own worker, the climate's started afresh when a newer request overtakes it or Pause ends it |
| `layers/layers.ts` | The computed layers the page holds, the temperature and the winds worked out with it, and whether each is current; the climate writes both together, each pass as it finishes and the pass under way |
| `layers/view.ts` | What the globe shows: the layer, each computed layer's part of the year, the one source for the layer and the winds, the month, the sunlight, the winds and the grid; `StoredView`, the part the browser remembers (all but the month and the source) |
| `layers/scalar/` | Each layer of one computed value per cell described as data, the temperature and the sea-level pressure the two offered (`temperature.ts`, `pressure.ts`, listed in `registry.ts`): its name, unit, how its values are written, its legend wording, its views of the year with their colours and scale fitting, its comparison with the observed Earth and where in the layer store its months come from; the layer panel, legend, cursor readout, top bar, date line and lighting take a description rather than naming the temperature. Also the description's types (`spec.ts`), a layer's values in the units chosen (`inUnit.ts`), the legend's caption (`caption.ts`), a year's fields and the scale a view of it is drawn on (`yearScale.ts`), and the fitting of a scale to the fields it shows and the writing of a value marked on it (`fit.ts`); importers take the rest through `index.ts` |
| `layers/playback.ts` | Playing through the year |
| `layers/earthData.ts`, `layers/observedData.ts` | Fetching the Earth data files when first needed, the observed years through a description of their file |
| `settings/panelMemory.ts` | Which panel sections are open, remembered by the browser |
| `settings/preferences.ts` | The page's preferences, remembered by the browser apart from the world, one `earth_sim.preference.` entry each: the system of units (`unitSystem`) and each quantity's unit override (such as `windSpeedUnitOverride`), into which the old `windSpeedUnit` entry is carried once and then removed, whether the winds are drawn as arrows or streaks, the layer, each layer's Show, and the Winds, Sunlight and Grid overlays; never the month or the comparison's source |
| `settings/units.ts` | The five quantities (temperature, pressure, wind speed, heights, distances), their units with each one's conversion from metric and decimals, the Metric and Imperial systems, the choice of a system with an override per quantity and the store that tells its listeners of each change, where choosing a system clears the overrides; also the eight compass points and a wind in words |
| `globe/` | The renderer, the material and its shaders (`material/`), camera, picking, colour ramps, the wind arrows and the wind streaks (`streaks.ts`: the trails moved along the wind, and their ribbons), when the globe is drawn (`frameLoop.ts`: on demand, or at every frame while animating) and the rule for when the streaks move (`windMotion.ts`) |
| `ui/main/` | What sits over the globe: the regions laid over it (`mainView.ts`), the dock of tiles there that choose the layer and switch the overlays (`layerDock.ts`), the top bar beside it with the layer's Show choice and the one comparison control (`topBar.ts`, `comparison.ts`), the timeline along the bottom with the month and Play (`timeline.ts`), the Pause button in the top-right corner (`pauseButton.ts`), the info box in the bottom-right corner (`infoBox.ts`), made of the legend (`legend.ts`: its ramp, marked at round values, on the scale the layer panel fits with `layers/scalar/`), one status line for the calculation, the layer and the winds (`windKey.ts` words where the winds stand) and the cursor readout (`cursorReadout.ts`) |
| `ui/panel/` | The side panel's sections, in the order the panel shows them (`panelSections.ts`): the world controls (`worldPanel.ts`) and the date line under the world's description (`dateLine.ts`), the view controls (`viewPanel.ts`), the planet controls (`planetPanel.ts`), the tool controls (`toolPanel.ts`), the statistics readout (`statsPanel.ts`), the Settings section's wind style, units and the button that opens the Model settings screen (`settingsPanel.ts`), that screen, a read-only dialog with the climate process diagram (`processDiagram.ts`) and every setting of the temperature and wind models read from `src/core/config.ts` (`modelSettings.ts`), and the New world dialog (`newWorldDialog.ts`) |
| `ui/` | What stays at the top of the folder: the labelled controls the panels are built from (`fields.ts`), the page's icons, which only the main view uses (`icons.ts`), a section of the side panel that opens and closes (`section.ts`), and the layer panel, which takes the layer, month, source and winds chosen on the dock, top bar and timeline and decides what the globe and the info box show (`layerPanel.ts`), with its types, the state it keeps, and the differences and error figures it works out against an observed year in `layerPanel/` (`types.ts`, `internal.ts`, `figures.ts`); its tests are split by theme, `layerPanel.test.ts` and `layerPanel.<theme>.test.ts` for the month, the comparison, the winds and the units |
| `styles.css` | The page's styles |
| `testing/` | Stand-ins for the canvas, document, storage, timers and animation frames, a made-up layer description, the reading of a shader's functions from its source (`glsl.ts`), years of Earth-like temperature and pressure for fitting scales (`earthLikeFixtures.ts`), and the layer panel on a real store with the results, observed years and winds its tests give it (`layerPanelStage.ts`), which only the tests use |

### `src/worker/`: the Web Worker

It computes from a copy of the world, and its answers depend on the request alone: it keeps no results between requests, only tables it can build again, such as the grid's. The page runs two: one for the statistics and one for the climate, which solves the temperature and the winds together in one request. The worker tells of each pass of the loop as it finishes, with its temperature and winds, and its response holds only the passes taken and whether it settled, the last pass's arrays being the result. The earlier passes' arrays are copies, since the loop goes on to read them; the last pass's are transferred. A pass cannot be interrupted, so a climate overtaken by a newer request, or stopped by Pause once its pass under way has finished, ends its worker and the page starts a fresh one.

| File | What it holds |
|-|-|
| `sim.worker.ts` | The worker itself, which only passes messages to the handler |
| `handle.ts` | The message handler, a plain function that answers one request of any kind |
| `client.ts` | The page's side of the channel |
| `testing/` | A stand-in worker for the tests |

### `scripts/`: building the data and the reports

Run with Node, not in the browser.

| File | What it does |
|-|-|
| `build-earth-data.ts` | Downloads the source and writes `public/data/earth-256.bin` |
| `build-observed-temperature.ts` | Downloads the source and writes `public/data/earth-temperature-1deg.bin` |
| `build-observed-winds.ts` | Downloads the three sources and writes `public/data/earth-wind-1deg.bin` and `public/data/earth-pressure-1deg.bin` |
| `build-observed-sea-temperature.ts` | Downloads the two sources and writes `public/data/earth-sea-temperature-1deg.bin` |
| `build-observed-currents.ts` | Downloads the two sources and writes `public/data/earth-currents-1deg.bin` |
| `observedGdalRun.ts` | Runs GDAL's `gdallocationinfo` on an observed source and compares it with this project's reader, for the air temperature and wind builds; `oceanGdalRun.ts` does the same for the sea temperature build |
| `observedBuild.ts` | What the observed builds share: the option, reading a source, and writing the data file; their range and storing-error checks are `earth/storedValues.ts` |
| `download.ts` | Downloads a source file into `.cache/` once, checked against its pinned length and SHA-256 |
| `downloadRetry.ts` | Downloads a file a server cuts afresh at each request, waiting and asking again when the server is busy |
| `earth/` | The parts of the build that touch no file: reading TIFF and netCDF, averaging pixels into cells, the sea sources (`oceanSource.ts`), the one-degree averaging of the currents (`regrid.ts`), and the comparison with GDAL. `dataFile.mjs` reads the finished data files |
| `time-temperature.ts` | The solver's timings and the simulated Earth's error figures |
| `time-winds.ts` | The wind model's timings, and how far its solve with the pressure on the 64 grid lies from one wholly on the world's own grid |
| `time-climate.ts` | Times the climate loop pass by pass |
| `update-earth-temperature-baseline.ts` | Writes the Earth temperature baseline afresh |
| `update-earth-winds-baseline.ts` | Writes the Earth winds baseline afresh |
| `write-config-doc.ts` | Writes `src/core/config.md` from the config |
| `baselineUpdate.ts` | What both baseline updates share: naming each number of a baseline, saying which moved, and writing the file |
| `wind-report.ts` | Writes the wind report, and lists the wind models it runs |
| `tune-winds.ts` | Runs the wind model with its settings changed and prints what each run gives |
| `tune/` | The parts of the tuning script that touch no file: its command line (`command.ts`), the sweep and the search (`search.ts`), the cases and their temperatures worked out once and the runs on them (`tuning.ts`), the numbers that show each known fault on the Earth (`faults.ts`), and the printout (`text.ts`) |
| `report/` | The parts of the wind report that touch no file: the cases (`cases.ts`), the maps (`map.ts`), the zonal-mean chart (`chart.ts`), the PNG writer (`png.ts`), the page (`page.ts`), the measures and checks against published studies (`summary.ts`) and the papers' words they are set beside (`literature.ts`), running the models on the cases (`run.ts`), and in `testing/` the XML and PNG readers only its tests use |
| `run-with-vite.mjs` | Runs a TypeScript script through Vite, so it can import the core |

### `public/data/`

The six Earth data files, served beside the page as they are; see [Data](data.md).
