# Move layers and overlays into the main view

What the globe shows is chosen in two sections of the side panel today: Layers for the colour layer, its view of the year and the month, and View for the winds, the sunlight and the cell grid. More layers are coming (rainfall, ocean currents, ice, storms, biomes), so these controls move out of the panel and onto the globe's own area, where what you're looking at is one click away.

Icon tiles run down the left edge of the globe: Terrain, Temperature and Pressure as one choice, then Winds, Sunlight and Grid as toggles. With Temperature or Pressure showing, the view of the year and, on an untouched Earth, one Simulated, Observed or Difference control sit at the top; that control now applies to the layer and the winds together. A month timeline with Play runs along the bottom. The legend, the wind key, the calculating status and the value under the pointer become one info box.

The climate is now worked out after every change to the world, whatever is on screen, since most of the page depends on it. A Pause button stops that while sculpting and catches up when released.

The browser remembers the layer and toggles between visits. A new Settings section in the side panel sets the units, all metric or all imperial with an override for each quantity, across every read-out and control, and whether winds are drawn as arrows or streaks, which now start as streaks unless the system asks for reduced motion.

Not included: any change to the temperature or wind models, a layout for phone-sized screens, heat carried by winds and the climate loop, and the folder refactor that follows.

## Plan

_2026-11-17 · 11 of 12 pieces done · now: waiting on a decision (piece 12)_

- [x] **1/12 The main-view regions, the icons, and the layer and overlay tiles** · `6278b72`
  Icon tiles down the left edge of the globe choose the colour layer and switch Winds, Sunlight and the grid.
- [x] **2/12 Show and one comparison control at the top** · `996d82c`
  The view of the year and one Simulated, Observed or Difference control, for the layer and the winds together.
- [x] **3/12 The month timeline, and the Layers section removed** · `f91b134`
  The month slider and Play along the bottom of the globe; the side panel loses its Layers section.
- [x] **4/12 One info box** · `7e3cd2e`
  The legend, the wind key, one status and the value under the pointer in a single box.
- [x] **5/12 Everything worked out after every change, with Pause** · `07c3a26`
  The climate is solved after every change and when the page opens, with a Pause button for sculpting.
- [x] **6/12 The browser remembers the view** · `7c01ae3`
  The layer, its view of the year and the three toggles come back as they were left.
- [x] **7/12 The Settings section, with arrows or streaks starting on Streaks** · `77d695d`
  A Settings section in the side panel; winds start as streaks unless the system asks for reduced motion.
- [x] **8/12 Units: the model and its settings** · `aad58e3`
  Metric or Imperial with an override for each quantity, in Settings; wind speed follows it first.
- [x] **9/12 Units in the read-outs** · `383f8e4`
  The legend, the info box and the Statistics follow the units, with round ticks in each.
- [x] **10/12 Units in the controls** · `6bf4fac`
  The Sea level, brush and New world controls read in the chosen units.
- [x] **11/12 Choosing Metric or Imperial clears the overrides** · `2a510dd` · added 2026-11-17: at the user's request
  Clicking Metric or Imperial sets every unit to that family, clearing any override.
- [ ] **12/12 The user guide restructured around the main view** · not started (was 11)
  The guide and the development notes put in order for the new layout.
