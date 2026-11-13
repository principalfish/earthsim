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
| `npm run time:temperature` | Time the temperature solver at every resolution and print the simulated Earth's error figures, as Markdown tables. Takes a few minutes |
| `npm run report:winds` | Write the wind report, `reports/winds/index.html`, to open in a browser: the observed Earth's winds and sea-level pressure in January and July, the worlds the wind models are run on, and each registered model's maps, error figures and solve times. The file is not committed |

## The Earth temperature baseline

`src/core/baseline/earthTemperature.json` records how far the simulated Earth is from the observed one, so that a change to the model cannot make it worse unnoticed.

- **What it holds:** for the Earth at 64 cells per face edge, the mean and root-mean-square difference (simulated less observed, in kelvin) for the annual average, each month, the warmest month, the coldest month and the seasonal range.
- **The test:** a test solves that Earth and fails, naming each figure, if any is worse than the file's by more than 0.05 K. A figure that has improved passes.
- **When a change is meant to move the figures:** run `npm run baseline:temperature`, which rewrites the file and prints what moved, and commit the file with the change.

## Type-checking rules

- The core is compiled without the DOM type library, and the worker with the worker's library in its place. A `document` or `window` reference in either fails `npm run typecheck`.
- The project does not depend on Node's type package, so nothing under `src/` can use a Node API. The scripts are checked against the few Node functions they call, declared by hand in `scripts/node.d.ts`.

## Source layout

### `src/core/`: the simulation

A pure library with no DOM, Three.js or worker globals.

| File | What it holds |
|-|-|
| `grid.ts` | The cubed-sphere grid every layer lives on |
| `world.ts` | A world: its settings, its date and the elevation of every cell |
| `generate.ts`, `noise.ts` | Worlds with noise-shaped continents, and the seeded noise behind them |
| `brush.ts` | The sculpting brushes: raise, lower and smooth |
| `history.ts` | The history of terrain edits, for undo and redo |
| `stats.ts` | Summary statistics of a world's terrain |
| `protocol.ts` | The messages between the page and the worker |
| `index.ts` | What the core exports |
| `serialize.ts` | The world file format and the checks a file must pass |
| `earth.ts` | Reading the Earth data file; the Earth as a world at each resolution |
| `observed.ts` | Reading the observed temperature file and taking it onto a world's cells |
| `wind/model.ts` | The shape every wind model shares, its error figures against the observed winds and pressure, and the mean of a field by bands of latitude |
| `observedWind.ts` | Reading the observed wind and pressure files and taking them onto a world's cells, the wind as a vector along `vector.ts`'s directions east and north |
| `observedGrid.ts` | What the observed files share: the one-degree grid, the checks on twelve months of it, storing a value as one byte, and bilinear interpolation onto a world's cells |
| `planet.ts` | The six planet settings, their limits and Earth's values, and the five of them the temperature reads (all but the day length); the sunlight, year length, rotation rate and trust warnings that follow from them; a world's date |
| `star.ts` | The star as the planet sees it: radius, surface temperature, colour, size in the sky and direction in each month |
| `insolation.ts` | Sunlight by latitude and time of year, the twelve months, and each cell's latitude |
| `temperature.ts` | The temperature model |
| `coarsen.ts` | A world averaged onto the grid a step coarser, and a field or a vector field carried back from it |
| `vector.ts` | Vector fields on the grid, east and north at every cell, and the gradient, divergence, curl, Laplacian and smoothing of fields |
| `exchange.ts` | Heat passed between neighbouring cells, and the multigrid-preconditioned solver for it |
| `compare.ts` | One field less another, and area-weighted error figures |
| `quantile.ts` | Area-weighted quantiles of values on the grid |
| `baseline/` | The Earth temperature baseline and its check |
| `testing/` | Helpers only the tests use |

### `src/app/`: the page

| File | What it holds |
|-|-|
| `main.ts` | Makes the parts of the page and hands them over to be joined |
| `wiring.ts` | Joins the parts: which part hears of what, and in which order |
| `startup.ts` | Brings the saved world back, or opens the New world dialog |
| `appState.ts` | The world being edited, and the ways to replace it or change its planet settings |
| `sculpt.ts` | Sculpting with the mouse |
| `undo.ts` | Undo and redo of strokes |
| `refresh.ts` | When to ask a worker again after the world changes |
| `workerService.ts` | The statistics and temperature services, each on its own worker |
| `layers.ts` | The computed layers the page holds, and whether each is current |
| `view.ts` | What the globe shows: the layer, the part of the year, the source and the month |
| `playback.ts` | Playing through the year |
| `storage.ts`, `autosave.ts` | The saved world in IndexedDB, export and import, and when to save |
| `panelMemory.ts` | Which panel sections are open, remembered by the browser |
| `earthData.ts`, `observedData.ts` | Fetching the Earth data files when first needed |
| `globe/` | The renderer, shaders, camera, picking and colour ramps |
| `ui/` | The panel's sections and controls, the New world dialog, the legend and the cursor readout |
| `styles.css` | The page's styles |
| `testing/` | Stand-ins for the canvas, document, storage and timers, which only the tests use |

### `src/worker/`: the Web Worker

It computes from a copy of the world and keeps nothing between requests. The page runs two: one for the statistics and one for the temperature.

| File | What it holds |
|-|-|
| `sim.worker.ts` | The worker itself, which only passes messages to the handler |
| `handle.ts` | The message handler, a plain function that answers one request |
| `client.ts` | The page's side of the channel |
| `testing/` | A stand-in worker for the tests |

### `scripts/`: building the data and the reports

Run with Node, not in the browser.

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
| `update-earth-temperature-baseline.ts` | Writes the Earth temperature baseline afresh |
| `wind-report.ts` | Writes the wind report, and lists the wind models it runs |
| `report/` | The parts of the wind report that touch no file: the cases (`cases.ts`), the maps (`map.ts`), the zonal-mean chart (`chart.ts`), the PNG writer (`png.ts`), the page (`page.ts`), running the models on the cases (`run.ts`), and in `testing/` the XML and PNG readers only its tests use |
| `run-with-vite.mjs` | Runs a TypeScript script through Vite, so it can import the core |

### `public/data/`

The four Earth data files, served beside the page as they are; see [Data](data.md).
