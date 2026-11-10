# Plan: add-globe-cubed-sphere-grid-and-elevation-sculpting

**Build model:** claude-fable-5-2 — the user's choice for this issue only (2026-11-10: "lets use fable to implement this one time"). It applies to every piece and every review fix, and for this issue it overrides the "Builder on Sonnet" experiment in `models.md`. The checks keep their `models.md` tiers. The planner's own choice had been claude-opus-5-5, with Sonnet for the mechanical piece 1.

## Context

earth_sim is a browser-based planet simulator for worldbuilding. The repo holds only a README and a `.gitignore`; this issue creates everything else. It is build step 1 of 8: a planet the user can see and sculpt, on the grid and app structure that temperature, winds, rainfall, ocean currents, ice and plate drift will later be built on. Believable results and a fast simulation matter more than fidelity.

### Decisions (all settled with the user on 2026-11-10)

- **Scope:** scaffold, grid, 3D globe, sculpting, starting worlds, save/load. No climate or time simulation, no flat map view, no changing a world's resolution after creation.
- **Architecture:** TypeScript. The simulation is a pure library with no browser dependency, run in a Web Worker. Three.js draws the globe. No server: static files only.
- **Tooling:** npm, Vite, Vitest, Biome, `tsc`. Biome owns linting and formatting; no ESLint or Prettier.
- **Grid:** a cubed sphere, six square faces of N by N cells. Terrain and every later layer share this one grid.
- **Resolution:** a per-world setting fixed at creation: 64 cells per face by default (about 150 km), or 128 (about 75 km) or 256 (about 40 km). Nothing may hard-code the resolution.
- **Sculpting:** raise, lower and smooth brushes applied directly on the globe. No separate land-mask mode.
- **Undo and redo:** one whole brush stroke per step (Ctrl+Z, Ctrl+Shift+Z), remembering only the cells each stroke changed.
- **Sea level:** an adjustable per-world setting with a slider, default zero. Elevation is stored in metres against a fixed zero datum; a cell is land when its elevation is above the world's sea level.
- **Display:** a sphere tinted smoothly by height (values blended between cells) and lit so slopes read as relief, with mountains physically raised from the sphere by an adjustable exaggeration, and a toggle to overlay the cell grid. Later map layers must be able to drape over the raised surface.
- **Starting worlds:** blank ocean of uniform depth; generated continents from noise with a seed (same seed gives the same world, plus a button for a random one) and a land-fraction slider; an Earth preset from NOAA's ETOPO 2022 ice-surface elevation (Greenland and Antarctica at the top of their ice; no bedrock data).
- **Web Worker role:** a compute service. The main thread owns the terrain and applies brush strokes instantly; the worker receives a copy and returns computed layers. This issue proves the channel with one real layer: land and sea areas and height statistics.
- **Pausing (constraint from later steps):** a run through time must be pauseable, with the map editable while paused and the run resuming from the edited state. No pause control is built here, but the design must not block it: the main thread's world is always the editable, authoritative copy, and the worker keeps no world state between requests.
- **UI:** plain TypeScript and DOM with hand-written HTML and CSS; no panel library and no framework.
- **Saving:** worlds export to and import from a file, and the current world autosaves to browser storage and is restored on reopen or refresh.

### Taken as given (the user saw these and did not change them)

- Cube-to-sphere mapping is equiangular. Planet radius is Earth's (6,371 km), a constant for now.
- Elevation is one number per cell, kept within -12,000 m to +12,000 m. A blank ocean is 4,000 m deep.
- Brushes have a size (radius in km) and a strength, and act on the surface point under the cursor.
- Mouse: with a brush selected, left-drag sculpts and right-drag rotates; the wheel zooms. A "move" tool makes left-drag rotate.
- Statistics readout: land percentage, highest point, deepest point, mean land height, mean ocean depth.
- Autosave uses IndexedDB and keeps one slot, the current world.
- The save file is a single versioned file holding the world's settings and its elevation data.
- Earth data is committed once at 256 cells per face (about 0.8 MB) and averaged down for 128 and 64. A script in the repo regenerates it.
- ETOPO 2022's licence has not been checked. Verify it allows redistribution before committing the data; if it is unclear or does not, stop and ask.
- Terrain passes to the worker as a copied array, not shared memory (shared memory needs server headers a static host cannot set).
- Target: current desktop Chrome or Firefox with a mouse. Touch, mobile and deployment are out of scope.

## Approach

