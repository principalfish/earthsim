# The climate loop: strength and stopping rule (2026-11-18)

Measured by a scratch script (not in the repo). Earth at 64, default numerics, each run alone for the seconds; three generated worlds at 64 (seeds 1–3, land 0.3, 0.5, 0.7) with one step a month and 0.05 K solves, four runs at once. "Passes" is the number run; "no" is not settled at the cap. Strengths are `windHeatCapacity` in J/m²/K (1.2e6 is a kilometre of air).

## The Earth at 64

Observed: Europe W − Asia E 11.5 K annual, 22.9 January; North America W − E 5.8 annual, 15.1 January; East Asia (25–45°N, 105–145°E land) January −4.0 °C. With no winds the model gives 0.7 / 2.4, −0.8 / −0.6 and about +2.3.

| Strength | Stopping rule | Passes | Seconds | Eu W−As E ann / Jan | NA W−E ann / Jan | E Asia Jan °C | Last change max / rms |
|-|-|-|-|-|-|-|-|
| 1.2e6 | (a) max ≤ 0.1, cap 6 | not settled after 6 | 14.2 | 5.3 / 12.5 | -0.7 / 3.4 | -0.3 | 6.22 / 0.4 |
| 1.2e6 | (b) rms ≤ 0.1, cap 8 | not settled after 8 | 18.1 | 4.6 / 12.2 | -1.0 / 3.2 | 0.0 | 3.85 / 0.24 |
| 1.2e6 | (c) half every pass, max ≤ 0.1, cap 6 | not settled after 6 | 13.6 | 5.5 / 12.7 | -1.0 / 3.2 | -0.8 | 3.02 / 0.29 |
| 1.2e6 | (c) half every pass, rms ≤ 0.1, cap 8 | not settled after 8 | 17.8 | 5.0 / 12.5 | -1.0 / 3.2 | -0.2 | 1.99 / 0.12 |
| 6e5 | (a) max ≤ 0.1, cap 6 | not settled after 6 | 12.1 | 4.1 / 8.9 | -0.4 / 2.8 | -0.1 | 0.5 / 0.03 |
| 6e5 | (b) rms ≤ 0.1, cap 8 | 5 | 10.1 | 4.1 / 8.9 | -0.5 / 2.7 | -0.1 | 1.23 / 0.08 |
| 6e5 | (c) half every pass, max ≤ 0.1, cap 6 | not settled after 6 | 12.3 | 4.2 / 8.9 | -0.4 / 2.8 | -0.3 | 1.12 / 0.1 |
| 6e5 | (c) half every pass, rms ≤ 0.1, cap 8 | 7 | 14.3 | 4.2 / 8.9 | -0.4 / 2.8 | -0.3 | 0.59 / 0.06 |
| 3e5 | (a) max ≤ 0.1, cap 6 | 6 | 10.5 | 2.7 / 6.1 | -0.4 / 1.7 | 0.7 | 0.02 / 0 |
| 3e5 | (b) rms ≤ 0.1, cap 8 | 4 | 7.2 | 2.7 / 6.1 | -0.4 / 1.7 | 0.7 | 0.31 / 0.03 |
| 3e5 | (c) half every pass, max ≤ 0.1, cap 6 | not settled after 6 | 11.2 | 2.7 / 5.9 | -0.4 / 1.7 | 0.7 | 0.41 / 0.04 |
| 3e5 | (c) half every pass, rms ≤ 0.1, cap 8 | 5 | 9.4 | 2.6 / 5.8 | -0.4 / 1.6 | 0.7 | 0.69 / 0.07 |

## Three generated worlds at 64: passes to settle, or "no"

| Strength | Stopping rule | Seed 1 | Seed 2 | Seed 3 |
|-|-|-|-|-|
| 1.2e6 | (a) max ≤ 0.1, cap 6 | no (last rms 0.87) | no (last rms 0.55) | no (last rms 1.74) |
| 1.2e6 | (b) rms ≤ 0.1, cap 8 | no (last rms 0.94) | no (last rms 0.59) | no (last rms 1.48) |
| 1.2e6 | (c) half every pass, max ≤ 0.1, cap 6 | no (last rms 0.43) | no (last rms 0.31) | no (last rms 1.11) |
| 1.2e6 | (c) half every pass, rms ≤ 0.1, cap 8 | no (last rms 0.37) | no (last rms 0.18) | no (last rms 0.75) |
| 6e5 | (a) max ≤ 0.1, cap 6 | no (last rms 0.26) | no (last rms 0.14) | no (last rms 0.31) |
| 6e5 | (b) rms ≤ 0.1, cap 8 | no (last rms 0.20) | 8 | no (last rms 0.20) |
| 6e5 | (c) half every pass, max ≤ 0.1, cap 6 | no (last rms 0.12) | no (last rms 0.14) | no (last rms 0.35) |
| 6e5 | (c) half every pass, rms ≤ 0.1, cap 8 | 7 | 7 | no (last rms 0.17) |
| 3e5 | (a) max ≤ 0.1, cap 6 | no (last rms 0.01) | no (last rms 0.01) | no (last rms 0.02) |
| 3e5 | (b) rms ≤ 0.1, cap 8 | 4 | 4 | 5 |
| 3e5 | (c) half every pass, max ≤ 0.1, cap 6 | no (last rms 0.04) | no (last rms 0.06) | no (last rms 0.11) |
| 3e5 | (c) half every pass, rms ≤ 0.1, cap 8 | 5 | 5 | 7 |


## The Earth at 256

Strength 6e5 with rule (b): settled in 5 passes (largest change 8.0, 4.2, 1.8, 1.1; rms 0.88, 0.39, 0.15, 0.07), 30.8 s in all.

## What is still moving, where the loop does not settle

Cell-months whose last pass changed them by more than 0.1 °C, against the snow-and-ice brightening range (0 °C down to −10 °C, before or after the pass):

| Case | Moving cell-months | In the range | Changed side of the range | Changed sign since the pass before |
|-|-|-|-|-|
| Earth 1.2e6, (a) | 65,113 | 16% | 2% | 53% |
| Earth 1.2e6, (c) max, cap 6 | 37,124 | 17% | 1% | 3% |
| Earth 6e5, (a) | 7,495 | 27% | 1% | 33% |
| Earth 6e5, (c) max, cap 6 | 13,857 | 25% | 1% | 0% |
| Earth 3e5, (c) max, cap 6 | 3,146 | 40% | 1% | 0% |

The generated worlds read the same way: 12–26% in the range at 1.2e6 and 6e5, 21–45% at 3e5, 1–2% changing side. Where the rule damps only an overshoot (a, b), 6–53% of the movers change sign between passes; with every pass halved, 0–10%.

## Brightening held at the first pass's value (a diagnostic only)

The clear share, which sets the reflectivity and the heat capacity of sea ice, held at the first pass's last-year values for all later passes. Earth, largest / rms change per pass:

| Strength | Brightening | Passes 2 to 8 |
|-|-|-|
| 1.2e6 | held | 13.7/1.39, 8.5/0.83, 5.8/0.50, 4.2/0.33, 3.5/0.22, 2.5/0.16, 1.9/0.11 |
| 1.2e6 | live (rule a) | 14.2/1.63, 12.1/1.13, 8.8/0.72, 8.0/0.60, 6.2/0.40 |
| 6e5 | held | 7.6/0.76, 3.0/0.29, 1.1/0.10, 0.56/0.04, 0.24/0.02, 0.11/0.01, 0.05/0.00 (settled in 7) |
| 6e5 | live (rule a) | 8.1, 4.6, 2.0, 1.2, 0.5 largest, not settled after 6 |
