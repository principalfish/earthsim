# Resume point — read this first

**State:** piece 7c-2, bands by longitude, is built, checked and reviewed (one round and the light re-check) and **not committed**: it waits for the user's verdict, relayed by the planner chat in the user's own words. Branch `claude/add-winds-layer-991a60`; HEAD is piece 7c-1's commit `165c816`, pushed; the working tree holds piece 7c-2 (12 files, +1,697 −158). Pieces 1 to 5, 7a, 8, 9, 7b and 7c-1 are committed; piece 6 was dropped; 7d moved out to the roadmap.

**Pending decision (the user's):** the re-check left one finding standing, low, a defect in the tuning script only: `scripts/tune-winds.ts:113` (and `tryValue` in `scripts/tune/search.ts`), a sweep or search of either blend-latitude setting stops with an error part-way once a value crosses the other setting, instead of skipping that value. Options: accept it as it is (recommended: neither setting is in the tuned set, and the error names both settings); or fix it (skip such values, with a test) before the commit. Also open, noticed by the verifier and uncertain: `src/core/wind/rules.ts:1480`, local lows about 0.3° short of the global low on a field with sharp steps in latitude; recommended: accept.

**After the verdict:** mark the two rows in `findings.md` (`accepted` or `fixed`), commit with the approved message, push, tick checkpoint 7c-2, cut this file to a pointer, save, and send the look-ahead for piece 10 (day length in the Planet section, with the steep-tilt warning).

Review is one round and a light re-check per piece, recorded in `findings.md`. The Earth's known faults are recorded and not tuned in this issue (the user's decision: Earth tuning waits until every part of the climate loop is built).
