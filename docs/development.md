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
| `npm run baseline:temperature` | Write the Earth temperature baseline afresh; see below |
| `npm run baseline:winds` | Write the Earth winds baseline afresh; see [Winds](winds.md#the-earth-winds-baseline) |
| `npm run time:temperature` | Time the temperature solver at every resolution and print the simulated Earth's error figures, as Markdown tables. Takes a few minutes |
| `npm run time:winds` | Time a year of the Earth's winds at every resolution, as `solveWinds` solves them by default (the pressure on the 64 grid) and wholly on the world's own grid beside it, and print how far the two lie apart, as Markdown tables. Takes about half a minute; see [Winds](winds.md#the-pressure-of-finer-worlds-is-worked-out-on-the-64-grid) |
| `npm run tune:winds` | Run the wind model many times with its settings changed, on the wind report's nine cases, and print the Earth's error figures and every case's measures, as Markdown tables: a sweep of one setting, a search over several, every case for some settings, or the model run on the observed temperature; run with nothing after it to list the settings and the forms. It changes no setting; see [Winds](winds.md#the-settings-and-the-tuning-script) |
| `npm run report:winds` | Write the wind report, `reports/winds/index.html`, to open in a browser: the observed Earth's winds and sea-level pressure in January and July, the nine worlds the wind models are run on, and each registered model's maps, error figures and solve times, and its section against published studies: how each paper was read, and for three checks (winds and the pressure low at a 60° tilt, and the tropical cell and bands of wind with a faster and a slower day) the papers' words beside what the model shows. The file is not committed |

## The Earth temperature baseline

`src/core/temperature/baseline/earthTemperature.json` records how far the simulated Earth is from the observed one, so that a change to the model cannot make it worse unnoticed.

- **What it holds:** for the Earth at 64 cells per face edge, the mean and root-mean-square difference (simulated less observed, in kelvin) for the annual average, each month, the warmest month, the coldest month and the seasonal range.
- **The test:** a test solves that Earth and fails, naming each figure, if any is worse than the file's by more than 0.05 K. A figure that has improved passes.
- **When a change is meant to move the figures:** run `npm run baseline:temperature`, which rewrites the file and prints what moved, and commit the file with the change.
- **The winds follow the temperature,** so a change to the temperature model moves the Earth winds baseline too: run `npm run baseline:winds` as well; see [Winds](winds.md#the-earth-winds-baseline).

## The climate process diagram

`docs/climate-process.pdf` is drawn by `scripts/docs/climate-process.py`. Its first page is a diagram of how the climate is to be worked out when every part up to the biomes is built: the loop of temperature, pressure, winds and ocean currents, and what is worked out from its settled state. The pages after it list the settings of the temperature and wind models, each with its value, what it controls, what raising or lowering it does, and where the value comes from.

It needs Python 3 and the `reportlab` library, which the project does not otherwise use, so run it from a throwaway environment outside the repository, `<dir>` being any folder there:

```bash
python3 -m venv <dir>
```

```bash
<dir>/bin/pip install reportlab
```

```bash
<dir>/bin/python scripts/docs/climate-process.py docs/climate-process.pdf
```

- **Re-running it with nothing changed** leaves the PDF byte-identical, so the PDF changes in a commit only when the script does. The committed PDF was drawn with reportlab 5.1.0; another version may write the same pages as different bytes.
- **The diagram is a design,** mostly of parts not built yet. Redraw it when one of them, once built, changes it.
- **The settings pages are a dated snapshot,** kept by hand in the script, with the date set once at its top. When a setting is added, removed or changed in `src/core/wind/rules.ts` or `src/core/temperature/temperature.ts`, bring the pages up to the code. A future `src/core/config.md` is to become the living list of the settings.

## Type-checking rules

- The core is compiled without the DOM type library, and the worker with the worker's library in its place. A `document` or `window` reference in either fails `npm run typecheck`.
- The project does not depend on Node's type package, so nothing under `src/` can use a Node API. The scripts are checked against the few Node functions they call, declared by hand in `scripts/node.d.ts`.

## Source layout

### `src/core/`: the simulation

A pure library with no DOM, Three.js or worker globals.

| File | What it holds |
|-|-|
| `grid/grid.ts` | The cubed-sphere grid every layer lives on |
| `grid/coarsen.ts` | A world or a field averaged onto the grid a step coarser, and a field or a vector field carried back from it |
| `grid/vector.ts` | Vector fields on the grid, east and north at every cell, and the gradient, divergence, curl, Laplacian and smoothing of fields |
| `grid/quantile.ts` | Area-weighted quantiles of values on the grid |
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
| `temperature/observed.ts` | Reading the observed temperature file and taking it onto a world's cells |
| `temperature/temperature.ts` | The temperature model |
| `temperature/exchange.ts` | Heat passed between neighbouring cells, and the multigrid-preconditioned solver for it |
| `temperature/baseline/` | The Earth temperature baseline (`earthTemperature.ts`, the figures in `earthTemperature.json`) and its check |
| `wind/model.ts` | The shape every wind model shares, its error figures against the observed winds and pressure, and the mean of a field by bands of latitude |
| `wind/rules.ts` | The rules wind model on a world's own grid, and its parts: sea-level pressure from zonal bands placed by the temperature and the day length plus thermal highs and lows, and the wind from it by a balance of pressure gradient, turning and friction; see [Winds](winds.md) |
| `wind/solve.ts` | The winds of a world: its input checked, the rules model's pressure worked out on the 64 grid and carried back to the world's grid, the winds from it there, and the annual mean of a year of winds |
| `wind/observedWind.ts` | Reading the observed wind and pressure files and taking them onto a world's cells, the wind as a vector along `grid/vector.ts`'s directions east and north |
| `wind/baseline/` | The Earth winds baseline (`earthWinds.ts`, the figures in `earthWinds.json`) and its check |
| `index.ts` | What the core exports |
| `protocol.ts` | The messages between the page and the worker, of three kinds: the terrain statistics, the temperature and the winds |
| `compare.ts` | One field less another, and area-weighted error figures |
| `testing/` | Helpers only the tests use |

### `src/app/`: the page

| File | What it holds |
|-|-|
| `main.ts` | Makes the parts of the page and hands them over to be joined |
| `wiring.ts` | Joins the parts: which part hears of what, and in which order |
| `editing/appState.ts` | The world being edited, and the ways to replace it or change its planet settings |
| `editing/sculpt.ts` | Sculpting with the mouse |
| `editing/undo.ts` | Undo and redo of strokes |
| `saving/startup.ts` | Brings the saved world back, or opens the New world dialog |
| `saving/storage.ts`, `saving/autosave.ts` | The saved world in IndexedDB, export and import, and when to save |
| `layers/refresh.ts` | When to ask a worker again after the world changes, whatever is on screen; the winds after each new temperature result and each change of the day length; the temperature and the winds stopped while paused and caught up on resuming; with `oneAtATime` (statistics, winds) one request at a time, an overtaken answer ignored |
| `layers/workerService.ts` | The statistics, temperature and winds services, each on its own worker |
| `layers/layers.ts` | The computed layers the page holds, the temperature and the winds worked out from it, and whether each is current |
| `layers/view.ts` | What the globe shows: the layer, each computed layer's part of the year, the one source for the layer and the winds, the month, the sunlight, the winds and the grid; `StoredView`, the part the browser remembers (all but the month and the source) |
| `layers/scalarLayer.ts` | Each layer of one computed value per cell described as data, the temperature and the sea-level pressure the two offered: its name, unit, how its values are written, its legend wording, its views of the year with their colours and scale fitting, its comparison with the observed Earth and where in the layer store its months come from; the layer panel, legend, cursor readout, top bar, date line and lighting take a description rather than naming the temperature |
| `layers/playback.ts` | Playing through the year |
| `layers/earthData.ts`, `layers/observedData.ts` | Fetching the Earth data files when first needed, the observed years through a description of their file |
| `settings/panelMemory.ts` | Which panel sections are open, remembered by the browser |
| `settings/preferences.ts` | The page's preferences, remembered by the browser apart from the world, one `earth_sim.preference.` entry each: the system of units (`unitSystem`) and each quantity's unit override (such as `windSpeedUnitOverride`), into which the old `windSpeedUnit` entry is carried once and then removed, whether the winds are drawn as arrows or streaks, the layer, each layer's Show, and the Winds, Sunlight and Grid overlays; never the month or the comparison's source |
| `settings/units.ts` | The five quantities (temperature, pressure, wind speed, heights, distances), their units with each one's conversion from metric and decimals, the Metric and Imperial systems, the choice of a system with an override per quantity and the store that tells its listeners of each change, where choosing a system clears the overrides; also the eight compass points and a wind in words |
| `globe/` | The renderer, shaders, camera, picking, colour ramps, the wind arrows and the wind streaks (`streaks.ts`: the trails moved along the wind, and their ribbons), when the globe is drawn (`frameLoop.ts`: on demand, or at every frame while animating) and the rule for when the streaks move (`windMotion.ts`) |
| `ui/main/` | What sits over the globe: the regions laid over it (`mainView.ts`), the dock of tiles there that choose the layer and switch the overlays (`layerDock.ts`), the top bar beside it with the layer's Show choice and the one comparison control (`topBar.ts`, `comparison.ts`), the timeline along the bottom with the month and Play (`timeline.ts`), the Pause button in the top-right corner (`pauseButton.ts`), the info box in the bottom-right corner (`infoBox.ts`), made of the legend (`legend.ts`), one status line for the calculation, the layer and the winds (`windKey.ts` words where the winds stand) and the cursor readout (`cursorReadout.ts`) |
| `ui/panel/` | The side panel's sections, in the order the panel shows them (`panelSections.ts`): the world controls (`worldPanel.ts`) and the date line under the world's description (`dateLine.ts`), the view controls (`viewPanel.ts`), the planet controls (`planetPanel.ts`), the tool controls (`toolPanel.ts`), the statistics readout (`statsPanel.ts`), the Settings section's wind style and units (`settingsPanel.ts`), and the New world dialog (`newWorldDialog.ts`) |
| `ui/` | What stays at the top of the folder: the labelled controls the panels are built from (`fields.ts`), the page's icons, which only the main view uses (`icons.ts`), a section of the side panel that opens and closes (`section.ts`), and the layer panel, which takes the layer, month, source and winds chosen on the dock, top bar and timeline and decides what the globe and the info box show (`layerPanel.ts`) |
| `styles.css` | The page's styles |
| `testing/` | Stand-ins for the canvas, document, storage, timers and animation frames, a made-up layer description, and years of Earth-like temperature and pressure for fitting scales (`earthLikeFixtures.ts`), which only the tests use |

### `src/worker/`: the Web Worker

It computes from a copy of the world, and its answers depend on the request alone: it keeps no results between requests, only tables it can build again, such as the grid's. The page runs three: one for the statistics, one for the temperature and one for the winds, which is sent the temperature's twelve months with the world.

| File | What it holds |
|-|-|
| `sim.worker.ts` | The worker itself, which only passes messages to the handler |
| `handle.ts` | The message handler, a plain function that answers one request of any kind |
| `client.ts` | The page's side of the channel |
| `testing/` | A stand-in worker for the tests |

### `scripts/`: building the data, the reports and the climate diagram

Run with Node, not in the browser; `docs/` alone is Python.

| File | What it does |
|-|-|
| `build-earth-data.ts` | Downloads the source and writes `public/data/earth-256.bin` |
| `build-observed-temperature.ts` | Downloads the source and writes `public/data/earth-temperature-1deg.bin` |
| `build-observed-winds.ts` | Downloads the three sources and writes `public/data/earth-wind-1deg.bin` and `public/data/earth-pressure-1deg.bin` |
| `observedGdalRun.ts` | Runs GDAL's `gdallocationinfo` on an observed source and compares it with this project's reader, for both observed builds |
| `observedBuild.ts` | What both observed builds share: the option, reading a source, and writing the data file; their range and storing-error checks are `earth/storedValues.ts` |
| `download.ts` | Downloads a source file into `.cache/` once, checked against its pinned length and SHA-256 |
| `earth/` | The parts of the build that touch no file: reading TIFF and netCDF, averaging pixels into cells, and the comparison with GDAL. `dataFile.mjs` reads the finished data files |
| `time-temperature.ts` | The solver's timings and the simulated Earth's error figures |
| `time-winds.ts` | The wind model's timings, and how far its solve with the pressure on the 64 grid lies from one wholly on the world's own grid |
| `update-earth-temperature-baseline.ts` | Writes the Earth temperature baseline afresh |
| `update-earth-winds-baseline.ts` | Writes the Earth winds baseline afresh |
| `baselineUpdate.ts` | What both baseline updates share: naming each number of a baseline, saying which moved, and writing the file |
| `wind-report.ts` | Writes the wind report, and lists the wind models it runs |
| `tune-winds.ts` | Runs the wind model with its settings changed and prints what each run gives |
| `tune/` | The parts of the tuning script that touch no file: its command line (`command.ts`), the sweep and the search (`search.ts`), the cases and their temperatures worked out once and the runs on them (`tuning.ts`), the numbers that show each known fault on the Earth (`faults.ts`), and the printout (`text.ts`) |
| `report/` | The parts of the wind report that touch no file: the cases (`cases.ts`), the maps (`map.ts`), the zonal-mean chart (`chart.ts`), the PNG writer (`png.ts`), the page (`page.ts`), the measures and checks against published studies (`summary.ts`) and the papers' words they are set beside (`literature.ts`), running the models on the cases (`run.ts`), and in `testing/` the XML and PNG readers only its tests use |
| `run-with-vite.mjs` | Runs a TypeScript script through Vite, so it can import the core |
| `docs/` | `climate-process.py`, which draws `docs/climate-process.pdf`; see [The climate process diagram](#the-climate-process-diagram) |

### `public/data/`

The four Earth data files, served beside the page as they are; see [Data](data.md).
