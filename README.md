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

A new world replaces the current one, and the old one cannot be brought back: its strokes are no longer there to undo. The sea level returns to 0 m, the planet settings to Earth's and the date to year zero. The camera, the relief exaggeration, the grid setting and the tool settings stay as they were. Generating the finest grid takes about half a second, during which the button says "Generating…" and the page does not respond; it cannot be cancelled once started.

The world is saved in the browser as you work: about a second after the last stroke, undo, redo, move of the Sea level slider, new world or import, and at once when the page is refreshed, left, closed or put in the background. Reopening or refreshing the page brings the world back as it was, with its resolution, its sea level, its planet settings and its date, and without the dialog. A browser that is killed, or that shuts a page without telling it first, as phones often do, can still lose what was changed in the last second. Under the World buttons, "Saved" says that the last save worked. "Autosave unavailable" says that the browser would not store the world, as some will not in a private window: the page works as before, but the world will not come back. The browser keeps one world for the page, so with the page open in two tabs the one that comes back is whichever was saved last. If the saved world cannot be read, the page opens on a blank ocean with the dialog, which says "The saved world could not be restored."

**Export** downloads the world as a file named `world.earthsim`. **Import** replaces the current world with the one in such a file, at once and without asking, and like a new world it leaves nothing to undo. A file that is not a world file, or one that is damaged, cut short or made by a newer version, is refused with a message under the buttons, and the current world is left untouched.

What is saved, in the browser and in a file alike, is the world only: its terrain, its resolution, its sea level, its planet settings (axial tilt, star brightness, star mass, orbit distance and greenhouse strength), its date in years since the world began, and how it started. A file saved before these existed is read with Earth's settings at year zero; a file whose planet settings are out of range, or whose date is negative, is refused as damaged rather than corrected. An Earth world is saved with its terrain like any other, so it comes back, and imports, without the elevation data being fetched again. The undo history, the camera, the relief exaggeration, the grid setting and the tool settings are not saved. A sea level that the Sea level slider cannot show is brought to one it can when a world is imported or brought back: to the nearest 10 m, the higher of two equally near, and to the nearer end of the slider if it lies beyond.

The Tools panel chooses what the left mouse button does on the globe:

- **Move**: left-drag turns the globe and the wheel zooms.
- **Raise**, **Lower** and **Smooth**: left-drag sculpts the terrain under the brush, whose outline follows the cursor. Right-drag turns the globe and the wheel zooms.

Two sliders set the brush. Brush radius runs from 100 to 3,000 km. Brush strength is how fast the centre of the brush rises or falls, from 100 to 5,000 m/s, for Raise and Lower; for Smooth it is a setting from 1 (gentlest) to 100 (strongest). The two strengths are kept apart, so changing one leaves the other as it was.

The Undo and Redo buttons at the top of the Tools panel step back and forward through the strokes, one stroke at a time:

- **Undo**: Ctrl+Z, or Cmd+Z on a Mac.
- **Redo**: Ctrl+Shift+Z or Ctrl+Y, or Cmd+Shift+Z on a Mac.

Up to the last 100 strokes can be undone, or fewer once they hold about 64 MB between them, which takes very long strokes on a fine grid. Making a new stroke after an undo discards what could have been redone. The keys do nothing while a stroke is being made, while typing in a text field or while the New world dialog is open. Only the terrain is put back: the sea level, the view settings and the tool settings are not part of the history.

The View panel sets how the world is drawn and where its sea stands:

- **Relief exaggeration**, from 1× (true scale) to 100×: how many times taller than it is the land is drawn above the sea, and how much steeper its slopes are shaded. A new page starts at 40×. Only the drawing changes: the terrain, the brushes and the statistics are the same at every setting.
- **Sea level**, from −6,000 to 6,000 m in steps of 10 m: the height the sea stands at on the scale the terrain is measured on. Land is whatever stands above it, so raising it floods the low ground and lowering it lays the sea floor bare. The level is part of the world, and the statistics follow it.
- **Show cell grid**: draws the outlines of the grid's cells over the globe. It starts off.

The Statistics readout at the bottom of the panel shows how much of the surface is land, the highest and deepest points, the mean height of the land and the mean depth of the ocean. It follows the terrain and the sea level, a moment after each stroke, undo, redo or move of the Sea level slider. Until the first figures arrive, and again after a new world is made, it says "Calculating…", and if the worker that computes them cannot be started or fails it says "Statistics unavailable" and hides the figures, while the rest of the page keeps working. Once the worker itself is gone it goes on saying so, for later worlds too, until the page is reloaded. The highest and deepest points are elevations on the scale of the Sea level slider; the two means are measured from the sea level.

## Development

Requires Node.js and npm. Run `npm install` once, then:

- `npm run dev`: serve the page locally with hot reload.
- `npm run build`: type-check, then write the static site to `dist/`.
- `npm test`: run the unit tests once.
- `npm run check`: lint and check formatting with Biome.
- `npm run typecheck`: type-check every part of the source.
- `npm run build:earth`: rebuild the Earth's elevation data from its source; see [Data](#data).

### Layout

- `src/core/`: the simulation as a pure library, with no DOM, Three.js or worker globals.
  - `src/core/serialize.ts`: the world file format, and the checks a file must pass to be read as a world.
  - `src/core/earth.ts`: reading the Earth data file, and the Earth as a world at each resolution.
- `src/app/`: the page, which imports the core.
  - `src/app/main.ts`: makes the parts of the page from the document, the globe, the worker and the browser's storage, and hands them over to be joined.
  - `src/app/wiring.ts`: joins the parts of the page together: which part hears of what, and in which order.
  - `src/app/startup.ts`: what the page does once it knows what was saved before: bring the saved world back, or open the New world dialog.
  - `src/app/appState.ts`: the world being edited, and the one way of replacing it.
  - `src/app/sculpt.ts`: sculpting with the mouse, which turns the cursor's path into dabs of a brush.
  - `src/app/undo.ts`: undo and redo of strokes, and the keys that ask for them.
  - `src/app/refresh.ts`: when to ask the worker again after the world changes.
  - `src/app/storage.ts`: the saved world in the browser's IndexedDB, and exporting and importing world files.
  - `src/app/autosave.ts`: when to save after the world changes.
  - `src/app/earthData.ts`: fetching the Earth data file the first time it is needed.
  - `src/app/globe/`: the globe's renderer, shaders, camera and picking.
  - `src/app/ui/`: the panels of controls and the New world dialog.
  - `src/app/testing/`: stand-ins for the canvas and the browser's animation frames, which only the tests use.
- `src/worker/`: the Web Worker that computes from a copy of the world and keeps nothing between requests.
  - `src/worker/sim.worker.ts`: the worker itself, which only passes messages to the handler.
  - `src/worker/handle.ts`: the message handler, a plain function that answers one request.
  - `src/worker/client.ts`: the page's side of the channel, which runs on the main thread.
- `public/data/earth-256.bin`: the Earth's elevation, served beside the page as it is.
- `scripts/`: what builds the data, run with Node rather than in the browser.
  - `scripts/build-earth-data.ts`: downloads the source and writes `public/data/earth-256.bin`.
  - `scripts/earth/`: the parts of that script that touch no file: what the source file must be and the checks on its download, reading its TIFF format, averaging pixels into cells, and the comparison with GDAL. `dataFile.mjs` reads the finished data file for the tests.
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
