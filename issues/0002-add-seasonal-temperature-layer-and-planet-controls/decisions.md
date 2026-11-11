# Decisions: Add seasonal temperature layer and planet controls

## Settled
- This is roadmap step 2: sunlight and seasonal temperature, the first simulated map layer. It builds on issue 0001 (globe, cubed-sphere grid, sculpting, worker, saving, Earth preset). The user asked to start planning it on 2026-11-11 while issue 0001 is in review. (2026-11-11)
- Carried over from issue 0001 and the roadmap, already decided by the user: the purpose is worldbuilding, so believable results and a fast simulation matter more than fidelity; the simulation is a pure TypeScript library with no browser dependency, run in a Web Worker as a compute service, with the page owning the editable world; everything runs client-side as static files; terrain and climate share one cubed-sphere grid at the world's resolution (64, 128 or 256 cells per face); a run through time must be pauseable with the map editable while paused. (2026-11-10)
- Planet controls in this issue: axial tilt; star brightness and orbit distance; greenhouse strength. Orbit eccentricity is not included. Year length is worked out from the star and orbit, not set directly. (2026-11-11)
- A comparison against real Earth is wanted, so each simulated layer can be checked against reality, for this step and the ones after it ("it might be good to have earth as a comparison to see if we're getting it right - for all these next things to build"). Its shape is still open. A flat map view was not asked for and is not in this issue. (2026-11-11)
- Temperature recalculates automatically, but how long a calculation takes is measured first and the exact trigger is decided from the numbers ("lets say automatically - but lets test how long this takes first"). (2026-11-11)
- Earth comparison is in the app and in this issue: when the world is the Earth preset the layer can show simulated, observed, or the difference, with summary numbers; built so each later step adds its own observed layer; the same data drives automated tests ("In the app, in this issue"). (2026-11-11)
- The temperature display has all four of: a month slider with play; a legend; the value under the cursor; and annual summaries (annual average, warmest month, coldest month, seasonal range). Temperature replaces the height colours while relief stays raised and coastlines stay outlined. (2026-11-11)
- The page shows the world's current date, because later steps may step forward millions of years ("we need a current date on the page somewhere - as we may end up stepping forward millions of years"). What it shows and counts from is still open. (2026-11-11)
- The temperature model: monthly steps through the year, repeated until it settles, with sunlight by latitude and season, land warming and cooling faster than ocean, heat spreading between neighbouring cells, cooling with height, and snow or ice brightening cold surfaces by a simple temperature rule that step 6's real ice later replaces ("Yes, build that"). (2026-11-11)
- Building waits until issue 0001 is merged into `main`; this issue branches from `main` then ("After 0001 is merged"). Planning finishes now. (2026-11-11)
- The date counts years since the world began: zero when a world is created (the Earth preset's zero means today), saved with the world, shown with the month, such as "Year 0 · July". Nothing advances the year in this issue; later steps do, and it then reads as, for example, "12,000 years" or "2.4 million years" ("Years since the world began"). (2026-11-11)
- Months are named January to December on every world, with northern midsummer in late June as on Earth, although the year is divided into twelve equal parts whatever its length ("January to December"). (2026-11-11)
- The temperature colour scale is fitted to each world, not fixed: it stretches to the coldest and hottest values of the world on screen ("Fitted to each world"). The user chose this over the recommended fixed scale. (2026-11-11)
- Good enough for this step is the right broad pattern, with the error against observed Earth measured and stored as a baseline that later steps must improve, not a target to hit now ("Right pattern, errors recorded"). Tests require a sensible global average, a warm equator and cold poles, strong seasons inland and mild ones at sea, and colder mountains. (2026-11-11)

## Open
- Planet control ranges and defaults.
- Which observed temperature dataset, and its licence (being researched).
- The automatic trigger, decided after the solver's timings are measured: only while the temperature layer is showing, or always.

## Assumed
- Temperature means near-surface air temperature in degrees Celsius, one value per cell per month.
- Planet settings and the world's date are saved with the world (optional header fields, so existing files load with Earth's values and year zero). Computed layers are not saved; they are recomputed on load.
- Temperature runs in its own worker, separate from the statistics worker, and results are transferred, not copied.
- While a result is out of date the previous one stays on screen, marked as out of date, with a progress indicator.
- Observed and difference views are offered only when the world started as the Earth preset.
- The fitted colour scale spans the whole year for the world on screen, so a colour means the same temperature in every month of that world and the month animation does not rescale. In the Earth comparison, simulated and observed share one scale; the difference view has its own scale centred on zero. Because the scale is fitted, two worlds of very different temperature can look alike in colour; the legend's numbers are how they are told apart.
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
