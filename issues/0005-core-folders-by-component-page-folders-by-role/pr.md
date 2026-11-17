# refactor: core folders by component, page folders by role

The simulation core is mostly one flat folder of about 25 source files, and the page has about 20 files at its top level plus a `ui/` folder of 26. Five more layers are coming (rain, ocean currents, ice, storms, tectonics), so the code moves into folders before they arrive, and the four largest files are cut down while they move.

The core gets one folder per component: grid maths, the world and its editing, the planet and its star, the Earth data, temperature and winds, each model with its own Earth baseline. The page is organised by role rather than by layer, since its legend, layer panel and pointer read-out serve every layer: editing, saving, layers and settings, with `ui/` split into what sits over the globe and the side panel's sections.

The globe's material and the scalar layers' descriptions are split into smaller files behind the same entry points. The layer panel and the page's wiring move out their types, constants and pure helpers; splitting their shared state further is a design change left for later. Tests split along with the code they cover.

Nothing the page does changes. Every test, the build and both Earth baselines must come out the same. The build scripts, the worker and the models' settings are not part of this.

Closes #9

Progress: the plan checklist on #9.
