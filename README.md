# earth_sim

Browser-based planet simulator for worldbuilding: draw continents and plates, then see temperature, winds, rainfall, ocean currents, ice and continental drift.

## Using the page

The first time, the page opens on a blank ocean, with the New world dialog showing. Pressing **Create world** as it stands gives generated continents on the coarsest grid, from a seed chosen at random, with 30% land; **Cancel** keeps the blank ocean. The **New world** button at the top of the panel brings the dialog back at any time, filled in with the options of the current world. It offers:

- **Resolution**: 64, 128 or 256 cells along each edge of a cube face, which makes cells of about 150, 75 or 40 km.
- **Start with**: a blank ocean, generated continents, or the Earth.
- **Seed**, for generated continents: a whole number from 0 to 4294967295. The same seed and land always give the same continents, and the same seed at another resolution gives the same continents on a finer or coarser grid. Leave the field blank for a seed chosen at random, or press **Random** to fill one in.
- **Land**, for generated continents: the share of the surface to make land, from 0 to 100%.

**Earth** starts from the real planet: the mean elevation of the ground and the sea floor in every cell, at the resolution chosen, with about 29% land at a sea level of 0 m. Greenland and Antarctica stand at the top of their ice, not at the rock beneath it. The seed and the land do not apply and are greyed out. The elevation data, under a megabyte, is fetched the first time an Earth world is made, while the button says "Loading Earth…", and is kept until the page is closed. If it cannot be fetched, the dialog says so and stays open, and the current world is left untouched; **Create world** tries again. See [Data](#data) for where the elevation comes from.

The line under the World heading says how the current world started, such as `Generated · 64 · seed 1977 · 30% land`, `Blank ocean · 128` or `Earth · 128`: the resolution, then the seed and the land. To get a world back, type its seed into the dialog and set the same land.

The line under it is the date: the world's age and, in Temperature view, the month on screen or the summary shown, such as `Year 0`, `Year 0 · July` or `Year 0 · Annual average`. Below ten thousand years the age is the year the world is in, counting from Year 0, such as `Year 1,234`; from there to a million it is the years gone by, `12,345 years`; then millions to a tenth, `2.4 million years`, and from a thousand million, billions, `4.5 billion years`. Each is rounded down, so an age is never written as one the world has not reached. A new world, and one saved before worlds had a date, reads `Year 0`.

A new world replaces the current one, and the old one cannot be brought back: its strokes are no longer there to undo. The sea level returns to 0 m, the planet settings to Earth's and the date to year zero. The camera, the relief exaggeration, the grid setting, the layer and the temperature view chosen and the tool settings stay as they were; the month on screen goes back to July, and the year stops playing. Generating the finest grid takes about half a second, during which the button says "Generating…" and the page does not respond; it cannot be cancelled once started.

The world is saved in the browser as you work: about a second after the last stroke, undo, redo, move of the Sea level slider or of a Planet slider, press of **Reset to Earth**, new world or import, and at once when the page is refreshed, left, closed or put in the background. Reopening or refreshing the page brings the world back as it was, with its resolution, its sea level, its planet settings and its date, and without the dialog. A browser that is killed, or that shuts a page without telling it first, as phones often do, can still lose what was changed in the last second. Under the World buttons, "Saved" says that the last save worked. "Autosave unavailable" says that the browser would not store the world, as some will not in a private window: the page works as before, but the world will not come back. The browser keeps one world for the page, so with the page open in two tabs the one that comes back is whichever was saved last. If the saved world cannot be read, the page opens on a blank ocean with the dialog, which says "The saved world could not be restored."

**Export** downloads the world as a file named `world.earthsim`. **Import** replaces the current world with the one in such a file, at once and without asking, and like a new world it leaves nothing to undo. A file that is not a world file, or one that is damaged, cut short or made by a newer version, is refused with a message under the buttons, and the current world is left untouched.

What is saved, in the browser and in a file alike, is the world only: its terrain, its resolution, its sea level, its planet settings (axial tilt, star brightness, star mass, orbit distance and greenhouse strength), its date in years since the world began, and how it started. A file saved before these existed is read with Earth's settings at year zero; a file whose planet settings are out of range, or whose date is negative, is refused as damaged rather than corrected. An Earth world is saved with its terrain like any other, so it comes back, and imports, without the elevation data being fetched again. The undo history, the camera, the relief exaggeration, the grid setting, the layer, temperature view and month chosen and the tool settings are not saved, and nor is the temperature, which is worked out again. A sea level that the Sea level slider cannot show is brought to one it can when a world is imported or brought back: to the nearest 10 m, the higher of two equally near, and to the nearer end of the slider if it lies beyond.

The Tools panel chooses what the left mouse button does on the globe:

- **Move**: left-drag turns the globe and the wheel zooms.
- **Raise**, **Lower** and **Smooth**: left-drag sculpts the terrain under the brush, whose outline follows the cursor. Right-drag turns the globe and the wheel zooms.

Two sliders set the brush. Brush radius runs from 100 to 3,000 km. Brush strength is how fast the centre of the brush rises or falls, from 100 to 5,000 m/s, for Raise and Lower; for Smooth it is a setting from 1 (gentlest) to 100 (strongest). The two strengths are kept apart, so changing one leaves the other as it was.

The Undo and Redo buttons at the top of the Tools panel step back and forward through the strokes, one stroke at a time:

- **Undo**: Ctrl+Z, or Cmd+Z on a Mac.
- **Redo**: Ctrl+Shift+Z or Ctrl+Y, or Cmd+Shift+Z on a Mac.

Up to the last 100 strokes can be undone, or fewer once they hold about 64 MB between them, which takes very long strokes on a fine grid. Making a new stroke after an undo discards what could have been redone. The keys do nothing while a stroke is being made, while typing in a text field or while the New world dialog is open. Only the terrain is put back: the sea level, the planet settings, the view settings and the tool settings are not part of the history, so Ctrl+Z after moving a Planet slider undoes the last stroke and leaves the planet as it is.

The View panel sets how the world is drawn and where its sea stands:

- **Relief exaggeration**, from 1× (true scale) to 100×: how many times taller than it is the land is drawn above the sea, and how much steeper its slopes are shaded. A new page starts at 40×. Only the drawing changes: the terrain, the brushes and the statistics are the same at every setting.
- **Sea level**, from −6,000 to 6,000 m in steps of 10 m: the height the sea stands at on the scale the terrain is measured on. Land is whatever stands above it, so raising it floods the low ground and lowering it lays the sea floor bare. The level is part of the world, and the statistics follow it.
- **Show cell grid**: draws the outlines of the grid's cells over the globe. It starts off.

The Planet panel, between View and Layers, sets the planet and its star. Each slider writes its value beside its label, adding "(Earth)" when it is Earth's exactly and is not already written as a multiple of Earth's, and a short line under its track marks Earth's value; the value is written to two or three significant figures, such as `0.861 × Sun` or `1.52 AU`. Each movement of a slider changes the world's settings, which are saved with the world and come back with it:

- **Axial tilt**, from 0° to 90° in half degrees, with Earth's 23.44° in place of 23.5°: how far the axis leans from upright to the orbit. It sets how far the sunlight moves north and south through the year, and so how strong the seasons are; at 0° there are none.
- **Star brightness**, from 0.1 to 10 times the Sun's: the sunlight the planet receives rises and falls with it, warming or cooling the planet.
- **Star mass**, from 0.1 to 10 times the Sun's: a heavier star makes the year shorter at the same distance, and a lighter one longer. It does not change the sunlight, but a shorter year gives each season less time to warm or cool the planet.
- **Orbit distance**, from 0.3 to 3 AU, an AU being the distance from the Earth to the Sun: the sunlight falls with the square of the distance, and the year lengthens farther out.
- **Greenhouse strength**, from 0 to 3 times Earth's in steps of 0.05: how strongly the air holds in heat, warming the planet. At 0 there is no greenhouse effect at all.

Star brightness, star mass and orbit distance move in about 200 steps of equal ratio rather than of equal amount, so that each step changes the value by about the same share, with a step exactly on Earth's value and the ends exactly on the limits.

Under the sliders, two lines follow the settings as they move. **Sunlight** is the sunlight the planet receives compared with what the Earth receives, from the star's brightness and the orbit's distance: as a share under twice Earth's, such as `86% of Earth's`, and as a multiple from there, such as `2.50 × Earth's`. **Year** is the length of the planet's year, from the orbit's distance and the star's mass: in days under two Earth years, such as `365 days`, and in Earth years from there, such as `3.2 years`.

The temperature model is calibrated on the Earth, and far from it its results are rough. A note under the two lines says so, and which way, once the sunlight and the greenhouse effect together leave the planet far colder or far hotter than the Earth; on the cold side it adds that the planet may be frozen over. They are taken together as a warmth, the sunlight times 1 + 0.633 × the greenhouse strength over Earth's 1.633, and the note shows outside a warmth of 0.9 to 1.25 of Earth's. Measured on the Earth, a warmth of about 0.86 freezes it over whatever the greenhouse strength, and one of about 1.25 takes its mean temperature past 33 °C; a generated world with 30% land and one all ocean do so within about 0.04 of those.

**Reset to Earth** puts all five settings back to Earth's at once, which is one change, worked out and saved once. On Earth's settings it does nothing.

The Statistics readout at the bottom of the panel shows how much of the surface is land, the highest and deepest points, the mean height of the land and the mean depth of the ocean. It follows the terrain and the sea level, a moment after each stroke, undo, redo or move of the Sea level slider. Until the first figures arrive, and again after a new world is made, it says "Calculating…", and if the worker that computes them cannot be started or fails it says "Statistics unavailable" and hides the figures, while the rest of the page keeps working. Once the worker itself is gone it goes on saying so, for later worlds too, until the page is reloaded. The highest and deepest points are elevations on the scale of the Sea level slider; the two means are measured from the sea level.

The Layers panel, between Planet and Statistics, chooses what the globe is coloured by: **Terrain**, the height colours the page opens on, or **Temperature**, the near-surface air temperature. In Temperature view the relief is still raised and shaded and the coastline is drawn as a thin line, and a drop-down, **Show**, chooses what of the year the globe shows:

- **Month**: the temperature in one month, July when the page opens. A slider picks the month from January to December, and **Play** steps through the year, a month a second, from December back round to January; the button stays pressed while the year plays, and pressing it again stops it. Moving the slider while the year plays carries on from the month chosen, a second after the slider last moved. Choosing another view or Terrain stops it.
- **Annual average**: the mean of the twelve months.
- **Warmest month** and **Coldest month**: each place's own warmest or coldest month, which need not be the same month everywhere.
- **Seasonal range**: how far each place's warmest month is above its coldest.

The temperatures, whichever month or summary is shown, are drawn in colours that run from dark blue for the coldest through red to pale yellow for the hottest, growing lighter from cold to hot. The legend under the choice shows the colours with round temperatures marked in °C and says what is shown, such as "Air temperature in July, °C". The scale is fitted to the world's whole year, so a colour means the same temperature in every month and in every summary, and the colours do not shift as the months go by. It spans the middle 99% of the year by area, every place in every month counting for its share of the surface, so that a tall peak or a small cold corner does not stretch the scale and squeeze the rest of the world into a few colours; its ends are rounded out to whole degrees. Places colder or hotter than that take the colour at the end of the scale, and the legend says so under its ends, such as "−34 and below" and "29 and above", at each end that has such places. The seasonal range, a difference of temperatures rather than a temperature, has a scale of its own from zero up to the largest range anywhere in the world, rounded up to a whole degree, marked every 5 degrees, and colours of its own, one hue from near white for a place whose year hardly changes to deep violet for the widest swing. Since most of a world changes little through the year, those colours change fastest at the low end of the scale, so that small ranges are told apart and not all drawn near white; its legend says it is a difference. The summaries are worked out on the page from the twelve months of each result.

Choosing Terrain gives back the height colours exactly. The layer, the view and the month are not saved; an edit of the terrain or the sea level keeps all three, and a new or imported world keeps the layer and the view but goes back to July, with the year stopped.

The temperature is worked out in a worker of its own, so that a slow solve never holds up the statistics, and only while Temperature is chosen: nothing is calculated until it first is. It is worked out a little under half a second after Temperature is chosen, and again after each stroke, undo, redo, move of the Sea level slider, change of a planet setting or new world. While a Planet slider is dragged, the calculation waits until the slider has been still for that time, and one overtaken by a later movement is stopped. After a terrain edit the calculation carries on from the last result, which settles in fewer years, until the terrain has drifted past a limit from the last fresh calculation; the next one then starts afresh. A change of sea level or of a planet setting always starts the calculation afresh, as a new world does: some worlds have two settled climates, an ordinary one and a frozen one, and a calculation carried on from another sea level or planet can stay in the wrong one. Away from a freezing tipping point the two agree. On a world that sits at one, where a small change of terrain flips it between its two climates, a calculation carried on can stay in the wrong climate until the terrain has drifted by the limit, when the fresh calculation that follows corrects it. The limit is about as much as raising 25 patches of land, each 1,000 km across, by 1,000 m, or sweeping the default brush over land for some 80 seconds. An edit that tips a partly frozen world into a wholly frozen one may also not show in full until the next calculation. Until the first result arrives the globe keeps the height colours. While a newer result is being worked out, the one before stays on the globe, and the legend says "Calculating" with the years done, an estimate of the years to go when there is one, and a thin bar; a result that no longer describes the world is marked "Out of date". Should the globe be unable to take a result that is current, the legend says "Temperature could not be shown" when the globe shows no temperature, and marks an earlier result still on the globe "Out of date". A change made while a solve is still running ends that worker and starts a fresh one. While Terrain is chosen, a change only marks the result out of date, and the temperature is worked out once when Temperature is chosen again. If the worker cannot be started, the legend says "Temperature unavailable".

On a grid finer than the coarsest, the temperature is worked out on the grid one step coarser, 64 cells per face edge for a world of 128 and 128 for a world of 256, then carried back to the world's own grid, where each place is cooled by its own height. That takes a fifth to a quarter of the time: about 3.4 seconds for the Earth at 256 rather than 17, and 0.85 rather than 3.5 at 128, timed in Node. Mountains stay as sharply colder than their surroundings as their own height makes them. At coasts, though, the difference between land and sea is smoothed over about one coarse cell, about 156 km on a world of 128 and 78 km on a world of 256, and an island or a neck of land narrower than a coarse cell does not shape the calculation, though it keeps the cooling of its own height. On the Earth the result differs from working it out on the world's own grid by 0.1 °C root-mean-square at 128, and by at most 1.4 °C in any place and month, on the Caspian Sea's northern shore in June; by 0.07 °C and 0.9 °C at 256, on the Gulf of Ob in June.

## Development

Requires Node.js and npm. Run `npm install` once, then:

- `npm run dev`: serve the page locally with hot reload.
- `npm run build`: type-check, then write the static site to `dist/`.
- `npm test`: run the unit tests once.
- `npm run check`: lint and check formatting with Biome.
- `npm run typecheck`: type-check every part of the source.
- `npm run build:earth`: rebuild the Earth's elevation data from its source; see [Data](#data).
- `npm run build:observed-temperature`: rebuild the Earth's observed temperature data from its source; see [Data](#data).
- `npm run time:temperature`: time the temperature solver at every resolution, from nothing and after small edits, on the Earth and a generated world, as the page works it out and, above the coarsest grid, on the world's own grid as well; print how far apart those two are and the simulated Earth's error against the observed temperature, as Markdown tables. It takes a few minutes.

### Layout

- `src/core/`: the simulation as a pure library, with no DOM, Three.js or worker globals.
  - `src/core/serialize.ts`: the world file format, and the checks a file must pass to be read as a world.
  - `src/core/earth.ts`: reading the Earth data file, and the Earth as a world at each resolution.
  - `src/core/observed.ts`: reading the observed temperature file, and taking it onto a world's cells.
  - `src/core/temperature.ts`: the temperature model, a seasonal energy balance on the world's grid, or the grid a step coarser above the coarsest, stepped through the year until the year repeats.
  - `src/core/coarsen.ts`: a world averaged onto the grid a step coarser, and a field carried back from it.
  - `src/core/exchange.ts`: heat passed between neighbouring cells, and the multigrid-preconditioned solver for the implicit steps it needs.
  - `src/core/compare.ts`: area-weighted error figures between two sets of monthly fields.
  - `src/core/testing/`: temperature results and progress of the right form, which only the tests use.
- `src/app/`: the page, which imports the core.
  - `src/app/main.ts`: makes the parts of the page from the document, the globe, the workers and the browser's storage, and hands them over to be joined.
  - `src/app/wiring.ts`: joins the parts of the page together: which part hears of what, and in which order.
  - `src/app/startup.ts`: what the page does once it knows what was saved before: bring the saved world back, or open the New world dialog.
  - `src/app/appState.ts`: the world being edited, the one way of replacing it, the way to set its planet settings, and the word that they have changed.
  - `src/app/sculpt.ts`: sculpting with the mouse, which turns the cursor's path into dabs of a brush.
  - `src/app/undo.ts`: undo and redo of strokes, and the keys that ask for them.
  - `src/app/refresh.ts`: when to ask a worker again after the world changes.
  - `src/app/workerService.ts`: the statistics and temperature services, each on a worker of its own: starting the worker, keeping only the newest answer, and what happens when there is no worker.
  - `src/app/layers.ts`: the computed layers the page holds, for now the temperature, with whether it is current, out of date or being calculated.
  - `src/app/view.ts`: the view settings that choose what the globe shows: the layer, what of the temperature's year is shown, and the month on screen.
  - `src/app/playback.ts`: playing through the year, a month at a time.
  - `src/app/storage.ts`: the saved world in the browser's IndexedDB, and exporting and importing world files.
  - `src/app/autosave.ts`: when to save after the world changes.
  - `src/app/earthData.ts`: fetching the Earth data file the first time it is needed.
  - `src/app/globe/`: the globe's renderer, shaders, camera and picking, and the colour ramps of the data layers (`ramp.ts`).
  - `src/app/ui/`: the panels of controls, the New world dialog, the Layers panel, the legend and the date line.
  - `src/app/testing/`: stand-ins for the canvas, the document the panels are built in, the browser's animation frames and timers, and a way to let settled promises run, which only the tests use.
- `src/worker/`: the Web Worker that computes from a copy of the world and keeps nothing between requests. The page runs two of it, one for the statistics and one for the temperature.
  - `src/worker/sim.worker.ts`: the worker itself, which only passes messages to the handler, and posts its progress and its answer, whose arrays it transfers.
  - `src/worker/handle.ts`: the message handler, a plain function that answers one request.
  - `src/worker/client.ts`: the page's side of the channel, which runs on the main thread.
  - `src/worker/testing/`: a stand-in for the simulation worker, which only the tests use.
- `public/data/earth-256.bin`: the Earth's elevation, served beside the page as it is.
- `public/data/earth-temperature-1deg.bin`: the Earth's observed monthly temperature, served the same way.
- `scripts/`: what builds the data, run with Node rather than in the browser.
  - `scripts/build-earth-data.ts`: downloads the source and writes `public/data/earth-256.bin`.
  - `scripts/build-observed-temperature.ts`: downloads the source and writes `public/data/earth-temperature-1deg.bin`.
  - `scripts/download.ts`: downloads a source file into `.cache/` once, checked against the length and SHA-256 pinned for it.
  - `scripts/earth/`: the parts of those scripts that touch no file: what each source file must be and the checks on its download, reading the TIFF and netCDF formats, averaging pixels into cells, and the comparison with GDAL. `dataFile.mjs` reads the finished data files for the tests, and `testing/` writes small netCDF files for them.
  - `scripts/time-temperature.ts`: the solver's timings and the simulated Earth's error figures.
  - `scripts/run-with-vite.mjs`: runs a TypeScript script through Vite, so that it can import the core.

The core is compiled without the DOM type library, and the worker and its handler with the worker's in place of it, so a `document` or `window` reference in either fails `npm run typecheck`. The project does not depend on Node's type package either, so nothing under `src/` can use a Node API; the scripts are type-checked against the few Node functions they call, declared by hand in `scripts/node.d.ts`.

## Data

The Earth start uses `public/data/earth-256.bin`: the mean elevation of each of the 393,216 cells of the finest grid, as whole metres in signed 16-bit integers, little-endian, in cell order, with no header (786,432 bytes). The two coarser grids are averaged from it, by area, when an Earth world is made.

It is derived from NOAA's ETOPO 2022 global relief model:

- **Product**: ETOPO 2022 at 60 arc-seconds, ice surface version, as the GeoTIFF `ETOPO_2022_v1_60s_N90W180_surface.tif` (21,600 × 10,800 pixels of one arc-minute; elevations in metres against the EGM2008 geoid, in effect mean sea level), from <https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/>. The file is 465,969,062 bytes and its SHA-256 is `9d27d4b8ea8e76977e2988bca667d7c8fa68b927355feffcddd6b4875a7fd08e`; the build script checks both, at every run, and deletes a file whose SHA-256 differs.
- **Ice surface**: the elevations follow the top of the ice sheets, so Greenland and Antarctica stand at the height of their ice. The bedrock version of the model is not used, and the page has no data on the rock under the ice.
- **Citation**: NOAA National Centers for Environmental Information. 2022: ETOPO 2022 15 Arc-Second Global Relief Model. NOAA National Centers for Environmental Information. https://doi.org/10.25921/fd45-gt74 . Accessed 2026-11-11.
- **Licence**, as stated on NOAA's metadata page for that DOI, read on 2026-11-11: "These data were produced by NOAA and are not subject to copyright protection in the United States. NOAA waives any potential copyright and related rights in these data worldwide through the Creative Commons Zero 1.0 Universal Public Domain Dedication (CC0-1.0)." The same page says: "Not to be used for navigation."

To rebuild the file, run `npm run build:earth`. It downloads the GeoTIFF, about 466 MB, into `.cache/etopo/`, which is not committed, and reuses it from there afterwards; a download that was cut off carries on where it stopped, and one that would grow past the file's length is stopped and deleted. Each pixel goes to the cell that holds its centre and counts in that cell's mean by its area. The build takes about 40 seconds once the file is there, and gives the same bytes every time.

The script reads the GeoTIFF with its own small reader rather than a library. `npm run build:earth -- --verify-with-gdal` first compares what that reader gives with what [GDAL](https://gdal.org/)'s `gdallocationinfo` gives at about 2,400 pixels (the corners, the edges, the corners where tiles meet, and pixels at random) and stops if any differs; without GDAL installed it says so and carries on. When the file in this repository was built, on 2026-11-11 with GDAL 3.12.2, those pixels matched bit for bit, as did all 233,280,000 pixels in a separate comparison with the whole image as `gdal_translate` decodes it. The cell means were also worked out a second time from GDAL's copy of the image, with separate code: 392,815 cells came out the same to the metre, 3 differed by the rounding of a mean that ends in a half, and 398 lie beside lines between cells that the centres of whole columns of pixels fall exactly on, where rounding decides which cell a pixel goes to; none of those differed by more than 15 m.

### Observed temperature

`public/data/earth-temperature-1deg.bin` holds the Earth's observed temperature, for comparing the simulated one with: the mean air temperature 2 m above the ground or the sea for each month, January to December, averaged over 1981 to 2010. It keeps the source's own grid of points one degree apart, 181 latitudes from 90° N to 90° S and 360 longitudes eastward from 0°, and the core interpolates it onto a world's cells when needed. Each value is one unsigned byte `b` standing for `-80 + 0.5 × b` °C, so the file holds -80 to 47.5 °C in half-degree steps; the source runs from -53.7 to 41.4 °C. The bytes run month by month, then row by row from the north, then column by column from 0° E, with no header (12 × 181 × 360 = 781,920 bytes). Storing a value moves it by at most a quarter of a degree, and the build script stops rather than write a value outside the range.

It is derived from NOAA's Twentieth Century Reanalysis:

- **Product**: NOAA/CIRES/DOE 20th Century Reanalysis (V3), the long-term monthly means of 2 m air temperature (variable `air`, in kelvin, the mean of the 80 ensemble members), as the netCDF-3 file `air.2m.mon.ltm.nc` from <https://downloads.psl.noaa.gov/Datasets/20thC_ReanV3/Derived/Monthlies/2mSI-MO/>. The file is 4,699,840 bytes and its SHA-256 is `38ae70640e246a1e90c1a0bca5a7032bdb20a8431a107f30fd1823409b3a57db`; the build script checks both, at every run, and deletes a file whose SHA-256 differs. Its rows run from the South Pole to the North Pole; the build turns them over.
- **Caveat**: the reanalysis assimilates only surface pressure observations, with the sea surface temperature and sea ice prescribed, so its temperatures over land are less tightly tied to measurements than those of reanalyses that also assimilate temperatures.
- **Licence**, as stated in the dataset's record at NOAA PSL, read on 2026-11-11: "These data were produced by NOAA and are not subject to copyright protection in the United States. NOAA waives any potential copyright and related rights in these data worldwide through the Creative Commons Zero 1.0 Universal Public Domain Dedication (CC0-1.0)".
- **Acknowledgement**, as NOAA asks: data provided by the NOAA PSL, Boulder, Colorado, USA, from their website at <https://psl.noaa.gov>. For papers NOAA also asks for: "Support for the Twentieth Century Reanalysis Project version 3 dataset is provided by the U.S. Department of Energy, Office of Science Biological and Environmental Research (BER), by the National Oceanic and Atmospheric Administration Climate Program Office, and by the NOAA Earth System Research Laboratory Physical Sciences Laboratory."
- **Reference**: Slivinski, L. C., Compo, G. P., Whitaker, J. S., Sardeshmukh, P. D., et al. (2019), Towards a more reliable historical reanalysis: Improvements for version 3 of the Twentieth Century Reanalysis system. Q J R Meteorol Soc, 145, 2876–2908. https://doi.org/10.1002/qj.3598 .

To rebuild the file, run `npm run build:observed-temperature`. It downloads the source, about 4.7 MB, into `.cache/observed/`, which is not committed, and reuses it from there afterwards, with the same checks on the download as the elevation build. It takes about a second once the file is there, and gives the same bytes every time.

The script reads the netCDF file with its own small reader rather than a library. `npm run build:observed-temperature -- --verify-with-gdal` first compares what that reader gives with what GDAL's `gdallocationinfo` gives at about 2,200 points, every month at each, both with the file's rows as they are and turned north side up, and stops if any differs; without GDAL installed it says so and carries on. When the file in this repository was built, on 2026-11-11 with GDAL 3.12.2, those values matched bit for bit, as did all 781,920 values in a separate comparison with the whole variable as `gdal_translate` decodes it.
