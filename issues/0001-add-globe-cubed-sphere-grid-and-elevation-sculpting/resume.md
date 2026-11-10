# Resume point — read this first

## Where we are
Issue 0001 (`add-globe-cubed-sphere-grid-and-elevation-sculpting`) is being planned, state `investigating`. The discussion is finished and the user approved the issue text. `issue.md` (with its `## Plan` checklist) and `plan.md` (11 pieces) are written in the planner worktree but **not saved**: the first save pushes the planner branch, and `main` must reach GitHub first or GitHub makes `planner` the default branch. No GitHub issue yet, no builder started.
State checks:
- `git -C /home/philiph/workspace/earth_sim remote -v` shows `origin git@github.com:principalfish/earthsim.git`.
- `git -C /home/philiph/workspace/earth_sim log --oneline main` shows `ffed15a Add README and .gitignore`.
- `git -C /home/philiph/workspace/earth_sim ls-remote --heads origin` lists `refs/heads/main` once the user has pushed it. If it lists nothing, the user has not pushed yet: do not save.
- `git -C /home/philiph/workspace/earth_sim/.planner status --short` lists the unsaved files until the first save after the push.
- `planner.py meta 1` shows state `investigating`.
If anything else differs, stop and tell the user.

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
17. 2026-11-10 — User's own addition: the simulation must be pauseable with human input on the map when paused → recorded as a design constraint; no pause control in this issue.
18. 2026-11-10 — Is the ledger complete and correct → "That's everything".
19. 2026-11-10 — User: "let me create a repo before you start" → they created `principalfish/earthsim` (private, empty) and added it as `origin`.
20. 2026-11-10 — Who makes `main`'s first commit → "Claude commits, I push": commit `ffed15a` made locally; the user pushes it.
21. 2026-11-10 — May the planner branch be pushed once `main` is on GitHub → "Yes, push it".
22. 2026-11-10 — Issue draft → "Approved".

## The pending decision (exact)
Two things asked together:
1. The user runs `git push -u origin main` and says when it is done.
2. Which proposed manual reviews to keep. Proposed: piece 5 (look of the globe and generated continents), piece 6 (feel of sculpting), piece 9 (new-world flow), piece 10 (refresh, export, import), piece 11 (Earth looks right). Only the ones the user confirms stay in `plan.md`.
Also put to the user, not blocking: the plan has 11 pieces (8 to 10 were estimated); browser-automation tests are not planned; and four defaults in `plan.md` Notes (first open shows the new-world dialog over a blank ocean; ocean drawn smooth with only land raised; a new world resets sea level; 100-stroke history).

## What the next session does
1. Run the state checks. If `main` is not on origin, ask the user to push it and wait.
2. Apply the user's answer on manual reviews to `plan.md` (remove the `Manual review:` lines they declined, and the "manual review done" wording on those checkpoints).
3. `planner.py save "<slug> (0001): issue and plan written"` — this is the first push of the planner branch.
4. `gh issue create --title "Add globe, cubed-sphere grid and elevation sculpting" --body "$(tail -n +2 "$FOLDER/issue.md")"`, then `planner.py set 1 gh_issue=<n>`.
5. `planner.py set 1 state=planned`, then rewrite this file as a short pointer.
6. Offer to start the builder, with the next-stage briefing for piece 1 (planner skill, "Starting the builder").

## Don't
- Don't save through `planner.py` until `main` is on origin.
- Don't push `main` or change remotes: those are the user's.
- Don't write source files or build in the planner chat.
- Don't treat items under "Proposed, not yet confirmed" in the design note as decided.
