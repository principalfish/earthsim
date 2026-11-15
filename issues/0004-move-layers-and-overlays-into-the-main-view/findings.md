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

## piece 2 · 2026-11-15 · Show and one comparison control at the top

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/topBar.ts:79` | The Show select was taken as `field.children[1]`, relying on the order `createSelectField` builds |
| round | correctness | low | docs | verified | fixed | `docs/temperature.md:87` | It and two lines of the user guide said a failed observed fetch always goes back to Simulated; one that fails after its layer was left keeps the choice and is tried again on return |
| round | docs | low | docs | verified | fixed | `src/app/wiring.ts:119` | `PageLayerOptions` was still described as what the Layers section shows and switches on and off |
| round | docs | low | docs | verified | fixed | `docs/user-guide.md:132` | The opening sentence of "Layers" packed three clauses and was hard to parse |
| round | correctness | - | - | dropped | - | `src/app/ui/layerPanel.ts:1367` | An old "could not be loaded" line shows again on returning to a layer on Simulated — dropped: consistent with staying on it, and not new |
| round | docs | - | - | dropped | - | `src/app/ui/viewPanel.ts:83` | Stale comment on what the View section holds — dropped: the diff already rewrote it and it is accurate |
| round | docs | - | - | dropped | - | `src/app/ui/layerPanel.ts:1463` | Comment on what the layer controls add — dropped: accurate; only the `wiring.ts` part stands |
| round | docs | - | - | dropped | - | `docs/user-guide.md:34` | "Switching Sunlight or Winds on opens Layers" — dropped: raised for the record, still true |
| round | coverage | - | - | dropped | - | `src/app/ui/layerPanel.test.ts:4236` | No test ties a real stroke and undo to the source's reset — dropped: the check said no action, and the link predates this piece |
| re-check | correctness | low | docs | verified | fixed | `docs/user-guide.md:185` | "Fetched when first needed" still says a failed fetch always goes back to Simulated; the layer's resets only while it is on screen, the winds' only while Winds is on |
| re-check | correctness | low | docs | verified | fixed | `docs/user-guide.md:262` | The winds' "Fetched when first needed" says a failed download always goes back to Simulated; it does only while Winds is on |
| re-check | docs | low | docs | verified | fixed | `docs/user-guide.md:161` | The Pressure bullet's edited clause is garbled and leaves out what happens when Pressure has been left |
| re-check | correctness | - | - | dropped | - | `docs/temperature.md:87` | "If Temperature has been left" is exact only for leaving for Pressure — dropped: accurate about the failure; going to Terrain resets through a separate, documented rule |
| manual | user | low | docs | - | fixed | `docs/user-guide.md` | The user chose to fix the three standing re-check findings: "Tried it, fix all" |
| re-check | docs | - | - | - | - | `docs/user-guide.md:161` | Light re-check of the three user-guide edits: clean |

## piece 3 · 2026-11-15 · The month timeline, and the Layers section removed

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | defect | verified | fixed | `src/app/styles.css:864` | In a short narrow window (800x420) the info region's stacked blocks pushed the timeline below the window, so the month could not be reached; the info row now gives way and the timeline keeps its row |
| round | correctness | low | defect | verified | fixed | `src/app/ui/timeline.ts:15` | The year's button was named "Pause" while playing, the name the whole page's Pause button will have; now "Play the year" and "Pause the year" |
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/fields.ts:41` | `quietValue` had no caller left after the old month slider went |
| round | correctness | low | cleanup | verified | fixed | `src/app/wiring.ts:367` | Two edited doc-comment lines (here and `layerPanel.ts:666`) were not rewrapped |
| round | correctness | low | docs | verified | fixed | `src/app/ui/layerPanel.test.ts:2501` | Stale wording: "shows the month controls", and "chosen in the Layers section" in `wiring.test.ts:1476` |
| round | correctness | - | - | dropped | - | `src/app/ui/layerPanel.ts:1157` | `announce` now tells the view before the comparison — dropped: nothing there throws in practice, and nothing relies on the order |
| round | docs | - | - | dropped | - | `docs/user-guide.md:11` | The Layers row of the tiles table does not mention the timeline — dropped: the table lists tiles, and the timeline has its own section |
| round | docs | - | - | dropped | - | `docs/user-guide.md:139` | The "Layers" heading could be read as the removed section — dropped: the check said leave it; the intro names the tiles |
| round | coverage | - | - | dropped | - | `src/app/ui/timeline.test.ts` | Optionally rename the arrow-key test to say the keys are the slider's own — dropped: optional, the test judged adequate |
| re-check | correctness | - | - | - | - | `src/app/styles.css:864` | Light re-check of the five fixes: clean |

## piece 4 · 2026-11-15 · One info box

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | cleanup | verified | open | `src/app/main.ts:183` | The `?? DEFAULT_WIND_UNIT` and `?? DEFAULT_WIND_STYLE` fallbacks never run, since the layer panel always fills both in; `InfoBoxOptions` is used only by a test |
| round | correctness | - | - | dropped | - | `src/app/ui/infoBox.ts:187` | The box decides it is empty from two blocks' own `hidden` but a flag for the read-out — dropped: same conditions, no effect on behaviour |
| round | correctness | - | - | dropped | - | `src/app/ui/infoBox.ts:70` | On Terrain with Winds on a temperature solve shows "Calculating" with no bar — dropped: as before this change, and the next piece rewrites this case |
| round | docs | - | - | dropped | - | `src/app/ui/layerPanel.ts:1174` | "The winds' lines are the key's own" — dropped: the check said it is still true |
| manual | user | - | defect | - | open | the info box | The user asked to take the winds block out of the box and keep the two wind comparison lines: "lets get rid of the wind part of the pop up box"; "Keep them as two lines" |
