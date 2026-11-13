import { describe, expect, it } from 'vitest';
import { cellAt, getGrid, latLonToDirection } from '../grid';
import { cellLatitudes, MONTHS_PER_YEAR } from '../insolation';
import { DEFAULT_PLANET, normalisePlanet, rotationRate } from '../planet';
import { createBlankWorld, PLANET_RADIUS_KM, type World } from '../world';
import { type ZonalMean, zonalMean } from './model';
import {
	AIR_DENSITY_KG_M3,
	EARTH_CONTRAST_K,
	LAND_FRICTION_FACTOR,
	LOW_SHIFT_FADE_DEG,
	LOW_SHIFT_GAIN,
	POLE_LOW_FROM_DEG,
	POLE_LOW_TO_DEG,
	PROFILE_BANDS,
	REFERENCE_PRESSURE_HPA,
	rulesPressureMonth,
	rulesWindsOnGrid,
	SEA_FRICTION_PER_S,
	SIDE_CONTRAST_K,
	thermalPressure,
	windsFromPressure,
	windsFromPressures,
	zonalBands,
} from './rules';
import { solveWinds } from './solve';

const grid = getGrid(64);
const { cellCount, areas } = grid;
const latitudes = cellLatitudes(grid);
const RADIANS_PER_DEGREE = Math.PI / 180;
/** Metres in a degree of latitude on the planet. */
const METRES_PER_DEGREE = (PLANET_RADIUS_KM * 1000 * Math.PI) / 180;

/** An ocean world with the Earth's settings but its day length. */
const oceanWorld = (dayLengthHours = 24): World => {
	const world = createBlankWorld(64);
	world.planet = normalisePlanet({ ...DEFAULT_PLANET, dayLengthHours });
	return world;
};

/** The cells whose centres lie within a box of latitude and longitude. */
const cellsIn = (
	south: number,
	north: number,
	west: number,
	east: number,
): number[] => {
	const found: number[] = [];
	const { centres } = grid;
	for (let cell = 0; cell < cellCount; cell++) {
		const longitude =
			(Math.atan2(
				centres[3 * cell + 1] as number,
				centres[3 * cell] as number,
			) *
				180) /
			Math.PI;
		const latitude = latitudes[cell] as number;
		if (
			latitude >= south &&
			latitude <= north &&
			longitude >= west &&
			longitude <= east
		) {
			found.push(cell);
		}
	}
	return found;
};

/** A world of ocean with one continent, 200 m high, from 40° to 65°N. */
const CONTINENT = cellsIn(40, 65, 40, 140);
const continentWorld = (): World => {
	const world = oceanWorld();
	for (const cell of CONTINENT) {
		world.elevation[cell] = 200;
	}
	return world;
};

/**
 * A made-up sea-level temperature in degrees Celsius that depends on the
 * latitude alone: 28 °C at the hottest latitude, falling as one less the
 * cosine of the distance from it, by 45 K at 90° away.
 */
const zonalField = (hottest: number): Float32Array => {
	const field = new Float32Array(cellCount);
	for (let cell = 0; cell < cellCount; cell++) {
		const away = ((latitudes[cell] as number) - hottest) * RADIANS_PER_DEGREE;
		field[cell] = 28 - 45 * (1 - Math.cos(away));
	}
	return field;
};

/** Twelve months, each the field of its index. */
const yearOf = (monthOf: (month: number) => Float32Array): Float32Array[] =>
	Array.from({ length: MONTHS_PER_YEAR }, (_, month) => monthOf(month));

/** A zonal mean of a made-up profile, in bands of 2° from the south. */
const profileOf = (temperature: (latitude: number) => number): ZonalMean => {
	const latitudes = Array.from(
		{ length: PROFILE_BANDS },
		(_, band) => -90 + ((band + 0.5) * 180) / PROFILE_BANDS,
	);
	return { latitudes, means: latitudes.map(temperature) };
};

/**
 * A profile with the Earth's contrast: 28 °C at the hottest latitude,
 * {@link EARTH_CONTRAST_K} colder at the poles when the hottest is the
 * equator.
 */
const earthLike =
	(hottest = 0) =>
	(latitude: number): number =>
		28 -
		EARTH_CONTRAST_K *
			(1 - Math.cos((latitude - hottest) * RADIANS_PER_DEGREE));

/**
 * The turning points of a function of latitude, from the south, short of
 * the poles.
 */
const turningPoints = (offset: (latitude: number) => number): number[] => {
	const found: number[] = [];
	const step = 0.25;
	// Short of the poles, where the bands' slope is eased to nothing.
	let before = offset(-89 + step) - offset(-89);
	for (let latitude = -89 + step; latitude < 89 - step / 2; latitude += step) {
		const after = offset(latitude + step) - offset(latitude);
		if (before * after < 0 || (before !== 0 && after === 0)) {
			found.push(latitude);
		}
		before = after;
	}
	return found;
};

