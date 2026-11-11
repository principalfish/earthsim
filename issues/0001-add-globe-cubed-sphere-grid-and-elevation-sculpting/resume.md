# Resume point — read this first

## Where we are
Issue 0001 (`add-globe-cubed-sphere-grid-and-elevation-sculpting`), state `building`. Pieces 1 to 9 of 11 are committed and pushed on `claude/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9`, latest `f9aba12`. The user settled piece 10's choices (`decisions.md`, `plan.md` Notes) and said "Start it" on 2026-11-11: the builder is building piece 10 (save, load and autosave) and will stop uncommitted at its review, which has a manual review. Piece 11 (Earth preset) is not started. GitHub: issue principalfish/earthsim#1 carries the plan checklist; draft PR 2 is open; `main` is still `ffed15a` and nothing is merged.

State checks (run from `/home/philiph/workspace/earth_sim`):
- `git log --oneline -1 claude/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9` shows `f9aba12 … piece 9/11: add new-world dialog` until piece 10 is approved, and `git ls-remote --heads origin` shows the same SHA.
- `python3 ~/.claude/lib/planner.py meta 1` shows state `building`, `gh_issue` 1, `pr` 2, `build_model` `claude-fable-5-2`.
- `git -C .claude/worktrees/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9 status --short` prints nothing until piece 10 is being built; then piece 10's uncommitted files.
- `git -C .planner status --short` is empty.
If the branch head or `meta` differs, stop and tell the user.

## How it got here — decisions already answered, in order
All design decisions are in `decisions.md` (Settled) and `plan.md` (Context and Notes). The ones that shape how the build runs: the implementation model is `claude-fable-5-2` for this issue only; pieces 1 to 4 and 7 to 8 ran without review pauses at the user's request; pieces 5 and 6 were approved after the user tried them ("Tried it, approve"); the build was paused twice at the user's request and resumed each time on "resume".

## The pending decision (exact)
Piece 10 (save, load and autosave) is built, checked and **uncommitted** in the builder's worktree; the branch head is `f9aba12` (piece 9). The builder sent its review request and the user has been given the review briefing, including the three data-loss risks its review loop found and closed (the start-up window, a failed save not retried on close, and a save started at reload never landing). Waiting on the user for the manual review, then diff approval: from the builder's worktree run `npm run dev` (or reload their own dev server, last seen on http://127.0.0.1:5176/); create a world, sculpt, see "Saved", refresh and see it return; sculpt and refresh within a second; export, make a new world, import; try an unrelated file; repeat at 256. Not tried by anyone: Firefox and Safari. Relay an approval only when the user's words say they tried it.

## What the next session does
1. Run the state checks. `planner.py ingest 1`; if it warns that a file changed in both places, merge by hand (edit the record, save, copy the merged file over the builder's copy in `<worktree>/.planner-outbox/issue/`, ingest again).
2. The builder is session `local_acf49a6d-c0ef-4a98-8721-d05319ed32de` (`builder: add-globe-cubed-sphere-grid-and-elevation-sculpting`). When its review request for piece 10 arrives, give the user the review briefing with the manual review first; relay an approval only when their words say they tried it.
3. After each commit: verify it on origin, tick the issue's `## Plan` checklist, `gh issue edit 1 --body-file <(tail -n +2 "$FOLDER/issue.md")`, then the next-stage briefing for the following piece with its choices. Piece 11 also has a `Manual review:` line, and needs the ETOPO download and a licence check (`plan.md` piece 11 and Notes). Normal per-piece pauses apply unless the user asks for another run-through.
4. When all pieces are done the builder sets state `review`: suggest `/review self add-globe-cubed-sphere-grid-and-elevation-sculpting`, then `/publish`. Merging is the user's.
5. If the builder is idle with uncommitted work and no message, it has stalled (see below): message it to carry on.

### If the builder session is gone
Run `python3 ~/.claude/lib/planner.py check-builder 1` before anything is archived or replaced; uncommitted work exists only in its worktree. A new builder is started as the planner skill's "Starting the builder" describes, only after the old worktree has let go of the branch.

## Things the next session should know
- **The builder stalls if the Claude Code process restarts mid-check.** It happened once (2026-11-10, about 12:50): it sat idle 35 minutes with uncommitted work. If it is idle with no message, send it a message to resume.
- **Tools:** `.planner/tools/setup-worktree.sh` and `.planner/tools/coverage-changed.sh` exist and `project.md` has the real commands. The coverage report does not see untracked files; the builder marks new files with `git add -N` first.
- **Verification gaps the user has been told about:** for pieces 6 and 7 the headless-browser gesture scripts were not re-run on the final builds after review fixes; the user's manual reviews of 5 and 6 are the real check. Piece 7 noted three seam pixels shifting by one colour level on the first redraw after a stroke; left alone.
- **Carried forward to piece 10 (from security checks):** show error messages as text, never HTML (grid errors carry the raw rejected value); validate a whole elevation array before writing any of it; reject non-numeric elevations; sea level must go through `normaliseSeaLevel` (single precision, within ±12,000 m), as must piece 9's reset.
- **Piece 8 adds `tsconfig.worker.json`**, which piece 1 deferred; the README's layout section gains `src/worker` then.
- **The user's own dev server** may still be running from the builder's worktree (last seen on http://127.0.0.1:5176/). It is theirs; leave it.
- **Roadmap:** temperature, winds, rainfall, currents, ice, storms and tectonics are later issues, in `investigations/2026-11-10-simulator-design-and-roadmap.md`. None is planned. The simulation must be pauseable with the map editable while paused.

## Don't
- Don't resume, or let the builder resume, without the user's word.
- Don't commit, revert or tidy anything in the builder's worktree from the planner chat, and don't archive the builder session while piece 8 is uncommitted.
- Don't build in the planner chat, and don't start a second builder for this issue while the first holds the branch.
- Don't change `models.md`: Fable is for this issue only.
- Don't push `main` or merge anything: those are the user's.
