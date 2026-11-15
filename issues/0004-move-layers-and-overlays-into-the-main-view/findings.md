# Findings: move-layers-and-overlays-into-the-main-view

## piece 1 · 2026-11-15 · The main-view regions, the icons, and the layer and overlay tiles

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | verified | fixed | `src/app/wiring.ts:342` | The `startPage` remarks read "The dock is shown every change of the view settings the layer panel tells of", garbled, with "The" stranded at a line end |
| round | correctness | low | docs | verified | fixed | `src/app/ui/layerPanel.ts:316` | The `setSunlight` doc comment had one 132-character line after an in-place edit, and the file header's lines 5-6 broke short (also raised by docs) |
| round | correctness | low | docs | verified | fixed | `src/app/ui/layerPanel.ts:20` | Three comments (20, 180, 1145) still said "the Winds control" though the dock's Winds tile sets it now; test names said the same |
| round | correctness | low | cleanup | verified | fixed | `src/app/wiring.ts:640` | The dock and the layer panel each fall back to `SCALAR_LAYERS` on their own and `startPage` passes neither a list; fixed by saying so in the `startPage` doc comment |
| round | correctness | - | - | dropped | - | `src/app/scalarLayer.ts:183` | Comments say "in the choice of layer" though the layer is chosen on the dock — dropped: the file is not in the diff and the wording is still accurate |
