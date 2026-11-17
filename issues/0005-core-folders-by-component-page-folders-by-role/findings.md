# Findings: core-folders-by-component-page-folders-by-role

## piece 1 · 2026-11-17 · The core in component folders

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | verified | fixed | `scripts/docs/climate-process.py:286` | Comment names `src/core/temperature.ts`, now `temperature/temperature.ts` (also raised by correctness) |
| round | docs | low | docs | verified | fixed | `docs/development.md:82` | `wind/observedWind.ts` row says `vector.ts`; it is now `grid/vector.ts` |
| round | coverage | low | test | dropped | - | `scripts/update-earth-temperature-baseline.ts:34` | `BASELINE_FILE` not asserted by a test — dropped: a literal path; a test needs an export and a change beyond import paths |

## piece 2 · 2026-11-17 · The page's top-level files in role folders

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | - | - | - | - | - | Clean: no finding (nit, not a finding: the `src/app` table rows keep their old order, so folders interleave) |
| round | security | - | - | - | - | - | Clean |
| round | docs | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | Clean |

## piece 3 · 2026-11-17 · `ui/` split into the main view and the panel

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | verified | fixed | `docs/development.md:121` | The new `ui/` row opened "What the two share", but only `fields.ts` is used by both folders; `layerPanel.ts`'s description also strayed from its header (also raised by correctness) |
| round | correctness | low | cleanup | dropped | - | `src/app/ui/layerPanel.ts:85-97` | `ui/` and `ui/main/` depend on each other at folder level (`main/cursorReadout.ts` imports types from `../layerPanel`) — dropped: a type-only back-edge, and the plan settles that `layerPanel` stays in `ui/` and imports its children |
| round | verifier | low | cleanup | noticed | - | `src/app/ui/main/cursorReadout.ts:43` | Moving `ShownLayer` and `ShownWinds` into `ui/main/` would make the dependency one-way; optional, outside this refactor |
| re-check | docs | low | docs | verified | fixed | `docs/development.md:121` | The first rewording ("What the folders above lean on") fitted `icons.ts`, `section.ts` and `layerPanel.ts` poorly (each used by one side or neither); now "What stays at the top of the folder", with `icons.ts` marked as the main view's only |

## piece 4 · 2026-11-17 · The scalar layers split, with the legend's fitting code

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | verified | fixed | `src/app/layers/scalar/index.ts:14` | Header said the legend shares `fit.ts`; the legend imports nothing from it |
| round | docs | low | docs | verified | fixed | `docs/development.md:112` | The `layers/scalar/` row said the same |
| round | docs | low | docs | verified | fixed | `docs/development.md:119` | The `ui/main/` row said the legend's scale is fitted in `fit.ts`; the layer panel fits it (with `fitSummaryScale`) and the legend is handed the range |
| round | correctness | low | cleanup | verified | fixed | `src/app/layers/scalar/yearScale.test.ts:13` | A test under `layers/` imported `legendTicks` from `ui/main/legend`, against "no file under layers/ imports from ui/"; the describe moved whole, unchanged, to `ui/main/legend.test.ts` |
| re-check | correctness | - | - | - | - | - | Clean: the moved block is byte-identical, no test lost or duplicated, no `layers/` file imports `ui/` |

## piece 5 · 2026-11-17 · The globe's material split

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | correctness | - | - | - | - | - | Clean: 33 declarations byte-identical; the shader strings equal, checked a second way (a bundle of HEAD's file run beside the new folder); no runtime import cycle |
| round | security | - | - | - | - | - | Clean |
| round | docs | - | - | - | - | - | Clean (nit, not a finding: the `globe/` row's "material and its shaders" is slightly narrow, since `material/` also holds the data texture, the sunlight and the constants) |
| round | coverage | - | - | - | - | - | Clean; the two uncovered lines (`testing/glsl.ts` 10 and 23, the test helper's defensive throws) accepted: the old test file never ran them either |

## piece 6 · 2026-11-17 · The layer panel's types, constants and pure helpers moved out, and its tests split

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | verified | fixed | `src/app/ui/layerPanel.ts:20` | The file header's `{@link LayerControls}` no longer resolved, since `LayerControls` moved to `layerPanel/types.ts` and is only re-exported; reworded to plain backticks, because Biome counts an import used only in a `{@link}` as unused |
| round | correctness | - | - | - | - | - | Clean: declarations identical, `differenceOf` and `figuresOf` close over nothing of `createLayerPanel`, the describe and test names identical, no top-level hook lost |
| round | security | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | Clean; the three uncovered helper lines (`testing/layerPanelStage.ts` 123, 126, 254) accepted: two unused default loader stand-ins and one unreachable throw, identical in the old test file |

## piece 7 · 2026-11-17 · The page wiring's types moved out

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | docs | low | docs | noticed | fixed | `docs/development.md:103` | Optional nit: "What the joining is given" fits `parts.ts` but not `lighting.ts`; reworded to "What the joining uses: the types of the parts it is given ... and how the globe is lit" (no verifier ran: every other check was clean and this was a wording nit) |
| round | correctness | - | - | - | - | - | Clean: moved declarations identical apart from `export` and one `{@link}` reworded; everything from `startPage`'s doc comment to the end of `wiring.ts` byte-identical |
| round | security | - | - | - | - | - | Clean |
| round | coverage | - | - | - | - | - | Clean |