**Layout.** Three areas under `src/`, with the dependency direction enforced by the type-checker:

- `src/core/` — the pure library. No DOM, no Three.js, no worker globals. Type-checked without the DOM library so a stray browser reference fails `tsc`. All simulation logic and almost all tests live here.
- `src/worker/` — a thin Web Worker shell that receives requests and calls `core`, plus the main-thread client for it.
- `src/app/` — the page: Three.js globe, DOM panels, input handling, IndexedDB. Imports `core` and the worker client.

**World model.** A world is its settings (resolution, sea level, how it started) and one `Float32Array` of elevation, `6 * N * N` long, indexed `face * N * N + j * N + i`. The grid's geometry (cell centres, areas, neighbours) is derived from N alone and cached per resolution, not stored in the world.

**Coordinates.** Core uses unit vectors with +Z at the north pole and longitude 0 at +X, east positive towards +Y. The renderer converts to Three.js's Y-up frame in one place. The Earth preset's tests pin this convention down.

**Rendering.** A subdivided cube-sphere mesh with elevation uploaded as a floating-point texture. The shader blends elevation between neighbouring cells, tints by height, lights by the elevation gradient, and raises vertices by `max(elevation, seaLevel) - seaLevel` times the exaggeration, so land stands up and the ocean stays a smooth surface coloured by depth. A suggested way to get seamless blending across cube edges: a cube texture, sampled with the lookup direction's face coordinates warped from gnomonic to equiangular so texel (i, j) lines up with cell (i, j). The builder checks this against current Three.js and WebGL2 behaviour (float or half-float linear filtering in particular) and may choose another technique; record the choice in Notes. Use `WebGLRenderer`, not the WebGPU renderer.

**Picking.** Ray against the unit sphere, analytically. With high exaggeration the cursor is slightly off the raised surface; accepted for this issue.

**Worker channel.** Request and response messages carry an id and a kind; the client returns promises and offers a latest-wins helper so stale statistics are dropped. The worker is stateless: every request carries the world snapshot it needs.

**Rejected alternatives.**
- Hexagonal geodesic and latitude-longitude grids: the user chose the cubed sphere (plain arrays, maps to GPU cube textures; lat-long breaks down at the poles).
- A finer terrain grid than the climate grid: rejected for one shared grid, to avoid resampling every layer.
- The worker owning the world: rejected; brush strokes would become message round trips and pause-and-edit is simpler with the main thread authoritative.
- A panel library or UI framework: rejected for plain DOM.
- Deferring the Web Worker: the user chose to build it now.
- Browser-automation tests (Playwright or similar): not planned. Rendering and interaction are verified by manual review; logic is kept in pure, unit-tested functions.

## Pieces

1. Scaffold tooling and app shell
   - Files: `package.json`, `package-lock.json`, `tsconfig*.json`, `vite.config.ts`, `biome.json`, `index.html`, `src/core/index.ts`, `src/core/index.test.ts`, `src/app/main.ts`, `src/app/styles.css`, `README.md`
   - What: an npm project with Vite, Vitest, Biome, TypeScript (strict) and Three.js installed. Scripts: `dev`, `build`, `test` (Vitest, run once), `check` (Biome lint and format check), `typecheck`. Type-checking is split so `src/core` compiles without the DOM library. The page shows a full-window canvas placeholder and an empty side panel. README gains the commands.
   - Functions: none of substance; a `CORE_VERSION` constant in `src/core/index.ts` for the smoke test.
   - Depends on: none
   - Acceptance: `npm run dev` serves the page; `npm run build`, `npm test`, `npm run check` and `npm run typecheck` all pass; adding a `document` reference to a file in `src/core` makes `npm run typecheck` fail (try it, then remove it).
   - Tests: a smoke test that Vitest runs against `src/core`. This piece is configuration; behaviour tests start in piece 2.

