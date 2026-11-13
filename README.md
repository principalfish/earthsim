# earth_sim

A planet simulator for worldbuilding that runs in the browser. Shape a world's land and sea, set its tilt and its star, and see how hot and cold it gets through the year. Believable results and a fast simulation matter more than physical fidelity.

It is a static site with no server and no account. The world is saved in the browser as you work and can be exported as a file.

## What works today

- **A globe you can sculpt.** Start from a blank ocean, generated continents or the real Earth, then raise, lower and smooth the terrain and move the sea level, with undo and redo.
- **Planet settings.** Axial tilt, the star's brightness and mass, the orbit's distance and the greenhouse strength.
- **A temperature layer.** Air temperature for each month, or the year's average, warmest month, coldest month and seasonal range, recalculated after every change.
- **The sun.** Drawn in the scene, with an optional day and night side on the globe.
- **Earth comparison.** On the Earth, the simulated temperature beside the observed one, and the difference.

Planned, in this order: winds; rainfall and climate zones; ocean currents; ice sheets and sea ice; tropical storm zones; plate tectonics and time stepping.

## Quick start

Requires Node.js and npm.

```bash
npm install
```

```bash
npm run dev
```

Open the address Vite prints. The first visit shows the New world dialog; press **Create world** for generated continents.

## Documentation

| Document | What is in it |
|-|-|
| [User guide](docs/user-guide.md) | Every control on the page: worlds, tools, view, planet, layers and the sun |
| [Temperature](docs/temperature.md) | How the temperature is worked out, when it is recalculated, its colours, and the Earth comparison |
| [Development](docs/development.md) | Commands, the source layout, and the Earth temperature baseline |
| [Data](docs/data.md) | The Earth data files: formats, sources, licences and how to rebuild them |

## Commands

| Command | What it does |
|-|-|
| `npm run dev` | Serve the page locally with hot reload |
| `npm run build` | Type-check, then write the static site to `dist/` |
| `npm test` | Run the unit tests once |
| `npm run check` | Lint and check formatting with Biome |
| `npm run typecheck` | Type-check every part of the source |

The data and timing scripts are listed in [Development](docs/development.md).

## Data credits

- **Elevation:** NOAA's ETOPO 2022 global relief model (CC0-1.0).
- **Observed temperature, winds and pressure:** NOAA/CIRES/DOE 20th Century Reanalysis V3, provided by the NOAA PSL, Boulder, Colorado, USA (CC0-1.0).

Full citations, licences and caveats are in [Data](docs/data.md).
