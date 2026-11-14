# Resume point — read this first

Piece 7c-1, "The tuning script and the small fixes", is **built but not yet reviewed or committed**. Pieces 1 to 5, 7a, 8, 9 and 7b are committed and pushed on branch `claude/add-winds-layer-991a60` (HEAD is piece 7b's commit, `92b5e6d`). The working tree holds piece 7c-1 (17 files). The project checks pass on it.

## Pending decision (sent to the planner chat 2026-11-14)

The outer-band rule. The user chose "weaken only the last band"; built that way, the 8-hour case counts 5 bands a hemisphere, but on the Earth tilted 60° the winter hemisphere's bands come to full strength (winter mid-latitude wind 1.21 and 2.89 times the summer's in January and July, where it was 0.20 and 0.61 and the paper reports weak winter winds). A narrower rule is in the tree as a candidate: bands in full within two cells of the low, or within 60° of it at a faster spin than the Earth's. With it every 24-hour and 96-hour case is as before this piece, the tilted Earth's winter winds are weak again (0.22, 0.61), and the 8-hour case counts 4 bands (south) and 5 (north) against the Earth's 3 and 3.
- A (recommended): keep the candidate.
- B: the user's original rule (only the last band weakened).
- C: the rule before this piece (the 8-hour case counts 2 and 3).

## Next step

On the relayed answer (the user's words): put the tree in the chosen state, re-run the project checks and coverage, take the after picture of the 60° maps, run one review round and a light re-check, write `findings.md`, and send the review request with the report's path and the before-and-after maps.
