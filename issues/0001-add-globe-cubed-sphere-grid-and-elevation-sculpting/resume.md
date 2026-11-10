# Resume point — read this first

## Where we are
Issue 0001 (`add-globe-cubed-sphere-grid-and-elevation-sculpting`), state `building`, is **paused at the user's request** (2026-11-10, about 22:55): "ok we're gonna need to just pause now im afraid, can you generate a resumption hand off". Nothing resumes until the user says so.

- **Done:** pieces 1 to 7 of 11 are committed and pushed on `claude/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9`, latest `8bfa67b`. The user tried and approved the two manual-review pieces so far (5, the globe; 6, sculpting).
- **Stopped mid-piece:** piece 8 (worker compute service and statistics readout) was being written by a Fable subagent when the builder was told to stop. Its partial files are **uncommitted** in the builder's worktree. No check, coverage run or analysis loop has run on them.
- **Not started:** pieces 9 (new-world dialog), 10 (save, load and autosave), 11 (Earth preset).
- GitHub: issue principalfish/earthsim#1 carries the plan checklist; draft PR 2 is open for the branch. `main` is still `ffed15a` (README and `.gitignore` only); nothing is merged.

State checks (run from `/home/philiph/workspace/earth_sim`):
- `git log --oneline -1 claude/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9` shows `8bfa67b … piece 7/11: add undo and redo`, and `git ls-remote --heads origin` shows the same SHA for that branch.
- `python3 ~/.claude/lib/planner.py meta 1` shows state `building`, `gh_issue` 1, `pr` 2, `build_model` `claude-fable-5-2`.
- `git -C .claude/worktrees/add-globe-cubed-sphere-grid-and-elevation-sculptin-9672e9 status --short` showed, when the stop was sent: modified `src/core/index.ts`, `tsconfig.app.json`, `tsconfig.json`; untracked `src/core/protocol.ts` (187 lines), `src/worker/client.ts` (261), `src/worker/handle.ts` (56), `src/worker/sim.worker.ts` (10), `tsconfig.worker.json` (9). No tests, no statistics panel, no app wiring yet. A few more lines may have landed before the subagent stopped.
- `git -C .planner status --short` is empty.
If the branch head or `meta` differs, stop and tell the user. If the worktree is missing, see "If the builder session is gone" below.

## The builder's stop report (confirmed by the builder, 2026-11-10)
The builder stopped its subagent and wrote the state into `plan.md` Notes (the entry beginning "Piece 8 was stopped mid-implementation"). In short:
- **Drafted, all untested and unreviewed:** `src/core/protocol.ts` (request and response types, `parseSimRequest`, `simFailure`, `isSimResponse`), `src/worker/handle.ts` (`handleRequest`), `src/worker/sim.worker.ts`, `src/worker/client.ts` (`createSimClient` with `request`, `latest`, `dispose`), `tsconfig.worker.json`, and small edits to `tsconfig.json`, `tsconfig.app.json` and `src/core/index.ts`.
- **Not started:** `src/worker/handle.test.ts`, `src/worker/client.test.ts`, `src/app/ui/statsPanel.ts` and its test, the debounced statistics scheduler, the wiring in `src/app/main.ts`, styles, README lines, the browser check of the worker, and the whole analysis loop.
- **On resume** the drafts are read against piece 8's plan entry before being built on, or discarded and the piece restarted from `8bfa67b`. To discard, in the builder's worktree: `git checkout -- src/core/index.ts tsconfig.app.json tsconfig.json`, then remove `src/core/protocol.ts`, `src/worker/` and `tsconfig.worker.json`.
- **Piece 8's defaults stand:** a "Statistics" section at the bottom of the panel with the five planned figures; requests debounced by about 150 ms and sent only after a stroke ends; "Statistics unavailable" on a worker error.