2. Cubed-sphere grid
   - Files: `src/core/grid.ts`, `src/core/grid.test.ts`
   - What: geometry for a resolution N, cached per N in typed arrays: cell index to and from (face, i, j); each cell's centre as a unit vector; each cell's exact area on the unit sphere; each cell's four edge neighbours, including across cube edges; the cell containing a given direction; latitude and longitude to and from a direction; all cells within an angular radius of a direction (for brushes).
   - Functions: `getGrid(n)`, `cellIndex`, `cellCentre`, `cellArea`, `neighbours`, `cellAt(direction)`, `cellsWithin(direction, radius)`, `latLonToDirection`, `directionToLatLon`
   - Depends on: 1
   - Acceptance: the tests pass at 64, 128 and 256; building the 256 grid takes well under a second.
   - Tests: cell areas sum to the whole sphere (4π) to 1e-9 relative at each resolution; largest-to-smallest area ratio is below 1.5; every cell has four distinct neighbours and neighbourhood is symmetric (B neighbours A whenever A neighbours B), checked for every cell including edges and corners; each neighbour's centre is within two cell widths (catches mis-stitched edges); `cellAt` of every cell centre returns that cell; `cellAt` of random directions returns the cell with the nearest centre among it and its neighbours; the poles and the eight cube corners resolve to a valid cell; latitude and longitude round-trip, with the north pole at +Z and (0°, 0°) at +X; `cellsWithin` matches a brute-force scan for random centres and radii, including ones spanning a cube corner; an unsupported resolution is rejected.

3. World model and terrain statistics
   - Files: `src/core/world.ts`, `src/core/stats.ts`, `src/core/world.test.ts`, `src/core/stats.test.ts`
   - What: the `World` type (resolution, sea level, origin record, elevation array) with the allowed resolutions and elevation limits as constants; a blank ocean world at -4,000 m; a statistics function returning land fraction by area, land and sea area in km², highest and deepest elevation, mean land height above sea level and mean ocean depth below it.
   - Functions: `createBlankWorld(resolution)`, `clampElevation`, `computeTerrainStats(world)`
   - Depends on: 2
   - Acceptance: the tests pass; statistics for a 256 world compute in a few milliseconds.
   - Tests: a blank world is 0% land with mean ocean depth 4,000 m and no NaN in any field; a world raised over one hemisphere is 50% land within one cell row's worth of area; raising sea level above a plateau turns it from land to sea in the statistics; an all-land world has no NaN and zero sea area; land plus sea area equals Earth's surface area (about 510.1 million km²); means are area-weighted (a test with tall small cells against low large cells); elevation outside the limits is clamped.

4. Continent generator
   - Files: `src/core/generate.ts`, `src/core/noise.ts`, `src/core/generate.test.ts`
   - What: a world of noise-shaped continents from a seed and a land fraction. Seeded 3D fractal noise is sampled at each cell's centre (so it is seamless over cube edges and the same seed gives the same continents at any resolution); the land threshold is the area-weighted quantile that yields the requested land fraction; heights are shaped so land rises from a coast, shelves are shallow and the ocean floor sits near -4,000 m. A small noise dependency such as `simplex-noise` is acceptable, or hand-written noise with a seeded generator.
   - Functions: `generateWorld({ resolution, seed, landFraction })`, `randomSeed()`
   - Depends on: 2, 3
   - Acceptance: the tests pass; generating a 256 world takes under about a second.
   - Tests: the same seed, resolution and land fraction give an identical elevation array; different seeds give different worlds; the land fraction of the result is within one percentage point of the request at 10%, 30%, 50% and 90%; land fraction 0 gives no land and 1 gives no sea; every elevation is finite and within the limits; the 64 and 128 versions of one seed agree on land or sea at the great majority of matching locations; elevation is continuous across cube edges (neighbour differences across edges are no larger than within faces).

5. Globe renderer with relief and view controls
   - Files: `src/app/globe/renderer.ts`, `src/app/globe/material.ts`, `src/app/globe/camera.ts`, `src/app/globe/picking.ts`, `src/app/globe/*.test.ts`, `src/app/ui/viewPanel.ts`, `src/app/main.ts`, `src/app/styles.css`, `index.html`
   - What: the Three.js globe as described under Approach, drawn on demand rather than in a continuous loop. Camera: drag rotates, wheel zooms within limits, the window can be resized. A view panel with a relief-exaggeration slider, a sea-level slider and a cell-grid overlay toggle. Until the new-world dialog exists (piece 9) the page opens on a generated 64 world with a fixed seed so there is terrain to look at. The renderer exposes: set the world, re-upload changed elevation, set sea level, set exaggeration, show or hide the grid, and pick the surface direction under a screen point.
   - Functions: `createGlobe(canvas)`, `globe.setWorld`, `globe.updateElevation`, `globe.setSeaLevel`, `globe.setExaggeration`, `globe.setGridVisible`, `globe.pick(x, y)`, `raySphere`, `coreToThree`
   - Depends on: 2, 3, 4
   - Acceptance: the generated world shows as a lit globe with blue oceans graded by depth and land graded green to brown to white; coastlines are smooth, not stair-stepped; no visible seams along cube edges or at corners; the exaggeration slider raises and flattens mountains; the sea-level slider floods and drains the land; the grid toggle shows cell outlines that line up with the terrain; rotating and zooming are smooth at 64, 128 and 256.
   - Tests: ray against the sphere hits the near point, misses outside the limb, and handles a ray starting inside; the core-to-Three.js conversion sends the north pole to +Y and round-trips; camera zoom is clamped to its limits. The shaders and scene need a real GPU and are verified by the manual review.
   - Manual review: the look of the globe and of the generated continents. From the builder's worktree run `npm install` then `npm run dev` and open the URL Vite prints. Check the acceptance list above by eye, in particular cube edges and corners (rotate until a corner faces you), and judge whether the generated continents are an acceptable base to sculpt.

