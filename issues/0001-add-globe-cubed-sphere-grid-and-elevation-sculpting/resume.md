# Resume point — read this first

## Where we are
Issue 0001 (`add-globe-cubed-sphere-grid-and-elevation-sculpting`) is `planned`: `issue.md` and `plan.md` (11 pieces) are written and saved, and the GitHub issue is principalfish/earthsim#1. The builder was started on the user's "Start the builder": session `local_acf49a6d-c0ef-4a98-8721-d05319ed32de` (`builder: add-globe-cubed-sphere-grid-and-elevation-sculpting`, name `b-add-globe-cubed-sphere`), working on piece 1. The user then said "lets use fable to implement this one time": `plan.md`'s build model is now `claude-fable-5-2` for this issue only, and the builder was told. The builder had already begun piece 1 on Sonnet (an uncommitted `package.json` and lock file); asked whether to keep or redo, the user said "Keep them, continue on Fable", and that was relayed.
State checks:
- `git -C /home/philiph/workspace/earth_sim ls-remote --heads origin` lists `main` and `planner`, and no issue branch yet.
- `python3 ~/.claude/lib/planner.py meta 1` shows state `planned`, `gh_issue` 1, `build_model` `claude-fable-5-2`.
- `git -C /home/philiph/workspace/earth_sim/.planner status --short` is empty.
If anything differs, stop and tell the user.

## How it got here — decisions already answered, in order
The design decisions are all in `decisions.md` and carried into `plan.md` Context. After them:
1. 2026-11-10 — Manual reviews → "keep all five" (pieces 5, 6, 9, 10, 11).
2. 2026-11-10 — `main` pushed by the user; planner branch pushed with their agreement; GitHub issue created.

## The pending decision (exact)
The build is **paused at the user's request**. They said "can we pause at the next appropriate moment" and, asked where, chose "Right now". Pieces 1 to 5 are committed and pushed (latest `21862d7`). Piece 6 (sculpting brushes) was stopped before anything was written: the builder confirmed its worktree is clean at `21862d7` and none of its processes is running. A Vite dev server started by the user for the piece 5 review may still be running from that worktree; it is theirs. Piece 6's choices are settled (`decisions.md`). Nothing resumes until the user says so.

## What the next session does
1. Run the state checks. `git -C /home/philiph/workspace/earth_sim/.claude/worktrees/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9 status --short` prints nothing; the branch head is `21862d7`.
2. `planner.py ingest 1` and read the builder's stop report (its last message to the planner chat, or `plan.md` Notes) for what is written and what must not be trusted.
3. Wait for the user's word to continue. Then relay it to the builder, quoting it: build piece 6 from the beginning on `claude-fable-5-2`, run the checks and analysis loop, and stop uncommitted at the review (it has a manual review). If the builder session is gone, the planner skill's "Starting the builder" and "Retiring a builder" apply; run `planner.py check-builder 1` first so the uncommitted work is not lost.
4. After each commit: verify on origin, tick the issue checklist, `gh issue edit 1`, then the next-stage briefing for the following piece. Normal per-piece pauses apply.

## Don't
- Don't build in the planner chat, and don't start a second builder for this issue.
- Don't change `models.md`: Fable is for this issue only.
- Don't push `main` or merge anything: those are the user's.
