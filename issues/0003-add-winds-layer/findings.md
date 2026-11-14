# Findings: add-winds-layer

## piece 9 · 2026-11-14 · The Winds switch and arrows on the globe
Cost: 8 subagents · about 471,000 tokens (one cut-off run unknown) · about 13 min (one cut-off run unknown)

| Phase | Check | Severity | Kind | Verdict | Outcome | Where | Finding |
|-|-|-|-|-|-|-|-|
| round | coverage | low | test | verified | fixed | `src/app/globe/wind.ts:210` | The fallback search in `arrowPatches` could not be reached and had no test |
| round | correctness | low | cleanup | verified | fixed | `src/app/globe/wind.ts:521` | `glslFloat` and `glslColour` were copies of those in `material.ts` |
| round | correctness | low | docs | verified | fixed | `src/app/styles.css:849` | The `.globe-overlays` comment left out the key; doc comments in `layerPanel.ts` ran past the wrap width |
| round | correctness | low | docs | verified | fixed | `src/app/ui/windKey.ts:21` | The key's top arrow is drawn at the cap but was labelled a plain "10 m/s" |
| re-check | correctness | low | docs | verified | accepted | `src/app/ui/layerPanel.ts:453` | A doc comment left ragged by the rewrap ("It stops when" alone on its line) |
