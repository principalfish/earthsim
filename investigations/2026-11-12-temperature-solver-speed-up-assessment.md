# Seasonal temperature solver: speed-up assessment

An independent, measured assessment of ways to speed up the temperature solver, asked for by the user on 2026-11-12 during issue 0002. Solving 256 worlds on the 128 grid with height cooling at full resolution is 4.7 times faster at a cost of 0.07 K RMS; three small solver fixes add 1.15 to 1.34 times with no change to the answer; together about 5.5 times. Nothing here is decided or built.

Solver as of commit `ff500c7`. All runs are Node 22, one thread, on a shared 12-core machine. Wall-clock times move by about 5 to 10 % between repeats because other work was running. CG iteration counts and the answers are deterministic, so every comparison below was checked against them as well as against time. "Diff" means the difference from the current answer for the same world and start, over all twelve months and all cells, in kelvin: the maximum, and the area-weighted RMS. "Earth error" means simulated minus observed. Throwaway edits were made in an isolated checkout and then reverted.

## 1. Baseline (re-measured)

| World | Start | Seconds | Years | Year changes (K) |
|-|-|-|-|-|
| Earth 64 | cold | 1.00 | 4 | 13.4, 0.75, 0.74, 0.026 |
| Earth 64 | warm, 500 m patch | 0.26 | 1 | 0.027 |
| Earth 64 | warm, sea +10 m | 0.61 | 3 | 1.77, 0.15, 0.038 |
| Earth 128 | cold | 4.40 to 4.75 | 4 | 13.3, 0.73, 0.71, 0.023 |
| Earth 128 | warm, patch | 1.24 to 1.26 | 1 | 0.028 |
| Earth 128 | warm, sea | 2.95 to 3.05 | 3 | 1.55, 0.17, 0.040 |
| Earth 256 | cold | 22.09 | 4 | |
| Earth 256 | warm, patch | 5.82 | 1 | |
| Earth 256 | warm, sea | 15.17 | 3 | |
| Generated 256 | cold | 25.11 | 5 | 22.1, 1.38, 0.54, 0.076, 0.037 |

Earth error, annual mean / annual RMS / January RMS / July RMS: 64: -0.15 / 3.93 / 4.45 / 4.80. 128: -0.18 / 3.96 / 4.46 / 4.87. 256: -0.19 / 3.98 / 4.47 / 4.93. These agree with the figures already known.

## 2. Where the time goes

Instrumented timers. Earth, cold, in milliseconds. "Step solves" is the CG inside each time step. "Cycle" is the multigrid preconditioner and "multiply" the matrix-vector product, both inside CG.

| Part | 128 cold | 256 cold | 256 share | 256 warm patch | 256 warm sea |
|-|-|-|-|-|-|
| Total | 4,750 | 22,090 | 100 % | 5,820 | 15,170 |
| Step solves (CG) | 3,221 | 15,964 | 72 % | 4,055 | 12,170 |
| of which multigrid cycles | about 2,250 | about 11,740 | 53 % | 2,973 | 7,922 |
| of which matrix multiply | 468 | 2,467 | 11 % | 629 | 1,663 |
| First guess / rough guess (cold: 12 solves; warm: 2) | 621 | 2,889 | 13 % | 866 (15 %) | 865 |
| Year-end correction (16 solves, 12 of them 0 iterations) | 374 | 1,436 | 6.5 % | 239 | 816 |
| Per-step physics (albedo, capacity, linearisation) | 238 | 818 | 3.7 % | 219 | 629 |
| setMass (validation, coarse masses, 24 by 24 Cholesky) | 114 | 409 | 1.9 % | 107 | 286 |
| Sunlight table and interpolation | 47 | 117 | 0.5 % | 28 | 85 |
| State update after each step | 36 | 148 | 0.7 % | 35 | 111 |
| Set-up plus solver build | 98 | 292 | 1.3 % | 205 | 165 |

CG iterations for each step solve (24 steps a year, so 96 solves cold):

| Grid | Mean | Range | Cost per multigrid cycle | Cost per multiply |
|-|-|-|-|-|
| 64 | 3.2 | 3 to 4 | 1.3 ms (53 ns per cell) | |
| 128 | 4.2 | 3 to 6 | 5.6 ms (57 ns per cell) | 1.2 ms (12 ns per cell) |
| 256 | 5.4 | 4 to 7 | 23 to 24 ms (60 ns per cell) | 4.8 ms (12 ns per cell) |

