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
Piece 5 (globe renderer with relief and view controls) is built, checked and **uncommitted** in the builder's worktree; the branch head is `dbc0939` (piece 4). The builder sent its review request and the user has been given the review briefing. Waiting on the user for three things:
1. The manual review, then diff approval. From `/home/philiph/workspace/earth_sim/.claude/worktrees/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9` run `npm run dev` and open the URL Vite prints; `?resolution=256` or `?resolution=128&seed=7&land=0.4` choose other worlds. Relay an approval only when the user's words say they tried it.
2. Are the generated continents acceptable as a base to sculpt? They show some straight trenches and ridges following the noise's grid, most visible at 256. Options: accept (builder's recommendation unless they jump out), or rework the generator's noise, which changes every seed's world.
3. Bundle size warning (551 kB, Three.js): leave it (recommended) or split Three.js into its own chunk.

## What the next session does
1. Run the state checks; `git -C <worktree> status --short` should still show piece 5 uncommitted.
2. If the user has not answered, show the briefing again (manual review first) and ask.
3. Relay the user's verdict to the builder, quoting their words: approval ("Commit and push") or the changes asked for, plus their answers to questions 2 and 3.
4. After the commit: ingest, verify on origin, tick piece 5 on the issue checklist and `gh issue edit 1`, then give the next-stage briefing for piece 6 (sculpting brushes). The run-through instruction ended at piece 5, so the normal per-piece pauses apply from piece 6 unless the user says otherwise.

## Don't
- Don't build in the planner chat, and don't start a second builder for this issue.
- Don't change `models.md`: Fable is for this issue only.
- Don't push `main` or merge anything: those are the user's.
