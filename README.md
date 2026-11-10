# earth_sim

Browser-based planet simulator for worldbuilding: draw continents and plates, then see temperature, winds, rainfall, ocean currents, ice and continental drift.

## Using the page

The Tools panel chooses what the left mouse button does on the globe:

- **Move**: left-drag turns the globe and the wheel zooms.
- **Raise**, **Lower** and **Smooth**: left-drag sculpts the terrain under the brush, whose outline follows the cursor. Right-drag turns the globe and the wheel zooms.

Two sliders set the brush. Brush radius runs from 100 to 3,000 km. Brush strength is how fast the centre of the brush rises or falls, from 100 to 5,000 m/s, for Raise and Lower; for Smooth it is a setting from 1 (gentlest) to 100 (strongest). The two strengths are kept apart, so changing one leaves the other as it was.

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
  - `src/app/sculpt.ts`: sculpting with the mouse, which turns the cursor's path into dabs of a brush.
  - `src/app/globe/`: the globe's renderer, shaders, camera and picking.
  - `src/app/ui/`: the panels of controls.

The core is compiled without the DOM type library, so a `document` or `window` reference there fails `npm run typecheck`.
