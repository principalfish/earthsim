# Resume point — read this first

## Where we are

Piece 4 of 15 ("Wind report with the observed Earth") is built, checked and reviewed in the builder's worktree, **uncommitted**, and paused for the user's review, which includes a manual review of the report page. Issue state `building`.
State checks: branch `claude/add-winds-layer-991a60`, HEAD `0bdca21` (`git -C /home/philiph/workspace/earth_sim/.claude/worktrees/add-winds-layer-991a60 log --oneline -1`), tree **not** clean: 23 files changed or added against HEAD (`git add -N . && git diff --stat HEAD`).
The report page is at `/home/philiph/workspace/earth_sim/.claude/worktrees/add-winds-layer-991a60/reports/winds/index.html` (ignored by git; `npm run report:winds` in the worktree writes it again).
If anything differs, stop and tell the user.

## The pending decision (exact)

1. Manual review: open the report page and check the observed Earth maps read clearly (arrows legible, key present, January and July side by side). Arrow spacing (5 degrees) and the pressure colours are the user's to judge.
2. Approve piece 4 for commit and push, or ask for changes. The review request sent to the planner chat has the summary, checks and the proposed commit message. No findings stand.

## What the next session does

1. On approval quoted from the user: commit with the approved message, push, tick checkpoint 4, cut this file to a pointer, save, send the look-ahead for piece 5.
2. On changes requested: make them, re-run the checks and the analysis loop (stopping once a round finds nothing above low), write the report again, and send a new review request.

## Don't

- Don't commit before the planner relays the user's approval in the user's words. Don't start piece 5 without the go-ahead.
- Don't start piece 7 until the planner says the plan has been revised after the user's choice of wind model.
- No attribution lines in commits. Push only this issue's branch, never forced. No other GitHub writes.
