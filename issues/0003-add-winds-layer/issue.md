# Add winds, air pressure and day length

earth_sim shows how hot and cold a planet is through its year, but not how its air moves. This adds the winds: which way and how hard the wind blows over the world in each month, with the air pressure behind it. Rain follows the winds and ocean currents are driven by them, so the later steps build on this one.

Winds and pressure are worked out from the monthly temperature and the planet settings. Two ways of doing so are prototyped first: rules that lay out the wind bands and add highs and lows over cold and warm land and sea, and a simplified simulated atmosphere. A report compares both with the real Earth's winds and on invented worlds (fast and slow spin, no tilt and strong tilt, generated continents, an ocean world, one continent), with solve times, and one is chosen from it.

A new Day length setting, from 3 hours to 30 days, sets how fast the planet spins, which decides how many wind bands there are and how wide. As with the other planet settings, a note says when the results are rough.

On the globe, a Winds switch draws arrows over the terrain or temperature colours, sized by speed, and later moving streaks. Pressure is a third colour layer beside Terrain and Temperature. Wind speed can be read in m/s, km/h or mph. On the Earth preset, both winds and pressure can be compared with the observed ones (NOAA's 20th Century Reanalysis v3), with error figures kept as a baseline.

Not included: winds carrying heat (temperature is unchanged by this step), upper-level winds and jet streams, rain, ocean currents, storms, tidally locked planets and backwards spin.

## Plan

_2026-11-13 · 1 of 15 pieces done · now: waiting on a decision (start piece 2)_

- [x] **1/15 Observed winds and pressure data** · `69d3619`
  The real Earth's monthly winds and sea-level pressure as two small data files, with readers that take them onto a world's cells.
- [ ] **2/15 Vector maths on the grid** · not started
  Gradient, divergence, curl, smoothing and east/north directions on the cubed-sphere grid.
- [ ] **3/15 Day length on the world** · not started
  A sixth planet setting, 3 hours to 30 days, saved with the world; older files load with 24 hours.
- [ ] **4/15 Wind report with the observed Earth** · not started
  A script that writes a page of wind and pressure maps, starting with the real Earth in January and July.
- [ ] **5/15 Prototype: rules plus a pressure map** · not started
  A rough wind model from pressure bands and thermal highs and lows, shown in the report on every case.
- [ ] **6/15 Prototype: a simulated atmosphere, and the choice** · not started
  A rough simulated atmosphere beside it in the report; then the work stops for the choice of model.
- [ ] **7/15 The chosen wind model in the core** · not started
  The chosen model finished, tuned against the Earth and documented.
- [ ] **8/15 Winds in the worker and the page's store** · not started
  Winds worked out in a worker after each temperature result, only while something shows them.
- [ ] **9/15 The Winds switch and arrows on the globe** · not started
  A Winds switch that draws arrows over the current colours, sized by speed, following the months.
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