6. Sculpting brushes
   - Files: `src/core/brush.ts`, `src/core/brush.test.ts`, `src/app/sculpt.ts`, `src/app/ui/toolPanel.ts`, `src/app/main.ts`, `src/app/styles.css`
   - What: raise, lower and smooth brushes. In `core`: apply one dab at a direction with a radius (km), a strength and a smooth falloff to zero at the edge, returning which cells changed; smoothing moves cells towards their area-weighted neighbour mean; results are clamped to the limits. In the app: a tool panel (move, raise, lower, smooth; size and strength sliders), the mouse scheme from Context, dabs spaced along the cursor's path so a fast drag leaves no gaps, strength scaled by elapsed time so the rate does not depend on frame rate, a brush outline on the globe, and only the changed cube faces re-uploaded.
   - Functions: `applyDab(world, { direction, radiusKm, strength, mode })`, `strokePath(from, to, spacing)`, `createSculptController(globe, world)`
   - Depends on: 5
   - Acceptance: raising on open ocean builds an island whose coast follows the brush shape; lowering cuts it back; smoothing softens a sharp peak; strokes across cube edges and corners show no seam or gap; sculpting stays responsive at 256 with the largest brush.
   - Tests: a raise dab increases only cells within the radius, most at the centre and nothing at or beyond the edge; lower is the mirror of raise; a dab centred on a cube corner changes cells on all three faces symmetrically; smoothing reduces the variance of a noisy patch and leaves a flat area unchanged; smoothing does not change the area-weighted mean noticeably; results never exceed the limits; the returned changed-cell list is exactly the set that changed; `strokePath` spaces dabs evenly along the great circle and includes the end point.
   - Manual review: how sculpting feels. Run `npm run dev` from the builder's worktree. Build an island, cut a bay, smooth a ridge, drag fast, and sculpt across a cube corner (turn on the grid overlay to find one). Try it at 256 by changing the fixed starting resolution if the dialog is not there yet; the builder says how.

7. Undo and redo
   - Files: `src/core/history.ts`, `src/core/history.test.ts`, `src/app/sculpt.ts`, `src/app/ui/toolPanel.ts`, `src/app/main.ts`
   - What: a stroke history. Each stroke records the before and after values of only the cells it touched. Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, with matching buttons that disable when there is nothing to do. A new stroke clears the redo stack. The history is capped (100 strokes) and is cleared when the world is replaced. Sea level and view settings are not part of the history.
   - Functions: `createHistory(limit)`, `history.begin()`, `history.record(cell, before)`, `history.commit(world)`, `history.undo(world)`, `history.redo(world)`
   - Depends on: 6
   - Acceptance: any sequence of strokes can be undone back to the starting terrain exactly and redone forward exactly; the globe updates on each step.
   - Tests: undo after one stroke restores the exact prior array; redo reapplies it exactly; several overlapping strokes undo in reverse order; a cell touched many times in one stroke restores to its value before the stroke; a new stroke after an undo discards redo; undo with empty history is a no-op; the cap drops the oldest stroke; a stroke that changed nothing adds no history entry; undo and redo report the changed cells so the right faces are re-uploaded.

