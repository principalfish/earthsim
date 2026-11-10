# earth_sim

Browser-based planet simulator for worldbuilding: draw continents and plates, then see temperature, winds, rainfall, ocean currents, ice and continental drift.

## Development

Requires Node.js and npm. Run `npm install` once, then:

- `npm run dev`: serve the page locally with hot reload.
- `npm run build`: type-check, then write the static site to `dist/`.
- `npm test`: run the unit tests once.
- `npm run check`: lint and check formatting with Biome.
- `npm run typecheck`: type-check every part of the source.

The page opens on a generated world with 64 cells per cube face, seed 1977 and 30% land. The address can choose another: `?resolution=64|128|256&seed=<whole number>&land=<0 to 1>`, where the seed is from 0 to 4294967295 and `land` is the share of the surface to make land. A parameter that is missing or not valid falls back to its default.

### Layout

- `src/core/`: the simulation as a pure library, with no DOM, Three.js or worker globals.
- `src/app/`: the page, which imports the core.
  - `src/app/globe/`: the globe's renderer, shaders, camera and picking.
  - `src/app/ui/`: the panels of controls.

The core is compiled without the DOM type library, so a `document` or `window` reference there fails `npm run typecheck`.
