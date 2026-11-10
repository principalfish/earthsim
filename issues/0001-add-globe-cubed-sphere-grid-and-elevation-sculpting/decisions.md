# Decisions: Add globe, cubed-sphere grid and elevation sculpting

## Settled
- Scope is build step 1 only: project scaffold, the grid, a 3D globe, sculpting land and elevation, and save/load. Temperature and every later layer get their own issues. (2026-11-10)
- Grid is a cubed sphere: six square faces of N by N cells. (2026-11-10)
- Terrain is edited by sculpting elevation with raise, lower and smooth brushes applied directly on the globe. Sea level decides what is land. No separate land-mask mode. (2026-11-10)
- Architecture: TypeScript; the simulation is a pure library with no browser dependency, run in a Web Worker; Three.js draws the globe; no server, static files only; worlds saved by file export and import. The user chose this over deferring the Web Worker. (2026-11-10)
- Tooling: npm, Vite, Vitest, Biome, `tsc --noEmit`. This issue scaffolds it, since the repo has no source files. (2026-11-10)
- Purpose is worldbuilding: believable results and a fast simulation matter more than fidelity. (2026-11-10)
- Resolution: terrain and climate share one grid. Resolution is a per-world setting: 64 cells per face by default (about 150 km), with 128 (about 75 km) and 256 (about 40 km) selectable. Nothing may hard-code the resolution. (2026-11-10)
- Display: a sphere tinted smoothly by height (values blended between cells) and lit so slopes read as relief, with mountains physically raised from the sphere by an adjustable exaggeration, and a toggle to overlay the cell grid. Later map layers must drape over the raised surface. (2026-11-10)
- A new world can start as any of three: blank ocean of uniform depth, generated continents from noise, or an Earth preset from real elevation data. All three are in this issue; the user chose this over the recommendation to do blank ocean only and add the Earth preset with temperature. (2026-11-10)
- Web Worker role: a compute service. The main thread owns the terrain and applies brush strokes instantly; the worker receives a copy and returns computed layers. Proven in this issue with one small real layer: land and sea areas and a few height statistics. (2026-11-10)
- UI layer: plain TypeScript and DOM with hand-written HTML and CSS panels; no panel library and no UI framework. (2026-11-10)
- Undo and redo are in this issue, one whole brush stroke per step (Ctrl+Z, Ctrl+Shift+Z), remembering only the cells each stroke changed. (2026-11-10)
- The current world autosaves to browser storage and is restored on reopen or refresh. File export and import remain the way to keep, back up and share worlds. (2026-11-10)
- No flat map view in this issue; the globe is the only view. A flat map comes as its own issue around the temperature step. (2026-11-10)
- Sea level is an adjustable per-world setting with a slider, default zero. Elevation is stored in metres against a fixed zero datum; a cell is land when its elevation is above the world's sea level. (2026-11-10)
- A world's resolution is set at creation only. Changing it later (resampling) is out of scope and can be its own issue. (2026-11-10)
- The Earth preset uses NOAA's ETOPO 2022 ice-surface elevation: Greenland and Antarctica at the top of their ice. Bedrock data is not included; the ice-sheet issue may add it. (2026-11-10)
- The continent generator exposes a seed (same seed gives the same world, with a button for a random one) and a land-fraction slider. Its output is noise-shaped, a base to sculpt, not geologically plausible terrain. (2026-11-10)
- The simulation must be pauseable, with the user able to edit the map while it is paused. Nothing runs through time in this issue, so no pause control is built here, but the design must not block it: the main thread's world is always the editable, authoritative copy, and any later run starts from whatever that copy holds. (2026-11-10)
- Implementation model for this issue is `claude-fable-5-2`, this issue only ("lets use fable to implement this one time"). (2026-11-10)
- Pieces 1 to 4 ran without pauses ("can you continue building to the first manual check piece?"); the normal per-piece pauses apply from piece 5 on. (2026-11-10)
- Piece 5 approved after the user tried the globe ("Tried it, approve"). (2026-11-10)
- The generated continents are accepted as they are, straight noise-grid features included; the generator's noise is not reworked. (2026-11-10)
- The 551 kB bundle warning is left alone; Three.js is not split into its own chunk. (2026-11-10)
- Piece 6 brush size: a fixed radius slider from 100 to 3,000 km, default 500 km, the same on every world. (2026-11-10)
- Piece 6 raise and lower strength: metres per second at the brush centre, 100 to 5,000, default 1,000. (2026-11-10)
- Piece 6 smooth strength: the share of the gap to the neighbour average closed per second, on the same slider, capped so it cannot overshoot. (2026-11-10)

## Open

_None._

## Assumed
- Piece 6: the brush outline is a thin ring on the globe under the cursor, hidden with the move tool and off the globe; the browser's right-click menu is suppressed on the canvas only. The user was told and did not object.
- "Pauseable" means the later run through time (drift, ice ages) can be stopped at any point, the terrain sculpted and other inputs changed, and the run resumed from the edited state. Which inputs are editable while paused, and whether editing is locked while a run is in progress, are decided in the issues that add those runs.
- Cube-to-sphere mapping is equiangular (the variant that keeps cell sizes most even).
- Planet radius is Earth's for now; it becomes a parameter in a later issue.
- Elevation is one number per cell, kept within about -12,000 m to +12,000 m.
- A blank ocean world has a uniform depth of 4,000 m.
- Brushes have a size (radius in km) and a strength control, and act on the surface point under the cursor.
- Mouse: with a brush selected, left-drag sculpts and right-drag rotates the globe; the wheel zooms. A "move" tool makes left-drag rotate.
- The worker's statistics show in a small readout: land percentage, highest point, deepest point, mean land height and mean ocean depth.
- Autosave uses IndexedDB and keeps one slot: the current world only.
- The save file is a single versioned file holding the world's settings (resolution, sea level, generator seed if any) and its elevation data.
- The Earth data is committed once at 256 cells per face and averaged down for 128 and 64. A script kept in the repo regenerates it from the ETOPO download.
- ETOPO 2022's licence has not been checked; the builder verifies it allows redistribution before committing the data, and stops to ask if it does not.
- Terrain passes between the main thread and the worker as copied or transferred arrays, not shared memory, because shared memory needs server headers a plain static host cannot set.
- Target is a current desktop Chrome or Firefox with a mouse. Touch and mobile are out of scope.
- Deployment (for example GitHub Pages) is out of scope; the app runs from the Vite dev server and a static build.