8. Worker compute service and statistics readout
   - Files: `src/core/protocol.ts`, `src/worker/sim.worker.ts`, `src/worker/client.ts`, `src/worker/client.test.ts`, `src/worker/handle.ts`, `src/worker/handle.test.ts`, `src/app/ui/statsPanel.ts`, `src/app/main.ts`
   - What: the Web Worker and its channel as described under Approach, with one request kind, terrain statistics. The message handler is a plain function so it is testable without a worker. The app requests statistics after a stroke ends, after undo or redo, when sea level changes and when the world is replaced, debounced, and shows them in a readout. A worker error shows as "statistics unavailable", not a broken page.
   - Functions: `handleRequest(request)`, `createSimClient(worker)`, `client.request(kind, world)`, `client.latest(kind, world)`
   - Depends on: 3, 7
   - Acceptance: the readout shows land percentage, highest and deepest points, mean land height and mean ocean depth, and follows edits within about a quarter of a second; sculpting stays smooth while statistics compute; the statistics match `computeTerrainStats` run directly.
   - Tests: the handler returns the same statistics as calling core directly; an unknown request kind returns an error response, not a throw; the client matches responses to requests by id when they arrive out of order; the latest-wins helper resolves only the newest of several overlapping requests; a worker error rejects the pending request and leaves the client usable; the worker does not alter the caller's elevation array.

9. New-world dialog
   - Files: `src/app/ui/newWorldDialog.ts`, `src/app/ui/worldPanel.ts`, `src/app/appState.ts`, `src/app/appState.test.ts`, `src/app/main.ts`, `src/app/styles.css`, `index.html`
   - What: a "New world" button and dialog: resolution (64, 128, 256), start type (blank ocean or generated continents), and for generated worlds a seed field, a random-seed button and a land-fraction slider. Confirming replaces the current world everywhere through one function: the globe, the sculpt controller, the history (cleared), the sea level (reset to zero) and the statistics. The dialog warns that the current world is replaced. With no world to restore, the page opens on a blank ocean with this dialog showing, replacing the fixed-seed world from piece 5.
   - Functions: `openNewWorldDialog()`, `replaceWorld(world)`, `createAppState()`
   - Depends on: 4, 5, 7, 8
   - Acceptance: each start type at each resolution produces the expected world; the same seed and land fraction reproduce the same continents; cancelling leaves the current world untouched; after replacing, undo has nothing to undo.
   - Tests: `replaceWorld` clears the history, resets sea level and notifies every listener once; the dialog's values convert to generator options correctly, including a blank seed becoming a random one; an invalid seed or out-of-range land fraction is rejected with a message.
   - Manual review: the new-world flow. Run `npm run dev`, then create a blank world and a generated one at each resolution, reuse a seed to confirm it reproduces, and cancel once to confirm nothing changes.

