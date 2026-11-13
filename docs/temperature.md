# Temperature

How the temperature layer is worked out, when it is recalculated, how it is coloured, and how it compares with the real Earth. For the controls, see the [User guide](user-guide.md#layers).

## The model

The temperature is a seasonal energy balance: the year is stepped through month by month, and repeated until one year matches the last. It accounts for:

- sunlight by latitude and time of year, from the axial tilt, the star and the orbit;
- land warming and cooling faster than sea;
- heat spreading between neighbouring cells;
- cooling with height;
- snow and ice brightening cold surfaces;
- the greenhouse strength.

There are no winds or ocean currents yet, so the aim is the right broad pattern, not a match to the real Earth.

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

- **Only while Temperature is chosen.** Nothing is calculated until it first is. While Terrain is chosen, a change only marks the result out of date.
- **After every change:** a stroke, undo, redo, a move of the Sea level or a Planet slider, or a new world. It starts a little under half a second after the change, and a change made during a solve stops it and starts a new one.
- **After a terrain edit it carries on from the last result,** which settles in fewer years.
- **After a change of sea level or planet it starts afresh,** as it does for a new world.

### Why it sometimes starts afresh

Some worlds have two settled climates: an ordinary one and a frozen one. A calculation carried on from a different sea level or planet can stay in the wrong one, so those changes always start afresh.

Terrain edits carry on, but only until the terrain has drifted past a limit since the last fresh calculation; the next one then starts afresh. The limit is about as much as raising 25 patches of land, each 1,000 km across, by 1,000 m, or sweeping the default brush over land for some 80 seconds. On a world that sits right at a freezing tipping point, the result can be in the wrong climate until that limit is reached.

### What the legend says meanwhile

| Legend | Meaning |
|-|-|
| "Calculating", with the years done and a bar | A new result is on its way; the one before stays on the globe |
| "Out of date" | The result on the globe no longer describes the world |
| "Temperature could not be shown" | The globe could not take a current result |
| "Temperature unavailable" | The worker could not be started |

Until the first result arrives, the globe keeps the height colours.

## Colours and scale

- **Colours** run from dark blue for the coldest, through red, to pale yellow for the hottest, growing lighter from cold to hot.
- **One scale for the whole year.** It is fitted to the world's whole year, so a colour means the same temperature in every month and every summary.
- **Fitted to the middle 99%.** The scale spans the middle 99% of the year by area, so a tall peak or a small cold corner does not squeeze the rest of the world into a few colours. Places beyond it take the colour at the end, and the legend says so, such as "−34 and below".
- **Seasonal range has its own scale and colours,** from near white to deep violet, starting at zero and marked every 5 degrees. The colours change fastest at the low end, since most of a world changes little through the year.

## Earth comparison

On the **measured Earth**, Temperature view adds a choice of where the temperature comes from.

| Source | What it shows |
|-|-|
| Simulated | What the page works out |
| Observed | The Earth's measured temperature; see [Data](data.md#observed-temperature) |
| Difference | The simulated less the observed |

- **The measured Earth** is an Earth world exactly as it was made: Earth's planet settings, the sea level at 0 m, and every cell's elevation untouched. A stroke, a move of the Sea level or a Planet slider, or a new or imported world that is not such an Earth takes the choice away; undoing back, **Reset to Earth**, or the sea level back at 0 m returns it.
- **Simulated and observed share one scale** once Observed or Difference has been chosen, so a colour means the same temperature in both.
- **The difference has a fixed scale** from −20 to +20 °C: blue where the simulation is colder, near white where the two agree, red where it is warmer.
- **Error figures** show under the legend, for the month or summary on screen: the mean difference and the root-mean-square difference, such as `Mean −0.1 °C · RMS 3.9 °C`.
- The observed temperature is fetched the first time it is needed. If that fails, the view goes back to Simulated and the next choice tries again.

The model's constants were tuned against the observed Earth when it was built, and were not tuned again for this comparison. The Earth's error figures are kept as a baseline for later steps, such as winds and ocean currents, to improve on; see [Development](development.md#the-earth-temperature-baseline).
