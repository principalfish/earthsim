# Add globe, cubed-sphere grid and elevation sculpting

earth_sim is a browser-based planet simulator for worldbuilding. This is its first step: a planet you can see and shape, and the foundation every later layer (temperature, winds, rainfall, oceans, ice, plate drift) is built on. The repository held only a README before this, so the branch also sets up the project: npm, Vite, Vitest, Biome and strict TypeScript.

## What it adds

- **A cubed-sphere grid** (`src/core/grid.ts`): six faces of N by N cells, with exact cell areas, neighbours across cube edges, and lookups by direction. Resolution is chosen per world: 64 cells per face (about 150 km), 128 or 256.
- **A world model** (`src/core/`): elevation in metres per cell, an adjustable sea level, and area-weighted terrain statistics. This library has no browser dependency; the type-check fails if it touches browser types.
- **Three ways to start a world:** a blank ocean, continents generated from a seed and a land fraction, or real Earth from NOAA's ETOPO 2022 elevation data.
- **A 3D globe** (`src/app/globe/`): Three.js, tinted by height and lit, with relief raised by an adjustable exaggeration, a cell-grid overlay, and seamless blending across cube edges done in the shader.
- **Sculpting:** raise, lower and smooth brushes applied on the globe, with per-stroke undo and redo.
- **A Web Worker compute service** (`src/worker/`): the page owns the editable world and the worker computes from a copy. It returns terrain statistics here; later climate layers use the same channel.
- **Saving:** worlds autosave to browser storage and restore on reload, and export to and import from a versioned file. An imported file is validated in full before the current world is touched.

Everything runs client-side as static files.

## The Earth data

`public/data/earth-256.bin` (0.79 MB) is derived from NOAA's ETOPO 2022 60 arc-second ice-surface elevation, which NOAA dedicates to the public domain under CC0-1.0. The README records the source, NOAA's citation and the licence statement. `npm run build:earth` regenerates the file; the 466 MB download is not committed. The script's hand-written TIFF reader was checked against GDAL and matched on all 233,280,000 pixels.

## How it was built and checked

Eleven pieces, one commit each, plus one commit of review fixes. Each piece went through the check commands and a review loop before it was committed, and the pieces whose effect has to be seen (the globe, sculpting, the new-world dialog, saving, the Earth preset) were tried by hand before approval.

At the head: `npm run check`, `npm run typecheck`, `npm test` (1,253 tests in 37 files) and `npm run build` all pass. Changed-lines coverage is 77%. The logic modules in `src/core` and `src/worker`, and the page's wiring, state, autosave and input handling, are at or near 100%.

A self review of the whole branch found no high-severity issues. Its 11 findings (one medium, ten low) are fixed in the last commit:

- the statistics readout stays "unavailable" once the worker has failed, and no longer shows figures for a world that has just been replaced;
- an imported sea level is rounded to the slider's step;
- the Earth data download is capped at its expected size;
- the sculpt controller, the globe's drag handling and the page's start-up wiring gained tests. The wiring moved from `main.ts` into a tested `wiring.ts`, and a re-check found no behavioural difference from that move.

A re-check of the fixes confirmed all 11 closed and raised three low points. One, an untested decision in how the statistics service is set up, is carried into the next issue, which reworks that code. The other two are accepted: the rule that saves only when the page is hidden, and a line that avoids rewriting identical status text, are both untested.

## Worth checking by hand

- **Firefox.** Every scripted browser check ran in headless Edge. Nothing has been tried in Firefox or Safari.
- **A real reload after the review fixes.** The saved-world checks in that round used an in-memory stand-in for browser storage, so a world surviving an actual refresh was last confirmed before the wiring moved. The storage code itself did not change.
- **The rendering.** `src/app/globe/renderer.ts` and the shaders need a GPU and have no automated tests.

## Known limits

- The brush lands slightly off the cursor on tall, exaggerated relief, because picking uses the smooth sphere.
- A worker that never answers has no timeout.
- A page killed without warning can lose the last second of edits.
- When the browser blocks storage, the page reports that the saved world could not be restored even if nothing was ever saved.
- The generated continents show some straight features that follow the noise's grid.
- The production bundle is about 560 kB, nearly all of it Three.js.

Closes #1