10. Save, load and autosave
    - Files: `src/core/serialize.ts`, `src/core/serialize.test.ts`, `src/app/storage.ts`, `src/app/storage.test.ts`, `src/app/ui/worldPanel.ts`, `src/app/main.ts`
    - What: a versioned single-file format (a short magic marker, a format version, a JSON header with the world's settings, then the elevation as little-endian 32-bit floats). Export downloads the file; import reads one and replaces the world through `replaceWorld`. Import treats the file as untrusted: it checks the marker, version, resolution, data length and that every value is finite, clamps to the limits, and on any failure shows a clear message and leaves the current world untouched. Autosave writes the same bytes to one IndexedDB slot shortly after any change and when the page is hidden, and restores it on load; a failed or corrupt restore starts a blank world and says so.
    - Functions: `serializeWorld(world)`, `deserializeWorld(bytes)`, `saveCurrent(world)`, `loadCurrent()`, `exportWorldFile(world)`, `importWorldFile(file)`
    - Depends on: 3, 9
    - Acceptance: export then import reproduces the world exactly; refreshing the page restores the world, its sea level and its resolution; a truncated or unrelated file is refused with a message.
    - Tests: serialise then deserialise round-trips elevation and settings exactly at each resolution; a wrong marker, an unknown version, a resolution outside the allowed set, a data length that does not match the resolution, a truncated file, a header that is not valid JSON and non-finite values are each rejected with a distinct error; out-of-range values are clamped; an absurdly large declared header length is rejected without allocating it; autosave round-trips through IndexedDB (a test double such as `fake-indexeddb` is acceptable); loading with nothing saved returns nothing; a corrupt stored value is reported and not loaded.
    - Manual review: saving for real. Run `npm run dev`, sculpt something, refresh and confirm it comes back; export, make a new world, import the file and confirm it matches; try importing some unrelated file and confirm the message.

11. Earth preset
    - Files: `scripts/build-earth-data.ts`, `public/data/earth-256.bin`, `src/core/earth.ts`, `src/core/earth.test.ts`, `src/app/ui/newWorldDialog.ts`, `src/app/earthData.ts`, `README.md`, `package.json`
    - What: a third start type, "Earth". A script downloads NOAA's ETOPO 2022 ice-surface elevation (a coarse product such as the 60 arc-second grid is plenty), averages it into each cell of the 256 grid and writes 16-bit metres to `public/data/earth-256.bin`; the download itself is not committed. Before committing the data, confirm ETOPO 2022's terms allow redistribution and record the source and citation in the README; if the terms are unclear, stop and ask. In `core`: decode the file and average it down, area-weighted, for 128 and 64. In the app: fetch the file when Earth is chosen, with a clear message if it fails to load.
    - Functions: `decodeEarth(bytes)`, `earthWorld(data, resolution)`, `loadEarthData()`
    - Depends on: 2, 3, 9
    - Acceptance: the Earth world looks like Earth the right way up and the right way round at all three resolutions, with land near 29%.
    - Tests: land fraction is between 27% and 31% at each resolution; the highest cell lies in the Himalaya and Tibet region and the deepest in the western Pacific; named spot checks are land (central Sahara, central Australia, central Brazil, the South Pole) and sea (mid Pacific at 0° 160°W, mid Atlantic at 30°N 40°W, the North Pole), which together catch a flipped or rotated face; the 128 and 64 worlds are the area-weighted averages of the 256 data; a file of the wrong length is rejected.
    - Manual review: whether it looks like Earth. Run `npm run dev`, choose New world, Earth, at each resolution. Check the continents are recognisable and correctly placed, Greenland and Antarctica stand high, and the statistics readout shows about 29% land.

## Checkpoints

- [ ] 1. Scaffold in place: dev server, build, tests, Biome and type-check all run and pass
- [ ] 2. Cubed-sphere grid passes its geometry and stitching tests at 64, 128 and 256
- [ ] 3. World model and terrain statistics pass their tests
- [ ] 4. Continent generator is deterministic and hits the requested land fraction
- [ ] 5. Globe renders a generated world with relief, sea level and grid overlay; manual review done
- [ ] 6. Raise, lower and smooth brushes work on the globe; manual review done
- [ ] 7. Undo and redo restore terrain exactly
- [ ] 8. Worker returns terrain statistics and the readout follows edits
- [ ] 9. New-world dialog creates blank and generated worlds at each resolution; manual review done
- [ ] 10. Export, import and autosave round-trip a world; manual review done
- [ ] 11. Earth preset loads and looks right at each resolution; manual review done

## Verification

After every piece, from the builder's worktree:

- `npm run check` — Biome lint and format
- `npm run typecheck` — TypeScript, including the rule that `src/core` has no DOM access
- `npm test` — Vitest
- `npm run build` — the static build succeeds

Piece 1 creates these scripts; before it, there is nothing to run. Coverage has no command yet, so the coverage check judges from the diff and each piece's `Tests:` line.

Test strategy: logic lives in `src/core` and in small pure functions in `src/app`, all unit-tested with Vitest in Node. WebGL rendering and mouse interaction are not automated; the pieces marked `Manual review:` cover them.

## Notes

- 2026-11-10: After piece 1 is committed, the planner chat writes the worktree-setup and changed-lines coverage scripts in the planner branch's `tools/` and updates `project.md` with the real check commands. From then on the builder uses `project.md`'s commands.
- 2026-11-10: Not asked of the user, chosen as defaults: with no saved world the page opens on a blank ocean with the new-world dialog showing (piece 9); the ocean is drawn as a smooth surface coloured by depth, with only land raised (piece 5); creating a new world resets sea level to zero (piece 9); the history keeps 100 strokes (piece 7). The planner chat raises these with the user in each piece's briefing.
- 2026-11-10: Implementation model for this issue is `claude-fable-5-2`, on the user's instruction ("lets use fable to implement this one time"), given just after the builder was started. Implementation subagents and review fixes run on it; the "Builder on Sonnet" experiment does not apply to this issue, so no experiment notes are needed. `models.md` is unchanged and later issues follow it as usual.
- 2026-11-10: Piece 1 was briefly started on Sonnet before the model change reached the builder: an uncommitted `package.json` and `package-lock.json` (npm scripts and the `three` dependency). The user chose "Keep them, continue on Fable", so Fable builds the rest of piece 1 on top of those two files.
- 2026-11-10: The ETOPO download is large (hundreds of MB) and needs network access. If the builder cannot fetch it, stop and ask rather than substituting another dataset.
