# Resume point — read this first

## Where we are
Issue 0001 (`add-globe-cubed-sphere-grid-and-elevation-sculpting`) is in the planning discussion, state `investigating`. Every question raised so far is answered and `decisions.md` has nothing under Open. The discussion is stopped on the closing check: the user has been shown the full ledger and asked whether anything is missing or wrong. No `issue.md` or `plan.md` yet, no builder started.
State checks: `git -C /home/philiph/workspace/earth_sim status --short --branch` shows `No commits yet on main` and a clean tree; `git remote` prints nothing (no `origin`). `planner.py meta 1` shows state `investigating`.
If anything differs, stop and tell the user.

## How it got here — decisions already answered, in order
1. 2026-11-10 — Scope of the first issue → step 1 only; the overall design is saved in `investigations/2026-11-10-simulator-design-and-roadmap.md`.
2. 2026-11-10 — Grid → cubed sphere.
3. 2026-11-10 — What painting means → sculpt elevation with raise, lower and smooth brushes.
4. 2026-11-10 — Architecture → adopt as proposed, including the Web Worker now.
5. 2026-11-10 — Resolution → one grid, per-world setting (64 default, 128 and 256 selectable).
6. 2026-11-10 — Display → smooth colour by height plus raised relief with adjustable exaggeration.
7. 2026-11-10 — Starting worlds → all three: blank ocean, generated continents, Earth preset.
8. 2026-11-10 — Worker role → compute service; main thread owns the terrain.
9. 2026-11-10 — UI layer → plain TypeScript and DOM.
10. 2026-11-10 — Undo and redo → in, per stroke.
11. 2026-11-10 — Autosave to browser storage → yes.
12. 2026-11-10 — Flat map view → not in this issue.
13. 2026-11-10 — Sea level → adjustable per world.
14. 2026-11-10 — Changing resolution after creation → no, set at creation only.
15. 2026-11-10 — Earth data → ETOPO 2022, ice surface.
16. 2026-11-10 — Generator controls → seed and land fraction.
17. 2026-11-10 — User's own addition: the simulation must be pauseable with human input on the map when paused → recorded as a design constraint; no pause control in this issue because nothing runs through time yet.

## The pending decision (exact)
Two things, asked together. First: is my reading of "pauseable" right (it is about the later run through time; this issue only has to keep the main thread's world editable and authoritative), or did the user mean something that needs building in this issue? Second: is the ledger in `decisions.md` complete and correct? The user was asked to confirm, and to promote any item under Assumed that they want to decide themselves. The Assumed items most worth their eye: the mouse scheme (left-drag sculpts, right-drag rotates), the single autosave slot, and that ETOPO's licence is unverified. Only an explicit "that's everything" or "go ahead" ends the discussion.

## What the next session does
1. Run the state checks.
2. If the user has not confirmed the ledger, show it again and ask.
3. On confirmation, draft `issue.md` and present it for approval, then write `plan.md` (the planner skill's Planning steps). Skip `gh issue create`: there is no remote.

## Don't
- Don't write source files or build in the planner chat.
- Don't create a GitHub issue or PR: there is no `origin` remote.
- Don't treat items under "Proposed, not yet confirmed" in the design note as decided.
