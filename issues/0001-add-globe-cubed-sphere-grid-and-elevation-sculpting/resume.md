# Resume point — read this first

## Where we are
Issue 0001 (`add-globe-cubed-sphere-grid-and-elevation-sculpting`) is in the planning discussion, state `investigating`. No `issue.md` or `plan.md` yet, no builder started. The discussion is stopped on the second round of questions to the user.
State checks: `git -C /home/philiph/workspace/earth_sim status --short --branch` shows `No commits yet on main` and a clean tree; `git remote` prints nothing (no `origin`). `planner.py meta 1` shows state `investigating`.
If anything differs, stop and tell the user.

## How it got here — decisions already answered, in order
1. 2026-11-10 — Scope of the first issue → step 1 only (scaffold, grid, globe, sculpting, save/load); the overall design is saved in `investigations/2026-11-10-simulator-design-and-roadmap.md`.
2. 2026-11-10 — Grid → cubed sphere.
3. 2026-11-10 — What painting means → sculpt elevation with raise, lower and smooth brushes; sea level decides land.
4. 2026-11-10 — Architecture → adopt as proposed, including the Web Worker now.

## The pending decision (exact)
Four questions, asked together:
1. Grid resolution. Options: one grid with resolution as a per-world setting, default 64 per face with 128 and 256 selectable (recommended); a finer terrain grid than the climate grid; fixed 64 per face. Flagged uncertainty: it is not known how fast the later solvers run at 256 per face (about 393k cells).
2. How the globe shows elevation. Options: smooth colour by height with lighting, plus a toggle for a cell-grid overlay (recommended); that plus exaggerated displaced relief; flat-coloured visible cells only.
3. Starting world (multi-select). Options: blank ocean (recommended for this issue); generated continents from noise; an Earth preset. Recommendation: add the Earth preset in the temperature issue, where it is first needed to check results against the real climate.
4. The Web Worker's job in this issue. Options: main thread owns the terrain and brush edits, worker is a compute service proven with a small derived layer such as land and sea statistics (recommended); worker owns the world and applies brush edits; build the channel but no job.

## What the next session does
1. Run the state checks.
2. Re-ask any of the four questions the user has not answered, then record answers in `decisions.md` and save.
3. Continue with the remaining Open items in `decisions.md` (UI layer, save format, undo, flat map view, sea level).
4. When Open is empty, present the full ledger and ask whether anything is missing before drafting `issue.md`.

## Don't
- Don't write source files or build in the planner chat.
- Don't create a GitHub issue or PR: there is no `origin` remote.
- Don't treat items under "Proposed, not yet confirmed" in the design note as decided.
