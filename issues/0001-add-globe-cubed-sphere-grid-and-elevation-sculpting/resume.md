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
Piece 6 (sculpting brushes) is built, checked and **uncommitted** in the builder's worktree; the branch head is `21862d7` (piece 5). The builder sent its review request and the user has been given the review briefing. Waiting on the user for the manual review, then diff approval: from `/home/philiph/workspace/earth_sim/.claude/worktrees/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9` run `npm run dev` (or reload their own dev server, last seen on port 5176), pick Raise, Lower and Smooth in the Tools section, sculpt across a cube corner, and repeat at `?resolution=256`. Things to judge: whether Smooth's default of 50 is the right speed, and responsiveness at 256 with the 3,000 km brush. Relay an approval only when the user's words say they tried it; a round of tuning is likely.

## What the next session does
1. Run the state checks; `git -C <worktree> status --short` should still show piece 6 uncommitted.
2. If the user has not answered, show the briefing again (manual review first) and ask.
3. Relay the user's verdict to the builder, quoting their words: approval ("Commit and push") or the changes asked for.
4. After the commit: ingest, verify on origin, tick piece 6 on the issue checklist and `gh issue edit 1`, then the next-stage briefing for piece 7 (undo and redo). Normal per-piece pauses apply.

## Don't
- Don't build in the planner chat, and don't start a second builder for this issue.
- Don't change `models.md`: Fable is for this issue only.
- Don't push `main` or merge anything: those are the user's.
