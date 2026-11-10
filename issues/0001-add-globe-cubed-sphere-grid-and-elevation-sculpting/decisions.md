# Decisions: Add globe, cubed-sphere grid and elevation sculpting

## Settled
- Scope is build step 1 only: project scaffold, the grid, a 3D globe, sculpting land and elevation, and save/load. Temperature and every later layer get their own issues. (2026-11-10)
- Grid is a cubed sphere: six square faces of N by N cells. (2026-11-10)
- Terrain is edited by sculpting elevation with raise, lower and smooth brushes applied directly on the globe. Sea level decides what is land. No separate land-mask mode and no heightmap import in this issue. (2026-11-10)
- Architecture: TypeScript; the simulation is a pure library with no browser dependency, run in a Web Worker; Three.js draws the globe; no server, static files only; worlds saved by file export and import. The user chose this over deferring the Web Worker. (2026-11-10)
- Tooling: npm, Vite, Vitest, Biome, `tsc --noEmit`. This issue scaffolds it, since the repo has no source files. (2026-11-10)
- Purpose is worldbuilding: believable results and a fast simulation matter more than fidelity. (2026-11-10)

## Open
- Grid resolution: one grid at a per-world resolution, or terrain painted on a finer grid than the climate runs on? At 64 cells per face a cell is about 150 km, so Britain is roughly three cells wide. Decides the core data model.
- How the globe shows elevation: smooth colour by height, displaced relief, or visible cells. Decides the renderer piece.
- What a new world starts as: blank ocean, generated continents, or an Earth preset.
- What the Web Worker does in this issue, given nothing is simulated yet, and whether the main thread or the worker owns the terrain.
- UI layer for the controls around the globe: plain TypeScript and DOM, a small panel library, or a framework.
- Save format and whether worlds also autosave to browser storage.
- Undo and redo for brush strokes: in or out of this issue.
- A flat map view alongside the globe: in or out of this issue.
- Sea level: fixed at zero elevation, or an adjustable setting.

## Assumed
- Cube-to-sphere mapping is equiangular (the variant that keeps cell sizes most even).
- Elevation is stored in metres relative to sea level, one number per cell.
- Planet radius is Earth's for now; it becomes a parameter in a later issue.
- Target is a current desktop Chrome or Firefox with a mouse. Touch and mobile are out of scope.
- Terrain passes between the main thread and the worker as copied or transferred arrays, not shared memory, because shared memory needs server headers a plain static host cannot set.
- Deployment (for example GitHub Pages) is out of scope; the app runs from the Vite dev server and a static build.
- No GitHub remote exists, so no GitHub issue or draft PR can be created until `origin` is added.
