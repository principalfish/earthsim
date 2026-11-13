# Resume point — read this first

## Where we are

Piece 1 of 15 ("Observed winds and pressure data") is built, checked and reviewed in the builder's worktree, **uncommitted**, and paused for the user's review. Issue state `building`.
State checks: branch `claude/add-winds-layer-991a60`, HEAD `abbf20d` (`git -C /home/philiph/workspace/earth_sim/.claude/worktrees/add-winds-layer-991a60 log --oneline -1`), tree **not** clean: 26 files changed against `origin/main` (`git diff --stat origin/main`). Data files: `sha256sum public/data/earth-wind-1deg.bin` gives `4b259f80…9711`, `earth-pressure-1deg.bin` gives `f798ccc7…d61c`, `earth-temperature-1deg.bin` is unchanged (`e685f84f…a51e`).
If anything differs, stop and tell the user.

## How it got here — decisions already answered, in order

1. 2026-11-13 — Which manual reviews to keep, and whether to start the builder → the builder was started for piece 1 only ("Start it").
2. 2026-11-13 — Builder models → "Same as last time": implementation subagents on Opus, checks on their usual tiers.
3. 2026-11-13 — Is the NOAA source there? → Yes: `uwnd.10m.mon.ltm.nc`, `vwnd.10m.mon.ltm.nc` and `prmsl.mon.ltm.nc` exist beside the temperature file; details in `plan.md` Notes.

## The pending decision (exact)

1. Approve piece 1 for commit and push, or ask for changes. The review request sent to the planner chat has the summary, the checks and the proposed commit message.
2. Three optional findings from the fifth analysis round stand unfixed (all low or nit, none a defect), because the rounds had stopped converging: (a) `encodeBytes` / `decodeBytes` in `src/core/observedGrid.ts` say "unsigned codec only" in their docs but do not assert it; (b) `observedWind` writes the bilinear weights out again beside `interpolate`; (c) `observedPressure` and `observedTemperature` share a four-line body. Options: commit as it is (the builder's recommendation, with (a) as a one-line assert if the user wants any of them), or fix some or all, which costs another round of checks.

## What the next session does

1. On approval quoted from the user: commit with the approved message, push `claude/add-winds-layer-991a60`, tick checkpoint 1, save, and send the look-ahead for piece 2.
2. On changes requested: make them, re-run the checks and the analysis loop, and send a new review request.

## Don't

- Don't commit before the planner relays the user's approval in the user's words. Don't start piece 2 without the go-ahead.
- Don't start piece 7 until the planner says the plan has been revised after the user's choice of wind model.
- No attribution lines in commits. Push only this issue's branch, never forced. No other GitHub writes.
