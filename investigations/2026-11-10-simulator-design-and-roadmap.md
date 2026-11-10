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

## Prior art

Listed from memory, not searched, so possibly incomplete or out of date: ExoPlaSim (a real climate model used by worldbuilders; offline, no ocean currents); ROCKE-3D, MITgcm, cGENIE (research models, hard to set up); Tectonics.js (browser tectonics with crude climate); Songs of the Eons and Undiscovered Worlds (rule-based climate); GPlates (real-Earth plate reconstruction, not a forward simulator). None is known to do the whole thing interactively.
