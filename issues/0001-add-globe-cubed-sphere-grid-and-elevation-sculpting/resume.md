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
Nothing is pending with the user. On their instruction ("can you continue building to the first manual check piece? i think its 5?") the builder runs pieces 1 to 4 without pauses, committing and pushing each, then implements piece 5 and stops uncommitted at its review pause. The next thing the user is asked is piece 5's manual review and diff approval.

## What the next session does
1. Run the state checks (state is `building`; the issue branch `claude/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9` gains a commit per piece on origin).
2. `planner.py ingest 1`, compare `git log --oneline main..<meta.branch>` with the ticked checkpoints in `plan.md`, and tick the issue's `## Plan` checklist for each committed piece (then `gh issue edit 1`).
3. Piece 1 is committed and pushed (`b22e81a`) and draft PR 2 is open (`meta.pr`). The worktree-setup and coverage scripts are in `.planner/tools/`, `project.md` has the real commands, and the builder has been told.
4. When the builder sends piece 5's review request, give the user the review briefing with the manual review first, and relay an approval only when their words say they tried it.
5. From piece 6 on, the normal per-piece pauses and briefings apply again.

## Don't
- Don't build in the planner chat, and don't start a second builder for this issue.
- Don't change `models.md`: Fable is for this issue only.
- Don't push `main` or merge anything: those are the user's.
