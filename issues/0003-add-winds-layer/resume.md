# Resume point — read this first

## Where we are

Piece 2 of 15 ("Vector maths on the grid") is built in the builder's worktree, **uncommitted**, and stopped in its first review round on a question for the user. Issue state `building`.
State checks: branch `claude/add-winds-layer-991a60`, HEAD `69d3619` (`git -C /home/philiph/workspace/earth_sim/.claude/worktrees/add-winds-layer-991a60 log --oneline -1`), tree **not** clean: piece 2's files changed (`git status --short`: `src/core/vector.ts` and its test new; `coarsen.ts`, `grid.ts`, `index.ts`, `observedWind.ts`, `observed.test.ts`, `coarsen.test.ts`, `docs/development.md` modified).
If anything differs, stop and tell the user.

## How it got here — decisions already answered, in order

1. 2026-11-13 — Piece 1 → approved "Approve, A: as is", committed `69d3619`, pushed.
2. 2026-11-13 — Piece 2 go-ahead "Start it"; replace piece 1's frame helper with `cellFrames` ("Yes, replace it"); fold in the flaky test's timeout ("Yes, fold it in"); stop the analysis loop once a round finds nothing above low severity ("Yes, stop at low only").

## The pending decision (exact)

Round 1 of piece 2's review verified one medium finding: a Laplacian made by composing this module's `divergence(gradient(f))` is only first order in the cell rows beside cube edges (seam error about 14 times the interior's at 64 and 28 times at 128, the ratio doubling with each refinement, though the absolute error still halves). Gradient, divergence and curl on their own are second order everywhere, with edge and corner error within 1.31 times the interior's. Options: (A) add a dedicated `laplacian(grid, field)` to `src/core/vector.ts` that takes the normal derivative at each edge straight from the stencil, second order at the seams too (a new function beyond the plan's list; more build time and another review round); (B) accept the limitation, keep it documented in the module, and note in `plan.md` that later pieces must not build a Laplacian by composing the two. The builder recommends A: piece 6's simulated atmosphere is the likely first user (viscosity), and a cube-edge imprint there would bias the comparison of the two wind models.

Five low and nit findings from the same round are being fixed meanwhile.

## What the next session does

1. On the user's answer: for A, have the implementation subagent add `laplacian` with tests (analytic Laplacian of a low-order harmonic; edge and corner error within a stated factor of the interior's at all three resolutions), then re-run checks, coverage and the analysis loop; for B, record the limitation in `plan.md` Notes and re-run the loop.
2. Stop the loop once a round finds nothing above low severity; fix clear low items; send the review request.

## Don't

- Don't commit before the planner relays the user's approval in the user's words. Don't start piece 3 without the go-ahead.
- Don't start piece 7 until the planner says the plan has been revised after the user's choice of wind model.
- No attribution lines in commits. Push only this issue's branch, never forced. No other GitHub writes.

## Planner note (2026-11-13)

The user asked to be pointed to the code that implements the Laplacian once piece 2 is done: in piece 2's review briefing, link `laplacian` in `src/core/vector.ts` (worktree path, with line numbers) and its tests, and say how it works in a few lines.
