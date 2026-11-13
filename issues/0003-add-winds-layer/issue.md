# Add winds, air pressure and day length

earth_sim shows how hot and cold a planet is through its year, but not how its air moves. This adds the winds: which way and how hard the wind blows over the world in each month, with the air pressure behind it. Rain follows the winds and ocean currents are driven by them, so the later steps build on this one.

Winds and pressure are worked out from the monthly temperature and the planet settings. Two ways of doing so are prototyped first: rules that lay out the wind bands and add highs and lows over cold and warm land and sea, and a simplified simulated atmosphere. A report compares both with the real Earth's winds and on invented worlds (fast and slow spin, no tilt and strong tilt, generated continents, an ocean world, one continent), with solve times, and one is chosen from it. (Revised 2026-11-13: after the rules prototype, the simulated atmosphere was deferred to a later roadmap step, since it was estimated at minutes per world against half a second; the rules model is the one built.)

A new Day length setting, from 3 hours to 30 days, sets how fast the planet spins, which decides how many wind bands there are and how wide. As with the other planet settings, a note says when the results are rough.

On the globe, a Winds switch draws arrows over the terrain or temperature colours, sized by speed, and later moving streaks. Pressure is a third colour layer beside Terrain and Temperature. Wind speed can be read in m/s, km/h or mph. On the Earth preset, both winds and pressure can be compared with the observed ones (NOAA's 20th Century Reanalysis v3), with error figures kept as a baseline.

Not included: winds carrying heat (temperature is unchanged by this step), upper-level winds and jet streams, rain, ocean currents, storms, tidally locked planets and backwards spin.

## Plan

_2026-11-13 · 5 of 16 pieces done (piece 6 dropped, piece 7 split in three) · now: piece 7a in progress_

- [x] **1/15 Observed winds and pressure data** · `69d3619`
  The real Earth's monthly winds and sea-level pressure as two small data files, with readers that take them onto a world's cells.
- [x] **2/15 Vector maths on the grid** · `b44f254`
  Gradient, divergence, curl, smoothing and east/north directions on the cubed-sphere grid.
- [x] **3/15 Day length on the world** · `0bdca21`
  A sixth planet setting, 3 hours to 30 days, saved with the world; older files load with 24 hours.
- [x] **4/15 Wind report with the observed Earth** · `faf7157`
  A script that writes a page of wind and pressure maps, starting with the real Earth in January and July.
- [x] **5/15 Prototype: rules plus a pressure map** · `993fa03`
  A rough wind model from pressure bands and thermal highs and lows, shown in the report on every case.
- [ ] ~~**6/15 Prototype: a simulated atmosphere, and the choice**~~ · dropped 2026-11-13: the simulated atmosphere is deferred to a later roadmap step (estimated at minutes per world against half a second for the rules model); the rules model is the one built
- [ ] **7a The wind model made real** (was part of 7; split 2026-11-13) · in progress
  The rules model as `solveWinds`: input checks, every world solved at 64 and refined, the annual mean, a timing script, the cube-corner smoothing fix and `docs/winds.md`.
- [ ] **8/15 Winds in the worker and the page's store** · not started
  Winds worked out in a worker after each temperature result, only while something shows them.
- [ ] **9/15 The Winds switch and arrows on the globe** · not started
  A Winds switch that draws arrows over the current colours, sized by speed, following the months.
- [ ] **7b The yardstick** (was part of 7; split 2026-11-13; moved after 9: winds on the globe first) · not started
  A ninth report case, an ocean world tilted 60°, and three checks against published studies of high tilt and of fast and slow spin.
- [ ] **7c The improvements** (was part of 7; split 2026-11-13) · not started
  Pressure bands that vary by longitude, and the prototype's known faults on the Earth, judged on all nine cases.
- [ ] **10/15 Day length in the Planet section** · not started
  The Day length slider, with a note when the winds are rough.
- [ ] **11/15 Wind under the pointer, and the unit option** · not started
  Wind speed and direction in the pointer strip, in m/s, km/h or mph.
- [ ] **12/15 Scalar layers made general** · not started
  A refactor so a second colour layer can reuse the legend, pointer strip and Earth comparison.
- [ ] **13/15 The Pressure layer** · not started
  Sea-level pressure as a third colour layer, with its legend and pointer readout.
- [ ] **14/15 Earth comparison and baseline for winds and pressure** · not started
  Observed winds and pressure on an untouched Earth, with error figures and a guarded baseline.
- [ ] **15/15 Moving streaks** · not started
  Animated streaks flowing with the wind, as a choice beside arrows.
