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

## Open
- UI layer for the controls around the globe: plain TypeScript and DOM, a small panel library, or a framework.
- Whether worlds also autosave to browser storage, besides file export and import.
- Undo and redo for brush strokes: in or out of this issue.
- A flat map view alongside the globe: in or out of this issue.
- Sea level: fixed at zero elevation, or an adjustable setting.
- Whether an existing world's resolution can be changed after creation (resampling the terrain).
- Earth preset data: which dataset, and whether Greenland and Antarctica use the ice surface or the bedrock beneath it.
- Generated continents: which controls the generator exposes.

## Assumed
- Cube-to-sphere mapping is equiangular (the variant that keeps cell sizes most even).
- Elevation is stored in metres relative to sea level, one number per cell.
- Planet radius is Earth's for now; it becomes a parameter in a later issue.
- Target is a current desktop Chrome or Firefox with a mouse. Touch and mobile are out of scope.
- Terrain passes between the main thread and the worker as copied or transferred arrays, not shared memory, because shared memory needs server headers a plain static host cannot set.
- Deployment (for example GitHub Pages) is out of scope; the app runs from the Vite dev server and a static build.
- The save file is a single versioned file holding the world's settings and its elevation data.
- No GitHub remote exists, so no GitHub issue or draft PR can be created until `origin` is added.