const allFinite = (fields: readonly Float32Array[]): boolean =>
	fields.every((field) => field.every((value) => Number.isFinite(value)));

const areaMean = (field: ArrayLike<number>): number => {
	let total = 0;
	let area = 0;
	for (let cell = 0; cell < cellCount; cell++) {
		total += (areas[cell] as number) * (field[cell] as number);
		area += areas[cell] as number;
	}
	return total / area;
};

const meanOver = (field: ArrayLike<number>, cells: readonly number[]) => {
	let total = 0;
	let area = 0;
	for (const cell of cells) {
		total += (areas[cell] as number) * (field[cell] as number);
		area += areas[cell] as number;
	}
	return total / area;
};

describe('zonalBands', () => {
	it('puts the low at the hottest latitude and the subtropical highs about 30° either side of it on the Earth', () => {
		const bands = zonalBands(profileOf(earthLike()), DEFAULT_PLANET);
		expect(bands.hottestLatitude).toBeCloseTo(0, 6);
		expect(bands.lowLatitude).toBeCloseTo(0, 6);
		// The polar bands' middles lie 1° from the poles.
		expect(bands.contrast).toBeCloseTo(
			EARTH_CONTRAST_K * (1 - Math.cos(89 * RADIANS_PER_DEGREE)),
			1,
		);
		expect(bands.cellWidth).toBeCloseTo(30, 0);
		expect(bands.northEdge).toBeCloseTo(30, 0);
		expect(bands.southEdge).toBeCloseTo(-30, 0);
		expect(bands.northCells).toBeCloseTo(3, 1);
		expect(bands.southCells).toBeCloseTo(3, 1);
		// The low, the subtropical highs and the subpolar lows, with the polar
		// highs at the poles themselves.
		const points = turningPoints(bands.offset);
		expect(points).toHaveLength(5);
		expect(bands.offset(0)).toBe(0);
		expect(bands.offset(30)).toBeGreaterThan(bands.offset(15));
		expect(bands.offset(30)).toBeGreaterThan(bands.offset(45));
		expect(bands.offset(60)).toBeLessThan(bands.offset(45));
		expect(bands.offset(60)).toBeLessThan(bands.offset(89));
		expect(bands.offset(-30)).toBeCloseTo(bands.offset(30), 6);
	});

	it('moves the low and the cell with the hottest latitude, further than it', () => {
		const bands = zonalBands(profileOf(earthLike(6)), DEFAULT_PLANET);
		expect(bands.hottestLatitude).toBeCloseTo(6, 0);
		expect(bands.lowLatitude).toBeGreaterThan(bands.hottestLatitude);
		expect(bands.northEdge).toBeGreaterThan(30);
		expect(bands.southEdge).toBeGreaterThan(-30);
		expect(bands.northEdge - bands.lowLatitude).toBeLessThan(
			bands.lowLatitude - bands.southEdge,
		);
	});

	it('has more, narrower bands for a shorter day, fewer and wider for a longer, and one cell reaching the poles at the slowest', () => {
		const at = (dayLengthHours: number) =>
			zonalBands(
				profileOf(earthLike()),
				normalisePlanet({ ...DEFAULT_PLANET, dayLengthHours }),
			);
		const [fast, earth, slow, slowest] = [8, 24, 96, 720].map(at);
		const widths = [fast, earth, slow, slowest].map(
			(bands) => bands?.cellWidth,
		);
		expect(widths[0]).toBeCloseTo(30 / Math.sqrt(3), 0);
		expect(widths[1]).toBeCloseTo(30, 0);
		expect(widths[2]).toBeCloseTo(60, 0);
		expect(widths[3]).toBe(90);
		const counts = [fast, earth, slow, slowest].map(
			(bands) => turningPoints((bands as ReturnType<typeof at>).offset).length,
		);
		expect(counts[0]).toBeGreaterThan(counts[1] as number);
		expect(counts[1]).toBeGreaterThan(counts[2] as number);
		expect(counts[2]).toBeGreaterThan(counts[3] as number);
		expect(fast?.northCells).toBeGreaterThan(earth?.northCells as number);
		expect(slow?.northCells).toBeLessThan(earth?.northCells as number);
		// At the slowest the one cell runs from the low to both poles.
		expect(counts[3]).toBe(1);
		expect(slowest?.northEdge).toBe(90);
		expect(slowest?.southEdge).toBe(-90);
		expect(slowest?.northCells).toBe(1);
		expect(slowest?.southCells).toBe(1);
	});

	it('stays sane with the hottest latitude near a pole, and with no contrast at all', () => {
		for (const hottest of [85, -89, 60]) {
			const bands = zonalBands(profileOf(earthLike(hottest)), DEFAULT_PLANET);
			expect(Math.abs(bands.lowLatitude)).toBeLessThanOrEqual(90);
			// The low lies at the hottest latitude or beyond it, towards its
			// pole.
			expect(Math.sign(bands.lowLatitude)).toBe(Math.sign(hottest));
			expect(Math.abs(bands.lowLatitude)).toBeGreaterThanOrEqual(
				Math.abs(bands.hottestLatitude),
			);
			expect(bands.northEdge).toBeGreaterThanOrEqual(bands.lowLatitude);
			expect(bands.southEdge).toBeLessThanOrEqual(bands.lowLatitude);
			expect(bands.northEdge - bands.southEdge).toBeGreaterThan(10);
			expect(bands.northEdge).toBeLessThanOrEqual(90);
			expect(bands.southEdge).toBeGreaterThanOrEqual(-90);
			for (let latitude = -90; latitude <= 90; latitude += 0.5) {
				expect(Number.isFinite(bands.offset(latitude))).toBe(true);
			}
		}
		const flat = zonalBands(
			profileOf(() => 15),
			DEFAULT_PLANET,
		);
		expect(Number.isFinite(flat.cellWidth)).toBe(true);
		expect(Number.isFinite(flat.offset(45))).toBe(true);
	});

	it('puts the low at a pole that is the hottest place, with no high beyond it', () => {
		for (const pole of [90, -90]) {
			for (const dayLengthHours of [8, 24, 96, 720]) {
				const bands = zonalBands(
					profileOf(earthLike(pole)),
					normalisePlanet({ ...DEFAULT_PLANET, dayLengthHours }),
				);
				const label = `${pole}°, ${dayLengthHours} h`;
				// The hottest latitude is about 76°, the bands being weighted by
				// their area, and the low moved on to within 2° of the pole.
				expect(Math.abs(bands.lowLatitude), label).toBeGreaterThan(88);
				// The pole's pressure is no higher than 20° from it, and no more
				// than 0.1 hPa above the low between.
				const atPole = bands.offset(pole);
				expect(atPole, label).toBeLessThanOrEqual(
					bands.offset(pole - Math.sign(pole) * 20),
				);
				for (let away = 0; away <= 20; away += 0.25) {
					const value = bands.offset(pole - Math.sign(pole) * away);
					expect(Number.isFinite(value), label).toBe(true);
					expect(value, label).toBeGreaterThanOrEqual(atPole - 0.1);
				}
				const cells = pole > 0 ? bands.northCells : bands.southCells;
				// The tropical cell's summer side reaches the pole at a quarter or
				// so of its phase, over the last degree and a half, where the
				// slope is eased to nothing.
				expect(cells, label).toBeLessThan(0.3);
			}
		}
	});

	it('moves the bands smoothly as the hottest latitude moves from the equator to either pole', () => {
		// The pressure at several latitudes on the summer side, against the
		// pressure 30° into the winter hemisphere, as the hottest latitude
		// moves by a step at a time. The largest change is about 0.7 hPa for
		// a step of 0.1°, near 8.5°, where the low moves 2.5° for each degree
		// and the summer side of the tropical cell widens; for a step of
		// 0.02° it is about 0.15 hPa, a fifth as much, as it is for bands
		// with no step anywhere, where a step would stay the same size.
		const largestChange = (
			sign: number,
			from: number,
			to: number,
			step: number,
		): number => {
			let largest = 0;
			let before: number[] | null = null;
			for (let hottest = from; hottest <= to + step / 2; hottest += step) {
				const bands = zonalBands(
					profileOf(earthLike(sign * hottest)),
					DEFAULT_PLANET,
				);
				const winter = bands.offset(-sign * 30);
				const values = [30, 50, 70, 80, 90].map(
					(latitude) => bands.offset(sign * latitude) - winter,
				);
				if (before !== null) {
					for (const [index, value] of values.entries()) {
						largest = Math.max(
							largest,
							Math.abs(value - (before[index] as number)),
						);
					}
				}
				before = values;
			}
			return largest;
		};
		for (const sign of [1, -1]) {
			expect(largestChange(sign, 0, 90, 0.1)).toBeLessThan(1);
			expect(largestChange(sign, 7, 10, 0.02)).toBeLessThan(0.25);
		}
	});

	it('places the low by the faded gain, and moves a low near a pole on to it, in both hemispheres', () => {
		const smoothStepOf = (x: number): number => {
			const t = Math.min(1, Math.max(0, x));
			return t * t * (3 - 2 * t);
		};
		for (const nominal of [0, 3, 6, 10, 20, 30, 45, 55, 62, 70, 76, 85, 90]) {
			for (const sign of [1, -1]) {
				const bands = zonalBands(
					profileOf(earthLike(sign * nominal)),
					DEFAULT_PLANET,
				);
				const hottest = bands.hottestLatitude;
				const shifted =
					hottest *
					(1 +
						(LOW_SHIFT_GAIN - 1) *
							Math.exp(-((hottest / LOW_SHIFT_FADE_DEG) ** 2)));
				const away = Math.abs(shifted);
				const expected =
					shifted +
					Math.sign(shifted) *
						smoothStepOf(
							(away - POLE_LOW_FROM_DEG) /
								(POLE_LOW_TO_DEG - POLE_LOW_FROM_DEG),
						) *
						(90 - away);
				const label = `${sign * nominal}°`;
				// The rule, to rounding.
				expect(bands.lowLatitude, label).toBeCloseTo(expected, 10);
				expect(Math.sign(bands.lowLatitude) || 1, label).toBe(
					Math.sign(hottest) || 1,
				);
				if (away <= POLE_LOW_FROM_DEG) {
					expect(bands.lowLatitude, label).toBe(shifted);
				}
				if (away >= POLE_LOW_TO_DEG) {
					expect(bands.lowLatitude, label).toBe(sign * 90);
				}
			}
		}
		// Near the equator the gain is almost whole, and by twice the fading
		// distance almost gone.
		const near = zonalBands(profileOf(earthLike(3)), DEFAULT_PLANET);
		expect(near.lowLatitude / near.hottestLatitude).toBeGreaterThan(
			0.95 * LOW_SHIFT_GAIN,
		);
		const far = zonalBands(profileOf(earthLike(45)), DEFAULT_PLANET);
		expect(far.lowLatitude / far.hottestLatitude).toBeLessThan(1.05);
	});

	it('scales each side’s bands by how much cooler its pole is than the low, leaving the other side alone', () => {
		// On a planet turning once in 720 hours the cells are 90° wide
		// whatever the contrast, so a pole's temperature reaches the bands
		// through its side's strength alone. The pole is kept out of the
		// hottest bands, more than 4 K below the low. Drops of 6, 15, 25, 30
		// and 45 K give strengths of about 0.10, 0.50, 0.93 and then 1.
		const slow = normalisePlanet({ ...DEFAULT_PLANET, dayLengthHours: 720 });
		const base = profileOf(earthLike());
		const full = zonalBands(base, slow);
		const atLow = 28 - EARTH_CONTRAST_K * (1 - Math.cos(RADIANS_PER_DEGREE));
		for (const [index, side] of [
			[PROFILE_BANDS - 1, 1],
			[0, -1],
		] as const) {
			for (const drop of [6, 15, 25, 30, 45]) {
				const means = [...(base.means as number[])];
				means[index] = atLow - drop;
				const bands = zonalBands({ latitudes: base.latitudes, means }, slow);
				const s = Math.min(1, drop / SIDE_CONTRAST_K);
				const expected = s * s * (3 - 2 * s);
				const strength = side > 0 ? bands.northStrength : bands.southStrength;
				const other = side > 0 ? bands.southStrength : bands.northStrength;
				const label = `${side > 0 ? 'north' : 'south'}, ${drop} K`;
				expect(bands.lowLatitude, label).toBeCloseTo(0, 10);
				expect(bands.cellWidth, label).toBe(90);
				expect(strength, label).toBeCloseTo(expected, 10);
				expect(other, label).toBe(1);
				for (let latitude = 5; latitude <= 90; latitude += 5) {
					// The side's pressure is its strength times the full one's,
					// and the other side's is untouched.
					expect(bands.offset(side * latitude), label).toBeCloseTo(
						expected * full.offset(side * latitude),
						9,
					);
					expect(bands.offset(-side * latitude), label).toBeCloseTo(
						full.offset(-side * latitude),
						12,
					);
				}
			}
		}
	});

	it('takes the contrast at the hottest latitude, not at the low, in both hemispheres', () => {
		for (const hottest of [20, 40, -20, -40]) {
			const profile = profileOf(earthLike(hottest));
			const bands = zonalBands(profile, DEFAULT_PLANET);
			const means = profile.means as number[];
			// The profile by straight lines between the bands' middles, every
			// 2° from −89°.
			const valueAt = (latitude: number): number => {
				const position = (latitude + 89) / 2;
				const below = Math.floor(position);
				const share = position - below;
				return (
					(means[below] as number) * (1 - share) +
					(means[below + 1] as number) * share
				);
			};
			const poles =
				0.5 * ((means[0] as number) + (means[PROFILE_BANDS - 1] as number));
			const label = `${hottest}°`;
			expect(bands.contrast, label).toBeCloseTo(
				valueAt(bands.hottestLatitude) - poles,
				10,
			);
			if (Math.abs(hottest) === 20) {
				// The low lies 11° further out, where it is 0.7 K cooler.
				expect(
					valueAt(bands.hottestLatitude) - valueAt(bands.lowLatitude),
					label,
				).toBeGreaterThan(0.5);
			}
		}
	});

	it('takes a band with no value from its nearest band, and refuses a profile with none or with a value that is not finite', () => {
		const whole = profileOf(earthLike());
		const gappy: ZonalMean = {
			latitudes: whole.latitudes,
			means: whole.means.map((mean, band) => (band < 3 ? null : mean)),
		};
		expect(zonalBands(gappy, DEFAULT_PLANET).lowLatitude).toBeCloseTo(0, 6);
		// A profile with gaps gives the bands of the profile filled by hand.
		const same = (a: ZonalMean, b: ZonalMean): void => {
			const one = zonalBands(a, DEFAULT_PLANET);
			const other = zonalBands(b, DEFAULT_PLANET);
			expect(one.hottestLatitude).toBe(other.hottestLatitude);
			expect(one.contrast).toBe(other.contrast);
			for (let latitude = -90; latitude <= 90; latitude += 5) {
				expect(one.offset(latitude)).toBe(other.offset(latitude));
			}
		};
		const means = whole.means as number[];
		const last = PROFILE_BANDS - 1;
		// The last three bands, the northernmost, take the last known one's.
		same(
			{
				latitudes: whole.latitudes,
				means: means.map((mean, band) => (band > last - 3 ? null : mean)),
			},
			{
				latitudes: whole.latitudes,
				means: means.map((mean, band) =>
					band > last - 3 ? (means[last - 3] as number) : mean,
				),
			},
		);
		// A gap of three bands in the middle, at −3°, −1° and 1°: the first
		// takes the band south of the gap, at −5°, the last the band north of
		// it, at 3°, and the middle one, as near to both, the band north of
		// it. The band at −5° is made a kelvin colder, so that the tie rule
		// shows.
		const known = means.map((mean, band) => (band === 42 ? mean - 1 : mean));
		const gapped: ZonalMean = {
			latitudes: whole.latitudes,
			means: known.map((mean, band) =>
				band >= 43 && band <= 45 ? null : mean,
			),
		};
		const byHand = [...known];
		byHand[43] = known[42] as number;
		byHand[44] = known[46] as number;
		byHand[45] = known[46] as number;
		const southern = [...byHand];
		southern[44] = known[42] as number;
		same(gapped, { latitudes: whole.latitudes, means: byHand });
		expect(zonalBands(gapped, DEFAULT_PLANET).hottestLatitude).not.toBe(
			zonalBands(
				{ latitudes: whole.latitudes, means: southern },
				DEFAULT_PLANET,
			).hottestLatitude,
		);
		expect(() =>
			zonalBands(
				{ latitudes: whole.latitudes, means: whole.means.map(() => null) },
				DEFAULT_PLANET,
			),
		).toThrow(RangeError);
		for (const bad of [
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]) {
			expect(() =>
				zonalBands(
					{
						latitudes: whole.latitudes,
						means: whole.means.map((mean, band) => (band === 30 ? bad : mean)),
					},
					DEFAULT_PLANET,
				),
			).toThrow(RangeError);
		}
	});
});