## How it got here — decisions already answered, in order
All design decisions are in `decisions.md` (Settled) and `plan.md` (Context and Notes); read those, not this list, for the detail. The ones that shape how the build runs:
1. 2026-11-10 — Implementation model → `claude-fable-5-2` for this issue only ("lets use fable to implement this one time"). It overrides the "Builder on Sonnet" experiment here; `models.md` is unchanged. The builder's shell is still Sonnet per its skill.
2. 2026-11-10 — Pieces 1 to 4 ran without pauses; piece 5 approved "Tried it, approve"; generated continents accepted as they are; the 551 kB bundle warning left alone.
3. 2026-11-10 — Piece 6 choices: radius 100 to 3,000 km; raise and lower in metres per second; smooth as a unitless 1 to 100, resolution-scaled (this replaced "share of the gap per second"). Approved "Tried it, approve", no tuning.
4. 2026-11-10 — Piece 7 choices: history of 100 strokes and 64 MB; Ctrl+Z ignored mid-stroke.
5. 2026-11-10 — "Run 7 and 8, stop at 9's review": pieces 7 and 8 commit without a review pause; before piece 9 the builder sends its look-ahead and waits; piece 9 stops uncommitted at its review.
6. 2026-11-10 — Pause requested, first "After piece 8 is committed", then "pause now": the builder was told to stop piece 8 immediately and leave the worktree as it is.

## The pending decision (exact)
The user's word to resume. Nothing else is open for piece 8: its approval to commit without a review pause ("Run 7 and 8, stop at 9's review") still stands once it is finished and its checks and analysis loop are clean.

Choices to put to the user before piece 9 is built (not yet asked):
- The builder's own look-ahead for piece 9, which it has not sent yet.
- The plan's defaults for piece 9, to confirm: with no saved world the page opens on a blank ocean with the new-world dialog showing; creating a new world resets sea level to zero; the seed is a whole number from 0 to 4,294,967,295; piece 9 removes the `resolution`, `seed` and `land` address parameters that piece 5 added for reviewing.
- Offered and unanswered, no action needed unless the user picks them up: planning the temperature issue in parallel; moving saving (piece 10) or the Earth preset (piece 11) earlier.

## What the next session does
1. Run the state checks. `planner.py ingest 1`; if it warns that `plan.md` changed in both places, merge by hand (edit the record, save, copy the merged file over `<worktree>/.planner-outbox/issue/plan.md`, ingest again).
2. Find the builder: `list_sessions` for `builder: add-globe-cubed-sphere-grid-and-elevation-sculpting` (session `local_acf49a6d-c0ef-4a98-8721-d05319ed32de`, name `b-add-globe-cubed-sphere`). Read its last message for its stop report: which piece 8 files are finished, part-written or not started.
3. Wait for the user's word to resume, then relay it to the builder with `SendMessage`, quoting it: assess the partial piece 8 files against `plan.md`'s piece 8 entry, finish or rewrite them on `claude-fable-5-2`, run the checks, coverage and the full analysis loop, commit and push, then send piece 9's look-ahead and wait.
4. After piece 8's commit: verify it on origin, tick piece 8 on the issue's `## Plan` checklist, `gh issue edit 1 --body-file <(tail -n +2 "$FOLDER/issue.md")`, report to the user, and put piece 9's choices to them.
5. Pieces 9, 10 and 11 each have a `Manual review:` line: give the review briefing with the manual review first, and relay an approval only when the user's words say they tried it. Normal per-piece pauses apply unless the user asks for another run-through.
6. When all pieces are done the builder sets state `review`: suggest `/review self add-globe-cubed-sphere-grid-and-elevation-sculpting`, then `/publish`. Merging is the user's.

### If the builder session is gone
Its worktree holds piece 8's uncommitted partial files and is the only copy. Run `python3 ~/.claude/lib/planner.py check-builder 1` before anything is archived or replaced. The partial work is small (about 520 lines, no tests) and can be redone from `plan.md`, so losing it costs a rebuild of piece 8, nothing more. A new builder is started as the planner skill's "Starting the builder" describes, only after the old worktree has let go of the branch.

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
