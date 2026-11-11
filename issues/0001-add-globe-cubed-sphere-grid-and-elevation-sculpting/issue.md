# Add globe, cubed-sphere grid and elevation sculpting

earth_sim is a browser-based planet simulator for worldbuilding. This is its first step: a planet you can see and shape, and the foundation every later layer (temperature, winds, rainfall, oceans, ice, plate drift) is built on.

The planet's surface is stored on a cubed-sphere grid whose resolution is chosen per world: 64 cells per cube face by default (about 150 km), or 128 or 256. A 3D globe shows it tinted by height and lit, with mountains raised from the sphere by an adjustable exaggeration and an optional overlay of the cell grid.

You shape the terrain by sculpting directly on the globe with raise, lower and smooth brushes, with undo and redo per stroke. Sea level is an adjustable setting that decides what is land. A new world starts as a blank ocean, as generated continents from a seed and a land fraction, or as real Earth from NOAA's ETOPO 2022 elevation data.

The simulation code is a pure TypeScript library with no browser dependency, run in a Web Worker as a compute service, while the page owns the editable world. Here the worker returns land and sea areas and height statistics; later climate layers use the same channel. That split is also what will let a run through time be paused, edited and resumed.

Worlds autosave in the browser and can be exported to and imported from a file. Everything runs client-side as static files. The issue also scaffolds the project tooling: npm, Vite, Vitest, Biome and TypeScript.

Not included: any climate or time simulation, a flat map view, and changing a world's resolution after it is created.

## Plan

_2026-11-11 · 8 of 11 pieces done · now: piece 9 in progress_

- [x] **1/11 Scaffold tooling and app shell** · `b22e81a`
  An npm project with Vite, Vitest, Biome, TypeScript and Three.js, and an empty page.
- [x] **2/11 Cubed-sphere grid** · `1a0f1f8`
  Cell centres, areas, neighbours across cube edges, and lookups for any resolution.
- [x] **3/11 World model and terrain statistics** · `81749de`
  The world's data, a blank ocean world, and land, sea and height statistics.
- [x] **4/11 Continent generator** · `dbc0939`
  Noise-shaped continents from a seed and a land fraction.
- [x] **5/11 Globe renderer with relief and view controls** · `21862d7`
  The lit 3D globe tinted by height, with raised relief, sea-level and exaggeration sliders and a grid overlay.
- [x] **6/11 Sculpting brushes** · `3c7e6ea`
  Raise, lower and smooth brushes applied on the globe with the mouse.
- [x] **7/11 Undo and redo** · `8bfa67b`
  Step back and forward one brush stroke at a time.
- [x] **8/11 Worker compute service and statistics readout** · `3ec0f59`
  The Web Worker channel, proven with live land and height statistics.
- [ ] **9/11 New-world dialog** · in progress
  Create a blank or generated world at a chosen resolution.
- [ ] **10/11 Save, load and autosave** · not started
  Export and import world files, and restore the current world after a refresh.
- [ ] **11/11 Earth preset** · not started
  Real Earth elevation from NOAA's ETOPO 2022 as a starting world.
