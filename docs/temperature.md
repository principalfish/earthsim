# Temperature

How the temperature layer is worked out, when it is recalculated, how it is coloured, and how it compares with the real Earth. For the controls, see the [User guide](user-guide.md#layers).

## The model

The temperature is a seasonal energy balance: the year is stepped through month by month, and repeated until one year matches the last. It accounts for:

- sunlight by latitude and time of year, from the axial tilt, the star and the orbit;
- land warming and cooling faster than sea;
- over the sea, two temperatures: the air's and the sea's own (see below);
- heat spreading between neighbouring cells;
- cooling with height;
- snow and ice brightening cold surfaces, and sea ice standing in where the sea nears freezing;
- the greenhouse strength;
- heat carried along by the winds, when a solve is given them (see below);
- the sea's heat carried along the wind-driven ocean currents, when a solve is given them (see below);
- the sea cooled where the winds' Ekman transport draws colder water up from below, when a solve is given the upwelling (see below).

The currents are the wind-driven gyres alone, and weaker than the real ones (see [Ocean](ocean.md#what-it-gets-wrong)), so the aim is the right broad pattern, not a match to the real Earth.

### The sea's own temperature

Over the sea each cell holds two temperatures: the air's, near the surface, and the sea's, its mixed top 60 m. The Temperature layer shows the air's everywhere.

- **The air** has its own heat store, the column of air's, as over land. It radiates to space, spreads heat to its neighbours and is carried by the winds.
- **The sea** takes the sunlight that reaches it. It gives the year's mean of that sunlight up to the air at a steady rate, as evaporation and long-wave radiation do, whatever the two temperatures; so what the sea stores is the sunlight's swing through the year, and where nothing else moves heat the sea and the air come to the same temperature.
- **The two exchange heat** as their difference drives it, at 20 W/m² for each kelvin (sensible heat, evaporation and long-wave radiation together, from the bulk formulas at a 5 m/s wind and 10 °C; see the `airSeaExchange` setting).
- **Sea ice** follows the sea's temperature: the sea starts to ice over below 0 °C and is wholly iced at −1.8 °C, the freezing point of sea water, and does not cool below it. The ice brightens the sea and cuts it off from the air, the exchange and the steady giving-up of sunlight both, so the air above can cool far below freezing in winter while the sea stays at freezing. Over land the snow and ice still follow the air.
- **The sea does not spread heat** to its neighbours by diffusion: the air's spreading over the sea stands for the heat carried sideways there, and the currents, in the climate loop, carry the sea's own (see [Heat carried by the currents](#heat-carried-by-the-currents)). Measured on the Earth, letting the sea spread heat as well, at the air's rate, made the error 5.6 K root-mean-square for the year against 3.7; splitting the rate between the two, 3.9.
- **Upwelling** cools the sea, in the climate loop, beside the coasts where the wind draws its top layer apart and colder water wells up from below (see [Cooling by upwelling](#cooling-by-upwelling)); the heat it takes leaves the climate.
- **Numerically,** within each step the sea is solved for at once in terms of its air, and the ice share's change over the step is solved for with the rest, so that a sea at the ice's edge does not swing between iced and open from step to step. At the default two steps a month every world measured settles (the Earth, generated worlds, a frozen Earth, the Earth tilted 60°, a hot planet); at one step a month the Earth and some others do not settle within 60 years.
- **A world with no sea** is solved with the air alone, one temperature per cell, and gives the same answer as a model without a sea temperature.

The sea and the air each have their own months in a result: the sea's are NaN over land, as the observed sea temperature marks land. The sea's, against the observed sea-surface temperature (NOAA OISST, 1991–2020; see [Data](data.md)), on the Earth at 64, from the climate loop with the currents carrying the sea's heat and the upwelling cooling it, and in brackets without either:

| Where | Simulated less observed, annual | January | July |
|-|-|-|-|
| All the sea | −0.8 K (3.2 K RMS; without, 2.4) | −0.6 K (3.4; 2.4) | −0.9 K (3.7; 3.0) |
| Tropics, 20°S–20°N | −1.7 K (2.7; 1.8) | −1.7 K (2.7; 1.7) | −1.5 K (2.8; 2.1) |
| North Atlantic, 50–65°N | −4.9 K (5.1; 6.3) | −4.8 K (5.3; 6.3) | −5.4 K (5.5; 6.9) |
| Gulf Stream, Kuroshio and the other western boundary currents | −1.8 K (3.5; 3.6) | −1.3 K (4.3; 3.3) | −3.2 K (4.9; 5.3) |
| Peru, Benguela, California and Canary coasts | +0.3 K (2.8; 3.6) | −0.2 K (2.4; 2.9) | +0.7 K (3.4; 4.3) |
| Eastern tropical Pacific | +1.7 K (2.3; 3.5) | +1.4 K (2.1; 3.2) | +2.1 K (2.8; 3.9) |
| Southern Ocean, 40–55°S | +2.5 K (3.4; 2.7) | +2.4 K (3.5; 2.9) | +2.5 K (3.6; 2.5) |
| Where the sea ices over | +2.6 K (3.1; 2.4) | +2.7 K (3.7; 3.2) | +2.1 K (3.5; 2.9) |

The currents warm the North Atlantic and the western boundary currents' seas, which are too cold, and cool the upwelling coasts and the eastern tropical Pacific, which are too warm; but they carry heat poleward into the Southern Ocean and the seas that ice over, which were too warm already, and out of the tropics, and the warm Kuroshio's water reaches too far into the North Pacific; over all the sea the error grows. The upwelling cools the upwelling coasts and the eastern tropical Pacific further, toward the observed (off Peru from 3.7 to 2.2 K root-mean-square, off Benguela from 4.7 to 3.5 K), but the heat it takes leaves the climate, and the whole sea comes out 0.5 K colder, the tropics and the western boundary currents most: over all the sea the error grows from 3.06 to 3.22 K. The air's spreading of heat over the sea, `diffusivity`, stands for the heat carried sideways that nothing else carries, and is lowered by the share of its poleward transport the currents carry (see [Model settings](../src/core/config.md)).

The air's own error against the observed air temperature, on the Earth at 64, is 3.94 K root-mean-square for the year, 4.97 K in January and 4.21 K in July (3.88, 4.87 and 4.28 K without the upwelling; 3.73, 4.63 and 4.09 K without the currents either, at the sea's diffusivity of 0.55). The air over the sea, with its own small heat store, swings with the seasons more than the sea below it, as it does over the real sea: the northern summers come out a little cold (western Europe in July −4.7 K, Scandinavia −5.3 K), and the northern winters colder (western Europe in January −4.7 K, the North Atlantic at 50–65°N −6.9 K), where the currents bring the sea too little heat. Polar summers come out too warm, by 6.7 K over the sea ice in July and 9.5 K in Antarctica's January.

The model's settings are listed, with what each does and where its value comes from, in [Model settings](../src/core/config.md).

### Heat carried by the winds

A solve may be given a year of winds, as the flows they carry across every cell edge (the flowing part of the winds: see [Winds](winds.md#the-flowing-part)). After each time step's heat exchange, a second step moves heat downwind: each cell takes the temperature of the air flowing in from its upwind neighbours, weighted by how much flows in against the cell's own heat capacity. Over the sea the heat the wind brings goes to the air and the sea together, shared as the exchange between them shares it over a step. The step is stable however long it is, makes no new extreme (to within the solver's tolerance), keeps the heat exactly, and leaves a uniform temperature as it is. The flows are those of the time each step ends, as the sunlight is, interpolated between the months'; only the flows are interpolated, the sunlight is worked out for that time.

How strongly the wind carries heat is one setting, the heat capacity of the air that moves it (about a kilometre of air); at 0 the solve is the one with no winds, exactly. A world of 128 or 256 is solved on a coarser grid, so its flows must be on that grid; `flowingPartForSolve` finds them there from the world's own winds (see [Winds](winds.md#the-flowing-part)).

### Heat carried by the currents

A solve may also be given a year of the sea's currents, as the water they carry across every cell edge: the gyres' flows (see [Ocean](ocean.md)) and the depth they are spread over. After each step's heat exchange and the winds' step, a third step carries the sea's temperature along them, by the same implicit upwind step as the winds', into and out of the sea's own heat store, its mixed top 60 m. The air over a sea cell takes its share of what the water brings through the exchange in the steps after.

- **The units.** The flows are in square metres a second spread over a depth: an edge's flow times the depth is the water crossing it each second, in cubic metres, and each cubic metre carries its sea's temperature at 4.18 MJ/m³/K (`seaWaterHeatCapacityJM3K`, the figure the sea's 60 m store is reckoned at). The climate loop gives the gyres' flows with their own depth, 200 m, so the heat carried is that of the gyres' whole transport.
- **Why the whole transport, not 60 m of it.** The water the gyres move above the thermocline is at about the sea's surface temperature, so its heat is the transport times that temperature; counting 60 m of 200 would carry 0.3 of it, on top of gyres that are already a fifth to a half as strong as the observed (see [Ocean](ocean.md#what-it-gets-wrong)).
- **Heat is moved, never made.** The gyres' flows carry nothing net in or out of any cell and nothing across a coast, and the land takes no part in the step; a solve refuses currents that carry anything across an edge of a land cell. On the Earth the heat the currents move sums to a few watts over the globe, against 3.1 PW moved between cells.
- **The year's end.** Each year the solve shifts every cell towards the climate its year's gain or loss of heat points to. Where the currents cross a cell's edges the sea's own change is not counted, but the mean change of the carried sea in its 5° band of latitude: the currents carry the sea's changes from cell to cell, and read as each cell's own gain or loss they are carried on and grow, while round a band they mostly cancel. On the Earth, counted cell by cell, a warm and a cold patch went round the Southern Ocean every five years, and a solve carried on from the climate's first pass had not settled in 60 years; left out, it settles in 6, and with the band's mean in 5, to the same answer.

On the Earth at 64, in the climate loop, the currents carry 0.44 PW northward across 30°N and 0.36 PW across 45°N, and 0.42 PW southward across 30°S and 0.50 PW across 45°S, the annual means of the heat moved between cells.

### Cooling by upwelling

A solve may also be given the upwelling: for each month and sea cell, the rate at which the water welling up into the mixed layer takes the sea's heat for each kelvin the sea is above the deep sea's temperature, and that temperature, 4 °C. `upwelling` in `ocean/upwelling.ts` works them out from the winds (see [Ocean](ocean.md#upwelling)). In each step the sea's balance gains the term `−u (T_s − T_d)`, solved for with the rest of the sea's step, the rate taken at the step's time between the months'; while the sea is no warmer than the deep sea it takes nothing. The air is cooled only through its exchange with the sea, and the year's end counts the upwelling's rate among what holds the sea back from a shift. A result gives `upwellingW`, the heat the upwelling took over its last year in watts over the planet, summed step by step at the sea's temperature each step ended at: what leaves the climate into the deep sea, which is not modelled. A solve given rates of zero, or a deep sea warmer than the sea, is the solve without upwelling, bit for bit.

### The climate loop

`solveClimate` works the temperature, the winds and the currents out together, in passes. The first pass is the temperature without winds or currents, the winds from it and the currents those winds drive. Each later pass solves the temperature again, carried on from the last pass's, the air's and the sea's, with the air's heat carried along the last pass's winds and the sea's along its currents, and the sea cooled by those winds' upwelling, then works out the winds from the new temperature and the currents from the new winds. The currents are solved on the grid the temperature is solved on (see [Ocean](ocean.md#what-it-costs)), each pass's starting from the last pass's answer.

- It stops when the root-mean-square change a pass makes to the monthly temperature, over the globe and the year, is no more than 0.1 °C, or after 8 passes. The largest change in a single cell is left out of the rule: a few cells of spring snow and ice keep moving by more than a degree for many passes.
- A pass whose change is larger than the one before's is an overshoot, and only half its change is applied; its winds are those of the temperature applied, and its currents those of those winds.
- A result that settled can be carried on from: a solve for the same world again settles at the second pass at the earliest, since the first carries heat along the start's winds and currents, which may be those of a world since edited, and a local edit moves the global change by less than the tolerance. A start whose currents cross what is now land, or that has none, has its currents worked out afresh from its winds. The upwelling of the first pass is always worked out from the start's winds, which the start carries, so it needs nothing of its own in the start.
- The page works the temperature out this way, as the climate; see [When it is recalculated](#when-it-is-recalculated).
- The day length now changes the settled temperature, through the winds, though not the first pass.
- On the Earth at 64 the loop settles in 4 passes, about 13 s from nothing, and carried on from the settled result in 2 passes, about 4.8 s; a world of 256 takes about 51 s and 16 to 19 s. Generated worlds settle in 4. The currents' part of a pass is small, about 0.05 s on the 64 grid and 0.5 s on the 128, and the upwelling's smaller, about 0.03 s on the 64 grid and 0.08 s on the 128; with the temperature's solve of the sea it cools, the upwelling adds under 1% to a climate solve from nothing, on the 64 grid and the 256; the rest of what they add is the temperature's: each year takes about a quarter more on the 64 grid and a third more on the 128, for the sea's step along the currents, and the second pass takes 5 years, the sea far from where the currents carry it settling slowly. `npm run time:climate` measures every resolution and the currents' and the upwelling's parts of a pass.
- With two feedbacks, the winds carrying the air's heat and the currents the sea's, the change still shrinks pass by pass: on the Earth about 1.8, 0.20 and 0.03 °C after the first.
- How fast the passes settle depends on how strongly the winds feed back. The thermal highs and lows are at their physical 0.7 hPa a kelvin for that reason: at the 3 they were tuned to before the winds carried heat, each pass shrank by about 0.7 and the Earth did not settle in 8. At 0.7 each pass shrinks by about 0.2 to 0.3.

The loop's three settings are in the [Model settings](../src/core/config.md).

### Heat carried along the winds, on the Earth

How strongly the wind carries heat is the heat capacity of the air that moves it, 1.2e6 J/m²/K: about a kilometre of air at the sea-level density, the depth the surface wind blows in. It is set from that physical estimate and not tuned. Its check is the Earth's west–east coast contrast at 40–60°N, kept in the [baseline](development.md#the-earth-temperature-baseline):

| | Simulated, annual | Observed, annual | Simulated, January | Observed, January |
|-|-|-|-|-|
| Western Europe less East Asia | 0.9 K | 11.5 K | 4.2 K | 22.9 K |
| West less east North America | 1.4 K | 5.8 K | 4.2 K | 15.1 K |

These are with the currents carrying the sea's heat and the upwelling cooling it (without the upwelling, 0.9 and 4.6 K, and 1.3 and 4.1 K). Without the currents, at the sea's diffusivity of 0.55, the winds gave 2.8 and 6.3 K for Europe against Asia and −0.1 and 2.8 K for North America, and without the winds as well, 0.7 and 2.4 K and about −0.8 and −0.6 K. So the winds make a contrast, in the right places: a quarter to a third of the observed size for Europe against Asia, a sixth of it in North America's January, and none for its year. The currents add to North America's but take from Europe against Asia's: they warm East Asia's coasts, beside the Kuroshio, more than western Europe.

The air over the North Atlantic follows its sea, which even with the currents' heat is about 5 K too cold at 50–65°N, so the winter air the westerlies bring Europe is too cold and its contrast with East Asia too small.

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

The temperature is worked out with the winds, as the [climate loop](#the-climate-loop), in its own worker, so a slow solve never holds up the rest of the page.

- **Pass by pass.** The first pass shows on the globe as soon as it is done, and each later pass refines it, the temperature and the winds always of the same pass, until the loop settles.
- **Whatever is on screen,** Terrain included, so the result is ready when Temperature is chosen.
- **After every change:** a stroke, undo, redo, a move of the Sea level or a Planet slider, the day length's included, or a new world. It starts a little under half a second after the change, and a change made during the loop stops it and starts a new one. A new world, and the world the page opens on, are asked for at once.
- **Not while paused.** The [Pause button](user-guide.md#the-pause-button) stops it: a change only marks the result out of date, a new world stays uncalculated, and a loop under way finishes the pass under way, shows it and stops. Resume carries on from that pass if nothing changed meanwhile (the first pass after a Resume cannot settle the climate, so a paused loop can take one pass more than one never paused), and otherwise asks once for everything changed.
- **After a terrain edit it carries on from the last climate that settled,** which settles in fewer passes and years. One that ran out of passes is shown but not carried on from.
- **After a change of sea level or planet it starts afresh,** as it does for a new world.

### Why it sometimes starts afresh

Some worlds have two settled climates: an ordinary one and a frozen one. A calculation carried on from a different sea level or planet can stay in the wrong one, so those changes always start afresh.

Terrain edits carry on, but only until the terrain has drifted past a limit since the last fresh calculation; the next one then starts afresh. The limit is about as much as raising 25 patches of land, each 1,000 km across, by 1,000 m, or sweeping the default brush over land for some 80 seconds. On a world that sits right at a freezing tipping point, the result can be in the wrong climate until that limit is reached.

### What the info box says meanwhile

The status line of the info box, under the legend, says where the climate stands, whatever is on screen, Terrain included; see the [user guide](user-guide.md#the-info-box).

| Status line | Meaning |
|-|-|
| "Calculating climate", with a bar | The climate's first pass is on its way, the bar following its years; the result before stays on the globe |
| "Refining climate (pass 2)", and so on, with a full bar | The first pass is on the globe, and a later pass is refining it |
| "Out of date" | The result on the globe no longer describes the world |
| "Paused" | The result is out of date, or there is none, and the calculation is paused; paused partway through the climate, the last pass finished stays on the globe |
| "Temperature could not be shown" | The globe could not take a current result, while Temperature is on screen |
| "Temperature unavailable" | The worker could not be started, while Temperature is on screen |
| "Climate unavailable" | The same, while Terrain is on screen |

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

The model's constants were tuned against the observed Earth when it was built, and were not tuned again for this comparison. The Earth's error figures, and its west–east coast contrasts, are kept as a baseline for later steps to improve on; see [Development](development.md#the-earth-temperature-baseline).
