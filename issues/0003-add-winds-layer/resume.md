# Resume point — read this first

## Where we are

Piece 3 of 15 ("Day length on the world") is built, checked and reviewed in the builder's worktree, **uncommitted**, and paused for the user's review. Issue state `building`.
State checks: branch `claude/add-winds-layer-991a60`, HEAD `b44f254` (`git -C /home/philiph/workspace/earth_sim/.claude/worktrees/add-winds-layer-991a60 log --oneline -1`), tree **not** clean: 15 files changed against HEAD (`git diff --stat HEAD`).
If anything differs, stop and tell the user.

## The pending decision (exact)

Approve piece 3 for commit and push, or ask for changes. The review request sent to the planner chat has the summary, checks and the proposed commit message. No findings stand; nothing else is for the user to choose.

## What the next session does

1. On approval quoted from the user: commit with the approved message, push, tick checkpoint 3, cut this file to a pointer, save, send the look-ahead for piece 4.
2. On changes requested: make them, re-run the checks and the analysis loop (stopping once a round finds nothing above low), and send a new review request.

## Don't

- Don't commit before the planner relays the user's approval in the user's words. Don't start piece 4 without the go-ahead.
- Don't start piece 7 until the planner says the plan has been revised after the user's choice of wind model.
- No attribution lines in commits. Push only this issue's branch, never forced. No other GitHub writes.
