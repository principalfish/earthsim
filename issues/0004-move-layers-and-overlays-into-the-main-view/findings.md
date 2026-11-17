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
| round | correctness | low | cleanup | verified | fixed | `src/app/main.ts:183` | The `?? DEFAULT_WIND_UNIT` and `?? DEFAULT_WIND_STYLE` fallbacks never run, since the layer panel always fills both in; `InfoBoxOptions` is used only by a test |
| round | correctness | - | - | dropped | - | `src/app/ui/infoBox.ts:187` | The box decides it is empty from two blocks' own `hidden` but a flag for the read-out — dropped: same conditions, no effect on behaviour |
| round | correctness | - | - | dropped | - | `src/app/ui/infoBox.ts:70` | On Terrain with Winds on a temperature solve shows "Calculating" with no bar — dropped: as before this change, and the next piece rewrites this case |
| round | docs | - | - | dropped | - | `src/app/ui/layerPanel.ts:1174` | "The winds' lines are the key's own" — dropped: the check said it is still true |
| manual | user | - | defect | - | fixed | the info box | The user asked to take the winds block out of the box and keep the two wind comparison lines: "lets get rid of the wind part of the pop up box"; "Keep them as two lines" |
| manual | user | - | defect | - | fixed | the legend | The user asked to drop the legend's end labels: "remove -35 and below and 30 and above from this" |
| manual | user | - | defect | - | fixed | the info box | The user asked for one "Wind:" line ("the wind data needs to be prefixed by Wind: and fit on one line"), then for no wind figures at all and a two-line pointer block ("actually remove the wind correct % / direction"; "all of these can be concatted into 1 or 2 lines") |
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/cursorReadout.ts:518` | The class `cursor-readout__temperature` had no stylesheet rule left and named the temperature on every layer; its comment was stale |
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/layerPanel.ts:170` | `ShownLayer.summary` and `ShownLayer.month` had no reader once the pointer's line dropped them |
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/layerPanel.ts:448` | Ragged doc paragraphs after the edits |
| round | correctness | low | cleanup | verified | fixed | `src/app/styles.css:678` | Two comment blocks not rewrapped |
| round | security | - | - | dropped | - | `src/app/windUnits.ts:94` | A NaN bearing would read "undefined" — dropped: the function requires a finite bearing, and NaN would come only from a broken wind field, outside this change |
| round | docs | - | - | dropped | - | `src/app/ui/windKey.ts` | The `windKey` names still say "key" — dropped: optional; the comments say what they do now; a rename is a later cleanup |
| re-check | correctness | low | test | verified | fixed | `src/app/ui/cursorReadout.test.ts:904` | Two `it.each` cases still set the removed `month` and `summary` fields, so they now test only what the 'the result' case does |
| re-check | correctness | - | - | noticed | - | `src/app/ui/cursorReadout.ts:96` | Doc comments still mention the month or summary the field may be; still true, no change needed |
| manual | user | low | test | - | fixed | `src/app/ui/cursorReadout.test.ts:904` | The user chose to fix the redundant test cases: "Tried it, fix it" |
| re-check | coverage | - | - | - | - | `src/app/ui/cursorReadout.test.ts:904` | Light re-check of the test fix: clean |

## piece 5 · 2026-11-16 · Everything worked out after every change, with Pause

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | medium | docs | verified | fixed | `docs/user-guide.md:281` | Still said switching Winds off stops the winds being worked out unless Pressure is on screen; now the winds are worked out after every change and only Pause stops them |
| round | correctness | low | defect | verified | fixed | `src/app/ui/infoBox.ts:208` | Ties went to the legend, so on Pressure the line read plain "Calculating" with no progress, not "Calculating temperature" and then "Calculating winds" as the guide says; the calculation's line now wins a calculating tie unless the legend's bar knows its fraction |
| round | correctness | low | defect | verified | fixed | `src/app/ui/pauseButton.ts:49` | The button changes its name (Pause to Resume) as well as `aria-pressed`, so a screen reader hears "Resume, pressed"; the name and the pressed state were both decided, so it is the user's call |
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/layerPanel.ts:23` | Changed doc-comment lines (also :220, :519) not rewrapped |
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/infoBox.ts:209` | The `{state, status, bar}` shape spelled out inline a third time; now `readonly CalculationContent[]` |
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/infoBox.ts:207` | The `calculation` parameter's default served only the tests; now required |
| round | docs | - | - | dropped | - | `docs/user-guide.md:192` | The Pressure legend's "Calculating" wording — dropped: matched the code then; the tie finding covers the clash |
| round | security | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | Clean: 96%, uncovered `main.ts` (entry point) and `topBar.ts:83` (unreachable guard), both reasons accepted |
| re-check | correctness | - | - | - | - | `src/app/ui/infoBox.ts:206` | The four fixes confirmed correct |
| re-check | docs | low | docs | verified | fixed | `docs/temperature.md:62` | The status table's "Calculating, with the years done and a bar" row matches no line the box shows; it shows "Calculating · year N, about M to go" once the years left are known |
| re-check | correctness | low | cleanup | verified | fixed | `src/app/ui/legend.ts:429` | `progressLine`'s first-year line and its "year N" line with no estimate can no longer show, since the calculation's "Calculating temperature" wins those ties; its doc still says they are shown |
| re-check | docs | - | - | dropped | - | `docs/temperature.md:63` | Name the "first year" state in the row — dropped: that line can no longer show |
| manual | user | low | defect | - | fixed | `src/app/ui/pauseButton.ts:49` | The user chose to fix all three and option (b), the name fixed at "Pause" with only the word and tooltip changing: "Tried it, fix all, B" |
| re-check | correctness | - | - | - | - | `src/app/ui/pauseButton.ts:49` | Light re-check of the three fixes: clean |

