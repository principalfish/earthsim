# Heat carried by winds, and the climate loop

Today heat spreads evenly between neighbouring cells, so a west coast and an east coast at the same latitude get the same climate. On the Earth the model gives almost no difference between them, where the real west coasts are about 11 K warmer than the east coasts across Europe and Asia at 40–60°N, and 23 K in January; its east coasts are 14–17 K too warm in winter.

The winds now carry heat. The climate is worked out as a loop: the temperature, then the winds from it, then the temperature again with the heat those winds carry, repeated until it settles. Only the part of the wind that flows across the surface carries heat, so none is made where winds converge. The loop is what ocean currents and ice will plug into in the next steps.

The page shows the first pass at once, as the climate looks today, and each later pass as it lands, with the status naming the pass; Pause lets the pass under way finish. The temperature and winds become one climate solve in the worker. The one new setting, how strongly the wind carries heat, starts from a physical estimate and is checked against the Earth's west–east contrast; it appears in the config and on the Model settings screen.

Winds explain about a quarter of the Earth's temperature error, so its overall figures move only modestly; the rest waits for the ocean, ice and the tuning step. Not included: ocean currents, rain, retuning other settings, the cooling with height and Antarctica (both noted for the tuning step).

## Plan

_2026-11-18 · 3 of 6 pieces done · now: waiting on a decision (piece 4)_

- [x] **1/6 The wind's flowing part** · `26e4dcb`
  The part of the surface wind that converges into lows is removed, so the rest can carry heat without making any.
- [x] **2/6 Heat carried by the wind, in the temperature solve** · `5fdab0c`, `35a6a00`
  The temperature solve takes the winds and moves heat downwind each step; with no winds it is exactly today's.
- [x] **3/6 The climate loop in the core** · `9735540`
  Temperature, winds and the heat they carry, repeated until it settles (0.1 °C, at most 6 passes).
- [ ] **4/6 The setting's value, and the baselines** · waiting on you
  How strongly the wind carries heat is set from physics and checked against the Earth's coasts; both baselines re-recorded with the coast contrast.
- [ ] **5/6 One climate request in the worker** · not started
  The worker answers one climate request with each pass as it lands.
- [ ] **6/6 The page: one scheduler, passes shown as they land** · not started
  The page shows the first pass at once and each refinement, with Pause between passes.
