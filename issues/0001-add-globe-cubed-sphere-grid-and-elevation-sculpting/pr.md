# Add globe, cubed-sphere grid and elevation sculpting

earth_sim is a browser-based planet simulator for worldbuilding. This is its first step: a planet you can see and shape, and the foundation every later layer (temperature, winds, rainfall, oceans, ice, plate drift) is built on.

The planet's surface is stored on a cubed-sphere grid whose resolution is chosen per world: 64 cells per cube face by default (about 150 km), or 128 or 256. A 3D globe shows it tinted by height and lit, with mountains raised from the sphere by an adjustable exaggeration and an optional overlay of the cell grid.

You shape the terrain by sculpting directly on the globe with raise, lower and smooth brushes, with undo and redo per stroke. Sea level is an adjustable setting that decides what is land. A new world starts as a blank ocean, as generated continents from a seed and a land fraction, or as real Earth from NOAA's ETOPO 2022 elevation data.

The simulation code is a pure TypeScript library with no browser dependency, run in a Web Worker as a compute service, while the page owns the editable world. Here the worker returns land and sea areas and height statistics; later climate layers use the same channel. That split is also what will let a run through time be paused, edited and resumed.

Worlds autosave in the browser and can be exported to and imported from a file. Everything runs client-side as static files. The issue also scaffolds the project tooling: npm, Vite, Vitest, Biome and TypeScript.

Not included: any climate or time simulation, a flat map view, and changing a world's resolution after it is created.

Closes #1

Progress: the plan checklist on #1.
