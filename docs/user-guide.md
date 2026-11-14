# User guide

Every control on the page. For how the temperature is worked out, see [Temperature](temperature.md); for the winds, [Winds](winds.md).

## The panel

The panel on the right has six sections, in this order: **World, Layers, View, Planet, Tools, Statistics**.

- Each section opens and closes from its heading, by mouse or with Enter or Space.
- On a first visit only World is open. The browser remembers which sections are open; this is a browser setting, not part of the world.
- While Tools is closed, its heading names the tool chosen, such as `Tools · Raise`.
- Ticking **Sunlight** or **Winds** opens Layers if it is closed, because that is where their month controls are. Nothing else opens or closes a section by itself.
- A closed section's controls are skipped by the Tab key.

## World

### Making a world

The first visit opens on a blank ocean with the New world dialog showing. **New world**, in the World section, brings the dialog back at any time.

| Option | Choices |
|-|-|
| Resolution | 64, 128 or 256 cells along each edge of a cube face: cells of about 150, 75 or 40 km |
| Start with | A blank ocean, generated continents, or the Earth |
| Seed (generated only) | A whole number from 0 to 4294967295. Blank picks one at random; **Random** fills one in |
| Land (generated only) | The share of the surface to make land, 0 to 100% |

- **Generated continents** are repeatable: the same seed and land give the same continents, at any resolution.
- **Earth** uses the real planet's elevation, with about 29% land at a sea level of 0 m. Greenland and Antarctica stand at the top of their ice. The data is fetched the first time it is needed; if that fails, the dialog says so and the current world is untouched.
- **A new world replaces the current one for good.** Its strokes can no longer be undone. The sea level returns to 0 m, the planet settings to Earth's and the date to Year 0. The camera, view, layer and tool settings stay as they were.
- Generating the finest grid takes about half a second, during which the page does not respond.

Two lines under the World heading describe the world:

- **How it started**, such as `Generated · 64 · seed 1977 · 30% land` or `Earth · 128`. To get a generated world back, enter the same seed and land.
- **The date**, such as `Year 0 · July`: the world's age and, where it applies, the month or summary on screen. Ages are rounded down, and large ones are written as `12,345 years`, `2.4 million years` or `4.5 billion years`.

### Saving

- **Autosave.** The world is saved in the browser about a second after each change, and at once when the page is closed, refreshed or put in the background. Reopening the page brings it back. "Saved" under the World buttons confirms the last save.
- **"Autosave unavailable"** means the browser would not store the world, as some will not in a private window. The page still works, but the world will not come back.
- The browser keeps one world for the page. With two tabs open, the one saved last wins.
- **Export** downloads the world as `world.earthsim`. **Import** replaces the current world with one from such a file, at once and without asking. A file that is damaged, not a world file, or from a newer version is refused, and the current world is untouched.

**What is saved,** in the browser and in a file: the terrain, resolution, sea level, planet settings, date, and how the world started.

**What is not saved:** the undo history, the camera, the view, layer, month and tool settings, and the temperature, which is worked out again.

A file saved before planet settings and dates existed loads with Earth's settings at Year 0.

## Tools

The Tools section chooses what the left mouse button does on the globe.

| Tool | Left-drag | Turning the globe |
|-|-|-|
| Move | Turns the globe | Left-drag; the wheel zooms |
| Raise, Lower, Smooth | Sculpts the terrain under the brush | Right-drag; the wheel zooms |

- **Brush radius:** 100 to 3,000 km.
- **Brush strength:** for Raise and Lower, how fast the ground at the centre of the brush rises or falls, 100 to 5,000 m/s. For Smooth, a setting from 1 (gentlest) to 100. The two are kept separately.

### Undo and redo

| Action | Keys |
|-|-|
| Undo | Ctrl+Z, or Cmd+Z on a Mac |
| Redo | Ctrl+Shift+Z or Ctrl+Y, or Cmd+Shift+Z on a Mac |

- Up to the last 100 strokes can be undone, or fewer once they hold about 64 MB between them.
- A new stroke after an undo discards what could have been redone.
- **Only the terrain is undone.** The sea level, planet settings, view and tool settings are not part of the history.

## View