What follows from this:

- The cost is (years) × (24 steps) × (about 1 + 5 multigrid cycles), and each cycle costs about five stencil passes over the fine grid. Allocation, set-up, sunlight and physics together are under 8 %. Nothing outside the CG step solves and the guess is worth chasing on its own.
- Iterations grow slowly with resolution (3.2, 4.2, 5.4), so the cost grows a little faster than the cell count: 128 to 256 is 4.0× the cells and 4.6× the time.
- The number of years is the other big factor: 4 from cold (5 for the generated world), 1 for a local edit, 3 for a sea-level change. Years 2 and 3 of a cold solve both change by about 0.74 K. At 64, year 2 has 18,000 of 24,576 cells above the 0.05 K tolerance (Southern Ocean adjustment) and year 3 has 5,900 (led by sea-ice cells). So the year count is not caused by a few stray cells, and a looser stopping rule does not shorten a cold solve (checked: tolerance 0.15 K and 0.3 K both still take 4 cold years).
- A warm patch edit already runs the minimum of one year, so only the cost of each year can be cut there, not the number of years.
- Allocation is not a factor: there is nothing allocated per step apart from one small result object for each solve.

## 3. Options, measured where cheap

### A. Solve a 256 world on the 128 grid, apply lapse-rate cooling at 256 (measured)

The fine world's elevation is averaged 2 × 2 to 128 (for the Earth this gives exactly the same world as `earthWorld(earth, 128)`). It is solved at 128. The monthly air temperatures are turned back into sea-level temperatures using the 128 cooling, carried to 256, and cooled with each 256 cell's own height.

| Variant | 256 cold s | Speed-up | Diff max / RMS | Earth error annual mean / annual RMS / Jan / Jul |
|-|-|-|-|-|
| Current 256 | 22.09 | 1× | 0 | -0.19 / 3.98 / 4.47 / 4.93 |
| 128 solve, copy to the four children | 4.58 | 4.8× | 1.16 / 0.114 | -0.19 / 3.99 / 4.48 / 4.90 |
| 128 solve, bilinear within each face | 4.72 | 4.7× | 0.92 / 0.066 | -0.19 / 3.99 / 4.48 / 4.89 |
| 128 solve, coast-aware copy (tried; worse) | 4.76 | 4.6× | 1.38 / 0.115 | same |
| 64 solve, bilinear to 256 | 1.16 | 19× | 1.89 / 0.147 | -0.17 / 3.99 / 4.50 / 4.85 |
| Generated 256, 128 solve, bilinear | 5.35 vs 25.11 | 4.7× | 0.89 / 0.092 | n/a |
| Earth 128 world, 64 solve, bilinear | 1.08 vs 4.46 | 4.1× | 1.36 / 0.103 | -0.16 / 3.96 / 4.48 / 4.83 |

Warm solves follow the 128 times: patch 1.24 s against 5.82 s (4.7×), sea level 2.95 s against 15.17 s (5.1×). These come from the measured 128 and 256 runs. The coarse-only warm path was not run end to end.

The error is spread out, not concentrated at coasts. Cells whose land or sea class differs from their coarse parent cover 1.1 % of the area and have the same maximum as the rest. This is ordinary resolution difference, not a coastline artefact. For scale, any change to the inner solve (a different predictor, red-black ordering) already moves the current answer by about 0.2 K maximum and 0.03 K RMS, and the model is 4 K RMS from the observed Earth. Bilinear transfer here works only within a face and is clamped at face edges. Interpolating across cube edges would lower the maximum a little more.

Effort: low to moderate. Downsample the elevation, transfer with bilinear interpolation, keep the resumable state at 128 (the state and its fallback guess then live on the coarse grid), and add tests. Risk: low. The 256 map keeps full-resolution lapse-rate detail. Only the smooth sea-level field is coarser. This confirms the builder's estimate of about 5× at 256.

### B. Cheap bookkeeping and kernel fixes (measured, answer unchanged)

The three changes, measured together:

