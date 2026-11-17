# Core folders by component, page folders by role

The simulation core is mostly one flat folder of about 25 source files, and the page has about 20 files at its top level plus a `ui/` folder of 26. Five more layers are coming (rain, ocean currents, ice, storms, tectonics), so the code moves into folders before they arrive, and the four largest files are cut down while they move.

The core gets one folder per component: grid maths, the world and its editing, the planet and its star, the Earth data, temperature and winds, each model with its own Earth baseline. The page is organised by role rather than by layer, since its legend, layer panel and pointer read-out serve every layer: editing, saving, layers and settings, with `ui/` split into what sits over the globe and the side panel's sections.

The globe's material and the scalar layers' descriptions are split into smaller files behind the same entry points. The layer panel and the page's wiring move out their types, constants and pure helpers; splitting their shared state further is a design change left for later. Tests split along with the code they cover.

Nothing the page does changes. Every test, the build and both Earth baselines must come out the same. The build scripts, the worker and the models' settings are not part of this.

## Plan

_2026-11-17 · 7 of 7 pieces done · now: all done, in review_

- [x] **1/7 The core in component folders** · `c239ed8`
  The core's files move into grid, world, planet, earth, temperature and wind folders, each model with its own baseline.
- [x] **2/7 The page's top-level files in role folders** · `1ff995c`
  The page's files move into editing, saving, layers and settings folders.
- [x] **3/7 ui/ split into the main view and the panel** · `c604d06`
  What sits over the globe and the side panel's sections get a folder each.
- [x] **4/7 The scalar layers split, with the legend's fitting code** · `15b6cdc`
  The temperature and pressure layer descriptions become a folder of small files, taking the scale fitting from the legend.
- [x] **5/7 The globe's material split** · `effae68`
  The globe's shaders, ramps and material setup become a folder of small files, the shader text unchanged.
- [x] **6/7 The layer panel's types, constants and pure helpers moved out, and its tests split** · `2d4e48e`
  The layer panel loses about 410 lines of types and helpers, and its tests split into five files by theme.
- [x] **7/7 The page wiring's types moved out** · `fb89e9c`
  The page wiring's types move to a file of their own.