## piece 6 · 2026-11-17 · The browser remembers the view

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | verified | fixed | `docs/user-guide.md:107` | "What is not saved: … the view, layer, month and tool settings" read as if the layer and view were forgotten between visits; now "not saved with the world", with what the browser remembers |
| round | correctness | low | cleanup | verified | fixed | `src/app/wiring.ts:380` | A doc-comment line left at 120 characters after the edit |
| round | correctness | - | - | dropped | - | `src/app/ui/layerPanel.ts:609` | The layer and Show fallbacks are written in both the preferences and the layer panel — dropped: the panel needs its own check for the layers it is given, and in the app both check the same full list, so they cannot disagree |
| round | security | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | Clean: 96%, uncovered `main.ts` (entry point, untouched here) and `topBar.ts:83` (unreachable guard), both reasons accepted |
| re-check | correctness | - | - | - | - | `src/app/wiring.ts:380` | Light re-check of the rewrap and the guide's line: clean |
| re-check | docs | nit | docs | verified | fixed | `docs/user-guide.md:107` | The new line says the browser never remembers "the month" but leaves out the comparison, which the guide's other two places name too; not wrong, less complete |
| manual | user | nit | docs | - | fixed | `docs/user-guide.md:107` | The user chose to name the comparison too: "Approve, fix it" |

## piece 7 · 2026-11-17 · The Settings section, with Streaks by default

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | docs | verified | fixed | `src/app/wiring.ts:453` | A doc-comment paragraph still said the view controls' choice of where the wind arrows come from goes to the layer panel; the source comes from the top bar's comparison control (raised by correctness and docs, merged) |
| round | coverage | - | - | dropped | - | `src/app/globe/renderer.ts:384` | The starting branch that puts the streaks or the arrows in the scene is run by no test — dropped: the renderer needs a real WebGL context and the value reaching it is tested; checked in a browser instead, streaks on a first load and arrows under reduced motion |
| round | security | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | 96%: uncovered `main.ts` (entry point), `topBar.ts:83` (unreachable guard) and `renderer.ts` 315, 384-385, 467 (the WebGL renderer has no tests), all reasons accepted |
| re-check | correctness | - | - | - | - | `src/app/wiring.ts:453` | Light re-check of the reworded comment: clean |
| re-check | docs | - | - | - | - | `src/app/wiring.ts:453` | Light re-check of the reworded comment: clean |

