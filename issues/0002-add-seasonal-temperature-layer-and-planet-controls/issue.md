# Add seasonal temperature layer and planet controls

earth_sim can shape a planet but not yet simulate one. This adds the first simulated layer: where the planet is hot and cold through its year. It is also the input every later layer needs, since winds follow temperature contrasts, rain follows winds, and ice follows temperature.

Temperature comes from a seasonal energy balance on the world's own grid: monthly steps through the year, repeated until they settle, with sunlight by latitude and season, land warming and cooling faster than ocean, heat spreading between neighbouring cells, cooling with height, and snow or ice brightening cold surfaces. It runs in its own Web Worker and recalculates automatically after edits.

A new Planet section sets axial tilt, the star's brightness and mass, the orbit's distance and the strength of the greenhouse effect, and shows the sunlight received and the length of the year. Year length matters: a longer year gives the land and sea more time to warm and cool, so its seasons are stronger. The settings are saved with the world; existing worlds load with Earth's values.

On the globe, temperature replaces the height colours while relief and coastlines stay. You can step or play through the twelve months, switch to annual summaries (average, warmest month, coldest month, seasonal range), read a legend fitted to the world on screen, and see the value under the cursor. The page also shows the world's date, counted in years since it began. The star is drawn in the scene, sized and coloured by its settings and moving north and south with the months, and a Sunlight switch lights the globe from it with a day and a night side.

When the world is the Earth preset, the layer can show the simulated temperature, the observed one, or the difference, with summary error figures. The observed data is NOAA's 20th Century Reanalysis v3 monthly climatology (CC0). This comparison is built so each later step can add its own observed layer. With no winds or ocean currents yet, the aim here is the right broad pattern, with the error recorded as a baseline for later steps to improve.

Not included: orbit eccentricity, rotation rate, a flat map view, winds, currents, rainfall and real ice sheets.

## Plan

_2026-11-12 · 7 of 13 pieces done · now: waiting on review of piece 8_

- [x] **1/13 Planet settings and date on the world** · `8390675`
  Worlds carry axial tilt, star brightness, star mass, orbit distance, greenhouse strength and a date, saved and loaded, with old files still loading.
- [x] **2/13 Sunlight by latitude and season** · `0c19852`
  Exact daily and monthly sunlight for any tilt from 0 to 90 degrees.
- [x] **3/13 Observed Earth temperature data** · `4a1e290`
  NOAA's 20th Century Reanalysis v3 monthly climatology, processed into a small committed file and regridded to the world's cells.
- [x] **4/13 Temperature solver, timing run and first error figures** · `1445e44`
  The seasonal energy-balance solver, a table of how long it takes at each resolution, and how far the simulated Earth is from the observed one.
- [x] **5/13 Temperature worker and recalculation** · `ff500c7`
  Temperature calculated in its own Web Worker and recalculated automatically after edits.
- [x] **6/13 Temperature layer on the globe** · `533ef95`
  The globe coloured by temperature with relief and coastlines kept, a Terrain or Temperature picker, and a legend.
- [x] **7/13 Month slider, annual summaries and date** · `fd8e21f`
  Step or play through the twelve months, view annual summaries, and see the world's date. After its manual review: a seasonal-range ramp that shows small ranges, and a temperature scale fitted to the middle 99% of the surface.
- [ ] **8/13 Re-solves that depend only on the world** · waiting on you · added 2026-11-12: the manual review found a frozen climate carried over after a sea-level change
  A re-solve after a sea-level or planet change starts fresh, so the result no longer depends on the order of edits.
- [ ] **9/13 Solver speed-ups** · not started · added 2026-11-12: the user asked for the measured speed-ups to be built
  Worlds above 64 solve one grid coarser with height cooling at full resolution, plus smaller solver fixes; about five times faster at 256.
- [ ] **10/13 Planet panel** (was 8) · not started
  Sliders for tilt, star brightness, star mass, orbit and greenhouse strength, with sunlight received and year length shown.
- [ ] **11/13 Value under the cursor** (was 9) · not started
  A readout of position, elevation and temperature at the point under the pointer.
- [ ] **12/13 Earth comparison view and error baseline** (was 10) · not started
  On the Earth preset: simulated, observed or difference, with error figures and a committed baseline.
- [ ] **13/13 The sun in the scene** (was 11) · not started · added 2026-11-11: the user asked for the sun to be drawn
  The star drawn in the scene, following the star settings and the months, with a Sunlight toggle that lights the globe from it.
