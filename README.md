# earth_sim

Browser-based planet simulator for worldbuilding: draw continents and plates, then see temperature, winds, rainfall, ocean currents, ice and continental drift.

## Using the page

The first time, the page opens on a blank ocean, with the New world dialog showing. Pressing **Create world** as it stands gives generated continents on the coarsest grid, from a seed chosen at random, with 30% land; **Cancel** keeps the blank ocean. The **New world** button at the top of the panel brings the dialog back at any time, filled in with the options of the current world. It offers:

- **Resolution**: 64, 128 or 256 cells along each edge of a cube face, which makes cells of about 150, 75 or 40 km.
- **Start with**: a blank ocean, or generated continents.
- **Seed**, for generated continents: a whole number from 0 to 4294967295. The same seed and land always give the same continents, and the same seed at another resolution gives the same continents on a finer or coarser grid. Leave the field blank for a seed chosen at random, or press **Random** to fill one in.
- **Land**, for generated continents: the share of the surface to make land, from 0 to 100%.

The line under the World heading says how the current world started, such as `Generated · 64 · seed 1977 · 30% land` or `Blank ocean · 128`: the resolution, then the seed and the land. To get a world back, type its seed into the dialog and set the same land.

A new world replaces the current one, and the old one cannot be brought back: its strokes are no longer there to undo. The sea level returns to 0 m. The camera, the relief exaggeration, the grid setting and the tool settings stay as they were. Generating the finest grid takes about half a second, during which the button says "Generating…" and the page does not respond; it cannot be cancelled once started.

The world is saved in the browser as you work: about a second after the last stroke, undo, redo, move of the Sea level slider, new world or import, and at once when the page is refreshed, left, closed or put in the background. Reopening or refreshing the page brings the world back as it was, with its resolution and its sea level, and without the dialog. A browser that is killed, or that shuts a page without telling it first, as phones often do, can still lose what was changed in the last second. Under the World buttons, "Saved" says that the last save worked. "Autosave unavailable" says that the browser would not store the world, as some will not in a private window: the page works as before, but the world will not come back. The browser keeps one world for the page, so with the page open in two tabs the one that comes back is whichever was saved last. If the saved world cannot be read, the page opens on a blank ocean with the dialog, which says "The saved world could not be restored."

**Export** downloads the world as a file named `world.earthsim`. **Import** replaces the current world with the one in such a file, at once and without asking, and like a new world it leaves nothing to undo. A file that is not a world file, or one that is damaged, cut short or made by a newer version, is refused with a message under the buttons, and the current world is left untouched.

What is saved, in the browser and in a file alike, is the world only: its terrain, its resolution, its sea level and how it started. The undo history, the camera, the relief exaggeration, the grid setting and the tool settings are not saved. A sea level beyond the ends of the Sea level slider is brought to the nearer end when a world is imported or brought back.

The Tools panel chooses what the left mouse button does on the globe:

- **Move**: left-drag turns the globe and the wheel zooms.
- **Raise**, **Lower** and **Smooth**: left-drag sculpts the terrain under the brush, whose outline follows the cursor. Right-drag turns the globe and the wheel zooms.

Two sliders set the brush. Brush radius runs from 100 to 3,000 km. Brush strength is how fast the centre of the brush rises or falls, from 100 to 5,000 m/s, for Raise and Lower; for Smooth it is a setting from 1 (gentlest) to 100 (strongest). The two strengths are kept apart, so changing one leaves the other as it was.

The Undo and Redo buttons at the top of the Tools panel step back and forward through the strokes, one stroke at a time:

- **Undo**: Ctrl+Z, or Cmd+Z on a Mac.
- **Redo**: Ctrl+Shift+Z or Ctrl+Y, or Cmd+Shift+Z on a Mac.

Up to the last 100 strokes can be undone, or fewer once they hold about 64 MB between them, which takes very long strokes on a fine grid. Making a new stroke after an undo discards what could have been redone. The keys do nothing while a stroke is being made, while typing in a text field or while the New world dialog is open. Only the terrain is put back: the sea level, the view settings and the tool settings are not part of the history.

The Statistics readout at the bottom of the panel shows how much of the surface is land, the highest and deepest points, the mean height of the land and the mean depth of the ocean. It follows the terrain and the sea level, a moment after each stroke, undo, redo or move of the Sea level slider. Until the first figures arrive, and again after a new world is made, it says "Calculating…", and if the worker that computes them cannot be started or fails it says "Statistics unavailable" and hides the figures, while the rest of the page keeps working. The highest and deepest points are elevations on the scale of the Sea level slider; the two means are measured from the sea level.

## Development

Requires Node.js and npm. Run `npm install` once, then:

- `npm run dev`: serve the page locally with hot reload.
- `npm run build`: type-check, then write the static site to `dist/`.
- `npm test`: run the unit tests once.
- `npm run check`: lint and check formatting with Biome.
- `npm run typecheck`: type-check every part of the source.

### Layout

- `src/core/`: the simulation as a pure library, with no DOM, Three.js or worker globals.
  - `src/core/serialize.ts`: the world file format, and the checks a file must pass to be read as a world.
- `src/app/`: the page, which imports the core.
  - `src/app/main.ts`: joins the parts of the page together.
  - `src/app/appState.ts`: the world being edited, and the one way of replacing it.
  - `src/app/sculpt.ts`: sculpting with the mouse, which turns the cursor's path into dabs of a brush.
  - `src/app/undo.ts`: undo and redo of strokes, and the keys that ask for them.
  - `src/app/refresh.ts`: when to ask the worker again after the world changes.
  - `src/app/storage.ts`: the saved world in the browser's IndexedDB, and exporting and importing world files.
  - `src/app/autosave.ts`: when to save after the world changes.
  - `src/app/globe/`: the globe's renderer, shaders, camera and picking.
  - `src/app/ui/`: the panels of controls and the New world dialog.
- `src/worker/`: the Web Worker that computes from a copy of the world and keeps nothing between requests.
  - `src/worker/sim.worker.ts`: the worker itself, which only passes messages to the handler.
  - `src/worker/handle.ts`: the message handler, a plain function that answers one request.
  - `src/worker/client.ts`: the page's side of the channel, which runs on the main thread.

The core is compiled without the DOM type library, and the worker and its handler with the worker's in place of it, so a `document` or `window` reference in either fails `npm run typecheck`.
