# earth_sim

Browser-based planet simulator for worldbuilding: draw continents and plates, then see temperature, winds, rainfall, ocean currents, ice and continental drift.

## Development

Requires Node.js and npm. Run `npm install` once, then:

- `npm run dev`: serve the page locally with hot reload.
- `npm run build`: type-check, then write the static site to `dist/`.
- `npm test`: run the unit tests once.
- `npm run check`: lint and check formatting with Biome.
- `npm run typecheck`: type-check every part of the source.

### Layout

- `src/core/`: the simulation as a pure library, with no DOM, Three.js or worker globals.
- `src/app/`: the page, which imports the core.

The core is compiled without the DOM type library, so a `document` or `window` reference there fails `npm run typecheck`.
