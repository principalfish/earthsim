# Resume point — read this first

## Where we are
Issue 0002 (`add-seasonal-temperature-layer-and-planet-controls`), roadmap step 2, is being built. `issue.md` (GitHub issue principalfish/earthsim#3) and `plan.md` (11 pieces) are written and saved. The builder is session `local_f46a8d01-2bba-49f0-b178-13cfe0924c9e` (`builder: add-seasonal-temperature-layer-and-planet-controls`, name `b-add-seasonal-temperatu`), started 2026-11-11 from `main` at `c866185`, implementing on `claude-opus-5-5`. It runs pieces 1 to 4 without pauses and then stops with the timing table and first Earth error figures. Issue 0001 is merged and cleaned up. This chat is `planner: earth-sim`.
State checks (run from `/home/philiph/workspace/earth_sim`):
- `python3 ~/.claude/lib/planner.py meta 2` shows state `planned` or `building`, `gh_issue` 3, base `main`, `build_model` `claude-opus-5-5`.
- `git -C .planner status --short` is empty.
- `git worktree list` shows the builder's worktree under `.claude/worktrees/`.
If anything else differs, stop and tell the user.

## How it got here — decisions already answered, in order
Everything is in `decisions.md` (Settled, with the user's words) and carried into `plan.md` Context. Late additions on 2026-11-11: keep all five manual reviews; build on Opus for this issue only; run pieces 1 to 4 without pauses; star mass is a fifth planet control ("Add star mass as a setting"), with year length from Kepler's third law.

## The pending decision (exact)
Nothing is pending with the user. Pieces 1 (`8390675`), 2 (`0c19852`) and 3 (`4a1e290`) are committed and pushed on `claude/add-seasonal-temperature-layer-and-planet-controls-f645fa`; draft PR 4 is open. The build was paused after piece 3 and resumed on the user's "resume" (2026-11-11, about 21:40). The builder is building piece 4 (the solver) from the start on `claude-opus-5-5`; it commits without a review pause under "Run 1 to 4, stop with the timings", then stops with the timing table, the first Earth error figures, its view on the sunlight trust band and its look-ahead for piece 5.

To put to the user at that stop: the recalculation trigger (only while the temperature layer is showing, or always); whether a determinate progress indicator is worth building given the times; and the builder's one deliberate refinement of the plan, outgoing heat in an emissivity form on a kelvin state where the plan said "linear in temperature".

Told to the user, not objected to: the source file's own `license` attribute has older, weaker wording than the CC0 statement on NOAA PSL's dataset record, which is what the README records.

## What the next session does
1. Run the state checks. `planner.py ingest 2` on every builder message; `list_sessions` with `linked: true` finds the builder.
2. After each of pieces 1 to 4 is committed: verify it on origin, tick the issue's `## Plan` checklist, `gh issue edit 3`, open the draft PR after the first pushed piece (planner skill, "The issue's draft PR"), and report to the user in a few lines.
3. When the builder stops after piece 4: put the recalculation trigger to the user (only while the temperature layer is showing, or always), and whether a determinate progress indicator is worth building given the times, then give the next-stage briefing for piece 5.
4. Pieces 6 to 11 each have a manual review. If the builder is idle with uncommitted work and no message, it has stalled: message it to carry on.

## Don't
- Don't build in the planner chat, and don't start a second builder for this issue.
- Don't change `models.md`: Opus is for this issue only.
- Don't push `main` or merge anything: those are the user's.
