# Temperature

How the temperature layer is worked out, when it is recalculated, how it is coloured, and how it compares with the real Earth. For the controls, see the [User guide](user-guide.md#layers).

## The model

The temperature is a seasonal energy balance: the year is stepped through month by month, and repeated until one year matches the last. It accounts for:

- sunlight by latitude and time of year, from the axial tilt, the star and the orbit;
- land warming and cooling faster than sea;
- heat spreading between neighbouring cells;
- cooling with height;
- snow and ice brightening cold surfaces;
- the greenhouse strength;
- heat carried along by the winds, when a solve is given them (see below).

There are no ocean currents yet, and the page does not yet use the climate loop below, so the aim is the right broad pattern, not a match to the real Earth.

The model's settings are listed, with what each does and where its value comes from, in [Model settings](../src/core/config.md).

### Heat carried by the winds

A solve may be given a year of winds, as the flows they carry across every cell edge (the flowing part of the winds: see [Winds](winds.md#the-flowing-part)). After each time step's heat exchange, a second step moves heat downwind: each cell takes the temperature of the air flowing in from its upwind neighbours, weighted by how much flows in against the cell's own heat capacity. The step is stable however long it is, makes no new extreme (to within the solver's tolerance), keeps the heat exactly, and leaves a uniform temperature as it is. The flows are those of the time each step ends, as the sunlight is, interpolated between the months'; only the flows are interpolated, the sunlight is worked out for that time.

How strongly the wind carries heat is one setting, the heat capacity of the air that moves it (about a kilometre of air); at 0 the solve is the one with no winds, exactly. A world of 128 or 256 is solved on a coarser grid, so its flows must be on that grid; `flowingPartForSolve` finds them there from the world's own winds (see [Winds](winds.md#the-flowing-part)).

### The climate loop

`solveClimate` works the temperature and the winds out together, in passes. The first pass is the temperature without winds and the winds from it, exactly as before. Each later pass solves the temperature again, carried on from the last pass's and with heat carried along the last pass's winds, then works out the winds from the new temperature.

- It stops when the root-mean-square change a pass makes to the monthly temperature, over the globe and the year, is no more than 0.1 °C, or after 8 passes. The largest change in a single cell is left out of the rule: a few cells of spring snow and ice keep moving by more than a degree for many passes.
- A pass whose change is larger than the one before's is an overshoot, and only half its change is applied.
- A result that settled can be carried on from: a solve for the same world again settles in one pass.
- The day length now changes the settled temperature, through the winds, though not the first pass.
- On the Earth at 64 the loop settles in 4 passes, about 8 s from nothing (1.4 s for the first pass, which is the temperature from nothing and the winds, then about 2 s for each later pass), and in one pass, about 2 s, carried on from the settled result; on a world of 128 about 9 s and 2 s, and on one of 256 about 27 s and 4 s. A later pass is the temperature carried on (0.3 s for a year), the flowing part of the winds (0.5–0.7 s, a tenth to a third less than from nothing because each month starts from the last pass's answer) and the winds (0.6 s). `npm run time:climate` measures it.
- How fast the passes settle depends on how strongly the winds feed back. The thermal highs and lows are at their physical 0.7 hPa a kelvin for that reason: at the 3 they were tuned to before the winds carried heat, each pass shrank by about 0.7 and the Earth did not settle in 8. At 0.7 each pass shrinks by about 0.2 to 0.3.

The loop's three settings are in the [Model settings](../src/core/config.md).

### Heat carried along the winds, on the Earth

How strongly the wind carries heat is the heat capacity of the air that moves it, 1.2e6 J/m²/K: about a kilometre of air at the sea-level density, the depth the surface wind blows in. It is set from that physical estimate and not tuned. Its check is the Earth's west–east coast contrast at 40–60°N, kept in the [baseline](development.md#the-earth-temperature-baseline):

| | Simulated, annual | Observed, annual | Simulated, January | Observed, January |
|-|-|-|-|-|
| Western Europe less East Asia | 2.9 K | 11.5 K | 7.8 K | 22.9 K |
| West less east North America | 0.0 K | 5.8 K | 3.5 K | 15.1 K |

Without the winds the model gave 0.7 and 2.4 K for Europe against Asia and about −0.8 and −0.6 K for North America. So the winds make a contrast, in the right places: a quarter to a third of the observed size in three of the four figures, and none for North America's year; the rest is not theirs to make: the sea's own heat transport, ocean currents, is a later step. East Asia's January comes out 0.8 °C against an observed −4.0. The Earth's error against the observed falls from 3.93 to 3.66 K root-mean-square for the year.

### Finer worlds are solved on a coarser grid

A world of 128 or 256 cells per face edge is solved on the grid one step coarser (64 or 128), then carried back to its own grid, where each place is cooled by its own height.

| World | Solved at | Time for the Earth (in Node) | Without this |
|-|-|-|-|
| 128 | 64 | 0.85 s | 3.5 s |
| 256 | 128 | 3.4 s | 17 s |

- Mountains stay as sharply colder than their surroundings as their height makes them.
- At coasts, the difference between land and sea is smoothed over about one coarse cell: about 156 km on a world of 128, and 78 km on a world of 256.
- An island or neck of land narrower than a coarse cell does not shape the result, though it keeps the cooling of its own height.
- On the Earth, the result differs from a solve on the world's own grid by about 0.1 °C root-mean-square, and by at most 1.4 °C in any place and month.

### How far to trust it

The model is calibrated on the Earth, and far from it the results are rough. The Planet section shows a warning when the sunlight and greenhouse effect together leave the planet far colder or far hotter than the Earth.

- The two are combined as a **warmth**: the sunlight (against Earth's) × (1 + 0.633 × the greenhouse strength) ÷ 1.633.
- The warning shows outside a warmth of 0.9 to 1.25.
- Measured on the Earth, a warmth of about 0.86 freezes it over, and one of about 1.25 takes its mean temperature past 33 °C.

## When it is recalculated

The temperature is worked out in its own worker, so a slow solve never holds up the rest of the page.

- **Whatever is on screen,** Terrain included, so the result is ready when Temperature is chosen.
- **After every change:** a stroke, undo, redo, a move of the Sea level or a Planet slider, or a new world. It starts a little under half a second after the change, and a change made during a solve stops it and starts a new one. A new world, and the world the page opens on, are asked for at once.
- **Not while paused.** The [Pause button](user-guide.md#the-pause-button) stops it: a change only marks the result out of date, a new world stays uncalculated, and a solve under way finishes. Resume asks once for everything changed meanwhile.
- **After a terrain edit it carries on from the last result,** which settles in fewer years.
- **After a change of sea level or planet it starts afresh,** as it does for a new world.

### Why it sometimes starts afresh

Some worlds have two settled climates: an ordinary one and a frozen one. A calculation carried on from a different sea level or planet can stay in the wrong one, so those changes always start afresh.

Terrain edits carry on, but only until the terrain has drifted past a limit since the last fresh calculation; the next one then starts afresh. The limit is about as much as raising 25 patches of land, each 1,000 km across, by 1,000 m, or sweeping the default brush over land for some 80 seconds. On a world that sits right at a freezing tipping point, the result can be in the wrong climate until that limit is reached.

### What the info box says meanwhile

The status line of the info box, under the legend, says where the result stands, unless the winds have something worse to say; see the [user guide](user-guide.md#the-info-box). It says so on Terrain too.

| Status line | Meaning |
|-|-|
| "Calculating · year 3, about 2 to go", or "Calculating · year 5, finishing", with a bar | A new result is on its way, on Temperature once the years left can be told; the one before stays on the globe |
| "Calculating temperature", with a bar | The same, said while Temperature is not on screen, and on it until the years left can be told |
| "Out of date" | The result on the globe no longer describes the world |
| "Paused" | The result is out of date, or there is none, and the calculation is paused |
| "Temperature could not be shown" | The globe could not take a current result |
| "Temperature unavailable" | The worker could not be started |

Until the first result arrives, the globe keeps the height colours.

## Colours and scale

- **Colours** run from dark blue for the coldest, through red, to pale yellow for the hottest, growing lighter from cold to hot.
- **One scale for the whole year.** It is fitted to the world's whole year, so a colour means the same temperature in every month and every summary.
- **Fitted to the middle 99%.** The scale spans the middle 99% of the year by area, so a tall peak or a small cold corner does not squeeze the rest of the world into a few colours. Places beyond it take the colour at the end; the legend marks only the values along the scale.
- **Round in the unit chosen.** The scale is fitted in the temperature's unit from Settings, so its ends and ticks are whole degrees in °F and K as in °C; see the [user guide](user-guide.md#units).
- **Seasonal range has its own scale and colours,** from near white to deep violet, starting at zero and marked every 5 °C, 10 °F or 5 K. The colours change fastest at the low end, since most of a world changes little through the year.

## Earth comparison

On the **measured Earth**, the comparison control in the top bar over the globe chooses where the temperature comes from. It is one control for the layer on screen and the winds; see the [user guide](user-guide.md#simulated-observed-or-difference).

| Source | What it shows |
|-|-|
| Simulated | What the page works out |
| Observed | The Earth's measured temperature; see [Data](data.md#observed-temperature) |
| Difference | The simulated less the observed |

- **The measured Earth** is an Earth world exactly as it was made: Earth's planet settings, the sea level at 0 m, and every cell's elevation untouched. A stroke, a move of the Sea level or a Planet slider, or a new or imported world that is not such an Earth takes the choice away; undoing back, **Reset to Earth**, or the sea level back at 0 m returns it.
- **Simulated and observed share one scale** once Observed or Difference has been chosen, so a colour means the same temperature in both.
- **The difference has a fixed scale** from −20 to +20 °C, −40 to +40 °F or −20 to +20 K: blue where the simulation is colder, near white where the two agree, red where it is warmer.
- **Error figures** show under the legend, for the month or summary on screen: the mean difference and the root-mean-square difference, such as `Mean −0.1 °C · RMS 3.9 °C`.
- The observed temperature is fetched the first time it is needed: when Observed or Difference is chosen in Temperature view, or Temperature is chosen while either is on. If that fails while Temperature is on screen, the view goes back to Simulated and the next choice tries again; if Temperature has been left meanwhile, the choice is kept and the fetch is tried again on coming back to it.

The model's constants were tuned against the observed Earth when it was built, and were not tuned again for this comparison. The Earth's error figures, and its west–east coast contrasts, are kept as a baseline for later steps, such as ocean currents, to improve on; see [Development](development.md#the-earth-temperature-baseline).
