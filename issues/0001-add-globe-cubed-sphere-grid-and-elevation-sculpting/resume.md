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
Nothing is pending with the user, but **a pause is requested**. Pieces 1 to 7 are committed and pushed (latest `8bfa67b`). The builder is finishing piece 8 (worker and statistics readout), which it commits and pushes without a pause under "Run 7 and 8, stop at 9's review". The user then said "can you pause the builder when appropriate" and chose "After piece 8 is committed": after that commit the builder sends piece 9's look-ahead and stops, and does not start piece 9 until the user says to resume.

## What the next session does
1. Run the state checks; the branch gains piece 8's commit after `8bfa67b`.
2. `planner.py ingest 1`. After piece 8's commit: verify on origin, tick the issue checklist, `gh issue edit 1` with the status line saying the build is paused, and report it to the user.
3. The build stays paused until the user says to continue. Piece 9's choices can be put to them when they return (the builder's look-ahead, plus the plan's defaults: with no saved world the page opens on a blank ocean with the new-world dialog showing; a new world resets sea level to zero; the seed is a whole number from 0 to 4,294,967,295).
4. On the user's word to resume: relay it explicitly, with their answers to piece 9's choices. Piece 9 is built and stops uncommitted at its review, which has a manual review.
5. If the builder has been idle a while with piece 8 uncommitted and no message, it may have stalled on a process restart: message it to resume piece 8 only.

## Don't
- Don't build in the planner chat, and don't start a second builder for this issue.
- Don't change `models.md`: Fable is for this issue only.
- Don't push `main` or merge anything: those are the user's.