1. **Inverse diagonal in the Gauss-Seidel sweep.** Multiply by a stored `1 / diagonal` instead of dividing. A division sits in the sweep's serial dependency chain. This alone cut cycle time by 14 % at 128 (cold total 4.44 → 4.12 s). Diff 0.000.
2. **Skip the year-end correction's later passes when the first correction is under 1 K.** Passes 2 to 4 only refine the T⁴ chord for large shifts. 12 of the 16 correction solves took 0 iterations but still cost a multiply, a cycle and setMass each. Correction time 324 → 202 ms at 128 cold. Diff ≤ 0.001 K.
3. **Skip the 2-iteration rough guess on a warm start.** It exists only for the "has the world moved more than 50 K" fallback test, and costs 15 % of a warm solve (0.87 s at 256). In this trial it was skipped outright, which drops the fallback test, so a real version needs a cheap stand-in. For example, compute the rough guess on the 64 grid (about 25 ms), or store the planet settings in the state and fall back when they change by more than a set amount.

| Set B together | Cold | Warm patch | Warm sea | Diff |
|-|-|-|-|-|
| 128 | 4.46 → 3.90 (1.14×) | 1.26 → 0.97 (1.30×) | 2.95 → 2.45 (1.20×) | ≤ 0.001 K |
| 256 | 22.09 → 19.18 (1.15×) | 5.82 → 4.35 (1.34×) | 15.17 → 12.24 (1.24×) | ≤ 0.001 K |

Effort: low (a few dozen lines). Risk: low. The rough-guess replacement is the only part that needs design.

### C. A and B together (composed from measured parts)

A 256 world solved at 128 with set B: cold about 4.0 s (5.5× against 22.1), warm patch about 1.0 s (5.8×), warm sea about 2.5 s (6×). The browser was about 1.3 to 1.4× slower than Node in the builder's runs, so expect a 256 cold solve of about 5.5 s in the page, against 28.7 s now. This is an estimate.

### D. Structured-stencil multiply and restriction (microbenchmark; total is an estimate)

On a face's interior, the four neighbours are always `cell ± 1` and `cell ± n` (checked for every interior cell at 128 and 256). Microbenchmark at 256 in Node:

| Kernel | ns per cell |
|-|-|
| Multiply, current (neighbour table) | 7.9 to 8.3 |
| Multiply, Float32 coefficients | 8.2 to 8.4 (no gain) |
| Multiply, structured interior plus table for the face border | 5.5 to 5.6 |
| Same with separate arrays per side | 5.8 |
| Sweep, current (divide) | 11.0 to 12.0 |
| Sweep, inverse diagonal | 9.1 |
| Sweep, structured interior | 9.0 (no further gain; the sweep is bound by its serial chain) |
| Sweep, faces interleaved to break the chain | 12.6 to 13.8 (worse; loses cache locality) |

Using the structured stencil for the multiply and the residual restriction should save about 1.5 s of a 256 cold solve, about 8 % (estimate). Effort: low to moderate. Risk: low, with border cells kept on the table.

### E. Coarse first guess for a cold start (estimate)

The cold first guess (20 Newton iterations of the no-heat-capacity balance) costs 13 % at both 128 and 256 (2.9 s at 256). Computing it on 64 and interpolating would cost about 0.15 s. Estimated saving about 11 % of a cold solve. The number of years it then needs is not measured. If option A is adopted, this applies to the 128 solve.

### F. Coarse solve as the starting state, then fine years (measured; weak)

| Variant | Total s | Fine years | Diff max / RMS |
|-|-|-|-|
| 128 world from 64 state, run to converge | 4.08 vs 4.40 | 3 (1.69, 0.051, 0.005) | 0.057 / 0.013 |
| 256 world from 64 state, run to converge | 16.02 vs 22.09 (1.4×) | 3 (2.47, 0.069, 0.020) | 0.056 / 0.014 |
| 256 world from 128 solve, one fine year, no convergence check | 10.25 (2.2×) | 1 | 0.55 / 0.038 |

Starting from a coarse solve removes the guess and about one year. But the stopping test then needs two or three full fine years, because the first fine year moves coastal cells by 1 to 2.5 K. It is worth having only as a background refinement after option A: show the 128-based answer in about 4 s, then optionally polish it with one 256 year from that state (about 6 s more) for 0.04 K RMS.

### G. Looser inner (CG) tolerance (measured; not worth it)

