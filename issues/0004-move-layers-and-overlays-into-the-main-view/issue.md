# Move layers and overlays into the main view

What the globe shows is chosen in two sections of the side panel today: Layers for the colour layer, its view of the year and the month, and View for the winds, the sunlight and the cell grid. More layers are coming (rainfall, ocean currents, ice, storms, biomes), so these controls move out of the panel and onto the globe's own area, where what you're looking at is one click away.

Icon tiles run down the left edge of the globe: Terrain, Temperature and Pressure as one choice, then Winds, Sunlight and Grid as toggles. With Temperature or Pressure showing, the view of the year and, on an untouched Earth, one Simulated, Observed or Difference control sit at the top; that control now applies to the layer and the winds together. A month timeline with Play runs along the bottom. The legend, the wind key, the calculating status and the value under the pointer become one info box.

The climate is now worked out after every change to the world, whatever is on screen, since most of the page depends on it. A Pause button stops that while sculpting and catches up when released.

The browser remembers the layer and toggles between visits. A new Settings section in the side panel sets the units, all metric or all imperial with an override for each quantity, across every read-out and control, and whether winds are drawn as arrows or streaks, which now start as streaks unless the system asks for reduced motion.

Not included: any change to the temperature or wind models, a layout for phone-sized screens, heat carried by winds and the climate loop, and the folder refactor that follows.

## Plan

_2026-11-15 · 3 of 11 pieces done · now: piece 4 in progress_

- [x] **1/11 The main-view regions, the icons, and the layer and overlay tiles** · `6278b72`
  Icon tiles down the left edge of the globe choose the colour layer and switch Winds, Sunlight and the grid.
- [x] **2/11 Show and one comparison control at the top** · `996d82c`
  The view of the year and one Simulated, Observed or Difference control, for the layer and the winds together.
- [x] **3/11 The month timeline, and the Layers section removed** · `f91b134`
  The month slider and Play along the bottom of the globe; the side panel loses its Layers section.
- [ ] **4/11 One info box** · in progress
  The legend, the wind key, one status and the value under the pointer in a single box.
- [ ] **5/11 Everything worked out after every change, with Pause** · not started
  The climate is solved after every change and when the page opens, with a Pause button for sculpting.
- [ ] **6/11 The browser remembers the view** · not started
  The layer, its view of the year and the three toggles come back as they were left.
- [ ] **7/11 The Settings section, with arrows or streaks starting on Streaks** · not started
  A Settings section in the side panel; winds start as streaks unless the system asks for reduced motion.
- [ ] **8/11 Units: the model and its settings** · not started
  Metric or Imperial with an override for each quantity, in Settings; wind speed follows it first.
- [ ] **9/11 Units in the read-outs** · not started
  The legend, the info box and the Statistics follow the units, with round ticks in each.
- [ ] **10/11 Units in the controls** · not started
  The Sea level, brush and New world controls read in the chosen units.
- [ ] **11/11 The user guide restructured around the main view** · not started
  The guide and the development notes put in order for the new layout.
