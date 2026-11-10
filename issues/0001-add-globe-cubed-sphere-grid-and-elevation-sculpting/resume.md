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
Nothing is pending with the user. Pieces 1 to 6 are committed and pushed (latest `3c7e6ea`). The user settled piece 7's choices (`decisions.md`) and chose "Run 7 and 8, stop at 9's review": the builder builds pieces 7 (undo and redo) and 8 (worker and statistics readout) without pauses, committing and pushing each, then sends piece 9's look-ahead and choices and waits before building it. Piece 9 stops uncommitted at its review, which has a manual review.

## What the next session does
1. Run the state checks; the branch gains a commit per piece after `3c7e6ea`.
2. `planner.py ingest 1` on every builder message. After each commit: verify on origin, tick the issue checklist and `gh issue edit 1`, and report it to the user in a few lines.
3. When the builder sends piece 9's look-ahead: put its choices to the user (and the plan's defaults for piece 9: with no saved world the page opens on a blank ocean with the new-world dialog showing; a new world resets sea level to zero; the seed is a whole number from 0 to 4,294,967,295), then relay their answers.
4. When piece 9's review request arrives, give the review briefing with the manual review first; relay an approval only when the user's words say they tried it.
5. If the builder has been idle a while with uncommitted work and no message, it may have stalled on a process restart: message it to resume.

## Don't
- Don't build in the planner chat, and don't start a second builder for this issue.
- Don't change `models.md`: Fable is for this issue only.
- Don't push `main` or merge anything: those are the user's.
