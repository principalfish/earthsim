# Simulator design and roadmap

The whole-simulator design for earth_sim and the eight-step build order, so each step's issue can draw on it. Only the items under "Decided by the user" are settled; everything else is a proposal to be confirmed when its step is planned.

## Decided by the user (2026-11-10)

- Purpose is worldbuilding: believable, not research-grade. Broad strokes and a fast-running simulation beat fidelity.
- Resolution much coarser than 10 km cells is fine.
- A browser app.
- Tectonics: the user draws the plates and sets their motion; plates are not auto-generated.
- The user wants to alter rotation rate, axial tilt and the star.
- Grid: cubed sphere.
- Architecture: TypeScript; the simulation is a pure library with no browser dependency, run in a Web Worker; Three.js draws the globe; no server, static files only; worlds saved by file export and import.
- Tooling: npm, Vite, Vitest, Biome, `tsc`.
- One issue per build step, starting with step 1.
- The simulation must be pauseable, with the user able to edit the map while it is paused; a run continues from the edited state. The main thread holds the editable, authoritative world and the worker computes from copies of it, which is what makes this possible.

## Proposed, not yet confirmed

### Time
- Simulate a seasonal cycle (monthly steps, repeated for a few years until it settles) rather than an annual mean, so tilt matters and Köppen climate zones can be output.
- Three timescales: climate (years to equilibrium), ice sheets (about 10 kyr), tectonics (Myr). Climate is re-solved as a snapshot every few Myr of drift, not run continuously.
- GPU compute (WebGPU) is not needed at around 25k cells. The pure core keeps that option open, and could run under Node for batch runs.

### How each feature would be modelled

| Feature | Approach | Difficulty |
|-|-|-|
| Temperature | Energy balance (sunlight, albedo, heat diffusion) with elevation correction | Easy |
| Winds | Scaling rules deriving the band layout from rotation rate and temperature contrast, plus land-sea pressure contrasts. A two-layer dynamic atmosphere is the more general alternative, harder to stabilise and tune | Medium |
| Ocean currents | Wind-driven gyres solved from the wind field around coastlines; deep circulation skipped at first | Medium |
| Rainfall | Moisture carried along the winds, raining out on uplift and mountains | Medium |
| Tropical storms | A diagnostic map from sea temperature, latitude and wind shear, not simulated storms | Easy |
| Glaciation | Snowfall minus melt, simple ice flow, albedo feedback into temperature | Medium |
| Continental drift | Rigid plates rotating on the sphere with rules for collision, subduction and rifting. The hardest part to make look right. Reference: "Procedural Tectonic Planets" (Cortial et al., 2019) | Hard |

### Planet parameters
- Axial tilt: exact geometry for sunlight by latitude and season. High confidence.
- Star brightness and orbit distance set incoming energy; star mass sets year length. High confidence.
- Rotation rate sets wind band width and count, ocean gyre strength and storm formation. Medium confidence.
- Limits: the wind scaling rules are only trusted for roughly Earth-like rotation (perhaps a quarter to four times Earth's rate; that range is a guess). Tidally locked planets need a different wind pattern. Tilts above about 54 degrees make the wind rules guesswork, although temperature stays right. Both are candidates for later extensions.

## Build order

Each step adds a viewable map layer and gets its own issue.

1. Globe, grid, and sculpting land and elevation
2. Sunlight and seasonal temperature
3. Winds
4. Moisture, rainfall and Köppen zones
5. Ocean currents, feeding heat back into temperature
6. Ice sheets and sea ice
7. Tropical storm zones
8. Plate tectonics and time stepping

## Status and carried-over items (as of 2026-11-13)

Keep this section current when a step is merged.

| Step | Status | Issue |
|-|-|-|
| 1 Globe, grid and sculpting | Done, merged 2026-11-11 | 0001, GitHub #1, PR #2 |
| 2 Sunlight and seasonal temperature | Done, merged 2026-11-13 | 0002, GitHub #3, PR #4 |
| 3 Winds | Next | |
| 4 Moisture, rainfall and Köppen zones | Not started | |
| 5 Ocean currents | Not started | |
| 6 Ice sheets and sea ice | Not started | |
| 7 Tropical storm zones | Not started | |
| 8 Plate tectonics and time stepping | Not started | |

### What step 2 built that later steps rely on
- **Planet settings on the world:** axial tilt, the star's brightness and mass, the orbit's distance and the greenhouse strength, saved with the world. A note in the Planet panel warns when they are outside the range the temperature model is trusted for.
- **Monthly temperature fields** for the twelve months, solved in a Web Worker only while the Temperature layer shows. A world finer than 64 cells per face edge is solved on the grid one step coarser and carried back, so coasts are smoothed over about one coarse cell.
- **Earth comparison:** on an untouched Earth preset the layer shows simulated, observed or difference. It was built so each later step can add its own observed layer.
- **Earth error baseline:** annual mean −0.15 °C and RMS 3.93 °C at 64, committed in `src/core/baseline/earthTemperature.json`, with a test that fails if the figures get worse. Nothing was tuned to the Earth. Winds (step 3) and above all ocean currents (step 5) are expected to improve it; re-run `npm run baseline:temperature` when a step changes the temperature.

### Left out of step 2, to pick up in a later step
- **Rotation rate** is not yet a planet setting. Step 3 needs it: it sets the width and number of the wind bands.
- **Orbit eccentricity.**
- **A flat map view.**
- **Real ice sheets:** step 2 only brightens cold surfaces; step 6 replaces that.

### Open follow-ups, nothing decided
- A fixed temperature scale option: the scale is fitted to each world, so a frozen planet is drawn in much the same colours as a warm one.
- With Sunlight on, the sun can be hard to find in the scene (accepted as it is for now).
- Terrain speckle on a world wholly at sea level (predates step 2).
- The build's 500 kB chunk warning (predates step 2).
- Whether the changed-lines coverage tool should also measure `scripts/`.
- Two small code notes from the step 2 review: a doc comment above the `MONTH_NAMES` re-export in `src/app/view.ts` that attaches to nothing; `cellLatitudes` in `src/core/insolation.ts` and a longitude in `src/core/observed.ts` repeating the `directionToLatLon` arithmetic with no test tying them together.
- Never tried by hand: Firefox, screen readers, touch and high-density screens, the production build since the solver speed-ups, and opening a world file saved before step 2 in the page.

## Prior art

Listed from memory, not searched, so possibly incomplete or out of date: ExoPlaSim (a real climate model used by worldbuilders; offline, no ocean currents); ROCKE-3D, MITgcm, cGENIE (research models, hard to set up); Tectonics.js (browser tectonics with crude climate); Songs of the Eons and Undiscovered Worlds (rule-based climate); GPlates (real-Earth plate reconstruction, not a forward simulator). None is known to do the whole thing interactively.
