# One config file for every model's settings, with a screen to read them

The temperature and wind models are built on about 60 numbers that get tuned: 18 for the temperature, 36 for the winds, and a few more chosen constants beside them. Today they sit in two files, in two different shapes, with what each means and where it comes from only in code comments, and the climate-process PDF repeats them all by hand. They should be easy to find, read and change, in one place that every later model (heat carried by winds, ocean currents, ice, rain) adds to.

All of them move into one `config.ts` in the core, with a section per model in titled groups. Each setting carries its value, its unit, what it does, what raising or lowering it does, where its value comes from, and whether it was tuned and against what. The models read their numbers from there, and the wind tuning script takes its list of tunable settings from it. A `config.md` is written from the same file, with a test that fails if the two drift apart.

The page gains a read-only "Model settings" screen, opened from Settings: a full-page overlay with a tab per model, the climate process diagram at the top, and every setting with its explanations. Settings are still changed by editing `config.ts`. The PDF and the script that drew it are removed.

No value changes: the Earth's temperature and wind figures come out exactly as before, and a run can still override the settings as it can today.

## Plan

_2026-11-18 · 5 of 5 pieces done · now: all done, in review; self review done_

- [x] **1/5 The temperature's settings in config.ts** · `279f599`
  The temperature's 18 settings, with their explanations, move into one config file the model reads from.
- [x] **2/5 The winds' settings in config.ts, and the tuning list** · `181cb39`
  The winds' 36 settings and the chosen constants beside them join it, and the tuning script takes its list from there.
- [x] **3/5 config.md, written from the config** · `34ab717`
  A page listing every setting is written from the config, with a test that keeps it from drifting.
- [x] **4/5 The "Model settings" screen** · `2957d36`
  A read-only screen, opened from Settings, shows every setting with its explanations.
- [x] **5/5 The climate process diagram on the screen, and the PDF removed** · `1e201c3`
  The process diagram is redrawn on the screen, and the PDF and its script go.
- [x] **Review fixes (round 1)** · `2fc625f`
  Shared helpers, doc comments that point at the config instead of repeating it, and small test and wording tidy-ups.