| `solverToleranceK` | 128 cold | Warm patch | Warm sea | Mean iterations | Diff max / RMS |
|-|-|-|-|-|-|
| 0.005 (current) | 4.40 s, 4 years | 1.24 s | 2.98 s, 3 years | 4.2 | 0 |
| 0.02 | 3.49 s, 4 years | 1.05 s | 3.16 s, 4 years | 2.9 | 1.21 / 0.12 |
| 0.05 | 3.98 s, 6 years | 0.87 s | 2.20 s | 1.8 | 3.5 / 0.40 |

Solve errors feed back into the year-to-year change, so looser solves cost extra years and cost accuracy. A 20 % gain on a cold solve at 0.02 is paid back on the sea-level case.

### H. Better CG starting guesses (measured; not worth it)

- **Quadratic extrapolation instead of linear:** 9 % fewer iterations. But the warm patch then needed 2 years (first-year change 0.053 against the 0.05 tolerance), which is a net loss. Diff 0.19 / 0.027.
- **Last year's trajectory plus today's offset:** most solves then start inside tolerance and take 0 iterations. But the year then stops converging: 27 years cold, 23 warm patch, 7 sea at 128. This is a useful finding. The inner stopping estimate (mass-weighted RMS 5e-3 K) is looser than the year loop silently relies on. The current scheme converges because each solve normally overshoots its tolerance.

### I. Time steps (measured; not worth it)

One step a month at 128: about 6.2 iterations per solve instead of 4.2, 5 cold years instead of 4, so the total cycle count is about the same. Diff 4.0 / 0.50 K, July Earth RMS 4.87 → 5.18. Fewer, larger steps make each solve stiffer and cost accuracy with no net speed. (One timing in this run was disturbed by other load; the conclusion rests on the cycle counts.)

### J. Red-black Gauss-Seidel ordering (measured; not worth it in JavaScript)

4.7 iterations instead of 4.2, and no cheaper per cycle because of the order-array indirection. 128 cold 4.58 s against 4.44 s. It would matter only for a parallel or GPU smoother.

### K. Faster convergence across years (estimate)

The year-end correction is already a Newton-like jump. Cold solves stall for two years at about 0.74 K. Anderson or secant acceleration on the end-of-year state could remove at most one year: up to 25 % cold and 33 % on the sea-level case, and nothing on a local edit. Effort moderate. Risk moderate: it could be unstable on extreme planets, and it interacts with the ice threshold. Not measured.

### L. Restricting a warm re-solve to the edited region (footprint measured; speed is an estimate)

For the 500 m Tibetan patch, the answer changes by more than 0.05 K over 1.6 % of the globe, and by more than 0.1 K over 0.6 %. Beyond 20° from the edit, every change is under 0.04 K, which is the solver's noise floor. The same holds at 128 and 256. A regional solve could in principle be 10 to 20× faster for local edits. But it needs a separate sub-grid multigrid solver, boundary values through the year that are not stored (only monthly means are), and handling at cube edges. It does nothing for sea-level, planet or global edits. Effort high, risk medium to high. After option A, a 256 local edit already takes about 1 s, so this is not worth it now.

### M. Float32 against Float64 (microbenchmark; not worth it in JavaScript)

Float32 coefficients gave no gain (8.2 against 7.9 ns per cell). V8 does the arithmetic in double anyway, and the kernels are latency- and gather-bound, not bandwidth-bound (about 6 GB/s). Float32 matters only inside WebAssembly SIMD or on a GPU.

### N. WebAssembly, with or without SIMD (estimate)

JavaScript reaches about 8 to 9 ns per cell per stencil pass. A tight compiled loop without bounds checks might reach 3 to 5. Estimate 1.5 to 2× on the CG part, so about 1.4 to 1.7× overall. SIMD helps the structured multiply and restriction but not the serial sweep. A static `.wasm` file works fine on a static site. Effort moderate to high (a second toolchain, an exact-results policy, keeping the TypeScript version as the reference). Uncertainty high: not tried.

### O. Several threads (estimate)

CG needs global reductions and a halo exchange every iteration, so it needs shared memory. SharedArrayBuffer needs cross-origin isolation (COOP and COEP headers). GitHub Pages cannot set headers. Netlify and Cloudflare Pages can, and a service-worker shim can fake them at some fragility. Lexicographic Gauss-Seidel is serial, so a parallel version needs per-face blocks or a red-black or Chebyshev smoother, which means more iterations (see J). Estimate 2 to 3× on 4 to 6 cores. Effort high, risk high: a hosting constraint plus non-deterministic reduction order. Without shared memory, message passing per iteration is not practical.

