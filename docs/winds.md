# Winds

How the surface winds and sea-level pressure are worked out, which planet settings they read, how far to trust them, and what they get wrong. The maps behind the figures here are in the wind report; see [Development](development.md#commands).

## The model

The winds are worked out from the temperature, a month at a time: first a map of sea-level pressure built by rules, then the wind that follows from it. It is a sketch of the real circulation, meant to be right in kind, not a simulation of the air.

### Bands of pressure

Each month's mean temperature by latitude places a pattern of bands round the planet:

- **A low** along the hottest latitude, moved a little further from the equator than it, more near the equator and less away from it, to make up for the temperature's seasons being weaker than the Earth's. When the hottest latitude passes 60°, the low moves on to the pole, and it is there fully once the hottest latitude reaches 80°.
- **Highs** at the edges of the tropical cell, the overturning that rises at the low, and beyond them lows and highs in turn, one band to each further cell, out to the poles.
- **The cells' width** follows how fast the planet turns and how much colder its poles are than its hottest latitude: 30° on the Earth, and in proportion to (24 hours ÷ the day length)^½ × (the contrast ÷ 41 K)^¼, at most 90°. Further cells of the same width fill the way to the poles, counted as a fraction, so the pattern changes smoothly with the day length.
- **Each side's bands** are as strong as its pole is cooler than the low, so a warm summer pole has weak bands and a cold winter pole strong ones. A summer side squeezed between the low and the equator widens to a whole cell as the low moves from 0.4 to 0.8 cell widths from the equator.

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

- **The July heat low sits over Siberia, not South Asia**, and the northern subtropical high runs unbroken over North Africa and Asia in July.
- **The Asian winter high is too weak:** 1,024 hPa against an observed 1,032 hPa.
- **The monsoons.** Over 5–20°N, 60–95°E the January north-east monsoon is about 2.5 times too strong ((−7.2, −6.2) m/s east and north against an observed (−2.8, −2.9)), and the July south-west monsoon about a third of the observed ((+1.9, +1.3) against (+6.9, +3.5)).
- **The North Pacific trades are weak:** −2 m/s against an observed −7.
- **The hemispheres' bands are alike:** the deep trough round Antarctica is missing.
- **Land winds cross the isobars at about 50°,** more than the observed.
- **Thermal winds are too strong at a 4-day day.**
- **Two hot regions far apart** that are within 4 K of each other give a low over neither: on the Earth tilted 60°, October's low lies at 38.7°N while the North Pole is hottest, and November has no bands at all.
- **Near a hottest latitude of 8.5°** the bands shift fast, 0.7 hPa for 0.1° of latitude, though smoothly.
- **The cube's corners.** The grid's cells are skewed where three faces of the cube meet. The smoothing makes up for that, so it reaches as far at a corner as elsewhere, within 2%, but not wholly: a cold patch 500 km across centred exactly on a corner makes a high 3.4% weaker, and winds 6.1% weaker, than the same patch elsewhere at its latitude. Removing that would take about two and a half times as long to smooth. No mark shows on the Earth's maps.

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

## How it was tuned

The model had thirteen rounds of hand tuning against the observed Earth and the invented worlds above. Of its 32 or so named settings, these were moved by hand: the equator-to-pole contrast it is scaled by, the bands' strength, the thermal response and its smoothing distance, how close to the hottest temperature a latitude must be to count towards the hottest latitude, both frictions, how the bands fade towards the poles, and the contrast a side's bands are scaled against (from 20 to 30 K). These were added while tuning: the sea's share of the thermal response, the limit on warmth, the fade with height, the outer cells' share, the low's move from the hottest latitude and how it fades, its move on to the pole (from 60° to 80°), the widening of a squeezed summer side (from 0.4 to 0.8 cell widths), and the turning along steep ground scaled by the planet's turning and the friction together. Two of the rounds came from a look at the Earth tilted 60°: the cap of high pressure over the summer pole in January, and a narrow band at 66°N in July.
