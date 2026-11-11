# Resume point — read this first

## Where we are
Issue 0001 (`add-globe-cubed-sphere-grid-and-elevation-sculpting`) is in state `review`: all 11 pieces are built, approved by the user, committed and pushed on `claude/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9`, head `96588b1` (review fixes, on top of piece 11's `4170dd0`). Twelve commits on `main`, 97 files, about 28,700 lines. GitHub: issue principalfish/earthsim#1 has every piece ticked; draft PR 2 is open; `main` is still `ffed15a` and nothing is merged. The builder session (`local_acf49a6d-c0ef-4a98-8721-d05319ed32de`) is idle with a clean worktree, waiting to apply any fixes a review chooses.

State checks (run from `/home/philiph/workspace/earth_sim`):
- `git log --oneline -1 claude/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9` shows `96588b1 … review fixes: apply self-review findings`, and `git ls-remote --heads origin` shows the same SHA for that branch.
- `python3 ~/.claude/lib/planner.py meta 1` shows state `review`, `gh_issue` 1, `pr` 2.
- `git -C .claude/worktrees/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9 status --short` prints nothing.
- `git -C .planner status --short` is empty.
If anything differs, stop and tell the user.

## How it got here
All design and run decisions are in `decisions.md` (Settled); each piece's as-built details, checks and review-loop outcome are in `plan.md` Notes. The user tried and approved every manual-review piece (5, 6, 9, 10, 11) with "Tried it, approve"; pieces 1 to 4, 7 and 8 ran without review pauses at their request. The implementation model was `claude-fable-5-2` for this issue only.

## The pending decision (exact)
`/review self` round 1 (review file `reviews/01-2026-11-11.md`): the user chose all 11 verified findings; the builder applied them as one commit, `96588b1` ("review fixes: apply self-review findings"), pushed on 2026-11-11. The branch head is `96588b1`; state `review`.

How it was approved: the builder reports the user typed "approve" directly in the builder chat after its review request to the planner chat was queued; the planner chat did not relay an approval and could not confirm the user's message from the builder's transcript. The user has been told and asked to say if that was not them.

In progress: the planner chat is re-running the four checks that raised findings (correctness and security on Opus, coverage and style on Sonnet) on `git diff 4170dd0..96588b1`, as fresh subagents, with a fresh verifier for anything they raise. If this chat is lost, re-run those four on that diff. Then: update `reviews/01-2026-11-11.md` (Outcome: fixed with `96588b1`, re-check results, the limits below) and its line in `review.md`; add `- [x] **Review fixes (round 1)** · \`96588b1\`` to the issue's `## Plan`, update its status line, `gh issue edit 1`; save; suggest `/publish add-globe-cubed-sphere-grid-and-elevation-sculpting`.

Limits the builder stated for this round, to record in the review file: the saved-world browser cases used an in-memory stand-in for IndexedDB, so a real reload was not re-checked (the storage code did not change); the stale-statistics fix is unit-tested only; the download guard's glue in `scripts/build-earth-data.ts` is untested and nothing was downloaded; four small adapters in `src/app/main.ts` are checked by reading and the browser run only. A dev server on port 5176 that was serving the builder's worktree stopped during the round; it was not the builder's and has not been restarted.

Also open: whether to widen `.planner/tools/coverage-changed.sh` to include `scripts/`.

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