| Control | Range | What it does |
|-|-|-|
| Relief exaggeration | 1× to 100×, starting at 40× | How much taller than true scale the land is drawn. Only the drawing changes |
| Sea level | −6,000 to 6,000 m in steps of 10 m | Where the sea stands. Raising it floods low ground. It is part of the world |
| Show cell grid | On or off | Draws the outlines of the grid's cells |
| Sunlight | On or off | Lights the globe from the sun; see [The sun](#the-sun). Not saved |
| Winds | On or off, starting off | Draws the surface winds as arrows over the globe; see [Winds](#winds). Not saved |
| Winds shown | Simulated or Observed, starting on Simulated | On an untouched Earth only: whether the arrows are the simulated winds or the observed Earth's; see [Simulated or observed winds](#simulated-or-observed-winds). Hidden on any other world |
| Wind speed | m/s, km/h or mph, starting on m/s | The unit wind speeds are written in, in the strip under the pointer and the key to the arrows. It changes both at once, and does not change the arrows. Shown whether or not Winds is on. The browser remembers it, as it does the open sections; it is not saved with the world |

## Planet

The Planet section sets the planet and its star. The settings are saved with the world. Each slider shows its value, and a mark on its track shows Earth's.

| Setting | Range | What it does |
|-|-|-|
| Axial tilt | 0° to 90° (Earth 23.44°) | How far the sunlight moves north and south through the year, and so how strong the seasons are. At 0° there are none |
| Star brightness | 0.1 to 10 × the Sun's | More sunlight warms the planet |
| Star mass | 0.1 to 10 × the Sun's | A heavier star shortens the year at the same distance. It does not change the sunlight, but a shorter year gives each season less time to warm or cool the planet |
| Orbit distance | 0.3 to 3 AU | Sunlight falls with the square of the distance, and the year lengthens farther out |
| Greenhouse strength | 0 to 3 × Earth's | How strongly the air holds in heat. At 0 there is no greenhouse effect |
| Day length | 3 hours to 30 days (Earth 24 hours) | How fast the planet turns, which sets how many bands of wind there are and how wide; see [Winds](winds.md). Changing it recalculates the winds only, not the temperature |

Under the sliders:

- **Sunlight:** what the planet receives compared with the Earth, such as `86% of Earth's` or `2.50 × Earth's`.
- **Year:** the length of the year, such as `365 days` or `3.2 years`.
- **A warning** when the settings leave the planet far colder or far hotter than the Earth. The temperature model is calibrated on the Earth and its results are rough far from it; see [Temperature](temperature.md#how-far-to-trust-it).
- **A second warning, for the winds,** when the day is shorter than 6 hours or longer than 4 days, or the tilt is above 54°. The wind model is calibrated on the Earth and its winds are rough there; see [Winds](winds.md#how-far-to-trust-it). It shows whether or not Winds is on.

**Reset to Earth** puts all six settings back at once. Planet changes are not part of undo. On the Earth, any change of a setting removes the Earth comparison, any day length but 24 hours included, and putting it back brings the comparison back.

## Layers

The Layers section chooses what the globe is coloured by.

- **Terrain:** the height colours the page opens on.
- **Temperature:** the near-surface air temperature. The relief is still raised and shaded, and the coastline is drawn as a thin line.
- **Pressure:** the sea-level pressure, in hPa; see [Pressure](#pressure). The relief and the coastline are drawn as in Temperature view.

In Temperature view, **Show** chooses what of the year is on the globe:

| Show | What it is |
|-|-|
| Month | One month, July to start with. A slider picks the month; **Play** steps through the year, a month a second |
| Annual average | The mean of the twelve months |
| Warmest month, Coldest month | Each place's own warmest or coldest month, which need not be the same month everywhere |
| Seasonal range | How far each place's warmest month is above its coldest |

- **The legend** sits over the bottom-right corner of the globe and says what is shown, such as "Air temperature in July, °C". While a new result is being worked out it says "Calculating" with a progress bar.
- **On an untouched Earth,** a second choice offers the simulated temperature, the observed one, or the difference between them. See [Temperature](temperature.md#earth-comparison).
- The layer, the view and the month are not saved. A new world goes back to July. Each layer keeps its own **Show** while another is on screen.

### Pressure

Pressure view colours the globe by the sea-level pressure of the winds' calculation, in hectopascals, for the month on screen.

- **Reduced to sea level.** The value is what the pressure would be at sea level at that place, so high ground does not show as low pressure: over a mountain it is the sea-level pressure there, not the thinner air at the summit.
- **Its colours** run from teal for low pressure, through near white, to brown for high. The near white is the planet's own mean over the whole year and the whole surface, and the scale is the same for every month and for the annual average, so a colour means the same in each as the year plays. The scale is at least 10 hPa wide, and the few places beyond its ends take the end colours.
- **Show** offers **Month** and **Annual average** only.
- **The legend** says what is shown, such as "Sea-level pressure in July, hPa" or "Annual average sea-level pressure, hPa". While the winds are being worked out it says "Calculating", with no year count, and "Pressure unavailable" if they cannot be.
- **The strip under the pointer** gives the pressure there, such as `July 1,018 hPa` or `Annual average 1,013 hPa`.
- **It is worked out with the winds,** from the temperature. Choosing Pressure asks for them even while Winds is off, and the colours appear once they are ready. Winds can be shown over it.
- **On an untouched Earth,** a second choice offers the simulated pressure, the observed one (the mean sea-level pressure of 1981 to 2010), or the difference between them, as for the temperature. The observed pressure is fetched the first time Observed or Difference is chosen; a line under the choice says "Loading observed pressure" meanwhile, and "Observed pressure could not be loaded" if it fails, when the choice goes back to Simulated and the next choice tries again.
  - **The legend** then says where the field comes from, such as "Observed sea-level pressure in July, hPa" or "Simulated less observed in July, hPa", and gives the mean and the root-mean-square of the simulated less the observed for the month or annual average on screen, in hPa, such as `Mean +1.2 hPa · RMS 4.5 hPa`.
  - **The difference** is drawn from −20 to +20 hPa, marked every 10, in the temperature difference's blue-to-red colours: blue where the simulated pressure is too low, red where it is too high. The scale is the same for every month and the annual average.
  - Any edit of the Earth removes the choice and puts it back on Simulated, and undoing the edit offers it again, as for the temperature.

### The value under the pointer

A strip at the bottom left of the globe describes the place under the pointer:

- its position, such as `27.9° N, 86.9° E`;
- its elevation from the sea level, such as `1,234 m` on land or `3,400 m deep` at sea;
- in Temperature or Pressure view, its value in what the globe shows, such as `July 18 °C`, `Seasonal range 12 °C` or `July 1,018 hPa`, followed by "out of date" when the result on the globe is not current;
- while Winds is on, on a line of its own, the wind there: its speed in the **Wind speed** unit, as a whole number, and the direction it blows from, one of the eight points of the compass, such as `7 m/s from the north-east`.

About the wind's line:

- **It is the cell's own wind,** from the same winds the arrows are drawn from, not the mean of an arrow's patch, and it is not capped at 10 m/s as the arrows are.
- **"calm"** below 0.5 m/s, in every unit, where no arrow would be drawn.
- **On Annual average** it is the mean wind of the year and says so: `Annual average 7 m/s from the north-east`.
- **"observed"** ends the line while the arrows are the observed winds: `7 m/s from the west observed`, `Annual average 7 m/s from the west observed`, or `calm observed`. A simulated wind has no mark.
- **"out of date"** follows the wind, apart from the temperature's mark, when the winds on the globe are not current, as while new ones are being worked out.
- There is no wind line while Winds is off, or before the first winds are ready.

It works with any tool, and is hidden while the pointer is off the globe. In a narrow window it moves above the legend. Screen readers read the legend but not the strip.

## The sun

The star is drawn in the scene as a glowing disc.

- **Where it is.** It stands over longitude 60° W and moves north and south with the month on screen, almost as far as the axial tilt at midsummer.
- **Finding it.** The page opens with the sun behind the viewer. It can be seen only from the night side, in the gap between the planet's edge and the edge of the view. Zooming out helps, and near the solstices the view has to be tilted as well as turned.
- **Its size** is drawn larger than life: 2.7° across for Earth's settings, and from about 0.6° to 9.5° across the sliders. A heavier star or a closer orbit draws it larger.
- **Its colour** follows its surface temperature, worked out from its brightness and mass: red for a cool star, through orange and yellow to near white for one like the Sun, and blue-white for a hot one. Brightness and mass are separate sliders, so a pairing no real star has gives a colour no real star of that mass has.

**Sunlight**, in the View section, lights the globe from the sun:

- **In Terrain view** the day side is evenly lit and the night side drawn at 30% brightness, with a soft edge between them.
- **In Temperature and Pressure view** the colours are left alone, since a darkened colour would read as another value. The edge between day and night is drawn as a thin line.
- While Sunlight is on, the month slider and **Play** also show in Terrain view, where they move the sun through the year.

## Winds

**Winds**, in the View section, draws the surface winds as arrows over whichever colours the globe shows, Terrain, Temperature or Pressure. The winds are worked out from the temperature, so ticking Winds asks for the temperature too, and the arrows appear once both are ready. [Winds](winds.md) explains how they are worked out and how far to trust them.

- **Each arrow** points the way the wind blows and stands for the patch of the surface around it: it shows the mean wind of that patch, the winds of its cells averaged as arrows, the larger cells counting for more.
- **Length and weight** grow with the speed, from 8 pixels just above 0.5 m/s to 26 pixels at 10 m/s, and no further for a stronger wind. A wind below 0.5 m/s is calm and has no arrow.
- **The same size at every zoom.** The arrows keep their size on the screen. Zooming in brings more of them, closer together on the globe, in steps from about 8° apart to about 2°, so they never crowd one another.
- **On the relief.** The arrows stand on the raised relief at every exaggeration, and fade out towards the globe's edge, so none show from the far side.
- **The key** beside the legend shows arrows of 5 m/s and of 10 m/s or more, labelled "10+ m/s", at the size they are drawn on the globe. In km/h they are labelled "18 km/h" and "36+ km/h", and in mph "11 mph" and "22+ mph"; see **Wind speed** in [View](#view). Under them it says "Calculating" while the winds, or the temperature they wait for, are being worked out, "Out of date" after a change they do not yet take in, "Not calculated yet" before the first when nothing is being worked out, and "Winds unavailable" if they cannot be worked out.

Which winds are shown follows the Layers section:

| Shown | Winds |
|-|-|
| Terrain, or Temperature or Pressure by month | The month on screen. While Winds is on, the month slider and **Play** also show in Terrain view |
| Annual average | The mean of the twelve months, worked out as arrows, so winds that turn round through the year, such as a monsoon's, largely cancel |
| Warmest month, Coldest month, Seasonal range | The month last on screen |

- While new winds are being worked out, the last ones stay on the globe. A new world drops them until its own are ready.
- Clearing Winds removes the arrows and stops the winds being worked out, unless Pressure is on screen, which needs them.
- The strip under the pointer gives the wind of the place under it; see [The value under the pointer](#the-value-under-the-pointer).

### Simulated or observed winds

On an untouched Earth, **Winds shown**, under Winds in the View section, chooses whether the arrows are the simulated winds or the observed Earth's: the mean wind ten metres up for each month of 1981 to 2010, on a 1° grid taken onto the world's cells. On any other world it is hidden and the arrows are the simulated winds.

- **Fetched when first chosen.** Nothing is downloaded until Observed is chosen. Meanwhile the simulated arrows stay and the key says "Loading observed winds". If the download fails the key says "Observed winds could not be loaded", the choice goes back to Simulated, and choosing Observed again tries again. Where the winds themselves stand comes first on the key's line: while they are out of date or being worked out it says that, and the line about the observed winds shows once they are current.
- **Which month.** The observed arrows follow the month on screen, and on Annual average they are the mean of the observed year, worked out as arrows as the simulated mean is. They need the simulated winds to be ready, as the observed temperature needs the simulated one.
- **Any edit removes the choice** and puts the arrows back on Simulated: a stroke, a change of sea level, a planet setting or a new world. Undoing the edit offers the choice again, on Simulated; the observed winds already fetched are kept.
- **Never out of date.** While the observed arrows are shown, the key says nothing of the simulated winds being worked out again.

Once the observed winds have been fetched, the key gives two lines under its arrows, whichever is shown, for as long as the world is the untouched Earth:

| Line | What it means |
|-|-|
| Off by 3.8 m/s on average | The area-weighted root-mean-square difference between the simulated and the observed wind, as vectors, in the **Wind speed** unit to one decimal, such as `Off by 13.7 km/h on average`. It changes with the unit at once |
| Direction right on 61% of the map | The share of the surface, where the observed wind is at least 1 m/s, on which the simulated wind points within 45° of the observed, as a whole percentage. A calm simulated wind there counts as pointing wrongly |

- **The month's or the year's.** By month the figures are the month's on screen; on Annual average they are the whole year's, every cell of every month taken together.
- **The tooltip** of each line gives its exact definition.
- **While the simulated winds are out of date** the figures stay under the simulated arrows, describing the winds on the globe, and are left off under the observed ones, as the legend does with the temperature's figures.

## Statistics

The Statistics section shows how much of the surface is land, the highest and deepest points, the mean height of the land and the mean depth of the ocean. It follows the terrain and the sea level, a moment after each change.

- The highest and deepest points are elevations on the scale of the Sea level slider. The two means are measured from the sea level.
- "Statistics unavailable" means the worker that computes them could not start or failed. The rest of the page keeps working; reload the page to try again.
