# One config file for every model's settings, with a screen to read them

The temperature and wind models are built on about 60 numbers that get tuned: 18 for the temperature, 36 for the winds, and a few more chosen constants beside them. Today they sit in two files, in two different shapes, with what each means and where it comes from only in code comments, and the climate-process PDF repeats them all by hand. They should be easy to find, read and change, in one place that every later model (heat carried by winds, ocean currents, ice, rain) adds to.

All of them move into one `config.ts` in the core, with a section per model in titled groups. Each setting carries its value, its unit, what it does, what raising or lowering it does, where its value comes from, and whether it was tuned and against what. The models read their numbers from there, and the wind tuning script takes its list of tunable settings from it. A `config.md` is written from the same file, with a test that fails if the two drift apart.

The page gains a read-only "Model settings" screen, opened from Settings: a full-page overlay with a tab per model, the climate process diagram at the top, and every setting with its explanations. Settings are still changed by editing `config.ts`. The PDF and the script that drew it are removed.

No value changes: the Earth's temperature and wind figures come out exactly as before, and a run can still override the settings as it can today.
