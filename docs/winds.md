# Winds

How the surface winds and sea-level pressure are worked out, which planet settings they read, how far to trust them, and what they get wrong. The maps behind the figures here are in the wind report; see [Development](development.md#commands).

## The model

The winds are worked out from the temperature, a month at a time: first a map of sea-level pressure built by rules, then the wind that follows from it. It is a sketch of the real circulation, meant to be right in kind, not a simulation of the air.

They are worked out again, in a worker of their own, as soon as each new temperature arrives and a moment after a change of the day length, whatever is on screen, and not while the [Pause button](user-guide.md#the-pause-button) is pressed.

### Bands of pressure

Each month's mean temperature by latitude places a pattern of bands round the planet:

- **A low** along the hottest latitude, moved a little further from the equator than it, more near the equator and less away from it, to make up for the temperature's seasons being weaker than the Earth's. It is held short of a limit from the equator that follows the cells' width: about 70° on a planet turning as fast as the Earth or faster, moving smoothly to the pole on a slower one (see [The low at a steep tilt](#the-low-at-a-steep-tilt)).
- **Highs** at the edges of the tropical cell, the overturning that rises at the low, and beyond them lows and highs in turn, one band to each further cell, out to the poles.
- **The cells' width** follows how fast the planet turns and how much colder its poles are than its hottest latitude: 30° on the Earth, and in proportion to (the day length ÷ 24 hours)^½ × (the contrast ÷ 41 K)^¼, at most 90°. Further cells of the same width fill the way to the poles, counted as a fraction, so the pattern changes smoothly with the day length.
- **Each side's bands** are as strong as its pole is cooler than the low, so a warm summer pole has weak bands and a cold winter pole strong ones, and a pole warmer than the low has none: no high stands over it. A summer side squeezed between the low and the equator widens to a whole cell as the low moves from 0.4 to 0.8 cell widths from the equator.
- **The outer bands** are kept at 0.3 of their strength, for the weak polar easterlies: those beyond the second cell from the low, or, on a planet spinning faster than the Earth, beyond 60° counted in cells of the width its spin alone sets (two of the Earth's cells, about 3.5 of its own at an 8-hour day), which in latitude is 60° at the Earth's contrast and from about 42° to 85° over the contrasts the model takes, whichever is further. The reach is counted in cells at the spin's width so that nothing changes at the Earth's spin, whatever the contrast. At the Earth's spin and slower that is every band beyond the second, so the Earth and the Earth tilted 60° keep weak polar and winter winds; at an 8-hour day the bands out to 60° from the low are in full, so its extra bands are as strong as the Earth's westerlies.

| Day length | Tropical cell | Cells from the equator to each pole |
|-|-|-|
| 8 hours | 17° | about 5.2 |
| 24 hours | 30° | 3 |
| 96 hours | 60° | 1.5 |
| 720 hours | 90° | 1 |

### Bands by longitude

Placed from the temperature averaged round the whole globe, the bands would move with the largest continent's seasons everywhere: on the one-continent world (land from 15°S to 55°N, about 143° of longitude across) the subtropical highs over the open ocean on the far side moved 18° and 23° of latitude between January and July, where the observed Earth's oceanic highs move 5° to 10°. So in the tropics and subtropics the low is placed from the temperature near each longitude instead:

- **Only where the low lies varies,** and with it the tropical cell's edges, which follow the low. The cells' width, each side's strength, the low's limit and the outer bands are worked out from the whole globe's temperature by latitude, as above, and so are the thermal highs and lows.
- **The window** is 180° of longitude across: whole over its middle 90° and tapering, as the square of a cosine, to nothing at its ends. Each longitude's temperature by latitude is the whole latitude's, plus the mean within the window of each place's difference from it; the low there is placed from that as above. 120° was tried too: it moves the open ocean's bands as little and follows the land more closely, but it weakens the Earth tilted 60°'s annual mean winds in the north to under 0.5 m/s at every latitude, so its one band there is no longer counted. 180° keeps every case's bands.
- **Between longitudes** the low is placed every 10°, and the bands' pressure between them is taken by a cubic through the four nearest, round the globe, so the pressure and its change with longitude have no step and no corner anywhere, the meridian of 180° included.
- **Towards the poles** the local bands blend into the one pattern round the globe: in full up to 40° from the equator, falling smoothly to none at 70°. At a pole every longitude meets, so the pressure there must be one value, whichever side it is approached from. Each pattern is 0 at its own low, but patterns with lows at different latitudes are mixed between longitudes and in the blend, so the low is at nearly the same pressure everywhere, within about 0.03 hPa on the one-continent world and the Earth; the globe's mean is still held at the reference afterwards. The blend must end beyond where it starts, or the pressure would step there; the model refuses settings that would make it so.
- **An ocean world stays zonal.** A temperature that depends on the latitude alone gives every longitude the same low, to within 4×10⁻⁴°, and the same bands, to within 2.1×10⁻⁴ hPa, on the 64 grid, for hottest latitudes of 5°N, 8°S and 15°N; with the hottest latitude moving 10° either side of the equator through the year the winds differ from those of one pattern round the globe by at most 6×10⁻⁴ m/s. That takes care: the grid's cells do not lie evenly in latitude within a band, so each band's mean is taken at its cells' mean latitude, not its middle, which would have put the lows 0.03° apart and the winds up to 0.15 m/s. The ocean world case, whose simulated temperature is itself not quite zonal on the grid, has winds within 0.093 m/s of one pattern's in every place and month, and its eastward wind lies at most 1.15 m/s from its 2° band's mean, against 1.18 m/s with one pattern.

The window's width and taper, and the blend's latitudes, are this project's choices, not tuned against the observed Earth. On the one-continent world the open ocean's bands, in the mean pressure by latitude over the longitudes more than 60° from the land, now move:

| | Southern high | Band low | Northern high |
|-|-|-|-|
| January | 32.2°S | 2.3°S | 24.6°N |
| July | 26.8°S | 1.1°S | 31.6°N |
| July less January, now | 5.4° | 1.2° | 7.0° |
| July less January, one pattern round the globe | 18.2° | 29.7° | 22.8° |

The band low over that ocean hardly moves: the ocean's own temperature peaks within about 3° of the equator in both months, and the ocean north of the equator is cooler than its latitude's mean in July, the land being hotter, so its thermal part holds the low south. `npm run tune:winds -- cases` prints this table for any settings; `localBandsShare=0` gives the one pattern round the globe exactly, the model as it was before.

### Thermal highs and lows

A place colder than its latitude's mean carries higher pressure, and a hotter one lower:

- the temperature is brought down to sea level, by the temperature model's own cooling with height, and taken less the mean of its latitude;
- each degree colder gives 0.7 hPa more, a warmth counts less the warmer it is, at most 6 K, and over the sea the response is 0.3 of the land's;
- a cold counts in full up to 20 K below the latitude's mean and then less and less, at most 25 K, so a high on low land is at most 17.5 hPa above its latitude before smoothing (75 hPa at the 3 hPa a kelvin the model was tuned at, about the Earth's record of 1,084 hPa; the figures in the rest of this item are at 3). The simulated Earth's coldest place against its latitude is 17.0 K below it (January, the basins north of Tibet), so the limit leaves the Earth's pressure exactly as it was; the Earth tilted 60° reaches 24.3 K, and its highest pressure is 1,054.3 hPa against 1,054.5 without the limit. A world made cold by a distant orbit gains nothing from it: the Earth twice as far from the Sun is frozen over and nearly as cold everywhere at a latitude, its coldest place only 1.4 K below its latitude and its highest pressure 1,020 hPa;
- over land the response fades with height, by a factor of e every 2,500 m;
- the result is smoothed over about 900 km, the size of the Siberian winter high.

The bands and the thermal part are then shifted together so that the globe's mean is 1,011 hPa: the model neither makes air nor loses it.

The **Pressure** layer shows this sea-level pressure on the globe, for the month on screen or as the year's mean, on a scale centred on the globe's mean over the year; see [Pressure](user-guide.md#pressure).

### The wind

The wind follows from the pressure by one balance everywhere: the push of the pressure gradient, the turning of the planet, and a friction that slows the wind in proportion to its speed. Away from the equator this gives a wind along the isobars, low pressure on the left in the north, crossing them a little towards the low; at the equator, where the planet's turning has no effect, it blows straight down the gradient.

- **Land** slows the wind five times as much as the sea.
- **High ground** turns the wind along its slopes rather than over them: the steeper the slope, the more of the wind across it is taken away. A sea cell beside a high coast has a slope too, so the wind there turns along the coast.

### The flowing part

The surface wind runs in towards the lows, which a model of the surface alone cannot follow: what flows in rises and is gone. Heat carried by the wind as it stands would pile up where it converges and be made from nothing. So heat is carried, in the climate loop (see [Temperature](temperature.md#the-climate-loop)), by the wind's **flowing part**, `flowingPart` in `src/core/wind/flowing.ts`: what the wind carries across every edge between cells, with the converging and spreading part taken out so that every cell has as much going in as coming out, to a ten-millionth of the typical flow across an edge. The part taken out is the flow down the gradient of a potential, found with the same solver as the temperature's heat exchange. It is returned as the flows across the edges, in square metres a second, not as a wind at the cell centres: a wind at the centres cannot be made to have no net flow in or out of every cell.

For the temperature solve, `flowingPartForSolve` adds the flows of a world of 128 or 256 up onto the 64 grid, takes the converging part out there (a month costs 60 ms whatever the world's size), and for a world of 256, which is solved on 128, shares the result back up.

On the Earth at 64, July's flowing part keeps about two thirds of the surface wind's flow (by squared size) in the same pattern, and a month takes about 60 ms. The grid's skewed cells, at the cube's corners above all, leave about an eighth of a purely converging wind's flow in place, going round and not in; that part carries heat but makes none.

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

On the Earth tilted 60°, at the 3 hPa a kelvin the model was tuned at, January's low now lies at 69.9°S, held short of the hottest latitude near 86°S, where it lay at the pole before; the lowest zonal-mean pressure is at 65°S, and the pressure rises only 1.3 hPa from there to the pole, against a cap 17 hPa high before. July's low, near 58°N, is short of the limit's knee and unchanged; the North Pole, 18 K cooler than the low, carries a high as any cooler pole does.

## How far to trust it

The model's settings start from published or textbook figures where there are any, and the rest are guesses tuned by hand; they are not physical truth. Measured on the Earth at 64 cells per face edge, given the winds of the climate loop (the temperature and the winds solved together, see [Temperature](temperature.md#the-climate-loop)), against the observed winds 10 m above the surface and the observed sea-level pressure (simulated less observed, each place weighted by its area):

| Months | RMS of the wind's difference as vectors | Direction within 45° | RMS pressure difference |
|-|-|-|-|
| January | 3.37 m/s | 62.8% | 7.71 hPa |
| July | 4.08 m/s | 58.6% | 6.90 hPa |
| The whole year | 3.61 m/s | 61.2% | 7.19 hPa |

The thermal response, `thermalHpaPerK`, is at its physical 0.7 hPa a kelvin. It was tuned by hand to 3 before the winds carried heat, and put back when they did: at 3 the loop's feedback did not settle (see [Temperature](temperature.md#the-climate-loop)). Against the observed Earth the two are close, 0.7 better in the wind's difference as vectors (3.61 against 3.78 m/s for the year) and the direction share, 3 slightly better in the pressure (7.01 against 7.19 hPa); the Siberian high and the South Asian low come out weaker at 0.7. The figures before the loop, at 3 and given the temperature without winds, were 3.82 m/s, 60.9% and 7.08 hPa for the year.

The direction is judged only where the observed wind is at least 1 m/s, 85% of the surface over the year. The mean speed and mean pressure differences are not kept in the baseline.

The page shows the same comparison on an untouched Earth, at the world's own resolution: Pressure's Observed and Difference, with the mean and RMS pressure difference under the legend in the pressure's unit from Settings, hPa or inHg, and the observed winds, fetched by choosing Observed or Difference with Winds on, drawn in the chosen style, arrows or streaks, to set beside the simulated; the page gives no wind figures of its own; see the [user guide](user-guide.md#simulated-or-observed-winds).

- **Day lengths from 6 to 96 hours** are trusted, both ends included. Outside them the bands are still worked out and the winds stay finite, at every day length from 3 to 720 hours, but the model was not tuned there and they are rough.
- **Tilts up to 54°** are trusted, 54° included; above it the winds are rough. 54° is a judgement, not a measurement: about the tilt above which the poles get more sunlight over the year than the equator. Several of the faults under [What it gets wrong](#what-it-gets-wrong) are the worlds tilted 60°.
- **The Planet section shows a note** when the winds are rough, naming each reason that applies: a day shorter than 6 hours, a day longer than 4 days, or a tilt above 54°.
- **The Earth's own tuning.** The model was tuned against the observed Earth and against a few invented worlds (the Earth with an 8-hour and a 4-day day, with no tilt and tilted 60°, a generated world, an ocean world and a one-continent world), so that their winds look right in kind; the error figures were not tuned for.

### The Earth winds baseline

`src/core/wind/baseline/earthWinds.json` records the figures above, so that a change to the model cannot make them worse unnoticed.

- **What it holds:** for the Earth at 64 cells per face edge, given the winds of the climate loop, for the whole year, January and July: the RMS of the wind's difference as vectors (m/s), the share within 45° in direction (as a percentage) and the RMS pressure difference (hPa).
- **The test:** a test solves that Earth and fails, naming each figure, if any is worse than the file's by more than its tolerance, or is not a number:

  | Figure | Worse when | Tolerance |
  |-|-|-|
  | RMS of the wind's difference as vectors | Higher | 0.02 m/s |
  | Direction within 45° | Lower | 0.2 percentage points |
  | RMS pressure difference | Higher | 0.05 hPa |

  A figure that has improved passes.
- **It guards, and is not a target.** It keeps the model from getting worse; it is not a figure to tune towards. Tuning the model against the Earth waits for a later step, once the rest of the loop the winds belong to is built (see [The Earth's known faults](#the-earths-known-faults)).
- **The winds follow the temperature,** so a change to the temperature model moves this baseline as well as the temperature's own ([Development](development.md#the-earth-temperature-baseline)): run both `npm run baseline:temperature` and `npm run baseline:winds`.
- **When a change is meant to move the figures:** run `npm run baseline:winds`, which rewrites the file and prints what moved, and commit the file with the change.

## What it gets wrong

The figures here, up to [The Earth's known faults](#the-earths-known-faults), were measured before the temperature depended on the winds, at the thermal response of 3 hPa a kelvin the model was tuned at and given the temperature without winds, which is what `npm run tune:winds` still works from. The model's default is now the physical 0.7 and the baseline's temperature is the climate loop's, so they are not the shipped model's figures; they stand as the record of the faults, to be measured again when the winds are tuned next.

- **The July heat low sits over Siberia, not South Asia**, and the northern subtropical high runs unbroken over North Africa and Asia in July. Both are the simulated temperature's (see below).
- **The Asian winter high is too weak** and too far west: 1,032 hPa at 55°N 77°E over 35–70°N, 60–140°E, against an observed 1,036.5 hPa at 53°N 97°E.
- **The monsoons.** Over 5–20°N, 60–95°E the January north-east monsoon is more than twice too strong ((−7.0, −6.1) m/s east and north against an observed (−2.8, −2.9)), and the July south-west monsoon's eastward part about two thirds of the observed ((+4.5, +3.2) against (+6.9, +3.5)). With one pattern of bands round the globe it was (+2.0, +1.3): the bands placed by longitude move the low further north over hot South Asia in July.
- **The North Pacific trades are weak:** −2 m/s against an observed −7.
- **The hemispheres' bands are alike:** the deep trough round Antarctica is missing.
- **Land winds cross the isobars at about 50°,** more than the observed.
- **Thermal winds are too strong at a 4-day day.**
- **Winds on slow spinners are too strong,** because the bands' pressure strength is fixed whatever the spin, while a slower turn balances a pressure gradient with a faster wind: on the Earth the fastest wind reaches 31 m/s at a 4-day day and 42 m/s at 30 days.
- **The ocean world tilted 60° is almost calm:** its temperature is nearly flat from equator to pole, about 8 K from its warmest latitude to its coolest in every month, so its hottest latitude lies in mid-latitudes, its bands are weak, and its pressure varies by under 2 hPa by latitude.
- **The Earth tilted 60° has no tropical easterlies in July:** the low lies near 58°N, and the tropical cell's winter side, stretched across the equator from it, puts its subtropical high at about 3°N, so the deep tropics lie in the westerlies beyond it, at about +1.3 m/s in the zonal mean.
- **Two hot regions far apart** that are within 4 K of each other give a low over neither: on the Earth tilted 60°, October's low lies at 38.7°N while the North Pole is hottest, and November has no bands at all.
- **Near a hottest latitude of 8.5°** the bands shift fast, 0.7 hPa for 0.1° of latitude, though smoothly.
- **The cube's corners.** The grid's cells are skewed where three faces of the cube meet. The smoothing makes up for that, so it reaches as far at a corner as elsewhere, within 2%, but not wholly: a cold patch 500 km across centred exactly on a corner makes a high 3.4% weaker, and winds 6.1% weaker, than the same patch elsewhere at its latitude. Removing that would take about two and a half times as long to smooth. No mark shows on the Earth's maps.

### Which faults are the temperature's

`npm run tune:winds -- diagnose` runs the model on the Earth with the observed temperature, taken onto the cells as the page's comparison takes it, beside the run on the simulated temperature. Like the rest of the tuning script it works from the temperature without winds; the figures below are at 3 hPa a kelvin, before the loop:

| | Simulated temperature | Observed temperature | Observed |
|-|-|-|-|
| Wind's difference as vectors, whole year | 3.82 m/s | 4.31 m/s | |
| Direction within 45°, whole year | 60.9% | 59.7% | |
| Pressure difference, whole year | 7.08 hPa | 7.17 hPa | |
| July: lowest pressure over 10–70°N, 40–140°E | 989.4 hPa at 64°N 89°E | 998.3 hPa at 31°N 49°E | 995.5 hPa at 32°N 71°E |
| July: mean pressure over 20–35°N, 15°W–120°E | 1,011.1 hPa | 1,003.1 hPa | 1,005.2 hPa |
| January: mean wind over 5–20°N, 60–95°E | (−7.0, −6.1) m/s | (−3.0, −2.3) m/s | (−2.8, −2.9) m/s |
| July: mean wind over 5–20°N, 60–95°E | (+4.5, +3.2) m/s | (+2.9, +3.6) m/s | (+6.9, +3.5) m/s |
| January: highest pressure over 35–70°N, 60–140°E | 1,032.1 hPa at 55°N 77°E | 1,029.5 hPa at 46°N 125°E | 1,036.5 hPa at 53°N 97°E |

### The Earth's known faults

These are recorded, not tuned. The model is not fitted any closer to the observed Earth until the rest of the loop it belongs to is built (ocean currents and ice), since each of those will change the temperature the winds are worked out from, and a fit made now would have to be made again. The diagnostic above reads them:

| Fault | Whose | What the observed temperature does |
|-|-|-|
| The July heat low over Siberia, not South Asia | The simulated temperature's | It moves to the Middle East, near the observed low over Pakistan |
| The unbroken northern subtropical high in July | The simulated temperature's | It falls to below the observed |
| The too strong winter (north-east) monsoon | The simulated temperature's | It comes to the observed |
| The weak eastward part of the summer (south-west) monsoon | The wind model's own | It stays well under half the observed, +2.9 against +6.9 m/s |
| The weak Asian winter high | The wind model's own | It stays weak, and moves to Manchuria |

- **The summer monsoon** with the simulated temperature rose from (+2.0, +1.3) to (+4.5, +3.2) m/s when the bands were placed by longitude, and is now stronger than with the observed temperature; with the observed temperature it is (+2.9, +3.6) m/s either way, its eastward part well under half the observed, so that part is still the wind model's fault.
- **The whole-year figures are worse with the observed temperature.** The model was tuned by hand against the simulated temperature, and some of its settings make up for that temperature's faults, as the low's move further from the equator does for its weak seasons.

## What it leaves out

- **The air above the surface.** There is one level, the surface, and no upper winds or jet streams.
- **Weather.** The winds are monthly means of a steady balance: no storms, fronts or day-to-day change.
- **The air's own motion.** The wind does not carry itself along, so nothing is steered by the flow upstream, and there is no difference between the hemispheres other than what their land and temperature give.
- **The ocean.** There are no ocean currents. On their own the winds do not change the temperature; the climate loop feeds them back, though the page does not use it yet.

## The pressure of finer worlds is worked out on the 64 grid

On a world of 128 or 256 cells per face edge, the pressure is worked out on the grid of 64: the world and its temperatures are averaged onto it, the bands, the thermal highs and lows and their smoothing are worked out there, and each month's pressure is carried back to the world's own grid. The wind is then worked out from that pressure on the world's own grid, each place with its own land or sea, height and slope.

| World | Time for a year of the Earth's winds (in Node) | Wholly on the world's own grid |
|-|-|-|
| 64 | 0.58 s | 0.58 s |
| 128 | 0.65 s | 3.1 s |
| 256 | 0.95 s | 16 s |

Nearly all the time is the smoothing of the thermal highs and lows; placing the bands by longitude adds about 0.04 s a year at 64. The smoothing reaches 900 km, far wider than a cell of the 64 grid, so little is lost. On the Earth, given the temperature's own temperatures, over every place and month of the year, against a solve wholly on the world's own grid:

| World | Wind, root-mean-square | Wind, worst place and month | Pressure, root-mean-square | Pressure, worst place and month |
|-|-|-|-|-|
| 128 | 0.06 m/s | 0.5 m/s | 0.05 hPa | 0.5 hPa |
| 256 | 0.07 m/s | 0.9 m/s | 0.06 hPa | 0.5 hPa |

- **The worst places** are beside coasts and the cube's edges, where the 64 grid's pressure has a slope least like the finer grid's; the worst of all on the Earth is near the Caspian Sea's eastern shore.
- **No mark of the 64 grid's cells** shows in the wind: from each place to the next it changes as much across the edges of the 64 grid's cells as within them, and as much as in a solve wholly on the world's own grid.

`npm run time:winds` measures both; see [Development](development.md#commands).

## The settings and the tuning script

The tuning script works from the temperature without winds and, like the figures in [What it gets wrong](#what-it-gets-wrong), at whatever `thermalHpaPerK` it is given, 0.7 by default: its Earth figures are not the baseline's, which come from the climate loop. `thermalHpaPerK` is among the settings a search varies, and at 3 the loop does not settle (see [Temperature](temperature.md#the-climate-loop)), so a search that raises it needs the loop looked at again. The winds' own retuning, against the loop's temperature, is a later step.

The model's settings, listed in [Model settings](../src/core/config.md), are its rough figures: one set with values by default (`DEFAULT_WIND_SETTINGS` in `src/core/wind/rules.ts`). They are written down as data in `WIND_CONFIG` in `src/core/config.ts`, each with its unit, what it controls, what raising and lowering it do, where it comes from, whether it was tuned, and the bounds a search keeps it within; the entries given a place in the tuning search are the ones `search tuned` takes. A run may change any of them, through `solveWinds`'s `settings` option; the page and its worker never do, and with none changed the run is the default one exactly.

`npm run tune:winds` runs the model many times with settings changed, on the wind report's nine cases, their temperatures solved once at the start (about ten seconds; a run of the Earth then takes about half a second). Run with nothing after it, it lists the settings and how to run it:

- **A sweep** of one setting over a range: one row for each value tried, with the Earth's three whole-year figures (the wind's difference as vectors, the share within 45° in direction, and the pressure difference).
- **A search** over several settings, or `tuned` for fourteen: the eleven tuned by hand against the observed Earth (the bands' strength, the thermal response and its smoothing distance, the hot window, both frictions, the low's move from the hottest latitude, the outer bands' share, the sea's share of the thermal response, the limit on warmth and the fade with height), and three moved by hand for other reasons: the Earth's contrast, set to the simulated Earth's own and not tuned; how the bands fade towards the poles, moved from 15° to 10° to keep more of the polar cell, not against the observed Earth; and the contrast a side's bands are scaled against, set against the Earth tilted 60°. It moves one setting at a time, each multiplied by 1.1 or 0.9 while that lowers the Earth's wind difference, then half the step, for three rounds by default, each step within its setting's bounds (a share above 0 and at most 1, a latitude or a cells' width at most 90°, a width in longitude at most 360°, every setting above 0); a step a bound stopped is printed. It never takes a step that worsens the direction share or the pressure difference from where it started, so it never ends worse than it started. It prints every case's band count and tropical edge, and the three checks against published studies, at the start and at the end.
- **The cases** for any set of settings, the same printout.
- **The diagnostic** above.

Each form takes `<setting>=<value>` arguments, which hold those settings throughout. The script proposes; it does not judge, and nothing it finds is applied by itself; the line it prints at a search's end, with the settings held and those moved in full, runs every case with the search's end exactly. A search over the tuned settings, run before the bands varied by longitude, for example, lowered the Earth's wind difference from 3.81 to 3.03 m/s mostly by weakening the thermal response and the bands, and with them the Earth's polar easterlies: its band count fell from three a hemisphere to two.

## How it was tuned

The model had thirteen rounds of hand tuning against the observed Earth and the invented worlds above. Of its 32 or so named settings, these were moved by hand: the equator-to-pole contrast it is scaled by, the bands' strength, the thermal response and its smoothing distance, how close to the hottest temperature a latitude must be to count towards the hottest latitude, both frictions, how the bands fade towards the poles, and the contrast a side's bands are scaled against (from 20 to 30 K). These were added while tuning: the sea's share of the thermal response, the limit on warmth, the fade with height, the outer cells' share, the low's move from the hottest latitude and how it fades, its move on to the pole (from 60° to 80°, since replaced by the limit at about 70° above), the widening of a squeezed summer side (from 0.4 to 0.8 cell widths), and the turning along steep ground scaled by the planet's turning and the friction together. Two of the rounds came from a look at the Earth tilted 60°: the cap of high pressure over the summer pole in January, and a narrow band at 66°N in July. Since then three rules were added that leave the Earth's winds exactly as they were: the limit on a cold place's high, the low's limit at a steep tilt, and the outer bands kept in full out to 60° from the low on a planet spinning faster than the Earth. Then the bands were placed by longitude (see [Bands by longitude](#bands-by-longitude)), with settings of this project's own choosing and no retune: it moved none of the nine cases' band counts and kept the Earth's whole-year figures within 2% of what they were, the wind's difference 3.81 to 3.82 m/s, the direction within 45° 60.6% to 60.9% and the pressure difference 7.11 to 7.08 hPa.
