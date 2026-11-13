# Resume: add-seasonal-temperature-layer-and-planet-controls

Draft PR #4 is open with its final description (2026-11-13), at `7896afc` against `main`; marking it ready and merging are the user's. Self review 01 is done: ten low items fixed in `7896afc`, the re-check clean (`reviews/01-2026-11-12.md`).

Once merged, `/issues` marks the issue done; then offer to clean up the builder's worktree, branch and session (`planner.py cleanup add-seasonal-temperature-layer-and-planet-controls`).

Open follow-ups, nothing decided: a fixed-scale option (a frozen planet is drawn in much the same colours as a warm one); the Terrain speckle on a world wholly at sea level (predates this issue); the build's 500 kB chunk warning (predates this issue); whether to widen `coverage-changed.sh` to `scripts/`; a stray doc comment above the `MONTH_NAMES` re-export in `src/app/view.ts`; `cellLatitudes` and `observed.ts` repeating the `directionToLatLon` arithmetic. Never tried by hand: Firefox; screen readers; touch and high-density screens; the production build since the solver speed-ups; importing a pre-issue world file in the page.
