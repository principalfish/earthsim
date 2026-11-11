# Resume point — read this first

## Where we are
Issue 0001 (`add-globe-cubed-sphere-grid-and-elevation-sculpting`) is in state `review`: all 11 pieces are built, approved by the user, committed and pushed on `claude/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9`, head `4170dd0` (piece 11, Earth preset). Eleven commits on `main`, 97 files, about 28,700 lines. GitHub: issue principalfish/earthsim#1 has every piece ticked; draft PR 2 is open; `main` is still `ffed15a` and nothing is merged. The builder session (`local_acf49a6d-c0ef-4a98-8721-d05319ed32de`) is idle with a clean worktree, waiting to apply any fixes a review chooses.

State checks (run from `/home/philiph/workspace/earth_sim`):
- `git log --oneline -1 claude/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9` shows `4170dd0 … piece 11/11: add Earth preset`, and `git ls-remote --heads origin` shows the same SHA for that branch.
- `python3 ~/.claude/lib/planner.py meta 1` shows state `review`, `gh_issue` 1, `pr` 2.
- `git -C .claude/worktrees/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9 status --short` prints nothing.
- `git -C .planner status --short` is empty.
If anything differs, stop and tell the user.

## How it got here
All design and run decisions are in `decisions.md` (Settled); each piece's as-built details, checks and review-loop outcome are in `plan.md` Notes. The user tried and approved every manual-review piece (5, 6, 9, 10, 11) with "Tried it, approve"; pieces 1 to 4, 7 and 8 ran without review pauses at their request. The implementation model was `claude-fable-5-2` for this issue only.

## The pending decision (exact)
No design decision is pending. The user has been given the all-pieces-done recap and offered:
1. `/review self add-globe-cubed-sphere-grid-and-elevation-sculpting` in the planner chat, to check the whole branch; the user picks findings and the builder applies them as a review-fixes commit. Then `/publish` for the final PR text. Merging is the user's.
2. Widening `.planner/tools/coverage-changed.sh` to include `scripts/` (it measures `src/` only today). Not done; awaiting their word.

## What the next session does
1. Run the state checks; `planner.py ingest 1`.
2. On the user's word, run `/review self` for this issue (the review skill), relay the chosen findings to the builder, and after its review-fixes commit add `- [x] **Review fixes (round <r>)** · <shas>` to the issue's `## Plan` checklist and `gh issue edit 1`.
3. Then `/publish add-globe-cubed-sphere-grid-and-elevation-sculpting` when the user asks.
4. After the PR is merged (the user's step): `/issues` or `planner.py sync` marks the issue done; then offer the cleanup in the planner skill's "Cleaning up a finished issue".

## Left for the review to weigh (from the builder's all-done note)
- Within each piece, security, coverage, style and common-mistakes were usually run in round 1 only and not re-run after fixes; correctness was. Small fixes the builder made after a verifier's ruling were sometimes not re-reviewed (pieces 2, 4, 7, and a comment in 11).
- Page code with no automated tests: `renderer.ts`, `main.ts`, and the DOM parts of the panels, dialog, input and sculpt controller. Exercised by scripted headless-Edge runs and the user's manual reviews. Firefox was never tried.
- Known and accepted, each in `plan.md` Notes: picking ignores relief; a worker that never answers has no timeout; old statistics can show briefly after a world is replaced; a page killed without warning can lose the last second of edits; blocked storage reads as "could not be restored"; three seam pixels shift one colour level on the first redraw after a stroke; a `favicon.ico` 404.
- `README.md` grew piece by piece and has not been read as a whole.
- `public/data/earth-256.bin` (0.79 MB binary) is in the branch.

## Housekeeping, not yet done
- The builder's worktree holds a git-ignored 445 MB NOAA download in `.cache/etopo/`, and its session scratch folder under `/tmp` holds about 1.2 GB of check artefacts. Both go when the worktree and session are cleaned up; don't remove them from the planner chat.
- The user's own dev server may be running from the builder's worktree; it is theirs.
- Later roadmap steps (temperature, winds, rainfall, currents, ice, storms, tectonics) are in `investigations/2026-11-10-simulator-design-and-roadmap.md`; none is planned. The user was offered planning temperature next.

## Don't
- Don't archive the builder session or remove its worktree before the review fixes are applied and the PR is merged; run `planner.py check-builder 1` first.
- Don't push `main` or merge anything: those are the user's.
- Don't change `models.md`: Fable was for this issue only.
