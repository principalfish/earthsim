# Resume point — read this first

## Where we are
Issue 0001 (`add-globe-cubed-sphere-grid-and-elevation-sculpting`) is in the planning discussion, state `investigating`. The discussion is finished: the user confirmed the ledger in `decisions.md` with "That's everything". Planning is stopped on approval of the `issue.md` draft, which has been shown in chat but not yet written to the folder. No `plan.md` yet, no builder started. The user also said "let me create a repo before you start": they are creating the GitHub repo and adding it as `origin` themselves, and planning waits for that.
State checks: `git -C /home/philiph/workspace/earth_sim status --short --branch` shows `No commits yet on main` and a clean tree; `git remote` prints nothing until the user adds `origin`; once it prints `origin`, the remote steps below apply. `planner.py meta 1` shows state `investigating`.
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
18. 2026-11-10 — Is the ledger complete and correct → "That's everything". The reading of "pauseable" as the later run through time stands.

## The pending decision (exact)
Two things. First, the user is adding a GitHub remote; wait for them to say it is done. `main` has no commits, and a builder worktree cannot branch from an unborn `main`, so `main` needs a first commit on origin (the user was advised to create the GitHub repo with a README and pull it). Second: does the user approve this `issue.md` draft? Only explicit approval counts; iterate on any changes.

    # Add globe, cubed-sphere grid and elevation sculpting

    earth_sim is a browser-based planet simulator for worldbuilding. This is its first step: a planet you can see and shape, and the foundation every later layer (temperature, winds, rainfall, oceans, ice, plate drift) is built on.

    The planet's surface is stored on a cubed-sphere grid whose resolution is chosen per world: 64 cells per cube face by default (about 150 km), or 128 or 256. A 3D globe shows it tinted by height and lit, with mountains raised from the sphere by an adjustable exaggeration and an optional overlay of the cell grid.

    You shape the terrain by sculpting directly on the globe with raise, lower and smooth brushes, with undo and redo per stroke. Sea level is an adjustable setting that decides what is land. A new world starts as a blank ocean, as generated continents from a seed and a land fraction, or as real Earth from NOAA's ETOPO 2022 elevation data.

    The simulation code is a pure TypeScript library with no browser dependency, run in a Web Worker as a compute service, while the page owns the editable world. Here the worker returns land and sea areas and height statistics; later climate layers use the same channel. That split is also what will let a run through time be paused, edited and resumed.

    Worlds autosave in the browser and can be exported to and imported from a file. Everything runs client-side as static files. The issue also scaffolds the project tooling: npm, Vite, Vitest, Biome and TypeScript.

    Not included: any climate or time simulation, a flat map view, and changing a world's resolution after it is created.

## What the next session does
1. Run the state checks.
2. If the user has not approved the draft, show it again and ask.
3. When `origin` exists: tell the user the next save pushes the planner branch to GitHub, where it is visible, and get a yes before saving. Check `git log main` has a commit.
4. On approval of the draft, write `issue.md` and save. With a remote, `gh issue create` and record `gh_issue`; without one, skip it.
5. Write `plan.md` (the planner skill's Planning steps), propose manual reviews, add the `## Plan` checklist to `issue.md`, then `planner.py set 1 state=planned`.

## Don't
- Don't write source files or build in the planner chat.
- Don't create the GitHub repo, add the remote, or push `main`: those are the user's.
- Don't create a GitHub issue until `origin` exists and the user has agreed to the planner branch being pushed.
- Don't treat items under "Proposed, not yet confirmed" in the design note as decided.
