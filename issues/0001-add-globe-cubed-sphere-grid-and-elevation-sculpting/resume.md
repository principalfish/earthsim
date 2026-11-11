# Resume point — read this first

## Where we are
Issue 0001 (`add-globe-cubed-sphere-grid-and-elevation-sculpting`) is `ready`: all 11 pieces and one round of review fixes are on `claude/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9`, head `96588b1`, and PR 2 (principalfish/earthsim#2, open against `main`, not a draft) carries the final description from `pr.md`, approved by the user on 2026-11-11. Merging is the user's.
State checks (run from `/home/philiph/workspace/earth_sim`):
- `python3 ~/.claude/lib/planner.py meta 1` shows state `ready`, `pr` 2.
- `git ls-remote --heads origin` shows `96588b1…` for the issue branch.
- `gh pr view 2 --json state --jq .state` is `OPEN` until the user merges, then `MERGED`.

## The pending decision (exact)
No pending decision. Next step is the user's merge of PR 2. See `plan.md` (every checkpoint ticked) and `reviews/01-2026-11-11.md`.

## What the next session does
1. After the merge: `/issues` or `python3 ~/.claude/lib/planner.py sync` marks the issue `done`. Then offer the cleanup in the planner skill's "Cleaning up a finished issue": the builder session `local_acf49a6d-c0ef-4a98-8721-d05319ed32de`, its worktree (which holds a git-ignored 445 MB NOAA download in `.cache/etopo/`) and local branches. Run `planner.py cleanup 1` and ask before removing anything.
2. The merge unblocks issue 0002 (`add-seasonal-temperature-layer-and-planet-controls`), which is `planned` and builds from `main`; see its `resume.md`.
3. Open, not blocking: whether to widen `.planner/tools/coverage-changed.sh` to include `scripts/`.

## Don't
- Don't merge, close or mark the PR: those are the user's.
- Don't archive the builder session or remove its worktree before the PR is merged.
