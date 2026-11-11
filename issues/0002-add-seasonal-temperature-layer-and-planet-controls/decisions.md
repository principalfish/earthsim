# Decisions: Add seasonal temperature layer and planet controls

## Settled
- This is roadmap step 2: sunlight and seasonal temperature, the first simulated map layer. It builds on issue 0001 (globe, cubed-sphere grid, sculpting, worker, saving, Earth preset). The user asked to start planning it on 2026-11-11 while issue 0001 is in review. (2026-11-11)
- Carried over from issue 0001 and the roadmap, already decided by the user: the purpose is worldbuilding, so believable results and a fast simulation matter more than fidelity; the simulation is a pure TypeScript library with no browser dependency, run in a Web Worker as a compute service, with the page owning the editable world; everything runs client-side as static files; terrain and climate share one cubed-sphere grid at the world's resolution (64, 128 or 256 cells per face); the user wants to alter axial tilt and the star; a run through time must be pauseable with the map editable while paused. (2026-11-10)

## Open
- Scope: what this issue includes beyond the temperature model itself (the layer display, planet controls, a flat map view, a comparison against real Earth temperatures).
- Which planet controls: axial tilt, star brightness, orbit distance, orbit eccentricity, greenhouse strength, year length.
- Time model: a seasonal cycle of monthly steps repeated until it settles (the roadmap's proposal), and what is kept (twelve monthly fields, annual mean, extremes).
- Physics included: land and ocean heat capacity, heat transport, elevation cooling, reflectivity, and a simple snow and ice reflectivity before real ice arrives in step 6.
- When the temperature is computed: automatically after edits, or on a button.
- How the layer is shown on the globe: colour scale, month selection and animation, legend, a readout under the cursor, how it combines with raised relief and coastlines.
- How results are checked against reality: targets for the Earth preset, and whether a reference dataset is committed.
- What is saved: planet settings in the world file (a format change); whether computed layers are saved or recomputed.
- Branching: issue 0001 is not merged, so this issue either waits for that merge or is built on top of issue 0001's branch.

## Assumed
- Temperature means near-surface air temperature in degrees Celsius, one value per cell per month.
- Rotation rate is not part of this issue: a monthly energy balance does not depend on day length. It arrives with winds in step 3.
- Ocean currents, winds, rainfall and real ice sheets are later steps; this issue must leave room for them to feed back into temperature.