describe('thermalPressure', () => {
	it('gives a cold place a high and a hot place a low against their latitude, more on land than at sea', () => {
		const world = continentWorld();
		const field = zonalField(0);
		const sea = cellsIn(40, 65, -140, -40);
		for (const cell of [...CONTINENT, ...sea]) {
			field[cell] = (field[cell] as number) - 10;
		}
		const thermal = thermalPressure(
			world,
			field,
			zonalMean(grid, field, PROFILE_BANDS),
		);
		const middle = cellAt(grid, latLonToDirection(52, 90));
		expect(thermal[middle]).toBeGreaterThan(5);
		expect(meanOver(thermal, CONTINENT)).toBeGreaterThan(
			2 * meanOver(thermal, sea),
		);
		expect(meanOver(thermal, sea)).toBeGreaterThan(0);
		// Elsewhere at those latitudes, warmer than the mean, lows.
		expect(meanOver(thermal, cellsIn(45, 60, 160, 180))).toBeLessThan(0);
	});

	it('makes a cold patch on a cube corner much the same high as the same patch elsewhere at its latitude', () => {
		// A patch 10 K colder, a Gaussian 500 km across, on an ocean world
		// whose temperature otherwise depends on the latitude alone, centred
		// on the corner at 35.26°N, 45°E, and at the same latitude on 0°,
		// inside a face.
		const world = oceanWorld();
		const cornerLatitude = Math.asin(1 / Math.sqrt(3)) / RADIANS_PER_DEGREE;
		const patchAt = (longitude: number) => {
			const [x, y, z] = latLonToDirection(cornerLatitude, longitude);
			const field = zonalField(0);
			const near: number[] = [];
			for (let cell = 0; cell < cellCount; cell++) {
				const cosine =
					(grid.centres[3 * cell] as number) * x +
					(grid.centres[3 * cell + 1] as number) * y +
					(grid.centres[3 * cell + 2] as number) * z;
				const km = Math.acos(Math.min(1, cosine)) * PLANET_RADIUS_KM;
				field[cell] =
					(field[cell] as number) - 10 * Math.exp(-0.5 * (km / 500) ** 2);
				if (km < 2000) {
					near.push(cell);
				}
			}
			const thermal = thermalPressure(
				world,
				field,
				zonalMean(grid, field, PROFILE_BANDS),
			);
			const winds = windsFromPressure(
				world,
				thermal.map((value) => REFERENCE_PRESSURE_HPA + value),
			);
			return {
				peak: Math.max(...near.map((cell) => thermal[cell] as number)),
				wind: Math.max(
					...near.map((cell) =>
						Math.hypot(winds.east[cell] as number, winds.north[cell] as number),
					),
				),
			};
		};
		const corner = patchAt(45);
		const face = patchAt(0);
		// The smoothing reaches as far at a corner as elsewhere; what is left
		// of a mark there comes from the correction it makes for the skewed
		// cells being taken from the field before each step: the high is
		// 3.4% weaker (2.18 against 2.26 hPa) and its strongest wind 6.1%
		// weaker (1.63 against 1.73 m/s). The smoothing alone, without the
		// correction, made them 16% and 29% stronger.
		expect(face.peak).toBeGreaterThan(2);
		expect(Math.abs(corner.peak / face.peak - 1)).toBeLessThan(0.05);
		expect(Math.abs(corner.wind / face.wind - 1)).toBeLessThan(0.08);
	});

	it('refuses a field of the wrong length, or one with a value that is not finite', () => {
		const field = zonalField(0);
		expect(() =>
			thermalPressure(
				oceanWorld(),
				field.subarray(1),
				zonalMean(grid, field, PROFILE_BANDS),
			),
		).toThrow(RangeError);
		for (const bad of [
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
		]) {
			const spoilt = field.slice();
			spoilt[100] = bad;
			expect(() =>
				thermalPressure(
					oceanWorld(),
					spoilt,
					zonalMean(grid, spoilt, PROFILE_BANDS),
				),
			).toThrow(RangeError);
		}
	});
});