### P. WebGPU compute (estimate)

All step physics and CG/multigrid would run on the GPU, in Float32, solving for the increment from the guess to keep precision, with a parallel smoother. Estimate 5 to 20× at 256 and much less at 64 (dispatch overhead). Effort very high: WGSL kernels, a CPU fallback for browsers without WebGPU, different results from the CPU path, and a GPU readback for convergence checks. Uncertainty very high.

## 4. Ranking

Speed-ups are for a 256 world against the current solver.

| Rank | Option | Speed-up | Accuracy cost | Effort | Risk | Basis |
|-|-|-|-|-|-|-|
| 1 | B: inverse diagonal, skip trivial correction passes, cheaper warm-start fallback test | 1.15× cold, 1.34× warm patch, 1.24× warm sea | none (≤ 0.001 K) | low | low | measured |
| 2 | A: solve 256 worlds on 128, bilinear transfer, full-resolution lapse rate | 4.7× cold, about 4.7× warm patch, 5× warm sea | 0.07 K RMS, 0.9 K max; Earth error unchanged within 0.04 K | low to moderate | low | measured |
| 3 | A + B together | about 5.5× cold, 5.8× warm patch, 6× warm sea | as A | | | composed from measured parts |
| 4 | D: structured multiply and restriction | about 8 % more | none | low to moderate | low | microbenchmark plus estimate |
| 5 | E: coarse first guess for cold starts | about 11 % on cold | none expected | low | low to medium (year count not measured) | estimate |
| 6 | F as background refinement: one fine year after A | adds about 6 s for 0.04 K RMS | improves A | low | low | measured |
| 7 | K: acceleration across years | up to 25 % cold, 33 % sea | small | moderate | moderate | estimate |
| 8 | N: WebAssembly | 1.4 to 1.7× overall | none, if done carefully | moderate to high | medium | estimate |
| 9 | O: threads | 2 to 3× | none, but not bit-reproducible | high | high (hosting headers) | estimate |
| 10 | P: WebGPU | 5 to 20× | Float32, different path | very high | high | estimate |
| Not worth it | G looser CG tolerance, H better CG starting guesses, I fewer steps, J red-black ordering, M Float32 in JavaScript, L regional re-solve (for now) | | | | | measured or estimated as above |

## 5. Recommendation

1. **Do B first.** It is nearly free, changes nothing visible, and applies at every resolution, including the 128 solve that A then relies on. The one design point is how the warm-start fallback test is done without the 0.87 s rough guess.
2. **Then A.** It gives most of the gain. It turns a 22 s cold 256 solve into about 4 s (about 5.5 s in a browser), and a 256 local edit into about 1 s, at an accuracy cost 50 times smaller than the model's own error against the observed Earth. Use bilinear transfer, not copying to the children. A 64-grid "draft" (19× at 256, 0.15 K RMS) could show something within about 1 s while the 128 solve runs.
3. **What compounds:** B, D and E speed up the coarse solve that A runs, so they multiply with A. F (one polishing 256 year in the background) and K (fewer years) are independent extras. Together, B + D + E + A might bring a 256 cold solve to about 3.3 s in Node (estimate).
4. **Not worth it now:** looser inner tolerance, cleverer CG predictors (they break the year convergence), one step a month, red-black ordering, Float32 in JavaScript, and the regional re-solve. Hold off on WebAssembly, threads and WebGPU unless 128 worlds themselves need to be several times faster. Threads also carry the cross-origin header constraint, and WebGPU needs a second code path.

## 6. What was not verified

- Option A's warm-start path was not run end to end. The figures given for it are the measured 128 warm times. Keeping the resumable state at 128 for a 256 world is a design change that was not built.
- Skipping the rough guess in B removes the fallback test. A cheap stand-in was not built or timed (about 25 ms at 64 is an estimate).
- D, E, K, L, N, O and P are estimates from the profile and microbenchmarks, not runs of the solver.
- Browser times were not measured. The 1.3 to 1.4× browser penalty is taken from the builder's Edge figures.
- Wall-clock figures carry about 5 to 10 % noise from other work on the machine. The conclusions rest on iteration counts and repeated runs.
- The generated world was checked only for option A, and only cold. The warm-start figures are for the Earth.
