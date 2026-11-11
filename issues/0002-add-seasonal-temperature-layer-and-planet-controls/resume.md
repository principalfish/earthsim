# Resume point — read this first

## Where we are
Issue 0002 (`add-seasonal-temperature-layer-and-planet-controls`), roadmap step 2, is in the planning discussion, state `investigating`. No `issue.md` or `plan.md` yet, no builder. Every design question is answered and recorded in `decisions.md`, with nothing Open. This chat (`planner: earth-sim`) also owns issue 0001, which is in review with a round of review fixes at its builder; read issue 0001's own `resume.md` for that.
State checks (run from `/home/philiph/workspace/earth_sim`):
- `python3 ~/.claude/lib/planner.py meta 2` shows state `investigating`, base `main`.
- `git -C .planner status --short` is empty.
- `git log --oneline -1 main` is still `ffed15a` until the user merges issue 0001.
If anything differs, stop and tell the user.

## How it got here — decisions already answered, in order
All in `decisions.md` (Settled), each with the user's words and the date. In brief: scope is the temperature model, its display, planet controls (tilt, star brightness and orbit distance, greenhouse strength) and an in-app comparison with observed Earth; the display has a month slider with play, a legend, the value under the cursor and annual summaries; the page shows a date counting years since the world began; months are January to December; the colour scale is fitted to each world (the user chose this over a fixed scale); good enough is the right broad pattern with errors recorded as a baseline; the model is a monthly seasonal energy balance with simple snow and ice brightening; recalculation is automatic, with the exact trigger decided after the solver's timings are measured; building waits until issue 0001 is merged into `main`.
`decisions.md` also has "What the code allows", the integration points read from issue 0001's branch at `4170dd0` with file and line references.

## The pending decision (exact)
The discussion is finished: the dataset is chosen (20th Century Reanalysis v3) and the user confirmed the ledger with "That's everything". Planning is stopped on approval of the `issue.md` draft, shown in chat on 2026-11-11 and not yet written to the folder. Draft title: "Add seasonal temperature layer and planet controls". If the draft is not in the chat, redraft it from `decisions.md`.

## What the next session does
1. Run the state checks.
2. Get the user's approval of the `issue.md` draft, write it, save.
3. `gh issue create`, record `gh_issue`.
4. Write `plan.md`: create the GitHub issue, write `plan.md`. The plan must put the solver and a timing run at 64, 128 and 256 first and stop there for the user's decision on the recalculation trigger; give temperature its own worker with transferred results; and have every place that builds a `World` set planet settings and the date. Propose manual reviews for the display, the planet controls and the Earth comparison.
5. Do not start a builder until issue 0001 is merged into `main`.

## Don't
- Don't build in the planner chat, and don't start a builder for this issue before issue 0001 is merged.
- Don't commit or name a dataset as chosen until the user has seen its quoted terms.
- Don't push `main` or merge anything: those are the user's.
