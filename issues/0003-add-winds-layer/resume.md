# Resume point — read this first

Piece 5 of 15, "Prototype: rules plus a pressure map", is built and **paused for the user's review; it is not committed**. Pieces 1 to 4 are committed and pushed on branch `claude/add-winds-layer-991a60` (HEAD is piece 4's commit, `faf7157`); the working tree holds piece 5 (8 files, +2,220 −14). All project checks pass on it. See `plan.md` `## Notes` (the 2026-11-13 piece 5 entries).

## Pending decisions (sent to the planner chat with the review request)

1. **The "with no tilt January equals July" assertion.** A round 1 fix removed it as redundant; round 2 asks for it back, which stopped the review loop. Options: A (recommended) restore it on a constant year, with a comment that it guards against anything keyed to the month's number, then run the checks and commit; B leave it out and reword the test's name.
2. **The cube-corner effect of `smoothField`** (a high 16% stronger and a wind 29% stronger for a cold patch centred exactly on a cube corner). Options: A (recommended) keep it as a known limit, pinned by a test, and fix `smoothField` when the model is chosen; B fix `smoothField` in `src/core/vector.ts` before this piece is committed.

## Next step

On the relayed approval (the user's words): apply the choices, run the project checks, commit as piece 5/15 with the approved message, push (no force), tick checkpoint 5, cut this file down to a pointer, save, and send the look-ahead for piece 6.

Standing: the plan stops after piece 6 for the user's choice of wind model; piece 7 does not start until the planner says the plan has been revised.
