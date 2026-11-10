# Resume point — read this first

## Where we are
Issue 0001 (`add-globe-cubed-sphere-grid-and-elevation-sculpting`) is `planned`: `issue.md` and `plan.md` (11 pieces) are written and saved, and the GitHub issue is principalfish/earthsim#1. No builder has been started. The user has been given the next-stage briefing for piece 1 and asked whether to start the builder.
State checks:
- `git -C /home/philiph/workspace/earth_sim ls-remote --heads origin` lists `main` and `planner`, and no issue branch yet.
- `python3 ~/.claude/lib/planner.py meta 1` shows state `planned`, `gh_issue` 1.
- `git -C /home/philiph/workspace/earth_sim/.planner status --short` is empty.
If anything differs, stop and tell the user.

## How it got here — decisions already answered, in order
The design decisions are all in `decisions.md` and carried into `plan.md` Context. After them:
1. 2026-11-10 — Manual reviews → "keep all five" (pieces 5, 6, 9, 10, 11).
2. 2026-11-10 — `main` pushed by the user; planner branch pushed with their agreement; GitHub issue created.

## The pending decision (exact)
No design decision is pending. The user decides whether to start the builder for piece 1 (scaffold tooling and app shell). Piece 1 has no open choices.

## What the next session does
1. Run the state checks.
2. On the user's go-ahead, start the builder as the planner skill's "Starting the builder" describes, then `planner.py track` its session.
3. Next step in the plan is the first unticked checkpoint: "1. Scaffold in place". See `plan.md`.
4. After piece 1 is committed, write the worktree-setup and coverage scripts in the planner branch's `tools/` and update `project.md` with the real check commands (`plan.md` Notes).

## Don't
- Don't build in the planner chat, and don't start the builder without the user's go-ahead.
- Don't push `main` or merge anything: those are the user's.
