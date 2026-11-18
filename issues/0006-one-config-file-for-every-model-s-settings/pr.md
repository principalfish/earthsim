# feat: one config file for every model's settings, with a screen to read them

The temperature and wind models are built on about 60 tuned numbers. They used to sit in two files, in two different shapes, with what each meant and where it came from only in code comments, and the climate-process PDF repeated them all by hand. They now live in one place, which every later model (heat carried by winds, ocean currents, ice, rain) will add to.

**`src/core/config.ts`.** The 18 temperature settings and 36 wind settings are data entries, grouped as the PDF grouped them. Each entry carries its value, its unit, what it controls, what raising or lowering it does, where its value comes from, and, where it was tuned, against what. The chosen constants that sat beside them move in too, as fixed choices that a run can't override: the reference pressure, the air density, the Earth's cell width and the solver's starting guesses. Physical constants, grid sizes and safety limits stay in the code. The models build their value objects from the config, so `TEMPERATURE_MODEL` and `DEFAULT_WIND_SETTINGS` keep their names, keys, key order and frozen identity, and no caller changes. The wind tuning script now takes its list of tunable settings and their bounds from the same entries. `config.ts` imports nothing from the models.

**No value changes.** Tests pin every value, the key order and the frozen objects against hand-written copies of the old values. Both Earth baselines and the tuning list are unchanged.

**`src/core/config.md`** is written from the config by `npm run docs:config`, with a test that fails if the committed page drifts. The temperature and wind docs and the README point to it.

**A read-only "Model settings" screen**, opened from Settings, shows the same config in a full-page dialog. Its first tab is the climate process diagram, redrawn as an SVG from the PDF's first page. The Temperature and Winds tabs each list their settings, one card per setting with all its explanations. Settings are still changed by editing `config.ts`. The climate-process PDF and the Python script that drew it are removed, with every reference to them.

**Review.**
- Every piece had its own review round. Pieces 4 and 5 were also tried in a browser before commit: the screen, and the diagram compared against the old PDF.
- The self review of the whole branch compared every exported value with `main` by script and found no correctness or security issue.
- Its ten tidiness findings are fixed in the last commit, along with four small findings from the re-check of those fixes:
  - one shared `entriesOf` helper replaces four copies and their casts;
  - doc comments at the old sites now point to the config instead of repeating it;
  - the diagram's tests no longer refer to the deleted PDF.
- The verifier was skipped in three of the per-piece rounds, where every finding was fixed anyway; the self review covered the whole branch.

**Worth checking by hand:** the screen and the diagram were seen in a real browser only at the two manual reviews; their unit tests use a stand-in document.

Closes #11
