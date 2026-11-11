# Add seasonal temperature layer and planet controls

earth_sim can shape a planet but not yet simulate one. This adds the first simulated layer: where the planet is hot and cold through its year. It is also the input every later layer needs, since winds follow temperature contrasts, rain follows winds, and ice follows temperature.

Temperature comes from a seasonal energy balance on the world's own grid: monthly steps through the year, repeated until they settle, with sunlight by latitude and season, land warming and cooling faster than ocean, heat spreading between neighbouring cells, cooling with height, and snow or ice brightening cold surfaces. It runs in its own Web Worker and recalculates automatically after edits.

A new Planet section sets axial tilt, the star's brightness, the orbit's distance and the strength of the greenhouse effect, and shows the sunlight received and the length of the year. The settings are saved with the world; existing worlds load with Earth's values.

On the globe, temperature replaces the height colours while relief and coastlines stay. You can step or play through the twelve months, switch to annual summaries (average, warmest month, coldest month, seasonal range), read a legend fitted to the world on screen, and see the value under the cursor. The page also shows the world's date, counted in years since it began.

When the world is the Earth preset, the layer can show the simulated temperature, the observed one, or the difference, with summary error figures. The observed data is NOAA's 20th Century Reanalysis v3 monthly climatology (CC0). This comparison is built so each later step can add its own observed layer. With no winds or ocean currents yet, the aim here is the right broad pattern, with the error recorded as a baseline for later steps to improve.

Not included: orbit eccentricity, rotation rate, a flat map view, winds, currents, rainfall and real ice sheets.
