# Winds

How the surface winds and sea-level pressure are worked out, which planet settings they read, how far to trust them, and what they get wrong. The maps behind the figures here are in the wind report; see [Development](development.md#commands).

## The model

The winds are worked out from the temperature, a month at a time: first a map of sea-level pressure built by rules, then the wind that follows from it. It is a sketch of the real circulation, meant to be right in kind, not a simulation of the air.

### Bands of pressure

Each month's mean temperature by latitude places a pattern of bands round the planet:

- **A low** along the hottest latitude, moved a little further from the equator than it, more near the equator and less away from it, to make up for the temperature's seasons being weaker than the Earth's. It is held short of a limit from the equator that follows the cells' width: about 70° on a planet turning as fast as the Earth or faster, moving smoothly to the pole on a slower one (see [The low at a steep tilt](#the-low-at-a-steep-tilt)).
- **Highs** at the edges of the tropical cell, the overturning that rises at the low, and beyond them lows and highs in turn, one band to each further cell, out to the poles.
- **The cells' width** follows how fast the planet turns and how much colder its poles are than its hottest latitude: 30° on the Earth, and in proportion to (24 hours ÷ the day length)^½ × (the contrast ÷ 41 K)^¼, at most 90°. Further cells of the same width fill the way to the poles, counted as a fraction, so the pattern changes smoothly with the day length.
- **Each side's bands** are as strong as its pole is cooler than the low, so a warm summer pole has weak bands and a cold winter pole strong ones, and a pole warmer than the low has none: no high stands over it. A summer side squeezed between the low and the equator widens to a whole cell as the low moves from 0.4 to 0.8 cell widths from the equator.
- **The outer bands** are kept at 0.3 of their strength, for the weak polar easterlies: those beyond the second cell from the low, or, on a planet spinning faster than the Earth, beyond 60° counted in cells of the width its spin alone sets (two of the Earth's cells, about 3.5 of its own at an 8-hour day), which in latitude is 60° at the Earth's contrast and from about 42° to 85° over the contrasts the model takes, whichever is further. The reach is counted in cells at the spin's width so that nothing changes at the Earth's spin, whatever the contrast. At the Earth's spin and slower that is every band beyond the second, so the Earth and the Earth tilted 60° keep weak polar and winter winds; at an 8-hour day the bands out to 60° from the low are in full, so its extra bands are as strong as the Earth's westerlies.

| Day length | Tropical cell | Cells from the equator to each pole |
|-|-|-|
| 8 hours | 17° | about 5.2 |
| 24 hours | 30° | 3 |
| 96 hours | 60° | 1.5 |
| 720 hours | 90° | 1 |

### Thermal highs and lows

A place colder than its latitude's mean carries higher pressure, and a hotter one lower:

- the temperature is brought down to sea level, by the temperature model's own cooling with height, and taken less the mean of its latitude;
- each degree colder gives 3 hPa more, a warmth counts less the warmer it is, at most 6 K, and over the sea the response is 0.3 of the land's;
- a cold counts in full up to 20 K below the latitude's mean and then less and less, at most 25 K, so a high on low land is at most 75 hPa above its latitude before smoothing, about the Earth's record of 1,084 hPa. The simulated Earth's coldest place against its latitude is 17.0 K below it (January, the basins north of Tibet), so the limit leaves the Earth's pressure exactly as it was; the Earth tilted 60° reaches 24.3 K, and its highest pressure is 1,054.3 hPa against 1,054.5 without the limit. A world made cold by a distant orbit gains nothing from it: the Earth twice as far from the Sun is frozen over and nearly as cold everywhere at a latitude, its coldest place only 1.4 K below its latitude and its highest pressure 1,020 hPa;
- over land the response fades with height, by a factor of e every 2,500 m;
- the result is smoothed over about 900 km, the size of the Siberian winter high.

The bands and the thermal part are then shifted together so that the globe's mean is 1,011 hPa: the model neither makes air nor loses it.

### The wind

The wind follows from the pressure by one balance everywhere: the push of the pressure gradient, the turning of the planet, and a friction that slows the wind in proportion to its speed. Away from the equator this gives a wind along the isobars, low pressure on the left in the north, crossing them a little towards the low; at the equator, where the planet's turning has no effect, it blows straight down the gradient.

- **Land** slows the wind five times as much as the sea.
- **High ground** turns the wind along its slopes rather than over them: the steeper the slope, the more of the wind across it is taken away. A sea cell beside a high coast has a slope too, so the wind there turns along the coast.

## The settings it reads

- **Day length**, as one full turn of the planet: it sets the turning in the wind's balance and the width of the cells.
- **Everything else only through the temperature.** The tilt, the star, the orbit and the greenhouse strength shape the winds only by the temperatures they give, and the season is read from the month's temperature alone, not from its name. With no tilt, every month's winds are the same.
- **The terrain and the sea level**, for land and sea, the height of the land and its slopes.

## The low at a steep tilt

On a planet with a steep tilt the hottest latitude can lie near the summer pole. The low is held short of a limit that follows the model's own cells' width:

| Day length | Cells' width | The low's limit |
|-|-|-|
| 8 hours | 17° | 70° |
| 24 hours | 30° | 70° |
| 48 hours | 42° | 77° |
| 96 hours | 60° | the pole |
| 720 hours | 90° | the pole |

The limit is 70° while the cells are no wider than the Earth's 30°, and moves smoothly to the pole as they widen to 60°, the width at a 4-day day; beyond that it is the pole. A low whose place lies within 60° of the equator, as the Earth's always does, is where it was placed; further out it nears the limit smoothly, so the bands make no step or corner as the hottest latitude or the day length moves. Beyond a low held short of a pole warmer than itself the bands are flat: no high is forced over the pole.

The reason is Guendelman and Kaspi, "An axisymmetric limit for the width of the Hadley cell on planets with large obliquity and long seasonality" (arXiv:1903.11656). It was read in its own text, the arXiv version 1, a manuscript submitted to Geophysical Research Letters; the journal version was not read. In their key points: "The Hadley cell ascending branch position in planets with strong seasonal variation of temperature is mainly bounded by the rotation rate." In section 2, the axisymmetric theory: "an Earth-like rotation rate or faster, limits the expansion of the circulation, such that even if φ0 is at the pole, and, for example, ∆H is increased (over a realistic range), it is unlikely for φ1 to reach the pole unless the rotation rate is slowed down", φ0 being the latitude of the hottest equilibrium temperature and φ1 that of the rising branch. In section 3.2, their simulations of ocean-covered planets tilted 90°, at the Earth's rotation rate and at a quarter of it: "shifting the maximal temperature poleward from a reference Earth-like state (Fig. 4a), does not result in a global pole-to-pole Hadley circulation for simulations with an Earth-like rotation rate (Fig. 4b), even when the temperature gradient is increased (Fig. 4c). However, slowing down the rotation rate, allows the ascending branch to reach the pole". A quarter of the Earth's rotation rate is the 4-day day. The paper gives no limit as a number: the 70°, and the way the limit moves with the cells' width, are this project's own choices.

On the Earth tilted 60°, January's low now lies at 69.9°S, held short of the hottest latitude near 86°S, where it lay at the pole before; the lowest zonal-mean pressure is at 65°S, and the pressure rises only 1.3 hPa from there to the pole, against a cap 17 hPa high before. July's low, near 58°N, is short of the limit's knee and unchanged; the North Pole, 18 K cooler than the low, carries a high as any cooler pole does.

## How far to trust it

The model's settings start from published or textbook figures where there are any, and the rest are guesses tuned by hand; they are not physical truth. Measured on the Earth at 64 cells per face edge, given the temperature model's own temperatures, against the observed winds 10 m above the surface and the observed sea-level pressure (simulated less observed, each place weighted by its area):

| Months | RMS of the wind's difference as vectors | Mean speed difference | Direction within 45° | Mean pressure difference | RMS pressure difference |
|-|-|-|-|-|-|
| January | 3.76 m/s | 0.00 m/s | 64.1% | −0.44 hPa | 7.18 hPa |
| July | 4.26 m/s | −0.20 m/s | 56.7% | −0.33 hPa | 6.84 hPa |
| The whole year | 3.81 m/s | −0.02 m/s | 60.6% | −0.38 hPa | 7.11 hPa |

The direction is judged only where the observed wind is at least 1 m/s, 85% of the surface over the year.

- **Day lengths from 6 to 96 hours** are trusted, both ends included. Outside them the bands are still worked out and the winds stay finite, at every day length from 3 to 720 hours, but the model was not tuned there and they are rough.
- **The Earth's own tuning.** The model was tuned against the observed Earth and against a few invented worlds (the Earth with an 8-hour and a 4-day day, with no tilt and tilted 60°, a generated world, an ocean world and a one-continent world), so that their winds look right in kind; the error figures were not tuned for.

## What it gets wrong

- **The July heat low sits over Siberia, not South Asia**, and the northern subtropical high runs unbroken over North Africa and Asia in July. Both are the simulated temperature's (see below).
- **The Asian winter high is too weak** and too far west: 1,032 hPa at 54°N 78°E over 35–70°N, 60–140°E, against an observed 1,036.5 hPa at 53°N 97°E.
- **The monsoons.** Over 5–20°N, 60–95°E the January north-east monsoon is about 2.5 times too strong ((−7.3, −6.3) m/s east and north against an observed (−2.8, −2.9)), and the July south-west monsoon about a third of the observed ((+2.0, +1.3) against (+6.9, +3.5)).
- **The North Pacific trades are weak:** −2 m/s against an observed −7.
- **The hemispheres' bands are alike:** the deep trough round Antarctica is missing.
- **Land winds cross the isobars at about 50°,** more than the observed.
- **Thermal winds are too strong at a 4-day day.**
- **The ocean world tilted 60° is almost calm:** its temperature is nearly flat from equator to pole, about 8 K from its warmest latitude to its coolest in every month, so its hottest latitude lies in mid-latitudes, its bands are weak, and its pressure varies by under 2 hPa by latitude.
- **The Earth tilted 60° has no tropical easterlies in July:** the low lies near 58°N, and the tropical cell's winter side, stretched across the equator from it, puts its subtropical high at about 3°N, so the deep tropics lie in the westerlies beyond it, at about +1.3 m/s in the zonal mean.
- **Two hot regions far apart** that are within 4 K of each other give a low over neither: on the Earth tilted 60°, October's low lies at 38.7°N while the North Pole is hottest, and November has no bands at all.
- **Near a hottest latitude of 8.5°** the bands shift fast, 0.7 hPa for 0.1° of latitude, though smoothly.
- **The cube's corners.** The grid's cells are skewed where three faces of the cube meet. The smoothing makes up for that, so it reaches as far at a corner as elsewhere, within 2%, but not wholly: a cold patch 500 km across centred exactly on a corner makes a high 3.4% weaker, and winds 6.1% weaker, than the same patch elsewhere at its latitude. Removing that would take about two and a half times as long to smooth. No mark shows on the Earth's maps.

### Which faults are the temperature's

`npm run tune:winds -- diagnose` runs the model on the Earth with the observed temperature, taken onto the cells as the page's comparison takes it, beside the run on the simulated temperature:

| | Simulated temperature | Observed temperature | Observed |
|-|-|-|-|
| Wind's difference as vectors, whole year | 3.81 m/s | 4.30 m/s | |
| Direction within 45°, whole year | 60.6% | 58.5% | |
| Pressure difference, whole year | 7.11 hPa | 7.31 hPa | |
| July: lowest pressure over 10–70°N, 40–140°E | 989.2 hPa at 64°N 86°E | 998.1 hPa at 29°N 47°E | 995.5 hPa at 32°N 71°E |
| July: mean pressure over 20–35°N, 15°W–120°E | 1,013.3 hPa | 1,002.9 hPa | 1,005.2 hPa |
| January: mean wind over 5–20°N, 60–95°E | (−7.3, −6.3) m/s | (−3.2, −2.9) m/s | (−2.8, −2.9) m/s |
| July: mean wind over 5–20°N, 60–95°E | (+2.0, +1.3) m/s | (+2.9, +3.6) m/s | (+6.9, +3.5) m/s |
| January: highest pressure over 35–70°N, 60–140°E | 1,032.0 hPa at 54°N 78°E | 1,030.3 hPa at 44°N 125°E | 1,036.5 hPa at 53°N 97°E |

- **The temperature's:** the July heat low over Siberia (with the observed temperature it moves to the Middle East, near the observed one over Pakistan), the unbroken northern subtropical high in July (it falls to below the observed), and the too strong winter monsoon (it comes to the observed).
- **The wind model's:** the weak summer monsoon, whose westerly part stays well under half the observed, and the weak Asian winter high, which stays weak and moves to Manchuria.
- **The whole-year figures are worse with the observed temperature.** The model was tuned by hand against the simulated temperature, and some of its settings make up for that temperature's faults, as the low's move further from the equator does for its weak seasons.

## What it leaves out

- **The air above the surface.** There is one level, the surface, and no upper winds or jet streams.
- **Weather.** The winds are monthly means of a steady balance: no storms, fronts or day-to-day change.
- **The air's own motion.** The wind does not carry itself along, so nothing is steered by the flow upstream, and there is no difference between the hemispheres other than what their land and temperature give.
- **The ocean.** There are no ocean currents, and the winds do not change the temperature.

## The pressure of finer worlds is worked out on the 64 grid

On a world of 128 or 256 cells per face edge, the pressure is worked out on the grid of 64: the world and its temperatures are averaged onto it, the bands, the thermal highs and lows and their smoothing are worked out there, and each month's pressure is carried back to the world's own grid. The wind is then worked out from that pressure on the world's own grid, each place with its own land or sea, height and slope.

| World | Time for a year of the Earth's winds (in Node) | Wholly on the world's own grid |
|-|-|-|
| 64 | 0.54 s | 0.54 s |
| 128 | 0.64 s | 2.8 s |
| 256 | 0.9 s | 17 s |

Nearly all the time is the smoothing of the thermal highs and lows, which reaches 900 km, far wider than a cell of the 64 grid, so little is lost. On the Earth, given the temperature's own temperatures, over every place and month of the year, against a solve wholly on the world's own grid:

| World | Wind, root-mean-square | Wind, worst place and month | Pressure, root-mean-square | Pressure, worst place and month |
|-|-|-|-|-|
| 128 | 0.05 m/s | 0.5 m/s | 0.05 hPa | 0.4 hPa |
| 256 | 0.07 m/s | 0.9 m/s | 0.06 hPa | 0.5 hPa |

- **The worst places** are beside coasts and the cube's edges, where the 64 grid's pressure has a slope least like the finer grid's; the worst of all on the Earth is near the Caspian Sea's eastern shore.
- **No mark of the 64 grid's cells** shows in the wind: from each place to the next it changes as much across the edges of the 64 grid's cells as within them, and as much as in a solve wholly on the world's own grid.

`npm run time:winds` measures both; see [Development](development.md#commands).

## The settings and the tuning script

The model's settings, its rough figures, are one set with values by default, each with where it comes from and whether it was tuned in its doc comment (`DEFAULT_WIND_SETTINGS` in `src/core/wind/rules.ts`). A run may change any of them, through `solveWinds`'s `settings` option; the page and its worker never do, and with none changed the run is the default one exactly.

`npm run tune:winds` runs the model many times with settings changed, on the wind report's nine cases, their temperatures solved once at the start (about ten seconds; a run of the Earth then takes about half a second). Run with nothing after it, it lists the settings and how to run it:

- **A sweep** of one setting over a range: one row for each value tried, with the Earth's three whole-year figures (the wind's difference as vectors, the share within 45° in direction, and the pressure difference).
- **A search** over several settings, or `tuned` for fourteen: the eleven tuned by hand against the observed Earth (the bands' strength, the thermal response and its smoothing distance, the hot window, both frictions, the low's move from the hottest latitude, the outer bands' share, the sea's share of the thermal response, the limit on warmth and the fade with height), and three moved by hand for other reasons: the Earth's contrast, set to the simulated Earth's own and not tuned; how the bands fade towards the poles, moved from 15° to 10° to keep more of the polar cell, not against the observed Earth; and the contrast a side's bands are scaled against, set against the Earth tilted 60°. It moves one setting at a time, each multiplied by 1.1 or 0.9 while that lowers the Earth's wind difference, then half the step, for three rounds by default, each step within its setting's bounds (a share above 0 and at most 1, a latitude or a cells' width at most 90°, every setting above 0); a step a bound stopped is printed. It never takes a step that worsens the direction share or the pressure difference from where it started, so it never ends worse than it started. It prints every case's band count and tropical edge, and the three checks against published studies, at the start and at the end.
- **The cases** for any set of settings, the same printout.
- **The diagnostic** above.

Each form takes `<setting>=<value>` arguments, which hold those settings throughout. The script proposes; it does not judge, and nothing it finds is applied by itself; the line it prints at a search's end, with the settings held and those moved in full, runs every case with the search's end exactly. A search over the tuned settings, for example, lowers the Earth's wind difference from 3.81 to 3.03 m/s mostly by weakening the thermal response and the bands, and with them the Earth's polar easterlies: its band count falls from three a hemisphere to two.

## How it was tuned

The model had thirteen rounds of hand tuning against the observed Earth and the invented worlds above. Of its 32 or so named settings, these were moved by hand: the equator-to-pole contrast it is scaled by, the bands' strength, the thermal response and its smoothing distance, how close to the hottest temperature a latitude must be to count towards the hottest latitude, both frictions, how the bands fade towards the poles, and the contrast a side's bands are scaled against (from 20 to 30 K). These were added while tuning: the sea's share of the thermal response, the limit on warmth, the fade with height, the outer cells' share, the low's move from the hottest latitude and how it fades, its move on to the pole (from 60° to 80°, since replaced by the limit at about 70° above), the widening of a squeezed summer side (from 0.4 to 0.8 cell widths), and the turning along steep ground scaled by the planet's turning and the friction together. Two of the rounds came from a look at the Earth tilted 60°: the cap of high pressure over the summer pole in January, and a narrow band at 66°N in July. Since then three rules were added that leave the Earth's winds exactly as they were: the limit on a cold place's high, the low's limit at a steep tilt, and the outer bands kept in full out to 60° from the low on a planet spinning faster than the Earth.
