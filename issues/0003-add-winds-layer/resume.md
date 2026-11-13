# Resume point — read this first

## Where we are

Piece 2 of 15 ("Vector maths on the grid", with the direct `laplacian` the user asked for) is built, checked and reviewed in the builder's worktree, **uncommitted**, and paused for the user's review. Issue state `building`.
State checks: branch `claude/add-winds-layer-991a60`, HEAD `69d3619` (`git -C /home/philiph/workspace/earth_sim/.claude/worktrees/add-winds-layer-991a60 log --oneline -1`), tree **not** clean: 10 files changed against HEAD (`git diff --stat HEAD`), `src/core/vector.ts` and `src/core/vector.test.ts` new.
If anything differs, stop and tell the user.

## How it got here — decisions already answered, in order

1. 2026-11-13 — Piece 1 → "Approve, A: as is", committed `69d3619`, pushed.
2. 2026-11-13 — Piece 2 go-ahead "Start it"; "Yes, replace it" (frame helper); "Yes, fold it in" (test timeout); "Yes, stop at low only" (analysis loop).
3. 2026-11-13 — Laplacian at cube edges → "A: add it now": a direct `laplacian(grid, field)`.

## The pending decision (exact)

1. Approve piece 2 for commit and push, or ask for changes. The review request sent to the planner chat has the summary, figures, checks and the proposed commit message.
2. Two optional items left unfixed for the user's choice: (a) one shared "make tangent" helper for a projection written twice (`refineVectors` and the end of `gradient`); (b) a guard in `smoothField` for a `km` below about 1e-155. The builder recommends leaving both.

## What the next session does

1. On approval quoted from the user: commit with the approved message, push, tick checkpoint 2, save, send the look-ahead for piece 3.
2. On changes requested: make them, re-run the checks and the analysis loop (stopping once a round finds nothing above low), and send a new review request.

## Don't

- Don't commit before the planner relays the user's approval in the user's words. Don't start piece 3 without the go-ahead.
- Don't start piece 7 until the planner says the plan has been revised after the user's choice of wind model.
- No attribution lines in commits. Push only this issue's branch, never forced. No other GitHub writes.