## piece 8 · 2026-11-17 · Units: the model and its settings

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | verified | fixed | `README.md:12` | Said the wind under the pointer is in m/s, km/h or mph; knots is offered and the unit comes from Settings |
| round | correctness | low | defect | verified | fixed | `src/app/preferences.ts:302` | Carrying over the old wind unit removed the old entry even when writing the override failed, losing the old unit for good; now removed only after a successful write |
| round | correctness | nit | cleanup | verified | fixed | `src/app/ui/settingsPanel.ts:97` | `createUnitSelect` was typed `SelectChoice<string>`, dropping the unit type |
| round | correctness | nit | docs | verified | fixed | `src/app/preferences.ts:5` | Header comment broke its line early |
| round | correctness | - | - | dropped | - | `src/app/preferences.ts:356` | `unitChoice()` sounds like a plain read but migrates — dropped: its doc already says so, and only the store calls it, once |
| round | security | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | Clean: 96%; uncovered lines only in files this change does not touch (`main.ts`, `topBar.ts:83`, `renderer.ts`), reasons accepted |
| re-check | docs | - | - | - | - | `README.md:12` | Light re-check of the README and the new comments: clean |
| re-check | correctness | low | defect | verified | fixed | `src/app/preferences.ts:371` | Where storage refuses writes but allows removals, the old wind entry now survives the visit; choosing "As the system" for wind speed then removes only the new key, so the old unit comes back next visit over that choice |
| re-check | correctness | low | docs | verified | fixed | `src/app/preferences.ts:105` | `unitChoice`'s doc still says the old entry is removed whatever it holds; since the fix it stays when the override cannot be written |
| re-check | correctness | - | - | dropped | - | `src/app/ui/settingsPanel.ts:163` | The wider select type relies on method bivariance — dropped: each select gets only its own quantity's value, so nothing wrong can reach it |
| manual | user | low | defect | - | fixed | `src/app/preferences.ts:371` | The user chose to fix both: choosing "As the system" for wind speed also removes the old entry, and the doc says the old entry is removed only once the override is kept: "Approve, fix both" |
| re-check | correctness | low | docs | verified | fixed | `src/app/preferences.ts:122` | `setUnitOverride`'s doc does not say that choosing "As the system" for the wind speed also removes the old wind unit entry |

