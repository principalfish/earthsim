# Plan: Ocean currents carrying heat, with a sea temperature of its own

Build model: claude-opus-5-5 (frontier): new numerics (a two-temperature solve, a corner grid, an elliptic gyre solve with coast constants) and changes to the climate loop where a wrong step is hard to spot in tests.

## Context

Step 5 of the roadmap (`investigations/2026-11-10-simulator-design-and-roadmap.md`), brought ahead of step 4 by the user. Step 3b (issue 0007, PR #14) made the climate a loop: each pass solves the temperature, then the winds, and later passes carry heat along the winds' flowing part (`src/core/climate.ts`, `src/core/temperature/advection.ts`, `src/core/wind/flowing.ts`). The sea does not move, and has no temperature of its own: each cell has one temperature, the air's near the surface, with the sea's top 60 m as its heat store over the sea.

### What the reads found (2026-11-18, in full in the issue folder)

- **The Earth's error after 3b** (`earth-error-2026-11-18.md`, script `climate-errors.ts`; 64 grid, shipped settings, simulated − observed °C, annual / January / July):
  - North Atlantic 40–65°N −4.4 / −1.5 / −6.8; Norwegian and Barents seas −10.9 / −17.6 / −7.0; western Europe −5.7 / −2.0 / −9.3; Scandinavia −8.9 / −8.7 / −10.8.
  - Upwelling coasts too warm: Peru +5.3, Benguela +4.7, California +1.9, Canaries +0.8 (annual); eastern tropical Pacific +3.9.
  - Western boundary currents near in the annual mean (−1.2), with winter warm biases off Japan (+6.1 January) from the land and winds.
  - Southern Ocean +2.0 (40–55°S) and +3.1 (55–70°S).
  - Coast contrasts W − E: Europe–Asia +2.9 / +7.8 (observed 11.5 / 22.9); North America +0.0 / +3.5 (observed 5.8 / 15.1).
  - Global rms 3.7 annual, 4.1 January; sea 2.9, land 5.1 (annual). Sea is 71% of the area and 41–44% of the squared error; the sea-ice zone alone 16–19%, the North Atlantic and Nordic seas 6–8%, upwelling coasts 1.3–2.1%. Currents can reach perhaps 10–12% of the squared error; sea ice, ice sheets and high ground are larger and not ocean problems. The Ross Ice Shelf counts as sea (+14 °C at 78°S).
- **Methods and data** (`methods-and-data-2026-11-18.md`): a Stommel gyre (r∇²ψ + β∂ψ/∂x = curl τ / ρ), ψ fixed on each coast with a constant per island (Godfrey's island rule), friction setting the western boundary width (r/β ≈ 300 km at r ≈ 6e-6 /s); failure modes: a circumpolar channel (clamp), Ekman blowing up at the equator (floor |f| at about 5°), tiny basins. Upwelling: where the offshore Ekman transport at a coast is positive, relax the sea toward cold water below. Europe's winter warmth is mostly the atmosphere and stored summer heat (Seager et al. 2002); at 26.5°N the gyre carries about 15% of 1.2 PW and the overturning the rest. Data: OISST v2 1991–2020 1° monthly mean (public domain, 3.4 MB); the GDP drifter monthly climatology (Laurindo et al. 2017, CC-BY 4.0, 0.25°).
- **The code** (`code-read-2026-11-18.md`): one temperature per cell (temperature.ts:5); land where `elevation − fround(seaLevel) > 0` (temperature.ts:743); sea capacity from 2.5e8 to the sea-ice 1e7 J/m²/K by the clear share, which is read from the air (temperature.ts:850, 1289–1318); diffusivity 0.55 over sea, 0.35 over land (config.ts:200, 224). 3b's advection takes 12 months of edge flows (4·cellCount, m²/s) and a per-cell capacity (advection.ts:110). `createExchangeSolver` needs every coupling > 0 (exchange.ts:381), so it cannot cut coasts; `removeConvergence` is global. The grid has corners only per face (grid.ts:674, 714), no shared corner index; `curl` at vector.ts:1405, `laplacian` at :1456; no basin code. Winds are monthly east/north m/s and pressure (model.ts:19–55), no stress. The loop's slots: climate.ts:339 (flows), :370 (after the winds), start :100, damping :364, stop :380. Arrows take {east, north} with a 10 m/s cap (wind.ts:55). Observed-data builds: `scripts/build-observed-*.ts`, `observedBuild.ts`, `docs/data.md:96–140`. Timings: 4 passes, ~8 s from nothing and 2 passes, ~3 s carried on, at 64 (docs/temperature.md:36).

### Settled (from `decisions.md`, in full)

- Step 5 of the roadmap, ocean currents, comes next, before step 4 (rainfall) and before the 3a follow-up (the deeper `layerPanel`/`wiring` splits), which is deferred until before step 4. The user: "Skip to step 5", then "Plan step 5" (2026-11-18)
- From the roadmap (2026-11-10 and 2026-11-18): currents are wind-driven gyres solved from the wind field around coastlines, deep circulation skipped at first; they feed heat back into temperature through the climate loop step 3b built (one pass: temperature, winds, currents, then back); retuning the whole loop waits for step 6b; believable and fast beats faithful.
- **Physics in scope:** wind-driven gyres, coastal upwelling (cold water brought up where the wind pushes coastal water offshore), and a simple overturning heat term (some heat taken from a basin's tropics and given to its open polar end), as separate pieces measured one at a time; the rule for which basins get the overturning on invented maps is a guess, measured before it ships. The user: "Gyres + upwelling + overturning (Recommended)" (2026-11-18)
- **The gyre is solved on grid corners:** a shared corner index across the cube's faces, with the gyre's flow pattern (streamfunction) solved there, so the flows are exact (nothing leaks onto land, nothing piles up). The user: "Add grid corners (Recommended)" (2026-11-18)
- **The sea gets a temperature of its own:** a sea-surface temperature beside the air's over sea cells, exchanging heat with it; currents carry the sea's. The user: "Separate sea temperature" (2026-11-18). Saved worlds hold no climate (`src/core/world/serialize.ts`), so no saved file changes.
- **Judged by physics, then a sanity check:** settings start from physical values; the builder measures the Earth by region and the coast contrasts and stops for the user if a region gets clearly worse; no chasing the Earth's figures until step 6b. The user: "Physics, then a sanity check (Recommended)" (2026-11-18)
- **Sea temperature first:** piece 1 adds the sea's own temperature and the air–sea exchange, with no currents, measured against observed sea temperatures; then the corner grid and gyres, upwelling, overturning, and the page, each measured on its own. The first climate pass is no longer today's model bit for bit, and both baselines are re-recorded. The user: "Sea temperature first (Recommended)" (2026-11-18)
- **On screen:** a Sea temperature layer (colour map, with Difference against observed sea temperatures, OISST v2 1991–2020 1°, public domain) and a Currents overlay drawn with arrows like the winds (compared with the drifter climatology, CC-BY, credited in docs/data.md). The user: "Sea temp layer + currents overlay (Recommended)" (2026-11-18)
- **Monthly currents:** 12 gyre solves a pass, following the winds; cost measured in the piece. The user: "Monthly (Recommended)" (2026-11-18)
- **The sea-ice stand-in follows the sea temperature:** the sea becomes icy as it nears freezing (about −1.8 °C), and the ice then cuts the sea off from the air, so the air above can get very cold while the sea stays at freezing; land keeps the air-driven stand-in; real sea ice is still step 6. The user asked "We don't have sea ice yet?" and, after the stand-in was explained, chose "The sea temperature (Recommended)" (2026-11-18)
- **The Temperature layer stays the air's** everywhere, compared with the observed air temperature as now; the sea's own is on the new Sea temperature layer. The user: "The air's, as today (Recommended)" (2026-11-18)

### Assumed

- **Air–sea exchange:** a physical bulk value (sensible, latent and long-wave together, of order 15–30 W/m²/K), with its source in the config entry; the air over the sea keeps the air's own heat store.
- **Upwelling's cold water:** a physical estimate of the water below the mixed layer, chosen by the builder with its source and measured against Peru, Benguela, California and the Canaries.
- **The overturning rule on invented maps:** the builder measures two or three candidate rules on the Earth and the generated worlds and stops for the user to choose before it ships, as 3b's piece 4 did.
- **Gyre details left to the builder, measured:** the friction that sets the western boundary current's width per grid size, island constants (the island rule), the circumpolar channel's clamp, the equatorial floor on the Coriolis term, and which grid the gyres are solved on.
- **The loop:** if it does not settle within the 8-pass cap at physical values, the builder measures options and stops for the user, as in 3b.
- **Manual review** at the page piece only (the Sea temperature layer and Currents overlay), as in 3b.
- **`ui/layerPanel.ts` grows** with the two new entries before the deferred split.

## Approach

Bottom up, each piece leaving the page working until the last two show the new layers:
1. the observed sea temperatures and currents, built into shipped data files with their loaders, so every later piece can measure against them;
2. the sea's own temperature over sea cells, exchanging heat with the air, with the ice stand-in following it; no currents yet; the first climate pass changes here and both baselines are re-recorded;
3. a shared corner index on the cubed sphere, with the operators a streamfunction needs: edge flows from corner values (exactly divergence-free) and a corner elliptic solve that holds a constant on each coast;
4. wind-driven gyres from the winds, monthly, as a pure function measured against the drifter currents;
5. the currents carry the sea's heat in the climate loop (temperature, winds, currents), measured against the Earth;
6. upwelling;
7. the overturning: candidate rules measured, the user chooses, then it ships;
8. the worker, the store and the Sea temperature layer;
9. the Currents overlay and the docs that describe the finished model.

Rejected (with the user's choices): gyres alone (the North Atlantic barely warms); rules placing gyres by basin and latitude (break on odd maps, no feedback); the sea carried as the cell's one temperature (the user chose a sea temperature of its own); a cell-centred streamfunction cleaned up afterwards (approximate at coasts); Munk friction (biharmonic, rings on coarse grids); one yearly current pattern; fixed Earth targets tuned to (retuning waits for step 6b).

## Pieces

1. Observed sea temperatures and currents
   - Model: claude-sonnet-5-5 (mechanical: follows the existing observed-data builds).
   - Files: new `scripts/build-observed-sea-temperature.ts` and `scripts/build-observed-currents.ts` (beside `build-observed-temperature.ts` and `build-observed-winds.ts`, reusing `observedBuild.ts` and `download.ts`), `package.json` (their scripts), new `public/data/earth-sea-temperature-1deg.bin` and `earth-currents-1deg.bin`, the loaders in `src/app/layers/observedData.ts`, new `src/core/ocean/observed.ts` (sampling the grids onto the cubed sphere, as `temperature/observed.ts` and `wind/observedWind.ts` do) and tests, `docs/data.md` (sources, licences, attribution, how to rebuild).
   - What: Monthly 1° grids of the observed sea-surface temperature (NOAA OISST v2, 1991–2020 long-term monthly mean, public domain) and surface currents (the GDP drifter monthly climatology, Laurindo et al. 2017, CC-BY 4.0, regridded from 0.25° to 1°, east and north in m/s), stored compactly as the existing observed files are (int16 with a scale, land and no-data marked). `docs/data.md` gives each source, its licence and the attribution CC-BY requires. If a source cannot be reached or its terms turn out to forbid shipping, stop and ask rather than substitute another.
   - Functions: the two build scripts; `loadObservedSeaTemperature`, `loadObservedCurrents` (names to match the existing loaders); `observedSeaTemperatureOn(grid, …)`, `observedCurrentsOn(grid, …)`.
   - Depends on: none.
   - Acceptance: both files build reproducibly from their sources; sampled onto the 64 grid, the sea temperature looks right by region (the Gulf Stream warm tongue, the cold Peru and Benguela coasts, the tropics near 27–29 °C) and the currents show the named currents (Gulf Stream, Kuroshio, Agulhas, the circumpolar current); land and no-data cells are marked, not zero; each file is a few MB at most.
   - Tests: the file format round-trip and scale; sampling onto the grid (a known value at a known place, land marked); the build's regridding on a small synthetic input; the loaders.

2. The sea's own temperature
   - Files: `src/core/temperature/temperature.ts` and its tests, `src/core/temperature/advection.ts` if the sea needs its own capacity there, `src/core/config.ts` (new settings), `src/core/config.md`, `src/core/climate.ts` (the result and start carry the sea's months), `src/core/protocol.ts` only for types the core shares, the temperature baseline (`src/core/temperature/baseline/earthTemperature.*`, `scripts/update-earth-temperature-baseline.ts`) and the winds baseline (re-recorded), `docs/temperature.md`.
   - What: Over sea cells, two temperatures: the air's, with the air's own heat store, and the sea's top 60 m (`oceanHeatCapacity`). Sunlight reaching the sea warms the sea; the sea and the air exchange heat at a physical bulk rate (one new setting, W/m²/K, with its source); the air radiates to space, spreads heat sideways and is carried by the winds as today. Land cells keep today's one temperature. The sea-ice stand-in over the sea follows the sea's temperature: the sea becomes icy as it nears freezing (about −1.8 °C, a new setting), the ice share cuts the exchange with the air and brightens the surface, and the sea does not cool below freezing; land keeps its air-driven stand-in. `TemperatureResult` gains the sea's monthly temperature (undefined meaning over land, marked as the builder chooses and documents), and `solveClimate`'s result and start carry it. The Temperature layer's data stays the air's. A world with no sea gives today's answer exactly.
   - Functions: `solveTemperature`'s sea layer and exchange; the ice share over the sea; the new config entries; `ClimateResult`/`ClimateStart` fields.
   - Depends on: 1 (to measure).
   - Acceptance: a land-only world gives today's temperatures bit for bit; heat is conserved across the exchange; a sea cell with no sun settles to the air's temperature; over an icy sea the air cools far below freezing in winter while the sea stays at freezing; the Earth's sea temperature is reported against OISST by region, and the air's error by region against today's (the region script), with the coast contrasts; the piece stops for the user if a region gets clearly worse; both baselines are re-recorded with old and new figures in the review, and the temperature baseline gains the sea-temperature figures (rms against OISST, annual and January); the loop still settles within the cap; timings reported.
   - Tests: the Acceptance cases; the exchange's two limits (zero exchange: the sea follows only the sun; a very large exchange: the two temperatures agree); the ice share's freezing floor; the climate result and start round-trip with the sea's months; the config entries' every-field check.

3. Grid corners
   - Files: new `src/core/grid/corners.ts` and its test, `src/core/grid/grid.ts` only to expose what corners need, `src/core/index.ts`, `docs/development.md` (the grid section).
   - What: A shared corner index for the cubed sphere: every corner numbered once across faces, the eight cube corners (three cells each) included; for each cell its four corners, for each edge its two corners in a fixed order, for each corner its cells. On top: edge flows from corner values (the flow across an edge is the difference of the corner values at its ends, in m²/s), which sum to exactly zero around every cell; and an elliptic solve on corners for an equation of the form a∇²ψ + b·∂ψ/∂x = f with ψ held to a constant on each connected coast (an unknown constant per island, from a condition the caller gives), suitable for the gyre (piece 4). The solver is the builder's choice (multigrid or preconditioned iteration on corners), stated with its timing at 64, 128 and 256.
   - Functions: `cornerIndex(grid)`, `edgeFlowsFromCorners`, `solveOnCorners` (names the builder's).
   - Depends on: none (can be built beside piece 2).
   - Acceptance: corner counts match 6N² + 2; each corner's cells are its neighbours across faces and at the cube corners; flows from any corner values have zero net flow at every cell to rounding; no flow crosses an edge whose two corners lie on the same coast; the solve recovers a known solution on a test basin and holds each coast at its constant.
   - Tests: the Acceptance cases at 8, 64 and 128; the seams and the cube corners; an island (two coasts) with its constant; convergence to tolerance.

4. Wind-driven gyres
   - Files: new `src/core/ocean/gyres.ts` and its test, `src/core/ocean/basins.ts` if coasts and islands need their own module, `src/core/config.ts` (a new `OCEAN_CONFIG` section, or a group of an existing one, the builder's call), `src/core/config.md`, `src/core/index.ts`, new `docs/ocean.md`, `docs/development.md`.
   - What: A pure `solveGyres(world, winds, …)`: for each month, the wind's push on the sea (a bulk drag on the surface wind), its curl at the corners, and a Stommel gyre solved with piece 3's corner solve; coasts and islands found from the sea mask, each holding its own constant; the circumpolar channel clamped; the Coriolis term floored near the equator. Returns monthly edge flows over the sea (none across a coast) and a cell-centred east/north current for drawing, in m/s at the surface. Settings (friction, drag, the depth the flow's heat is carried over, the clamps) start from physical values with sources; the builder measures the boundary current's width at 64, 128 and 256 and which grid the gyres are solved on.
   - Functions: `solveGyres`; the basin and island finder; the config entries.
   - Depends on: 3.
   - Acceptance: flows have zero net flow at every sea cell and none across a coast; a single rectangular basin under westerlies and trades gives one gyre with its strong current on the western side; reversing the wind reverses the gyre; on the Earth the named currents appear in the right places and directions (Gulf Stream, Kuroshio, Brazil, East Australian, Agulhas, the circumpolar current) and the direction agreement with the drifter currents is reported; timing per month at 64, 128 and 256.
   - Tests: the Acceptance cases on synthetic basins; an island; a circumpolar channel; the equatorial floor; the config entries.

5. Currents carry the sea's heat in the loop
   - Files: `src/core/temperature/temperature.ts` and `advection.ts` (the sea layer carried along the currents), `src/core/climate.ts` and its test (a currents stage after the winds; the start carries the currents), `src/core/temperature/baseline/*`, `src/core/wind/baseline/*` and their update scripts (re-recorded), `scripts/time-climate.ts`, `docs/temperature.md`, `docs/ocean.md`.
   - What: The temperature solve takes the currents' monthly flows and carries the sea's temperature along them with the sea's heat store, by the same implicit upwind step 3b uses for the air; each pass becomes temperature, winds, currents, and the next pass's temperature carries heat along the previous pass's winds and currents. Pass 1 has no currents. The loop's damping and stop rule cover the new feedback; if it does not settle within the cap at physical values, measure options and stop for the user.
   - Functions: `solveTemperature`'s `currents` input; `solveClimate`'s currents stage; `ClimateResult`/`ClimateStart` fields.
   - Depends on: 2, 4.
   - Acceptance: with no currents the solve is piece 2's exactly; heat is conserved; a warm patch of sea moves along a current; on the Earth the sea temperature against OISST, the air's error by region and the coast contrasts are reported before and after, with the piece stopping for the user if a region gets clearly worse; the loop settles within the cap on the Earth and the generated worlds; both baselines re-recorded; timings from nothing and carried on at 64 and 256.
   - Tests: the Acceptance cases; the loop's pass order with currents; the start round-trip; the cap and settling with two feedbacks.

6. Upwelling
   - Files: new `src/core/ocean/upwelling.ts` and its test, `src/core/temperature/temperature.ts` (the cooling term), `src/core/climate.ts`, `src/core/config.ts`, `src/core/config.md`, the baselines, `docs/ocean.md`.
   - What: From each month's wind, the Ekman transport (with the equatorial floor); where it carries coastal water offshore, and where it diverges at the equator, cold water from below the mixed layer mixes into the sea at a rate set by the transport; the water below has a physical estimate of its temperature (with source). It cools the sea only; heat taken is accounted for.
   - Functions: `upwelling(world, winds, …)`; the solve's mixing term; the config entries.
   - Depends on: 5.
   - Acceptance: an eastern coast under an equatorward wind cools; a western coast under the same wind does not; reversing the wind stops it; on the Earth Peru, Benguela, California, the Canaries and the eastern tropical Pacific are reported before and after against OISST and the air's observed, and the piece stops for the user if a region gets clearly worse; baselines re-recorded; the loop still settles.
   - Tests: the Acceptance cases on synthetic coasts; the equator; the heat accounting; the config entries.

7. The overturning
   - Files: new `src/core/ocean/overturning.ts` and its test, `src/core/temperature/temperature.ts`, `src/core/climate.ts`, `src/core/config.ts`, `src/core/config.md`, the baselines, `docs/ocean.md`.
   - What: A heat term per basin: heat taken from the basin's tropical sea and given to its open high-latitude end, conserving heat, with a strength from a physical estimate (about 0.5–1 PW for an Earth-sized basin, scaled by the basin). The rule for which basins get it on an invented map is a guess: the builder measures two or three candidate rules (for example, every basin open to high latitudes; only the widest such opening in each hemisphere; one scaled by how far poleward the basin reaches) on the Earth and the generated worlds, and stops for the user to choose before it ships.
   - Functions: `overturning(world, …)`; the basin rule; the config entries.
   - Depends on: 5 (and the basin finder from 4).
   - Acceptance: heat is conserved; a basin with no open polar end gets none; on the Earth the North Atlantic and Nordic seas, western Europe and Scandinavia are reported before and after, and the North Pacific does not warm much; the user's chosen rule is recorded; baselines re-recorded; the loop still settles.
   - Tests: the Acceptance cases on synthetic basins; heat conservation; the chosen rule's cases.

8. The worker, the store and the Sea temperature layer
   - Files: `src/core/protocol.ts` and its test, `src/worker/handle.ts` and its test (each pass carries the sea's months and the currents), `src/app/layers/layers.ts`, `refresh.ts` and their tests, a new scalar layer beside the temperature's under `src/app/layers/scalar/`, `src/app/ui/layerPanel.ts` and its tests, `src/app/ui/main/cursorReadout.ts`, `infoBox.ts`, `legend.ts` as needed, `docs/user-guide.md`.
   - What: The climate pass messages carry the sea's monthly temperature and the currents (copied, the last pass transferred, as now). A Sea temperature layer: a colour map over the sea (land shown as terrain), the month and the timeline as the Temperature layer, a Difference view against OISST, and the cursor readout over the sea showing the sea's temperature; it updates with each pass like the others.
   - Functions: the protocol fields; the store's sea and currents parts; the Sea temperature layer.
   - Depends on: 5 (6 and 7 add nothing to the protocol).
   - Acceptance: the layer appears in the panel, draws the sea's temperature, updates with each pass, and its Difference view matches the observed by region; the cursor readout over the sea shows it; the old layers are unchanged.
   - Tests: the protocol round-trip; the store's new parts; the layer's colours, Difference and readout; the panel entry.
   - Manual review: open the Earth, choose Sea temperature, step through the months, try the Difference view (the warm Gulf Stream tongue, the cold Peru and Benguela coasts, the Nordic seas); hover the sea for the readout; check Temperature, Pressure and Winds look as before. The user runs `npm run dev` from the builder's worktree; the builder leaves no server running.

9. The Currents overlay, and the finished model's docs
   - Files: `src/app/globe/wind.ts` and `streaks.ts` (the wind arrows, shared or parameterised for currents, with its own speed cap near 1 m/s), `src/app/layers/view.ts` (the overlay toggle), a currents key beside `src/app/ui/main/windKey.ts`, `src/app/ui/layerPanel.ts`, `src/app/ui/panel/processDiagram.ts` ("Built today" and "Planned, not built"), `src/app/ui/panel/modelSettings.ts` if the new config section needs a place, `docs/user-guide.md`, `docs/ocean.md`, `docs/temperature.md`, `README.md` only if its one-line feature list changes.
   - What: A Currents overlay: arrows like the winds', on the sea only, scaled for sea speeds, drawn on any layer; the option to show the observed drifter currents for the Earth, as the winds have. The process diagram's "Built today" gains the sea temperature and currents (gyres, upwelling, overturning) in the loop; "Planned, not built" loses them. The user guide describes the two new layers and what the currents do.
   - Functions: the currents overlay and its key; the diagram's lines.
   - Depends on: 8.
   - Acceptance: the overlay draws the currents on the sea only, at sea speeds, on any layer, updating with each pass; the observed currents can be shown for the Earth; the diagram and guide describe the finished model.
   - Tests: the overlay's arrows (sea only, scale, observed toggle); the key; the diagram's lines; the panel entry.
   - Manual review: open the Earth, turn on Currents over Temperature and over Sea temperature; check the Gulf Stream, Kuroshio, the circumpolar current and the Peru current; switch to the observed currents and compare; sculpt a new continent across an ocean and watch the gyres change as the passes land; open Model settings and check the new settings and the diagram's lines. The user runs `npm run dev` from the builder's worktree; the builder leaves no server running.

## Checkpoints
- [ ] 1. Observed sea temperatures and currents
- [ ] 2. The sea's own temperature
- [ ] 3. Grid corners
- [ ] 4. Wind-driven gyres
- [ ] 5. Currents carry the sea's heat in the loop
- [ ] 6. Upwelling
- [ ] 7. The overturning
- [ ] 8. The worker, the store and the Sea temperature layer
- [ ] 9. The Currents overlay, and the finished model's docs

## Verification

After every piece: `npm run check`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run docs:config` leaving `config.md` unchanged after regenerating. Changed-lines coverage with `project.md`'s Coverage command. Pieces 2, 5, 6 and 7 re-record both Earth baselines (`npm run baseline:temperature`, `npm run baseline:winds`) with old and new figures in the review, rerun the region script (`climate-errors.ts` in the issue folder, `node scripts/run-with-vite.mjs <path>`) and report timings with `npm run time:climate`. Pieces 3 and 4 leave both baselines untouched.

## Notes
