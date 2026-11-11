# Resume point — read this first

## Where we are
Issue 0002 (`add-seasonal-temperature-layer-and-planet-controls`), roadmap step 2, is in the planning discussion, state `investigating`. No `issue.md` or `plan.md` yet, no builder. Every design question asked so far is answered and recorded in `decisions.md`; one item is Open, the observed temperature dataset. This chat (`planner: earth-sim`) also owns issue 0001, which is in review with a round of review fixes at its builder; read issue 0001's own `resume.md` for that.
State checks (run from `/home/philiph/workspace/earth_sim`):
- `python3 ~/.claude/lib/planner.py meta 2` shows state `investigating`, base `main`.
- `git -C .planner status --short` is empty.
- `git log --oneline -1 main` is still `ffed15a` until the user merges issue 0001.
If anything differs, stop and tell the user.

## How it got here — decisions already answered, in order
All in `decisions.md` (Settled), each with the user's words and the date. In brief: scope is the temperature model, its display, planet controls (tilt, star brightness and orbit distance, greenhouse strength) and an in-app comparison with observed Earth; the display has a month slider with play, a legend, the value under the cursor and annual summaries; the page shows a date counting years since the world began; months are January to December; the colour scale is fitted to each world (the user chose this over a fixed scale); good enough is the right broad pattern with errors recorded as a baseline; the model is a monthly seasonal energy balance with simple snow and ice brightening; recalculation is automatic, with the exact trigger decided after the solver's timings are measured; building waits until issue 0001 is merged into `main`.
`decisions.md` also has "What the code allows", the integration points read from issue 0001's branch at `4170dd0` with file and line references.

## The pending decision (exact)
1. The observed temperature dataset. A research subagent was asked to verify candidates against the providers' own pages (NOAA PSL NCEP/NCAR Reanalysis 1 and NCEP-DOE Reanalysis 2 long-term monthly means, ERA5 monthly averages, Berkeley Earth, MERRA-2, CRU, WorldClim, 20th Century Reanalysis): product, URL, format, size, resolution, ocean coverage, averaging period, the exact redistribution terms quoted with their page URL, and the citation; ranked for clear redistribution terms, no login, a simple format (GDAL 3.12 and Node 22 are available) and land plus ocean coverage. Its report had not arrived when this was written; if it is not in the chat, re-run that research. Put its recommendation and a fallback to the user with the quoted terms.
2. Then the closing check: present the full ledger and ask whether anything is missing or wrong. Only an explicit "that's everything" or "go ahead" ends the discussion.

## What the next session does
1. Run the state checks.
2. Settle the dataset with the user, record it, save.
3. Present the full ledger and get the closing confirmation.
4. Draft `issue.md` for approval, create the GitHub issue, write `plan.md`. The plan must put the solver and a timing run at 64, 128 and 256 first and stop there for the user's decision on the recalculation trigger; give temperature its own worker with transferred results; and have every place that builds a `World` set planet settings and the date. Propose manual reviews for the display, the planet controls and the Earth comparison.
5. Do not start a builder until issue 0001 is merged into `main`.

## Don't
- Don't build in the planner chat, and don't start a builder for this issue before issue 0001 is merged.
- Don't commit or name a dataset as chosen until the user has seen its quoted terms.
- Don't push `main` or merge anything: those are the user's.
