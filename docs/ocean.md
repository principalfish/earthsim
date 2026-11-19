# Ocean

How the wind-driven ocean currents are worked out, what they cost, how they compare with the observed Earth's, and what they leave out. The code is `src/core/ocean/gyres.ts` and `src/core/ocean/basins.ts`; the settings are listed in [Model settings](../src/core/config.md#ocean).

The currents are worked out by `solveGyres` from a world and a year of its surface winds. The climate loop works them out from each pass's winds and carries the sea's heat along them in the next pass (see [Temperature](temperature.md#heat-carried-by-the-currents)); the page does not draw them.

## The gyres

The wind pushes on the sea, and the push twists the water into a gyre in each basin: clockwise between the trades and the westerlies of the northern hemisphere, anticlockwise in the southern. The model is Stommel's: for each month, the transport summed through the depth of the wind-driven flow has a streamfunction `ψ`, in cubic metres a second, set by

`r ∇²ψ + β ∂ψ/∂x = curl τ / ρ`

where `τ` is the wind's stress on the sea, `ρ` the sea water's density (1025 kg/m³), `β = 2Ω cos φ / R` how fast the Coriolis parameter grows northward, `x` eastward, and `r` a friction rate. Across the middle of a basin the twist is balanced by the water moving to another latitude (the Sverdrup balance: southward in a northern subtropical gyre), and the water comes back in a narrow, fast current along the basin's western side, about `r / β` wide: the Gulf Stream, the Kuroshio, the Brazil, East Australian and Agulhas currents. The friction is set so that this width is the observed Gulf Stream's, about 100 km at 30°.

### The wind's push

The stress is a bulk drag on the surface wind at each cell's centre, `τ = ρ_air C_d |U| U`, with the wind model's air density of 1.2 kg/m³ and a drag coefficient of 1.2 × 10⁻³ (Large and Pond, 1981). Its curl at a corner of the grid is its circulation round the centres of the cells that meet there, the stress along each side the mean of the two cells' it joins, divided by the corner's area. Summed over any set of corners, the circulations add up to the one round the set's edge, so an island's total is the wind's circulation round it.

### Solved on the corners

`ψ` is solved on the grid's corners with the corner solver of `grid/corners.ts`, and the transport across each edge between two cells is the difference of `ψ` at the edge's two ends. So the flows carry exactly nothing net in or out of any cell, whatever the solve's error, and since `ψ` is one value along each coast, nothing crosses a coast. Where the grid does not resolve the western boundary current, on the 64 and 128 grids, the solver spreads it over about a cell.

### Coasts and islands

Each connected piece of sea needs one coast where `ψ` is given, since the equation takes no notice of a constant added to it; the difference of `ψ` between two coasts is what flows between them. Each piece of sea, largest first, holds its largest coast at zero, and every other coast it touches is an island. An island's value is found from the circulation round it: the equation summed over the island's corners holds as it does over the sea, so that round the island the wind's push is balanced by friction (the island rule of a frictional gyre). The transport between Australia and Asia, and between Antarctica and the continents, follows from it.

Some pieces are not solved as they are:

- **Small islands.** Each island is one more unknown on every level of the solver, the coarsest of which is solved densely, so the 32 largest are kept (`maxIslands`; the Earth has 26 on the 64 grid, 67 on the 128 and 158 on the 256). The sea flows over the rest, and each is then held to one value, the mean of `ψ` at its corners: what was sent across it goes round it, and nothing crosses its coast. The cap is on the islands found: an island in the lagoon of one flowed over joins the larger sea and can add one more.
- **Enclosed seas whose only coasts are islands,** such as a lake on an island, have no coast to hold `ψ` at, so they are held still, as part of the land round them, with no gyre and no Ekman transport. A lake on a continent keeps its own small gyre, held at the continent's value.
- **A planet with no land** has no coast at all, and its gyres are held still; its wind still drives an Ekman transport. A planet with no sea has nothing to solve.

### The circumpolar current

Where a circle of latitude crosses no land, as between Antarctica and the southern tips of the continents, the sea can flow round the globe, and there nothing but friction holds the flow back: it carries the wind's push over the friction, and would grow without bound as the friction is lowered. Those corners, and the corners of a coast that reaches every longitude (Antarctica's), take a friction of their own, `channelFrictionPerS`, which stands for the pressure on the sea floor's ridges that holds the observed current back: the observed current's push and transport give about 2 × 10⁻⁶ /s, the same as the gyres' friction. Lowering the gyres' friction to sharpen the boundary currents leaves the circumpolar current as it is.

### The Ekman transport

The wind's push also moves the top tens of metres of the sea at right angles to the wind, to its right in the north and to its left in the south: the Ekman transport, `τ × ẑ / (ρ f)`, in square metres a second, returned for each cell beside the gyres. It piles water up and draws it down, which a streamfunction cannot do, so it is not in the flows. The Coriolis parameter `f` passes through zero at the equator, so within 5° of it `|f|` is held at its value at 5° (`equatorFloorDeg`), and the transport stays finite.

### The flows and the surface current

The flows across the edges, in the layout the heat advection takes, and the surface current at each cell's centre, in metres a second, are the transport spread over the depth of the wind-driven layer, 200 m (`layerDepthM`): the Florida Current carries about 32 Sv at about 1.8 m/s across about 90 km.

## What it costs

The solver is built once for a world's land, settings and rotation, and `solveGyres` keeps the last one built for each grid; each month then is one solve, started from the month before's answer, or from the last solve's when one is given. On the Earth, on the development machine, in Node:

| Grid | Building the solver | Twelve months, each from the month before | Twelve months from the last solve's answer, winds 5% different |
|-|-|-|-|
| 64 | 0.25 s | 0.25 to 0.30 s | 0.17 to 0.20 s |
| 128 | 0.65 s | 0.82 s | 0.60 to 0.74 s |
| 256 | 2.0 s | 3.2 s | 2.1 s |

Each month takes one to three iterations at the default tolerance of 10⁻⁴, at which `ψ` is within 3 × 10⁻⁴ of its largest value of the exact answer. `solveGyres` solves on the world's own grid; for the flows to be those of the coasts the heat is carried between, it is given the world on the grid the temperature is solved on: the 64 grid for worlds of 64 and 128, the 128 grid for a world of 256. In the climate loop the solver is built once and each pass's months start from the last pass's answer: on the Earth that takes about 0.05 s a pass on the 64 grid and 0.5 s on the 128, against a climate solve of about 13 s for a world of 64 and 51 s for a world of 256, each four passes; most of what the currents add to the loop is the temperature's carrying of the sea's heat along them (see [Temperature](temperature.md#the-climate-loop)). On the 256 grid itself the gyres would take about three times as long as on the 128.

The western boundary current, in a basin from 10°N to 50°N and 60° of longitude wide under trades and westerlies, measured along 30°N:

| Grid | Strongest northward current | Distance from the coast at which it falls to 1/e of that | Width of the northward flow | Most carried round the gyre |
|-|-|-|-|-|
| 64 | 0.13 m/s | 160 km | 560 km | 5.8 Sv |
| 128 | 0.19 m/s | 190 km | 460 km | 6.4 Sv |
| 256 | 0.22 m/s | 110 km | 410 km | 6.7 Sv |

## The heat they carry

The climate loop carries the sea's heat along the flows, the whole transport of the 200 m layer at 4.18 MJ/m³/K (see [Temperature](temperature.md#heat-carried-by-the-currents)). On the Earth at 64 they carry 0.47 PW northward across 30°N and 0.45 PW southward across 30°S, over the year.

## How far to trust it

Measured on the Earth on the 64 grid, with the simulated climate's winds and with the observed winds, against the drifters' surface currents (Laurindo et al. 2017): the agreement in direction is the cosine of the angle between the model's current and the observed, weighted by the observed speed and the cells' areas, over every cell and month with data.

| Basin | Simulated winds | Observed winds | Observed winds, with the Ekman drift spread over 50 m |
|-|-|-|-|
| North Atlantic | 0.20 | 0.48 | 0.58 |
| North Pacific | 0.21 | 0.44 | 0.42 |
| South Atlantic | 0.23 | 0.41 | 0.58 |
| South Pacific | 0.07 | 0.48 | 0.53 |
| Indian | 0.40 | 0.54 | 0.55 |
| Southern (south of 45°S) | 0.32 | 0.84 | 0.85 |
| All | 0.24 | 0.53 | 0.57 |

The named currents, annual means over a box round each, from the simulated winds (the observed winds' in brackets), against the drifters'; the direction is the one the current flows towards, clockwise from north:

| Current | Box | Model | Drifters |
|-|-|-|-|
| Gulf Stream | 32–40°N, 78–68°W | 52°, 0.05 m/s, at most 0.17 (68°, 0.04, at most 0.10) | 63°, 0.16, at most 0.73 |
| Kuroshio | 28–37°N, 128–142°E | 45°, 0.04, at most 0.36 (54°, 0.05, at most 0.33) | 67°, 0.21, at most 0.79 |
| Brazil | 32–20°S, 50–38°W | 227°, 0.05, at most 0.17 (223°, 0.07, at most 0.21) | 211°, 0.07, at most 0.34 |
| East Australian | 36–25°S, 150–157°E | 175°, 0.04, at most 0.12 (162°, 0.03, at most 0.10) | 156°, 0.10, at most 0.63 |
| Agulhas | 38–28°S, 22–34°E | 202°, 0.05, at most 0.23 (226°, 0.17, at most 0.44) | 212°, 0.18, at most 1.12 |
| Circumpolar, 60–50°S | eight boxes of 45° | 66° to 105°, 0.03 to 0.06 (75° to 98°, 0.12 to 0.15) | 66° to 86°, 0.11 to 0.17 |

Every named current is in its place and flows the right way. The circumpolar current flows east at every longitude; it carries 7 to 36 Sv through Drake Passage over the year with the simulated winds and 33 to 51 Sv with the observed, against about 140 Sv observed.

## What it gets wrong

- **Too weak.** The boundary currents are a fifth to a half of the drifters' at their strongest, and the mean speed over the sea is a quarter of theirs. The stress is taken from monthly mean winds, and `|U| U` of a mean wind is less than the mean of `|U| U` over the storms that make it up: from the observed monthly winds the zonal mean stress over the sea is about 0.04 N/m² in the trades and 0.015 N/m² in the northern westerlies. The 64 and 128 grids also spread the boundary currents wider than they are, and the drifters' currents include the Ekman drift, which the surface current here leaves out.
- **The simulated winds' errors** carry through: the agreement in direction is 0.24 with them against 0.53 with the observed winds, lowest in the South Pacific (see [Winds](winds.md#what-it-gets-wrong)).
- **The circumpolar current** carries a third or less of the observed, for the same reason and because its real brake, the pressure on the sea floor's ridges, is stood for by a uniform friction.
- **No equatorial currents.** The equatorial currents and undercurrent are not Sverdrup flow, and the drifters' westward equatorial Pacific current (0.32 m/s) is missing; the Ekman transport is returned but not added to the surface current.
- **Straits and isthmuses at the grid's width.** On the 64 grid the Isthmus of Panama is open, so the two Americas are separate islands and some sverdrups flow between the Atlantic and the Pacific there; on the 128 and 256 grids it is closed. The Bering Strait is open on every grid.
- **Left out:** eddies, the deep and overturning circulation, the currents driven by the sea's own differences of temperature and saltiness, and sea ice's effect on the push.