## piece 9 · 2026-11-17 · Units in the read-outs

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | minor | docs | verified | fixed | `docs/user-guide.md:333` | A sentence on the globe's colours under other units had no verb in its second half |
| round | correctness | low | cleanup | verified | fixed | `src/app/scalarLayer.ts:984` | Whether a view's values are differences was decided in two places (the fit and the globe's metric range); now one helper, `isDifferenceView`, used by both and by the read-out |
| round | correctness | nit | docs | verified | fixed | `src/app/scalarLayer.ts:509` | A remarks line left unwrapped (raised by correctness and docs, merged) |
| round | coverage | - | - | dropped | - | `src/app/ui/layerPanel.test.ts` | The inHg panel test matches ticks loosely — dropped: the exact inHg ends and ticks are pinned in `scalarLayer.test.ts`; the panel test shows the wiring |
| round | coverage | - | - | dropped | - | `src/app/ui/layerPanel.ts` | `setUnits` redraws when another layer's unit changes — dropped: harmless, the output is the same |
| round | security | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | 96%: uncovered `main.ts` (entry point, including the statistics' height unit), `topBar.ts:83`, `renderer.ts`, reasons accepted |
| re-check | docs | - | - | - | - | `docs/user-guide.md:333` | Light re-check of the sentence and the comments: clean |
| re-check | correctness | low | cleanup | verified | fixed | `src/app/scalarLayer.ts:473` | `isDifferenceView` also counts an end-to-end or centred view marked as differences, whose fit runs over absolute months; such a view would drop the °F or K offset and share the ordinary views' cached scale. None exists; a new test approves that combination |
| re-check | docs | low | docs | verified | fixed | `src/app/scalarLayer.ts:462` | `isDifferenceView`'s doc gives the conversion rule as its own reason; the reason is that the view's values are spans |
| manual | user | low | cleanup | - | fixed | `src/app/scalarLayer.ts:473` | The user chose to fix both: only views fitted from zero count as differences (the `isDifference` flag went), and the doc says their values are spans: "ok approve and fix as you suggest" |
| re-check | correctness | - | - | - | - | `src/app/scalarLayer.ts:473` | Light re-check of the two fixes: clean |

## piece 10 · 2026-11-17 · Units in the controls

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | cleanup | verified | fixed | `src/app/ui/fields.ts:281` | `createCheckField` and its type had no caller since the grid checkbox became a dock tile, with their CSS still in place and a new test only keeping them covered; deleted (raised by correctness and coverage, merged) |
| round | docs | low | docs | verified | fixed | `docs/user-guide.md:83` | The Resolution cell sizes, brush radius and strength (:120-121) and Sea level (:139) were given in metric only; each now notes it follows the units |
| round | correctness | nit | cleanup | verified | fixed | `src/app/ui/toolPanel.ts:194` | `formatStrength` built its text by hand; now `formatQuantity`, as the radius and sea level do |
| round | correctness | - | - | dropped | - | `src/app/ui/toolPanel.ts` | `formatKm` and `formatMetres` now write mi and ft too — dropped: they name the unit they take, and the check called them acceptable |
| round | security | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | 97%: uncovered `main.ts`, `topBar.ts:83` and `renderer.ts`, none touched here, reasons accepted |
| re-check | docs | - | - | - | - | `docs/user-guide.md:83` | Light re-check of the guide's notes: clean |
| re-check | correctness | low | cleanup | verified | fixed | `src/app/ui/viewPanel.test.ts:81` | Two test lines (:81, :109) still look for the `field__checkbox` class, which nothing creates any more; they cannot fail, and the test's claim holds without them |
| manual | user | low | cleanup | - | fixed | `src/app/ui/viewPanel.test.ts:81` | The user chose to drop the two dead checkbox checks: "Tried it, fix it" |
| re-check | correctness | - | - | - | - | `src/app/ui/viewPanel.test.ts:81` | Light re-check of the dropped test lines: clean |

## piece 11 · 2026-11-17 · Choosing Metric or Imperial clears the overrides

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | defect | verified | fixed | `src/app/ui/fields.ts:405` | Space on the system already chosen cleared nothing: browsers send no click for Space on a checked radio (seen in headless Edge); a keyup listener now calls back once and stops the default (raised by correctness and coverage, merged) |
| round | coverage | low | test | verified | fixed | `src/app/ui/fields.test.ts:116` | The arrow-key tests drove a change alone, but an arrow key sends click then change; the fields one was a duplicate and went, the Settings one now clicks |
| round | coverage | - | - | dropped | - | `docs/user-guide.md` | The guide's Space claim — dropped: the guide claims only clicks |
| round | coverage | - | - | dropped | - | `src/app/ui/settingsPanel.test.ts:208` | No test of the selects reading "As the system" after a system click — dropped: covered by the wiring test and "shows units chosen elsewhere" |
| round | security | - | - | - | - | - | Clean |
| round | docs | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | 97%: uncovered only `main.ts`, `topBar.ts:83` and `renderer.ts`, none touched here, reasons accepted |
| re-check | coverage | - | - | - | - | `src/app/ui/fields.ts:420` | Light re-check of the keyup listener's tests: clean |
| re-check | correctness | low | docs | verified | fixed | `src/app/testing/fakeDocument.ts:70` | The fake's `keyUp` doc says it lets go of a key "as the browser does", but it models Chromium (no click for Space on a checked radio); browsers are not known to agree |
| manual | user | low | docs | - | fixed | `src/app/testing/fakeDocument.ts:70` | The user chose "as Chromium does" for the fake's `keyUp` doc: "Approve, fix it" |

## piece 12 · 2026-11-17 · The user guide restructured around the main view

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | medium | docs | verified | fixed | `docs/user-guide.md:156` | The timeline was said to show with Sunlight or Winds on whatever the layer; it shows for them only on Terrain |
| round | correctness | low | cleanup | verified | fixed | `docs/user-guide.md:333` | A second "Arrows or streaks" heading under Settings; renamed "Winds drawn as" |
| round | docs | low | docs | verified | fixed | `docs/user-guide.md:364` | The old wind unit's carry-over named a control that no longer exists and read as history; now a present fact |
| round | correctness | nit | docs | verified | fixed | `docs/user-guide.md:3` | The intro said the panel holds only the world and its settings |
| round | docs | - | - | dropped | - | `docs/user-guide.md:335` | Settings repeats the wind style's default — dropped: the guide gives a control's starting value where it lives |
| round | docs | - | - | dropped | - | `docs/user-guide.md:146` | The top bar restates Show and the comparison — dropped: its bullets are already one-line pointers |
| round | docs | - | - | dropped | - | `docs/user-guide.md:153` | Status wording repeated — dropped: moved unchanged, and the Winds text already links to the info box |
| round | correctness | - | - | dropped | - | `README.md:13` | "its status" read as the legend's — dropped: it reads as the info box's own status line, which it is |
| round | security | - | - | - | - | - | Not run: docs only |
| round | coverage | - | - | - | - | - | Not run: docs only; 85 links checked, none broken |
| re-check | correctness | - | - | - | - | `docs/user-guide.md:156` | Light re-check of the four fixes, as correctness and docs: clean |

## review 01 · 2026-11-17

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | low | defect | verified | fixed | `src/app/main.ts:224` | `setInert` leaves the main-view controls live while storage loads; Pause then Resume asks for the blank world's temperature |
| round | docs | low | docs | verified | fixed | `docs/development.md:109` | The `view.ts` row misses the one source, the grid and `StoredView` |
| round | common-mistakes | low | cleanup | verified | fixed | `src/app/wiring.test.ts:1677` | Six dead `setWindUnit` stubs in `createControls` |
| round | docs | nit | docs | verified | fixed | `src/app/ui/infoBox.ts:9` | "as before" history wording in the header |
| round | docs | nit | docs | verified | fixed | `README.md:14` | Two new bullets too long; one clause ungrammatical |
| round | docs | nit | docs | noticed | fixed | `docs/winds.md:108` | Observed winds said to show "as arrows"; streaks follow them too |
| round | common-mistakes | - | - | dropped | - | `src/app/main.ts:73` | Unguarded `window.matchMedia` — dropped: in every browser the page can run in; no change asked |
| round | security | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | Clean: 97%, 31 uncovered lines with accepted reasons |
| re-check | common-mistakes | - | - | - | - | `src/app/wiring.test.ts:1677` | Light re-check of the removed stubs: clean |
| re-check | correctness | low | cleanup | verified | open | `src/app/wiring.ts:530` | The reflowed `startPage` doc left one line at 94 characters among lines of 70 to 75 |
| re-check | docs | - | - | dropped | - | `src/app/view.ts:204` | `PageView.winds` says shown "as arrows" — dropped: stale on main already, and this branch does not touch the line |
| re-check | docs | low | docs | noticed | - | `src/app/view.ts:204` | Noticed: the same line could say "as arrows or as moving streaks", a one-line fix if wanted here |
