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
Nothing is pending with the user. Pieces 1 to 5 are committed and pushed (latest `21862d7`). The user settled piece 6's choices (see `decisions.md`) and said "Start it"; the builder is building piece 6 (sculpting brushes) and will stop uncommitted at its review, which has a manual review.

## What the next session does
1. Run the state checks; piece 6 should be uncommitted in the builder's worktree, or its review request should be waiting.
2. `planner.py ingest 1`. When the review request arrives, give the user the review briefing with the manual review first; relay an approval only when their words say they tried it.
3. After each commit: verify on origin, tick the issue checklist, `gh issue edit 1`, then the next-stage briefing for the following piece. Normal per-piece pauses apply.
4. If the builder has been idle a while with uncommitted work and no review request, it may have stalled on a process restart: message it to resume.

## Don't
- Don't build in the planner chat, and don't start a second builder for this issue.
- Don't change `models.md`: Fable is for this issue only.
- Don't push `main` or merge anything: those are the user's.
