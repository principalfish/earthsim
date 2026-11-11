# Decisions: Add seasonal temperature layer and planet controls

## Settled
- This is roadmap step 2: sunlight and seasonal temperature, the first simulated map layer. It builds on issue 0001 (globe, cubed-sphere grid, sculpting, worker, saving, Earth preset). The user asked to start planning it on 2026-11-11 while issue 0001 is in review. (2026-11-11)
- Carried over from issue 0001 and the roadmap, already decided by the user: the purpose is worldbuilding, so believable results and a fast simulation matter more than fidelity; the simulation is a pure TypeScript library with no browser dependency, run in a Web Worker as a compute service, with the page owning the editable world; everything runs client-side as static files; terrain and climate share one cubed-sphere grid at the world's resolution (64, 128 or 256 cells per face); a run through time must be pauseable with the map editable while paused. (2026-11-10)
- Planet controls in this issue: axial tilt; star brightness and orbit distance; greenhouse strength. Orbit eccentricity is not included. Year length is worked out from the star and orbit, not set directly. (2026-11-11)
- A comparison against real Earth is wanted, so each simulated layer can be checked against reality, for this step and the ones after it ("it might be good to have earth as a comparison to see if we're getting it right - for all these next things to build"). Its shape is still open. A flat map view was not asked for and is not in this issue. (2026-11-11)
- Temperature recalculates automatically, but how long a calculation takes is measured first and the exact trigger is decided from the numbers ("lets say automatically - but lets test how long this takes first"). (2026-11-11)

## Open
- Earth comparison: where it lives (in the app as a compare view, or tests and a report only), what is shown (simulated, observed, difference, summary numbers), which observed dataset, and whether it is part of this issue or its own.
- Time model and physics: a seasonal cycle of monthly steps repeated until it settles; what is kept (twelve monthly fields and annual summaries); which processes are included (land and ocean heat capacity, heat transport, elevation cooling, reflectivity, a simple snow and ice reflectivity before real ice arrives in step 6).
- The automatic trigger, once timings are known: only while the temperature layer is showing, or always; and what the globe shows while a result is out of date.
- How the layer is shown on the globe: colour scale, month selection and animation, legend, a readout under the cursor, annual summaries, how it combines with raised relief and coastlines.
- What the planet controls look like: ranges, units, defaults and any derived readouts (the user asked "what do planet controls view?").
- What is saved: planet settings in the world file; whether computed layers are saved or recomputed.
- Branching: issue 0001 is not merged, so this issue either waits for that merge or is built on top of issue 0001's branch.

## Assumed
- Temperature means near-surface air temperature in degrees Celsius, one value per cell per month.
- Rotation rate is not part of this issue: a monthly energy balance does not depend on day length. It arrives with winds in step 3.
- Ocean currents, winds, rainfall and real ice sheets are later steps; this issue must leave room for them to feed back into temperature.

## What the code allows (read from issue 0001's branch at `4170dd0`)
- `World` (`src/core/world.ts:81-101`) has no slot for planet settings, and a worker request carries only the world (`src/core/protocol.ts:40`). Settings therefore go on the world, which also gets them saved; every place that builds a world must set them (`createBlankWorld`, `generate.ts:459`, `earth.ts:152`, `serialize.ts`, `isWorldShaped` in `protocol.ts:107`).
- The save header ignores unknown fields and has room for more within format version 1 (`src/core/serialize.ts:327-329`, `:44-48`), so planet settings can be optional header fields that default when absent, and existing files keep loading. The data section's length is exact (`:374`), so computed layers cannot be appended without a version change; recomputing on load is simpler.
- There is one worker, answering one request at a time, and a superseded request still runs to completion (`src/worker/client.ts:85-86`). A slow temperature solve on it would hold up the statistics readout. Nothing is cancelled and nothing times out.
- Arrays are copied in both directions, not transferred (`client.ts:130-133`, `sim.worker.ts:9`). Twelve monthly fields at 256 per face are about 19 MB.
- The worker keeps no state between requests (`protocol.ts:4-6`), so a solve cannot start from the previous answer unless the request carries it.
- The grid gives cell centres (+Z north, `grid.ts:8-9`), exact areas and four neighbours per cell including across cube edges (`:145-152`); there is no per-cell latitude array and no neighbour-iteration helper. `computeTerrainStats` (`stats.ts:82-140`) is the pattern for an area-weighted pass.
- The globe is coloured entirely in the shader, in one function meant to be the place to swap colour sources (`src/app/globe/material.ts:408`, header `:11-14`). Elevation is a cube texture of six R32F faces (`renderer.ts:183-205`). The cell-sampling and edge-blending functions read a fixed sampler (`material.ts:220`); taking the sampler as a parameter lets a second cube texture of the same layout reuse them. Colour ramps are baked into the shader at creation (`:118`), so a per-layer ramp needs uniforms or a small texture.
- Recomputing after edits goes through one scheduler with a 150 ms debounce that waits out an active stroke (`src/app/refresh.ts:81`, `:117-123`), triggered by stroke commit and undo (`main.ts:223`), the sea-level slider (`:251`) and world replacement (`:277`).
- The side panel is World, Tools, View, Statistics, each module appending its own section (`main.ts:164-256`); field helpers are in `ui/fields.ts`. The segmented picker used for tools is private to `ui/toolPanel.ts:196`.
- Nothing shows a value under the cursor today. `globe.pick` returns a direction, and `cellAt` (`grid.ts:591`) turns it into a cell.
- App state owns only the world (`src/app/appState.ts:57-102`); computed layers need a home outside `World`.
- Issue 0001's review fixes, not yet committed, restructure `src/app/main.ts`; the line numbers above for `main.ts` will move.
