# Resume point — read this first

Nothing is pending and nothing is left to build. Every piece is committed and pushed on branch `claude/add-winds-layer-991a60`: pieces 1 to 5, 7a, 8, 9, 7b, 7c-1, 7c-2, 10, 11, 12, 13, 14a, 14b, 15 and 16 (piece 6 was dropped and 7d moved out to the roadmap). HEAD is piece 16's commit `e9193d9`, the same as origin; the tree is clean. The issue's state is `review`: the next step is the planner chat's `/review self add-winds-layer`.

Review is one round and a light re-check per piece, recorded in `findings.md`. The Earth's known faults are recorded and not tuned in this issue (the user's decision: Earth tuning waits until every part of the climate loop is built). The winds' baseline (`npm run baseline:winds`) is set at piece 14b; a later change to the winds or the temperature model must rewrite it. See `plan.md` (`## Checkpoints`, `## Notes`).

## Pending (2026-11-15): the user is choosing which self-review findings to fix

`/review self add-winds-layer`, review 01, ran on the whole branch against main (abbf20d), HEAD `e9193d9`. The verifier upheld four findings, all low, and dropped none:
1. `src/app/refresh.ts:757` (and :745), defect: turning Winds on or choosing Pressure while the temperature is current waits the 400 ms debounce, so "Not calculated yet" flashes before "Calculating". Fix: `refreshNow()` when the temperature is current.
2. `README.md:52`, docs: the scripts line no longer covers baselines, the wind report or tuning. Fix: reword.
3. `src/app/refresh.ts:234`, cleanup: a current answer that arrives while a newer request is held back is dropped and the same solve re-run. This rests on piece 8's rule, so it's the user's call.
4. `src/app/ui/layerPanel.ts:898`, cleanup: the simulated winds' summary also averages pressure, which the arrows don't use. Fix: east and north only, as the observed branch does.
Security, coverage (97%, 83 lines uncovered, all with reasons) and common-mistakes were clean.