describe('windsFromPressure', () => {
	it('balances the gradient, the turning and the friction: along the isobars away from the equator and down the gradient at it', () => {
		const world = oceanWorld();
		// Pressure rising northward by 1 hPa a degree everywhere.
		const pressure = new Float64Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			pressure[cell] = 1011 + (latitudes[cell] as number);
		}
		const { east, north } = windsFromPressure(world, pressure);
		const push = -100 / METRES_PER_DEGREE / AIR_DENSITY_KG_M3;
		const k = SEA_FRICTION_PER_S;
		for (const latitude of [0.5, 20, 45, -45]) {
			const cell = cellAt(grid, latLonToDirection(latitude, 10));
			const f =
				2 *
				rotationRate(world.planet) *
				Math.sin((latitudes[cell] as number) * RADIANS_PER_DEGREE);
			const expectedEast = (f * push) / (k * k + f * f);
			const expectedNorth = (k * push) / (k * k + f * f);
			expect(east[cell]).toBeCloseTo(expectedEast, 1);
			expect(north[cell]).toBeCloseTo(expectedNorth, 1);
		}
		// Low pressure to the south: easterlies in the north, westerlies in
		// the south, and southward at the equator.
		const at = (latitude: number) =>
			cellAt(grid, latLonToDirection(latitude, 10));
		expect(east[at(45)]).toBeLessThan(-1);
		expect(east[at(-45)]).toBeGreaterThan(1);
		expect(Math.abs(east[at(0.5)] as number)).toBeLessThan(
			0.1 * Math.abs(north[at(0.5)] as number),
		);
		expect(north[at(0.5)]).toBeLessThan(0);
	});

	it('slows the wind over land and turns it along steep ground', () => {
		const world = oceanWorld();
		const plateau = cellsIn(30, 50, 60, 100);
		for (const cell of plateau) {
			world.elevation[cell] = 3000;
		}
		const pressure = new Float64Array(cellCount);
		for (let cell = 0; cell < cellCount; cell++) {
			pressure[cell] = 1011 + (latitudes[cell] as number) / 2;
		}
		const sea = windsFromPressure(oceanWorld(), pressure);
		const land = windsFromPressure(world, pressure);
		const speed = (winds: typeof sea, cell: number) =>
			Math.hypot(winds.east[cell] as number, winds.north[cell] as number);
		// On the plateau's flat middle only the friction differs: the speed
		// goes as one over √(f² + k²).
		const middle = cellAt(grid, latLonToDirection(40, 80));
		const f =
			2 *
			rotationRate(world.planet) *
			Math.sin((latitudes[middle] as number) * RADIANS_PER_DEGREE);
		const k = SEA_FRICTION_PER_S;
		const kLand = LAND_FRICTION_FACTOR * k;
		expect(speed(land, middle) / speed(sea, middle)).toBeCloseTo(
			Math.sqrt((f * f + k * k) / (f * f + kLand * kLand)),
			6,
		);
		// On the plateau's southern edge, the wind blowing south off it is cut
		// to well under the same wind's off land a metre high, while the wind
		// along the edge is barely touched.
		const low = oceanWorld();
		for (const cell of plateau) {
			low.elevation[cell] = 1;
		}
		const flat = windsFromPressure(low, pressure);
		const edge = cellsIn(29, 32, 78, 82)
			.filter((cell) => plateau.includes(cell))
			.reduce((south, cell) =>
				(latitudes[cell] as number) < (latitudes[south] as number)
					? cell
					: south,
			);
		expect(Math.abs(land.north[edge] as number)).toBeLessThan(
			0.5 * Math.abs(flat.north[edge] as number),
		);
		expect(land.east[edge]).toBeCloseTo(flat.east[edge] as number, 0);
	});

	it('refuses a pressure field of the wrong length', () => {
		expect(() =>
			windsFromPressure(oceanWorld(), new Float64Array(cellCount - 1)),
		).toThrow(RangeError);
	});
});

