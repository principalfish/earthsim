# Resume point — read this first

Piece 7b, "The yardstick: a ninth case and three literature checks", is **started but no code is written**: the builder looked the papers up first and stopped, as the plan requires, to report access and where the papers differ from the plan's expectations. Pieces 1 to 5, 7a, 8 and 9 are committed and pushed on branch `claude/add-winds-layer-991a60` (HEAD is piece 9's commit, `0a48b68`); the tree is clean.

## Pending decisions (sent to the planner chat 2026-11-14)

Access, as read by the builder (texts and page images are under the builder's scratch folder, `papers/`):

| Paper | How it was read |
|-|-|
| Ferreira et al. 2014 | The paper's own text (published PDF): abstract, section 3.2, section 6, Appendix A, Fig. 7 |
| Held and Hou 1980 | The paper's own text (scanned pages read as images): abstract, Eq. (16) and the paragraph after it, p. 519 |
| Way et al. 2018 | The paper's own text (arXiv PDF): sections 3.1 and 3.2, Fig. 9's caption |
| Lobo and Bordoni 2020 | Abstract only; the full text could not be reached |
| Salameh et al. 2018 | Not reached at all |
| Kaspi and Showman 2015 (not on the plan's list) | The paper's own text (arXiv PDF): sections 3.1 and 4; Fig. 6a's values read off the plot |

1. Check (a): the paper says more than the plan: westerlies only in the summer hemisphere, winds vanishing in the winter hemisphere, and weak mid-latitude winds at 54°. Recommended: word the check as the paper has it.
2. Check (b): Lobo and Bordoni read in the abstract only. Recommended: accept the abstract and cite Ferreira's own text on the overturning beside it; or the user supplies the paper; or drop Lobo and Bordoni.
3. Check (c): Way et al. give no cell width at a 4-day day, and no paper read states the square-root rule. Recommended: take the widths from Kaspi and Showman 2015, Fig. 6a (about 25° at Earth's spin, 46° at a quarter, 15° at three times, read off the plot), keep Held and Hou for the steeper theory and Way et al. for the cell reaching the pole by about 16 days.
4. The slow-end note: Salameh et al. not reached; Way et al. section 3.2 gives a change to a day-night circulation between 32 and 64 days. Recommended: cite Way et al. and drop Salameh.

## Next step

On the relayed answers (the user's words): re-run `planner.py path`, re-read piece 7b, then build the ninth case, the measures and the report's section with the access table; checks; one review round and a light re-check; `findings.md`; review request with the report's path.
