# Decisions: Move layers and overlays into the main view

Step 3c of the roadmap (`investigations/2026-11-10-simulator-design-and-roadmap.md`).

## Settled
- Purpose is worldbuilding: believable results and a fast-running simulation beat fidelity (2026-11-10)
- The layers come out of the side panel into the main view, as a step of its own after winds merges. The user: "i think we will do a separate UI piece to bring out layers from the side entirely - it lives in the main UI i think"; "New step after winds merges (Recommended)" (2026-11-14)
- 3c comes before 3a (the folder refactor), so the UI is rearranged once and the files then moved once; 3a places whatever new files 3c adds (2026-11-14)
- Planned in this chat on the user's word: "ok lets plan 3c" (2026-11-15)

## Open
- Where in the main view the layer and overlay controls sit, and what shape they take.
- Where the month controls (slider, Play) and the Show choice (Month, Annual average and so on) go.
- Which controls count as overlays and move: Winds and its options (drawn as, shown, speed unit); whether Sunlight moves too.
- Where the Earth comparison (Simulated, Observed, Difference) goes.
- What stays in the side panel, and whether the Layers section goes entirely.
- How much of roadmap step 3b's design (everything worked out, one status for the whole solve, a pause control) is built here, and how much is only left room for.
- Narrow windows.
- Whether local `main` is fast-forwarded to `origin/main` (the merged winds) before a builder branches from it.

## Assumed
- No change to what is worked out or when: 3c rearranges the page's controls and nothing in `src/core` or the workers.
- Nothing in a world file changes; the browser's remembered choices (open sections, wind unit, arrows or streaks) carry over.
