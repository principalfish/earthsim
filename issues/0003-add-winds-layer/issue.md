# Add winds, air pressure and day length

earth_sim shows how hot and cold a planet is through its year, but not how its air moves. This adds the winds: which way and how hard the wind blows over the world in each month, with the air pressure behind it. Rain follows the winds and ocean currents are driven by them, so the later steps build on this one.

Winds and pressure are worked out from the monthly temperature and the planet settings. Two ways of doing so are prototyped first: rules that lay out the wind bands and add highs and lows over cold and warm land and sea, and a simplified simulated atmosphere. A report compares both with the real Earth's winds and on invented worlds (fast and slow spin, no tilt and strong tilt, generated continents, an ocean world, one continent), with solve times, and one is chosen from it.

A new Day length setting, from 3 hours to 30 days, sets how fast the planet spins, which decides how many wind bands there are and how wide. As with the other planet settings, a note says when the results are rough.

On the globe, a Winds switch draws arrows over the terrain or temperature colours, sized by speed, and later moving streaks. Pressure is a third colour layer beside Terrain and Temperature. Wind speed can be read in m/s, km/h or mph. On the Earth preset, both winds and pressure can be compared with the observed ones (NOAA's 20th Century Reanalysis v3), with error figures kept as a baseline.

Not included: winds carrying heat (temperature is unchanged by this step), upper-level winds and jet streams, rain, ocean currents, storms, tidally locked planets and backwards spin.
