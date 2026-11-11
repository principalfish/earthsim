# Resume point — read this first

## Where we are
Issue 0002 (`add-seasonal-temperature-layer-and-planet-controls`), roadmap step 2, is `planned`: `issue.md` (GitHub issue principalfish/earthsim#3) and `plan.md` (10 pieces) are written and saved. No builder is started, and none may be until issue 0001 is merged into `main`, because `main` has none of the code this builds on. This chat (`planner: earth-sim`) also owns issue 0001; read its own `resume.md` for that.
State checks (run from `/home/philiph/workspace/earth_sim`):
- `python3 ~/.claude/lib/planner.py meta 2` shows state `planned`, `gh_issue` 3, base `main`, `build_model` `claude-opus-5-5`.
- `git -C .planner status --short` is empty.
- `git ls-remote --heads origin main` is `ffed15a…` until the user merges issue 0001. After the merge it moves, and `git show origin/main:src/core/world.ts` exists.
If anything else differs, stop and tell the user.

## How it got here — decisions already answered, in order
Everything is in `decisions.md` (Settled, with the user's words) and carried into `plan.md` Context. The discussion ended with "That's everything"; the issue text was approved with "Approved".

## The pending decision (exact)
The user has been shown the plan and asked two things:
1. Which proposed manual reviews to keep: piece 6 (the temperature layer's look), piece 7 (playing through the year), piece 8 (the planet controls), piece 9 (the cursor readout), piece 10 (the comparison with real Earth). Only the ones they confirm stay in `plan.md`; remove the `Manual review:` line and the "manual review done" wording of the checkpoint for any they decline.
2. Which model implements this issue. `plan.md` names `claude-opus-5-5`; while `models.md`'s "Builder on Sonnet" experiment is on, the builder implements on `claude-sonnet-5-5` regardless. Issue 0001 used `claude-fable-5-2` on the user's one-time instruction. Record their answer in `decisions.md` and `plan.md`'s Build model line.
Also told to the user, not blocking: the defaults listed in `plan.md` Notes (the mass-brightness relation for year length; the observed file is about 0.8 MB, not "well under 1 MB"; and the others).

## What the next session does
1. Run the state checks.
2. Apply the user's answers on manual reviews and the model to `plan.md`, save.
3. Wait for issue 0001 to be merged (`/publish` for it first, then the user merges). Then check `plan.md`'s "What the code offers" against `main`, give the next-stage briefing for piece 1, and start the builder on the user's go-ahead (planner skill, "Starting the builder"): branch from `main`, `python3 ~/.claude/lib/planner.py track` its session.
4. After piece 4 is committed the builder stops with a timing table and Earth error figures: put the recalculation trigger to the user before piece 5.

## Don't
- Don't start a builder for this issue before issue 0001 is merged into `main`.
- Don't build in the planner chat.
- Don't push `main` or merge anything: those are the user's.
