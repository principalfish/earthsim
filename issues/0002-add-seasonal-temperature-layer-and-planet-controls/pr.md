# Add seasonal temperature layer and planet controls

earth_sim could shape a planet but not simulate one. This adds the first simulated layer: where the planet is hot and cold through its year. Every later layer builds on it, since winds follow temperature contrasts, rain follows winds, and ice follows temperature.

## What it adds

**The temperature model.** A seasonal energy balance in `src/core`: monthly steps through the year, repeated until the year settles, with sunlight by latitude and season, land warming and cooling faster than sea, heat spreading between neighbouring cells, cooling with height, and snow or ice brightening cold surfaces. The implicit heat-exchange steps use a multigrid-preconditioned solver. A world finer than 64 cells per face edge is solved on the grid one step coarser and carried back to its own grid, where each cell is cooled by its own height. That takes a fifth to a quarter of the time (the Earth at 256 in about 3.4 seconds rather than 17, timed in Node) and differs from a solve on the world's own grid by about 0.1 °C root-mean-square.

**A worker and recalculation.** The solve runs in its own Web Worker, only while the Temperature layer is showing, and again after each stroke, undo, redo, sea-level move, planet change or new world. After a terrain edit it carries on from the last result; a change of sea level or planet, or enough accumulated terrain change, starts it afresh, so a world with both an ordinary and a frozen settled climate does not stay in the wrong one.

**Planet settings.** A Planet section sets axial tilt, the star's brightness and mass, the orbit's distance and the greenhouse strength, and shows the sunlight received and the length of the year. A note warns when the settings are outside the range the model is trusted for. The settings are saved with the world; older world files load with Earth's values. Planet changes are not undoable; a button resets them to Earth's.

**The layer on the globe.** Temperature replaces the height colours while relief and coastlines stay. The months can be stepped or played, or swapped for annual summaries (average, warmest month, coldest month, seasonal range). The legend sits over the globe's bottom-right corner, on a scale fitted to the middle 99% of the world's year by area so that one peak does not flatten the rest; the seasonal range has its own scale and colours. A strip at the bottom left gives the position, elevation and temperature under the pointer. The page shows the world's date and opens on Terrain.

**The sun.** The star is drawn in the scene, sized and coloured by its settings and moving north and south with the months. A Sunlight switch lights the globe from it with a day and a night side.

**Earth comparison.** While the world is the Earth preset exactly as made, the layer can show the simulated temperature, the observed one, or the difference on a fixed ±20 °C scale, with mean and root-mean-square error figures. The observed data is NOAA's 20th Century Reanalysis v3 monthly climatology (CC0), built into `public/data/` by a script with its own netCDF reader. The Earth's error figures at 64 are committed as a baseline (annual mean −0.15 °C, RMS 3.93 °C) and a test fails if they get worse. Nothing was tuned to the Earth: with no winds or ocean currents yet, the aim is the right broad pattern, and later steps should improve on the baseline.

**Panel layout.** Every side-panel section opens and closes, in the order World, Layers, View, Planet, Tools, Statistics. Only World is open on a first visit, and the state is remembered in local storage.

Not included: orbit eccentricity, rotation rate, a flat map view, winds, currents, rainfall and real ice sheets.

## How it was checked

- 73 test files with 2,429 tests; lint, typecheck and build pass. Tests run 97% of the changed lines under `src/`; the rest need WebGL 2 or are browser-only glue. The `scripts/` folder is outside that measure.
- Every piece from the month slider onward was tried by hand in the page before it was committed, in Edge on Windows, with the sun and the collapsible sections also tried from a Mac.
- One self-review round over the whole branch found no high or medium issues and nine low ones, plus one noticed in passing. All ten are fixed in `7896afc`, and a re-check of that commit was clean.

## Worth a look by hand

- Firefox, touch and high-density screens, and screen readers have not been tried.
- The production build has not been tried in a browser since the solver speed-ups; the dev server has.
- Opening a world file saved before this change has only been covered by tests, not tried in the page.
- `npm run build:earth` was not re-run after the review fixes moved a small helper it uses; typecheck covers the change, and the script needs a 466 MB download to run.

## Known limits

- The temperature scale is fitted to each world, so a frozen planet is drawn in much the same colours as a warm one; the legend's numbers tell them apart.
- At coasts on worlds finer than 64, the land and sea difference is smoothed over about one coarse cell, and an island narrower than that does not shape the result.
- With Sunlight on, the sun itself can be hard to find in the scene.
- Lowering the sea level cools the planet, since more land stands higher above the sea; this was kept as believable.

Closes #3

The piece-by-piece history is the plan checklist on #3.
