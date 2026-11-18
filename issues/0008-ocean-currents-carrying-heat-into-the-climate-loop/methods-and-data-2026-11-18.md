# Methods and data for ocean currents (research read, 2026-11-18)

## Method
- **Stommel:** r∇²ψ + β∂ψ/∂x = curl(τ)/ρ. Second-order elliptic; SOR or multigrid on the cube grid, β term upwinded. ψ = 0 on the main coast; each island or extra continent gets its own constant from Godfrey's island rule (https://faculty.washington.edu/kessler/sverdrup/islandrule/islandrule.html). Munk (biharmonic) needs two boundary conditions and rings on coarse grids.
- **Boundary width:** Stommel width r/β; with β ≈ 2e-11, r ≈ 6e-6 /s gives ~300 km at 64, r ≈ 2e-6 /s ~100 km at 256 (the reader's arithmetic). Munk A ≈ 6e4 (64) to 2e3 m²/s (256) for a layer ≥ 3 cells (https://mitgcm.org/public/r2_manual/final/online_documents/node115.html).
- **Failure modes:** a circumpolar channel has no Sverdrup closure (transport ∝ 1/r: clamp it); Ekman τ/(ρf) blows up at the equator (floor |f| at ~5°); basins a few cells wide just drift downwind.
- **Upwelling add-on:** where the offshore Ekman component at a coast is positive, relax SST toward cold subsurface water: cold eastern-boundary coasts.

## Other tools
- Rule-placed gyres (Worldbuilding Pasta, Artifexian): instant, look right, break on odd maps, no feedback (https://worldbuildingpasta.blogspot.com/2020/10/an-apple-pie-from-scratch-part-vic.html).
- PlaSim/ExoPlaSim: 50 m slab with a Q-flux diagnosed from a fixed-SST run or plain diffusion (https://arxiv.org/pdf/1803.10751). Diffusion is stable but gives no warm-west/cold-east contrast.

## Europe's warmth
Most of the winter warmth comes from atmospheric advection and stored summer heat; ocean transport adds ~0–3 °C (Seager et al. 2002, https://ocp.ldeo.columbia.edu/res/div/ocp/gs/pubs/Seager_etal_QJ_2002.pdf; Rhines & Häkkinen 2003, https://usclivar.org/sites/default/files/amoc/Rhines_Hakkinen_2003.pdf). At 26.5°N the horizontal gyre carries ~15% of 1.2 PW, the rest is overturning (https://nora.nerc.ac.uk/537761/). Cheap overturning: a Q-flux of ~0.5–1 PW taken from a basin's tropics and released at its open high-latitude end.

## Data (all redistributable with attribution)
| Dataset | Licence | Grid | Size |
|-|-|-|-|
| GDP drifter climatology (Laurindo 2017) | CC-BY 4.0 | 0.25°, monthly | 1 NetCDF |
| OSCAR v2 | NASA open | 0.25°, daily | large |
| ECCO | NASA open | 0.5°, monthly | large |
| Copernicus | free, attribution | varies | large |
| OISST v2 | public domain | 1°, monthly, 1991–2020 mean | 3.4 MB |
| ERSST v5 | public domain | 2° | not checked |
| WOA23 | CC0 | 1°, monthly | not checked |
| HadISST | Open Government Licence | 1° | not checked |

GDP: https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_monthlymeans/index.html. OISST: https://downloads.psl.noaa.gov/Datasets/noaa.oisst.v2/. At 1° int16 a monthly u,v set is ~3 MB.

Recommended: Stommel streamfunction with island constants plus Ekman upwelling; GDP monthly drifter climatology for currents; OISST v2 1991–2020 1° mean for SST.
