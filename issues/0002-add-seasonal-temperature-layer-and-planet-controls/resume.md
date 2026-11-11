# Resume point — read this first

## Where we are
Issue 0002 (`add-seasonal-temperature-layer-and-planet-controls`), roadmap step 2, is `planned`: `issue.md` (GitHub issue principalfish/earthsim#3) and `plan.md` (10 pieces) are written and saved. No builder is started yet. Issue 0001 is merged, so `main` has the code this builds on. This chat (`planner: earth-sim`) also owns issue 0001; read its own `resume.md` for that.
State checks (run from `/home/philiph/workspace/earth_sim`):
- `python3 ~/.claude/lib/planner.py meta 2` shows state `planned`, `gh_issue` 3, base `main`, `build_model` `claude-opus-5-5`.
- `git -C .planner status --short` is empty.
- `git ls-remote --heads origin main` is `c866185…` or later, and `git show origin/main:src/core/world.ts` exists.
If anything else differs, stop and tell the user.

## How it got here — decisions already answered, in order
Everything is in `decisions.md` (Settled, with the user's words) and carried into `plan.md` Context. The discussion ended with "That's everything"; the issue text was approved with "Approved".

## The pending decision (exact)
One question blocks the builder's start, because piece 1 implements it: how year length is worked out. The user asked "does it matter? surely each year is just done with month steps and the actual length of that month is irrelevant". The planner chat explained that it does (a season's length sets how far land and ocean warm and cool before the sun moves on) and asked again, with three options: derive the star's mass from its brightness by the main-sequence relation and compute the year from that and the orbit (recommended); add star mass as a fifth control; or treat every year as Earth-length, dropping the year-length readout and that effect.

Already answered on 2026-11-11: keep all five manual reviews; build on `claude-opus-5-5` for this issue only; run pieces 1 to 4 without pauses and stop with the timing table. Issue 0001 is merged (`main` at `c866185`) and cleaned up.

## What the next session does
1. Run the state checks.
2. Settle the year-length question, record it in `decisions.md` and `plan.md` (piece 1's What and Tests, and Approach), save.
3. Start the builder (planner skill, "Starting the builder"): branch from `main`, session model `claude-sonnet-5-5` for the shell per `models.md`, with the brief saying implementation runs on `claude-opus-5-5` and pieces 1 to 4 run without pauses; then `python3 ~/.claude/lib/planner.py track` its session and mark piece 1 in progress on the issue checklist.
4. After piece 4 is committed the builder stops with a timing table and Earth error figures: put the recalculation trigger to the user before piece 5.

## Don't
- Don't build in the planner chat.
- Don't push `main` or merge anything: those are the user's.
