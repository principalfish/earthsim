# Resume point — read this first

## Where we are
Issue 0002 (`add-seasonal-temperature-layer-and-planet-controls`), roadmap step 2, is being built. `issue.md` (GitHub issue principalfish/earthsim#3) and `plan.md` (10 pieces) are written and saved. The builder is session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e` (`builder: add-seasonal-temperature-layer-and-planet-controls`, name `b-add-seasonal-temperatu`), started 2026-11-11 from `main` at `c866185`, implementing on `claude-opus-5-5`. It runs pieces 1 to 4 without pauses and then stops with the timing table and first Earth error figures. Issue 0001 is merged and cleaned up. This chat is `planner: earth-sim`.
State checks (run from `/home/philiph/workspace/earth_sim`):
- `python3 ~/.claude/lib/planner.py meta 2` shows state `planned` or `building`, `gh_issue` 3, base `main`, `build_model` `claude-opus-5-5`.
- `git -C .planner status --short` is empty.
- `git worktree list` shows the builder's worktree under `.claude/worktrees/`.
If anything else differs, stop and tell the user.

## How it got here — decisions already answered, in order
Everything is in `decisions.md` (Settled, with the user's words) and carried into `plan.md` Context. Late additions on 2026-11-11: keep all five manual reviews; build on Opus for this issue only; run pieces 1 to 4 without pauses; star mass is a fifth planet control ("Add star mass as a setting"), with year length from Kepler's third law.

## The pending decision (exact)
One design addition is open, not blocking pieces 1 to 4. The user asked, after the builder was started: "as part of this can we render the sun in the background when appropriate". The planner chat asked how it should work: whether the sun also lights the globe, leaving a night side; where it sits, given the model has no time of day; and how its size and colour follow the star settings. Once settled it becomes a new piece at the end of `plan.md` (a full `## Pieces` entry and a checkpoint), the issue's `## Plan` checklist gains it marked `added 2026-11-11`, `gh issue edit 3`, and the builder is told to re-run `planner.py path`.

## What the next session does
1. Run the state checks. `planner.py ingest 2` on every builder message; `list_sessions` with `linked: true` finds the builder.
2. After each of pieces 1 to 4 is committed: verify it on origin, tick the issue's `## Plan` checklist, `gh issue edit 3`, open the draft PR after the first pushed piece (planner skill, "The issue's draft PR"), and report to the user in a few lines.
3. Settle the sun with the user and add its piece to `plan.md`, as above.
4. When the builder stops after piece 4: put the recalculation trigger to the user (only while the temperature layer is showing, or always), and whether a determinate progress indicator is worth building given the times, then give the next-stage briefing for piece 5.
5. Pieces 6 to 10 each have a manual review. If the builder is idle with uncommitted work and no message, it has stalled: message it to carry on.

## Don't
- Don't build in the planner chat, and don't start a second builder for this issue.
- Don't change `models.md`: Opus is for this issue only.
- Don't push `main` or merge anything: those are the user's.
