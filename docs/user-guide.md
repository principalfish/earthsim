# User guide

Every control on the page. For how the temperature is worked out, see [Temperature](temperature.md); for the winds, [Winds](winds.md).

## The tiles over the globe

A column of tiles down the left edge of the globe chooses what it shows. Each tile is a button with an icon over its name, and its name shows as a tooltip.

| Tile | What it does |
|-|-|
| **Layers:** Terrain, Temperature, Pressure | What the globe is coloured by, one at a time, starting on Terrain; see [Layers](#layers). The chosen tile is outlined |
| **Overlays:** Winds | Draws the surface winds over the globe, as arrows or streaks, starting off; see [Winds](#winds). Not saved |
| **Overlays:** Sunlight | Lights the globe from the sun, starting off; see [The sun](#the-sun). Not saved |
| **Overlays:** Grid | Draws the outlines of the grid's cells, starting off. Not saved |

- Each overlay tile switches on and off by itself, and is outlined while it is on.
- From the keyboard, Tab reaches the chosen layer's tile, and the arrow keys move the choice to the next layer or the one before, round from the last to the first. Tab then reaches each overlay tile, which Space or Enter switches.
- In a narrow window only the icons show; the tooltips still name them.
- In a window too short for all the tiles the column scrolls: turn the mouse wheel over a tile, or move to a tile with the keyboard.
- The globe can still be turned and sculpted anywhere beside the tiles.

## The top bar

Along the top of the globe, beside the tiles:

- **Show**, while Temperature or Pressure is on screen: what of that layer's year is on the globe; see [Layers](#layers). It is hidden on Terrain.
- **Simulated, Observed, Difference**, on an untouched Earth: where the layer on screen and the winds come from, one choice for both; see [Simulated, observed or difference](#simulated-observed-or-difference).
- In a narrow window the two take a line each.

## The timeline

Along the bottom of the globe, beside the tiles, while what is shown depends on the month: Temperature or Pressure on **Month**, or Sunlight or Winds on. Otherwise it is hidden.

- **Play** steps through the year, a month a second, from December round to January; while it plays the button shows **Pause**, which stops it on the month shown. It stops by itself on a new world, and when what is shown no longer depends on the month.
- **The month** is a slider under the twelve months' first letters, with the month shown boxed; July to start with. Drag the slider or click a letter to pick a month. Picking one while the year plays carries on from there.
- From the keyboard, Tab reaches **Play**, which a screen reader calls "Play the year" (or "Pause the year" while it plays), and then the slider, which the arrow keys move a month at a time; a screen reader hears the month's name.
- The globe can still be turned and sculpted between the timeline's controls.

## The info box

One box over the bottom-right corner of the globe, above the timeline, describes what is on screen. It holds, from the top, only the parts that apply:

- **The legend,** while Temperature or Pressure is on screen: what is shown, such as "Air temperature in July, °C", its colours with values marked under them, and on an untouched Earth the comparison's figures. Places beyond either end of the scale take its end colours; the legend has no words for them; see [Layers](#layers).
- **One status line** for the layer and the winds together, saying where their calculation stands. When the two stand differently it says the worse, in this order: unavailable ("Temperature unavailable", "Pressure unavailable", "Winds unavailable"), "Calculating", "Out of date", "Not calculated yet". While the temperature on screen is being worked out it gives the years done, such as "Calculating · year 3, about 2 to go", and a progress bar runs under the line while the layer on screen is being worked out. While everything shown is current the line says nothing, except "Loading observed winds" or "Observed winds could not be loaded" when that is so.
- **The value under the pointer,** while the pointer is over the globe, under a rule, in two lines: the place, such as `1.7° N, 49.1° E · 4,628 m deep`, and its values, such as `28 °C · 15 mph S`; see [The value under the pointer](#the-value-under-the-pointer).

The box has no key to the arrows or streaks, and no figures of the winds against the observed.

- With Terrain alone and the pointer off the globe there is no box. With Winds on as well, it shows only while the status line has something to say.
- In a narrow window the box takes the whole width beside the tiles. In a window too short for it, its top tucks under the top bar, whose controls stay in front.
- The globe can still be turned and sculpted through the box.
- Screen readers hear the status line once each time it changes, and never the value under the pointer.

## The panel

The panel on the right has five sections, in this order: **World, View, Planet, Tools, Statistics**.

- Each section opens and closes from its heading, by mouse or with Enter or Space.
- On a first visit only World is open. The browser remembers which sections are open; this is a browser setting, not part of the world.
- While Tools is closed, its heading names the tool chosen, such as `Tools · Raise`.
- No section opens or closes by itself: switching **Sunlight** or **Winds** on leaves the panel as it is.
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
| Winds drawn as | Arrows or Streaks, starting on Arrows | Whether the winds are drawn as arrows that stand still or as streaks carried along by the wind; see [Arrows or streaks](#arrows-or-streaks). Shown whether or not Winds is on. The browser remembers it, as it does the wind speed unit; it is not saved with the world |
| Wind speed | m/s, km/h or mph, starting on m/s | The unit the wind under the pointer is written in, in the [info box](#the-info-box). It changes it at once, and does not change the arrows. Shown whether or not Winds is on. The browser remembers it, as it does the open sections; it is not saved with the world |

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

The **Layers** tiles over the globe choose what it is coloured by, and the top bar holds the layer's **Show** choice and, on an untouched Earth, the comparison. The month and **Play** are on the [timeline](#the-timeline).

- **Terrain:** the height colours the page opens on.
- **Temperature:** the near-surface air temperature. The relief is still raised and shaded, and the coastline is drawn as a thin line.
- **Pressure:** the sea-level pressure, in hPa; see [Pressure](#pressure). The relief and the coastline are drawn as in Temperature view.

In Temperature view, **Show**, in the top bar, chooses what of the year is on the globe:

| Show | What it is |
|-|-|
| Month | One month, July to start with, picked or played on the [timeline](#the-timeline) |
| Annual average | The mean of the twelve months |
| Warmest month, Coldest month | Each place's own warmest or coldest month, which need not be the same month everywhere |
| Seasonal range | How far each place's warmest month is above its coldest |

- **The legend,** in the [info box](#the-info-box), says what is shown, such as "Air temperature in July, °C". While a new result is being worked out the box's status line says "Calculating", with the years done and a progress bar.
- **On an untouched Earth,** the comparison in the top bar offers the simulated temperature, the observed one, or the difference between them; see [Simulated, observed or difference](#simulated-observed-or-difference) and [Temperature](temperature.md#earth-comparison).
- The layer, the view, the month and the comparison's choice are not saved. A new world goes back to July and to Simulated. Each layer keeps its own **Show** while another is on screen.

### Pressure

Pressure view colours the globe by the sea-level pressure of the winds' calculation, in hectopascals, for the month on screen.

- **Reduced to sea level.** The value is what the pressure would be at sea level at that place, so high ground does not show as low pressure: over a mountain it is the sea-level pressure there, not the thinner air at the summit.
- **Its colours** run from teal for low pressure, through near white, to brown for high. The near white is the planet's own mean over the whole year and the whole surface, and the scale is the same for every month and for the annual average, so a colour means the same in each as the year plays. The scale is at least 10 hPa wide, and the few places beyond its ends take the end colours.
- **Show** offers **Month** and **Annual average** only.
- **The legend** says what is shown, such as "Sea-level pressure in July, hPa" or "Annual average sea-level pressure, hPa". While the winds are being worked out the info box's status line says "Calculating", with no year count, and "Pressure unavailable" if they cannot be.
- **The value under the pointer** gives the pressure there, such as `1,018 hPa`, whether by month or on the annual average.
- **It is worked out with the winds,** from the temperature. Choosing Pressure asks for them even while Winds is off, and the colours appear once they are ready. Winds can be shown over it.
- **On an untouched Earth,** the comparison in the top bar offers the simulated pressure, the observed one (the mean sea-level pressure of 1981 to 2010), or the difference between them, as for the temperature. The observed pressure is fetched the first time it is needed: when Observed or Difference is chosen on Pressure, or Pressure is chosen while either is on. A line under the choice says "Loading observed pressure" meanwhile, and "Observed pressure could not be loaded" if it fails. The choice then goes back to Simulated when Pressure is still on screen, and the next choice tries again; if Pressure has been left, the choice is kept and the fetch is tried again on coming back to it.
  - **The legend** then says where the field comes from, such as "Observed sea-level pressure in July, hPa" or "Simulated less observed in July, hPa", and gives the mean and the root-mean-square of the simulated less the observed for the month or annual average on screen, in hPa, such as `Mean +1.2 hPa · RMS 4.5 hPa`.
  - **The difference** is drawn from −20 to +20 hPa, marked every 10, in the temperature difference's blue-to-red colours: blue where the simulated pressure is too low, red where it is too high. The scale is the same for every month and the annual average.
  - Any edit of the Earth removes the choice and puts it back on Simulated, and undoing the edit offers it again, as for the temperature.

### Simulated, observed or difference

On an untouched Earth, one control in the top bar chooses where both the layer on screen and the winds come from. What it offers depends on what is on screen:

| On screen | Offered |
|-|-|
| Temperature or Pressure, with Winds on or off | Simulated, Observed, Difference |
| Terrain with Winds on | Simulated, Observed |
| Terrain with Winds off | Nothing: the control is hidden |

| Choice | The layer | The winds |
|-|-|-|
| Simulated | Simulated | Simulated |
| Observed | Observed | Observed |
| Difference | The simulated less the observed | Simulated |

- **It starts on Simulated,** and on any world but the untouched Earth there is no control and everything is simulated. The choice is not saved.
- **Kept from layer to layer.** Going from Temperature to Pressure, or back, keeps Observed or Difference. The new layer's observed data is fetched then, if it has not been already: the simulated layer shows meanwhile, with its loading line under the control, and if it cannot be fetched the line says so and the choice goes back to Simulated. A fetch that fails after its layer has been left keeps the choice, and is tried again on coming back to that layer.
- **Going to Terrain** on Difference puts the choice back on Simulated, as it does on Observed with Winds off; on Observed with Winds on it stays, and the arrows stay observed.
- **Fetched when first needed.** Choosing Observed or Difference fetches the layer's observed data and, while Winds is on, the observed winds; switching Winds on while either is chosen fetches the winds then. If either cannot be fetched while what it is for is still on screen (the layer, or Winds on), the choice goes back to Simulated and its line says so: the layer's under the control, the winds' on the info box's status line.
- **Any edit removes the control** and puts everything back on Simulated: a stroke, a change of sea level, a planet setting or a new world. Undoing the edit offers it again, on Simulated.

### The value under the pointer

The last part of the [info box](#the-info-box) describes the place under the pointer in two lines, each part apart from the next by a middle dot:

- **The place:** its position, then its elevation from the sea level, such as `27.9° N, 86.9° E · 1,234 m` on land or `1.7° N, 49.1° E · 4,628 m deep` at sea.
- **Its values:** in Temperature or Pressure view the value of what the globe shows, then, while Winds is on, the wind there, such as `28 °C · 15 mph S`. With only one of the two the line holds that one, such as `7 m/s NE` on Terrain with Winds on or `1,018 hPa` with Winds off; with neither there is no second line.

About the layer's value:

- **No month or summary is named:** the value is the same whatever of the year the globe shows, such as `18 °C` by month, on the annual average or as the seasonal range, which the legend's caption names.
- **"observed"** or **"difference"** follows it when that is what the globe shows: `21 °C observed`, `+2 °C difference`.
- **"out of date"** follows it when the result on the globe is not current: `28 °C out of date`.

About the wind:

- **Its speed** is in the **Wind speed** unit, as a whole number, and its direction is the point of the compass it blows from, one of N, NE, E, SE, S, SW, W and NW: `15 mph S` blows from the south. On Annual average it is the mean wind of the year.
- **It is the cell's own wind,** from the same winds the arrows are drawn from, not the mean of an arrow's patch, and it is not capped at 10 m/s as the arrows are.
- **"calm"** below 0.5 m/s, in every unit, with no direction, where no arrow would be drawn.
- **"observed"** follows the wind while the arrows are the observed winds: `7 m/s W observed` or `calm observed`. A simulated wind has no mark.
- **"out of date"** follows the wind, apart from the layer's mark, when the winds on the globe are not current, as while new ones are being worked out.
- There is no wind while Winds is off, or before the first winds are ready.
- A line too long for the box is cut short.

It works with any tool, and is hidden while the pointer is off the globe. Screen readers hear the info box's status line but not the value under the pointer.

## The sun

The star is drawn in the scene as a glowing disc.

- **Where it is.** It stands over longitude 60° W and moves north and south with the month on screen, almost as far as the axial tilt at midsummer.
- **Finding it.** The page opens with the sun behind the viewer. It can be seen only from the night side, in the gap between the planet's edge and the edge of the view. Zooming out helps, and near the solstices the view has to be tilted as well as turned.
- **Its size** is drawn larger than life: 2.7° across for Earth's settings, and from about 0.6° to 9.5° across the sliders. A heavier star or a closer orbit draws it larger.
- **Its colour** follows its surface temperature, worked out from its brightness and mass: red for a cool star, through orange and yellow to near white for one like the Sun, and blue-white for a hot one. Brightness and mass are separate sliders, so a pairing no real star has gives a colour no real star of that mass has.

The **Sunlight** tile lights the globe from the sun:

- **In Terrain view** the day side is evenly lit and the night side drawn at 30% brightness, with a soft edge between them.
- **In Temperature and Pressure view** the colours are left alone, since a darkened colour would read as another value. The edge between day and night is drawn as a thin line.
- While Sunlight is on, the [timeline](#the-timeline) also shows in Terrain view, where it moves the sun through the year.

## Winds

The **Winds** tile draws the surface winds as arrows, or as streaks (see [Arrows or streaks](#arrows-or-streaks)), over whichever colours the globe shows, Terrain, Temperature or Pressure. The winds are worked out from the temperature, so switching Winds on asks for the temperature too, and the arrows appear once both are ready. [Winds](winds.md) explains how they are worked out and how far to trust them.

- **Each arrow** points the way the wind blows and stands for the patch of the surface around it: it shows the mean wind of that patch, the winds of its cells averaged as arrows, the larger cells counting for more.
- **Length and weight** grow with the speed, from 8 pixels just above 0.5 m/s to 26 pixels at 10 m/s, and no further for a stronger wind. A wind below 0.5 m/s is calm and has no arrow.
- **The same size at every zoom.** The arrows keep their size on the screen. Zooming in brings more of them, closer together on the globe, in steps from about 8° apart to about 2°, so they never crowd one another.
- **On the relief.** The arrows stand on the raised relief at every exaggeration, and fade out towards the globe's edge, so none show from the far side.
- **Where the winds stand.** The [info box](#the-info-box)'s status line says "Calculating" while the winds, or the temperature they wait for, are being worked out, "Out of date" after a change they do not yet take in, "Not calculated yet" before the first when nothing is being worked out, and "Winds unavailable" if they cannot be worked out, unless the layer on screen has worse to say.

Which winds are shown follows the layer's **Show**:

| Shown | Winds |
|-|-|
| Terrain, or Temperature or Pressure by month | The month on screen. While Winds is on, the [timeline](#the-timeline) also shows in Terrain view |
| Annual average | The mean of the twelve months, worked out as arrows, so winds that turn round through the year, such as a monsoon's, largely cancel |
| Warmest month, Coldest month, Seasonal range | The month last on screen |

- While new winds are being worked out, the last ones stay on the globe. A new world drops them until its own are ready.
- Switching Winds off removes the arrows and stops the winds being worked out, unless Pressure is on screen, which needs them.
- The value under the pointer gives the wind of the place under it; see [The value under the pointer](#the-value-under-the-pointer).

### Arrows or streaks

**Winds drawn as**, in the View section, draws the winds as **Arrows**, as above, or as **Streaks**: many short trails carried along by the wind and fading behind their heads, as on weather maps.

- **Faster and longer where the wind is stronger.** A trail's head moves with the wind where it is, about 15° of arc in three seconds in a 10 m/s wind and half as far in a wind half as strong, so a trail in a 10 m/s wind is about 3° long and one in a gentle wind short. Trails in calm air, below 0.5 m/s, fade out and start again elsewhere.
- **The same winds as the arrows.** Streaks follow whatever the arrows would show: Simulated or Observed, the month on screen or the year's mean. Playing the year or changing the month changes the winds under the trails, which carry on from where they are.
- **Each trail lives a few seconds,** fading in and out, and starts again somewhere else in view; one that passes out of view starts again too. There are more of them when the whole globe is in view and fewer close in, where each is longer on the screen; never more than 3,000.
- **On the relief.** Like the arrows, the streaks lie on the raised relief at every exaggeration, keep their width on the screen, and fade out towards the globe's edge.
- **The info box** is the same either way.
- **The page draws continuously only while streaks are moving:** while Streaks is chosen, Winds is on, there are winds to show and the page is visible. Choosing Arrows, switching Winds off or putting the tab in the background stops it, and the page draws only when something changes, as it does with arrows.
- **Reduced motion.** Streaks are offered even when your system is set to reduce motion, since they move only if you choose them; choosing Arrows stops them.
- The browser remembers the choice, as it does the open sections and the wind speed unit. Winds itself still starts off at each visit.

### Simulated or observed winds

On an untouched Earth, the comparison in the top bar also chooses whether the arrows are the simulated winds or the observed Earth's: the mean wind ten metres up for each month of 1981 to 2010, on a 1° grid taken onto the world's cells. Observed shows the observed winds; Simulated and Difference show the simulated ones. On Terrain with Winds on it offers Simulated and Observed; see [Simulated, observed or difference](#simulated-observed-or-difference). On any other world there is no control and the arrows are the simulated winds.

- **Fetched when first needed.** Nothing is downloaded until Observed or Difference is chosen with Winds on, or Winds is switched on while either is chosen. Meanwhile the simulated arrows stay and the info box's status line says "Loading observed winds". If the download fails it says "Observed winds could not be loaded", the choice goes back to Simulated, for the layer too, while Winds is still on, and choosing Observed again tries again. Where the results themselves stand comes first on the status line: while they are out of date or being worked out it says that, and the line about the observed winds shows once they are current.
- **Which month.** The observed arrows follow the month on screen, and on Annual average they are the mean of the observed year, worked out as arrows as the simulated mean is. They need the simulated winds to be ready, as the observed temperature needs the simulated one.
- **Any edit removes the choice** and puts the arrows back on Simulated, with the layer: a stroke, a change of sea level, a planet setting or a new world. Undoing the edit offers the choice again, on Simulated; the observed winds already fetched are kept.
- **Never out of date.** While the observed arrows are shown, the status line says nothing of the simulated winds being worked out again.
- **No figures on the page.** How far the simulated winds are from the observed is measured for the Earth's baseline (see [Winds](winds.md)), but the page does not show it.

## Statistics

The Statistics section shows how much of the surface is land, the highest and deepest points, the mean height of the land and the mean depth of the ocean. It follows the terrain and the sea level, a moment after each change.

- The highest and deepest points are elevations on the scale of the Sea level slider. The two means are measured from the sea level.
- "Statistics unavailable" means the worker that computes them could not start or failed. The rest of the page keeps working; reload the page to try again.