describe('windsFromPressures', () => {
	it('gives each field’s winds as windsFromPressure does, and refuses a field of the wrong length', () => {
		const world = continentWorld();
		const fields = [0, 20].map((hottest) =>
			zonalField(hottest).map((value) => REFERENCE_PRESSURE_HPA - value),
		);
		const winds = windsFromPressures(world, fields);
		expect(winds.east).toHaveLength(2);
		fields.forEach((field, index) => {
			const one = windsFromPressure(world, field);
			expect(winds.east[index]).toEqual(one.east);
			expect(winds.north[index]).toEqual(one.north);
		});
		expect(() =>
			windsFromPressures(world, [
				fields[0] as Float32Array,
				new Float32Array(cellCount - 1),
			]),
		).toThrow(RangeError);
	});
});

describe('the rules model through solveWinds', () => {
	// One run of a year, about half a second at 64 cells per face edge,
	// more under coverage, hence the longer time allowed.
	it('on an ocean world with Earth’s settings is symmetric east–west, with easterlies in the tropics and westerlies in mid-latitudes in both hemispheres', () => {
		const world = oceanWorld();
		const field = zonalField(0);
		const result = solveWinds(
			world,
			yearOf(() => field),
		);
		const east = result.east[0] as Float32Array;
		const north = result.north[0] as Float32Array;
		const pressure = result.pressure[0] as Float32Array;
		// The wind each cell would have if the pressure were the bands' alone,
		// taken at the cell's latitude: what the winds on a world with no
		// longitude to tell its cells apart must be. The worst difference is
		// about 0.04 m/s, near 68°, where the bands' slope changes fastest;
		// within 4° of the cube's corners, where the grid's cells are most
		// skewed, it is under 0.01 m/s, no more than elsewhere at their
		// latitude. A mark there of a tenth of the winds' would be 0.5 m/s.
		const bands = zonalBands(
			zonalMean(grid, field, PROFILE_BANDS),
			world.planet,
		);
		const omega = rotationRate(world.planet);
		const k = SEA_FRICTION_PER_S;
		const cornerCosine = Math.cos(4 * RADIANS_PER_DEGREE);
		let worst = 0;
		let worstAtCorners = 0;
		for (let cell = 0; cell < cellCount; cell++) {
			const latitude = latitudes[cell] as number;
			const slope =
				(bands.offset(latitude + 0.25) - bands.offset(latitude - 0.25)) / 0.5;
			const push = (-100 * slope) / METRES_PER_DEGREE / AIR_DENSITY_KG_M3;
			const f = 2 * omega * Math.sin(latitude * RADIANS_PER_DEGREE);
			const expectedEast = (f * push) / (k * k + f * f);
			const expectedNorth = (k * push) / (k * k + f * f);
			const difference = Math.max(
				Math.abs((east[cell] as number) - expectedEast),
				Math.abs((north[cell] as number) - expectedNorth),
			);
			worst = Math.max(worst, difference);
			// The corners lie along (±1, ±1, ±1): near one, every coordinate
			// of the centre is near ±1/√3.
			const nearCorner =
				[0, 1, 2].reduce(
					(sum, axis) =>
						sum + Math.abs(grid.centres[3 * cell + axis] as number),
					0,
				) /
					Math.sqrt(3) >
				cornerCosine;
			if (nearCorner) {
				worstAtCorners = Math.max(worstAtCorners, difference);
			}
		}
		expect(worst).toBeLessThan(0.05);
		expect(worstAtCorners).toBeLessThan(0.02);
		const zonal = zonalMean(grid, east, 18).means as number[];
		// Bands of 10° from the south: 10–20° and 40–50° either side.
		for (const band of [7, 10]) {
			expect(zonal[band]).toBeLessThan(-2);
		}
		for (const band of [4, 13]) {
			expect(zonal[band]).toBeGreaterThan(2);
		}
		expect(zonal[7]).toBeCloseTo(zonal[10] as number, 6);
		expect(areaMean(pressure)).toBeCloseTo(REFERENCE_PRESSURE_HPA, 3);
	}, 60_000);

	// Four runs of a year, each about half a second at 64 cells per face
	// edge, more under coverage, hence the longer time allowed.
	it('takes the season from the temperature alone: no month number or tilt is read, so with no tilt January equals July', () => {
		const months = yearOf((month) =>
			zonalField(10 * Math.sin((2 * Math.PI * month) / MONTHS_PER_YEAR)),
		);
		const upright = oceanWorld();
		upright.planet = normalisePlanet({ ...DEFAULT_PLANET, axialTiltDeg: 0 });
		const tilted = oceanWorld();
		tilted.planet = normalisePlanet({ ...DEFAULT_PLANET, axialTiltDeg: 60 });
		const a = solveWinds(upright, months);
		const b = solveWinds(tilted, months);
		expect(b).toEqual(a);
		// The months given in the other order give the year in the other
		// order: a month's winds are those of its temperature.
		const reversed = solveWinds(upright, [...months].reverse());
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			expect(reversed.east[month]).toEqual(a.east[MONTHS_PER_YEAR - 1 - month]);
			expect(reversed.pressure[month]).toEqual(
				a.pressure[MONTHS_PER_YEAR - 1 - month],
			);
		}
		// With no tilt the temperature is the same in every month, and so
		// January equals July. The checks above would still pass for a model
		// that read the month's number the same from either end of the year
		// (January as December, June as July); this one would not.
		const steady = solveWinds(
			upright,
			yearOf(() => zonalField(0)),
		);
		expect(steady.east[6]).toEqual(steady.east[0]);
		expect(steady.north[6]).toEqual(steady.north[0]);
		expect(steady.pressure[6]).toEqual(steady.pressure[0]);
	}, 60_000);

	// One run of a year, about half a second at 64 cells per face edge,
	// more under coverage, hence the longer time allowed.
	it('gives a cold continent in winter higher pressure than the sea at its latitude', () => {
		const world = continentWorld();
		const winter = zonalField(-15);
		for (const cell of CONTINENT) {
			winter[cell] = (winter[cell] as number) - 20;
		}
		const pressure = solveWinds(
			world,
			yearOf(() => winter),
		).pressure[0] as Float32Array;
		const sea = cellsIn(40, 65, -140, -40);
		expect(meanOver(pressure, CONTINENT)).toBeGreaterThan(
			meanOver(pressure, sea) + 5,
		);
	}, 60_000);

	// Five runs of a year, about half a second each at 64 cells per face
	// edge, more under coverage, hence the longer time allowed.
	it('is finite everywhere at every day length from 3 to 720 hours, the poles and the equator included', () => {
		const world = continentWorld();
		// A mountain range, for steep ground.
		for (const cell of cellsIn(-10, 10, -80, -70)) {
			world.elevation[cell] = 6000;
		}
		// The hottest latitude from the south pole to the north, one month
		// with no contrast at all.
		const months = yearOf((month) =>
			month === 11
				? new Float32Array(cellCount).fill(10)
				: zonalField(-90 + 16 * month),
		);
		const poles = [-1, 1].map((sign) =>
			cellAt(grid, latLonToDirection(90 * sign, 0)),
		);
		const equator = cellAt(grid, latLonToDirection(0, 0));
		for (const dayLengthHours of [3, 8, 24, 96, 720]) {
			world.planet = normalisePlanet({ ...DEFAULT_PLANET, dayLengthHours });
			const result = solveWinds(world, months);
			expect(allFinite(result.east), `${dayLengthHours} h`).toBe(true);
			expect(allFinite(result.north), `${dayLengthHours} h`).toBe(true);
			expect(allFinite(result.pressure), `${dayLengthHours} h`).toBe(true);
			for (const cell of [...poles, equator]) {
				for (const month of result.east.keys()) {
					const speed = Math.hypot(
						result.east[month]?.[cell] as number,
						result.north[month]?.[cell] as number,
					);
					expect(speed).toBeLessThan(50);
				}
			}
		}
	}, 60_000);

	// Two runs of a year, each about half a second at 64 cells per face
	// edge, more under coverage, hence the longer time allowed.
	it('is deterministic', () => {
		const world = continentWorld();
		const months = yearOf((month) => zonalField(month - 6));
		expect(solveWinds(world, months)).toEqual(solveWinds(world, months));
	}, 60_000);

	it('refuses other than twelve months, or a month of the wrong length, on its own grid too', () => {
		const field = zonalField(0);
		expect(() => rulesWindsOnGrid(oceanWorld(), [field])).toThrow(RangeError);
		expect(() =>
			rulesWindsOnGrid(
				oceanWorld(),
				yearOf((month) => (month === 3 ? field.subarray(2) : field)),
			),
		).toThrow(RangeError);
		expect(() =>
			rulesPressureMonth(oceanWorld(), field, new Float64Array(cellCount - 1)),
		).toThrow(RangeError);
	});
});
