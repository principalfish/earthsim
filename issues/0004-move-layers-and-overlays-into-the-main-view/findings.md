# Findings: move-layers-and-overlays-into-the-main-view

## piece 1 · 2026-11-15 · The main-view regions, the icons, and the layer and overlay tiles

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | verified | fixed | `src/app/wiring.ts:342` | The `startPage` remarks read "The dock is shown every change of the view settings the layer panel tells of", garbled, with "The" stranded at a line end |
| round | correctness | low | docs | verified | fixed | `src/app/ui/layerPanel.ts:316` | The `setSunlight` doc comment had one 132-character line after an in-place edit, and the file header's lines 5-6 broke short (also raised by docs) |
| round | correctness | low | docs | verified | fixed | `src/app/ui/layerPanel.ts:20` | Three comments (20, 180, 1145) still said "the Winds control" though the dock's Winds tile sets it now; test names said the same |
| round | correctness | low | cleanup | verified | fixed | `src/app/wiring.ts:640` | The dock and the layer panel each fall back to `SCALAR_LAYERS` on their own and `startPage` passes neither a list; fixed by saying so in the `startPage` doc comment |
| round | correctness | - | - | dropped | - | `src/app/scalarLayer.ts:183` | Comments say "in the choice of layer" though the layer is chosen on the dock — dropped: the file is not in the diff and the wording is still accurate |
| manual | user | low | defect | - | fixed | the page | In a window shorter than about 465 px the dock was clipped at the bottom with no scrolling; the user chose to let it scroll ("Tried it, approve, scroll") |
| round | docs | low | docs | verified | fixed | `src/app/styles.css:880` | After the scroll change the `.main-view` comment still said the dock is "the full height of the area" |
| round | docs | low | docs | verified | fixed | `src/app/styles.css:904` | The dock's comment did not say that the room kept for the scrollbar starts the regions beside it about 10 px further right in every window (also raised by correctness) |
| round | correctness | - | - | dropped | - | `src/app/styles.css:912` | A wheel over a heading or a gap between tiles zooms the globe instead of scrolling the dock — dropped: intended, only controls take the pointer, and the guide says "over a tile" |
| round | correctness | - | - | dropped | - | `src/app/styles.css:920` | On overlay-scrollbar platforms the gutter reserves nothing and the scrollbar draws over the padding — dropped: not a real problem; the 10 px shift part is the row above |
