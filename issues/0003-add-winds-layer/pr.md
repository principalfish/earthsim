# Add winds, air pressure and day length

earth_sim showed how hot and cold a planet is through its year, but not how its air moves. This adds the surface winds and the sea-level pressure behind them, month by month, worked out from the temperature and the planet settings, and a new Day length setting. Rain, ocean currents and the rest of the climate build on this.

## The model

The winds come from rules, not a simulated atmosphere. Pressure bands are laid out from the warmest latitude, with the cells' widths set by the day length and the equator-to-pole contrast; thermal highs and lows are added over cold and warm land and sea; and the wind is a balance of the pressure gradient, the planet's turning and friction. The bands are placed by longitude within a window, so the low follows hot land in summer. The pressure is solved on the 64-cell grid and refined; the winds are worked out on the world's own grid, in a third Web Worker. A simulated atmosphere was weighed and deferred to the end of the roadmap, as too slow for now.

The model has 36 settings, each overridable for a run, with `npm run tune:winds` to try them. Their values and what raising or lowering each one does are in `docs/climate-process.pdf`, after a diagram of how the climate is to be worked out once the rest is built (`scripts/docs/climate-process.py` draws it).

## On the page

- **Winds** (View) draws the winds over any layer, as arrows or as moving streaks, sized by speed; the choice of arrows or streaks and the speed unit (m/s, km/h, mph) are remembered.
- **Pressure** is a third colour layer beside Terrain and Temperature, with its legend and pointer readout. The pointer readout also gives the wind's speed and direction.
- **Day length** (Planet), from 3 hours to 30 days, sets how many wind bands there are and how wide. A note says when the winds are rough: a day under 6 hours or over 4 days, or a tilt above 54°.
- **The Earth comparison** now covers pressure (Simulated, Observed and Difference, ±20 hPa) and winds (Simulated or Observed arrows, with "Off by X m/s on average" and "Direction right on Y% of the map" in the key), against NOAA's 20th Century Reanalysis v3.

The temperature is unchanged: winds don't carry heat yet, and the temperature baseline was unchanged at every piece.

## How close to the Earth

On the Earth at 64, over the whole year: the wind is off by 3.82 m/s RMS as vectors, its direction is within 45° on 60.9% of the map, and the pressure is off by 7.08 hPa RMS. These are kept in `src/core/baseline/earthWinds.json`, with a test that fails if a change makes them worse (`npm run baseline:winds` rewrites it). They guard; they are not a target. The known faults (the July heat low over Siberia rather than South Asia, the monsoons, a weak Asian winter high, weak North Pacific trades, too strong winds on slow spinners, and some faults at a 60° tilt) are recorded in `docs/winds.md` and deliberately not tuned yet, since heat carried by winds, ocean currents and ice will each change the temperature the winds come from. A diagnostic run on the observed temperature shows which faults are the temperature's and which the wind model's.

Invented worlds were checked in kind with a report (`npm run report:winds`): fast and slow spin, no tilt and a 60° tilt, generated continents, an ocean world and one continent. The cell widths and how they change with spin were compared with published studies (Kaspi and Showman 2015, Held and Hou 1980, Way et al. 2018, Ferreira et al. 2014, Guendelman and Kaspi, Lobo and Bordoni 2020); for Lobo and Bordoni only the abstract was read, and Kaspi and Showman's figures were read off a plot.

## To check by hand

On a fresh Earth: tick Winds and switch between Arrows and Streaks over each layer, with the year playing and the globe zoomed; choose Pressure and its Observed and Difference views; choose Observed under Winds shown and read the key; move the Day length slider to each end and watch the note; and create a new world with a layer showing, which should read "Calculating" at once.

## Review

Every piece had a correctness, security and coverage review with a verifier and a light re-check, recorded in the planning record. The self review of the whole branch found four small things. Three were fixed (`34cfc28`): turning on Winds or Pressure showed "Not calculated yet" for 0.4 s before "Calculating", and the same wait was found and removed for turning on Temperature and for a new world; a README line; and a pressure average the arrows never used. One was left: a day length changed and changed back within 0.4 s during a solve re-runs the same solve (about a second at 256), with the right result in the end. Changed-line coverage is 97%; the uncovered lines are mostly the WebGL renderer, which is checked in a browser.

The commits are numbered out of 15 up to piece 15, though a 16th piece (the diagram) was added later.

Closes #5
