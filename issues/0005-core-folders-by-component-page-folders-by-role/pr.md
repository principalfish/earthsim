# refactor: core folders by component, page folders by role

The simulation core was mostly one flat folder, and the page had about 20 files at its top level beside a `ui/` folder of 26. More layers are coming (rain, ocean currents, ice, storms, tectonics), so the code moves into folders before they arrive, and the four largest files are cut down along the way. Nothing the page does changes.

**The core, by component.** `src/core/` now has `grid/`, `world/`, `planet/`, `earth/`, `temperature/` and `wind/`, and each model keeps its own Earth baseline (`temperature/baseline/`, `wind/baseline/`). `index`, `protocol`, `compare` and `testing/` stay at the top. Everything outside the core still imports it through `core/index`. The two baseline update scripts now read from and write to the new baseline folders.

**The page, by role.** `src/app/` has `editing/`, `saving/`, `layers/` and `settings/`, with only `main.ts`, `wiring.ts` and `styles.css` left at the top. `ui/` splits into `ui/main/` (what sits over the globe) and `ui/panel/` (the side panel's sections and the New world dialog). `fields`, `icons`, `section` and `layerPanel` stay in `ui/`.

**The large files.**
- `scalarLayer.ts` becomes nine small files in `layers/scalar/` behind an `index.ts` with the same exports. The scale-fitting code moves in from the legend, so `layers/` no longer depends on `ui/`.
- `globe/material.ts` becomes ten files in `globe/material/` behind an `index.ts` with the same exports. The shader strings were checked byte for byte before and after.
- `ui/layerPanel.ts` (1,440 lines to 1,046) and `wiring.ts` (953 to 618) move out only their types, constants and already-pure helpers. Splitting their shared state further would change function signatures, so it is left as a follow-up.
- The tests split with their source. `layerPanel`'s 4,380-line test file also splits into five files by theme, and `wiring.test.ts` stays whole as the check that the page still starts the same.

**Review.** Every piece had its own review round. Pieces 3 to 7 ran straight through at the user's request, each committed after its review with no pause, and every choice the builder made is recorded in the plan. The self review of the whole branch compared every moved and split file declaration by declaration against `main` and found nothing that changes behaviour:
- the public entry points export the same names;
- there are no import cycles at run time;
- no old path survives as a string;
- the same 3,623 tests run, with identical bodies.

The verifier upheld none of the small findings. The light re-check was skipped after one-line doc fixes in three pieces, and one move piece ran no separate coverage check, since no code line changed.

**Reading the diff.** `git diff -M` shows the moves as renames, and `--color-moved` makes the split files' moved code easy to tell apart from the few lines that changed. The build scripts, the worker and the models' settings are not touched.

Closes #9
