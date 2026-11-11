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
`/review self` round 1 has run on `main` (`ffed15a`) against `4170dd0` (2026-11-11). Checks: correctness and security on Opus, coverage, style and common-mistakes on Sonnet; verifier on Opus. No high findings. The verifier upheld 11 and dropped 4. The user chose **all 11** to fix. The review is written to `reviews/01-2026-11-11.md` and indexed in `review.md`, and the findings were sent to the builder on 2026-11-11 to apply as its Review fixes step (it pauses for the user's review through the planner chat before committing). Next: when the builder reports the review-fixes commit, ingest, confirm it with `git log main..<meta.branch>`, re-run the checks that raised findings (correctness, security, coverage, style) on the new diff with a fresh verifier, then record the outcome in the review file, `review.md` and the issue's `## Plan` checklist.

Verified (id · where · severity · issue · fix):
- V1 · `src/app/sculpt.ts:667-863` · medium · `createSculptController` has no test (stroke lifecycle, capture and cancel paths, `track` bounds, `setWorld` order) · a fake-canvas harness: one `onStrokeEnd` per stroke, none for move, `setWorld` ends the stroke before `onWorldChange`.
- C1 · `src/app/main.ts:112,276` · low · after a worker load error, the next world replacement shows "Calculating…" for good · keep a failed flag and show unavailable, or have the client reject requests after a load error.
- C3 · `src/app/appState.ts:142-146` · low · a kept sea level is only clamped, breaking `ViewPanel.setSeaLevel`'s whole-multiple-of-10 m contract · round to `SEA_LEVEL_SLIDER_STEP_M` in `replaceWorld` when keeping.
- S1 · `scripts/build-earth-data.ts:194-205` · low · the download has no size cap; size and hash are checked only after the stream ends · stop and delete once `written > ETOPO_FILE_BYTES`; check `Content-Range` on a 206.
- C2 · `src/app/refresh.ts:91-104` with `main.ts:276-277` · low · an in-flight result from the old world can replace "Calculating…" for up to 150 ms · a generation counter in the scheduler, or request at once on replacement.
- V3 · `src/app/globe/input.ts:108-193` · low · drag state machine untested · same harness as V1.
- V2 · `src/app/main.ts:150-339` · low (verifier lowered it from medium) · listener order and the `starting` guard are untested · move the wiring into an injectable function and test call order.
- V4 · `src/app/ui/toolPanel.ts:262-270` · low · the focus hand-off when a history button becomes disabled is untested · test `setHistoryState` focus moves.
- Y1 · `README.md:63-70` · low · `src/app/startup.ts` missing from Layout · add a line.
- Y2 · `README.md:5-40` · low · no paragraph introduces the View panel · add one.
- Y3 · `src/core/protocol.ts:85`, `serialize.ts:144` · low · two `isRecord` helpers that differ on arrays · rename the serialize one `isPlainObject`, or share one.

Dropped: V5 (`grid.ts:665-666` reset: the wrap needs 2^32 searches and the reset is plainly correct); Y4 (the two clamps do not behave the same); Y5 (acceptable, different needs); Y6 (exports for tests; the guide allows it). Common-mistakes was clean and appended nothing to the guides.

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
