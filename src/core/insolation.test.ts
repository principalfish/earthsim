import { describe, expect, it } from 'vitest';
import { cellCentre, directionToLatLon, getGrid } from './grid';
import {
	cellLatitudes,
	dailyInsolation,
	MONTHS_PER_YEAR,
	monthlyInsolation,
	NORTHERN_SOLSTICE_FRACTION,
	SOLAR_CONSTANT_W_M2,
	subsolarLatitude,
} from './insolation';
import {
	DEFAULT_PLANET,
	type PlanetSettings,
	sunlightRelativeToEarth,
} from './planet';

/**
 * The host's high-resolution clock. It is not part of the ES2022 library the
 * core is type-checked against.
 */
declare const performance: { now: () => number };

/** Earth's settings with some of them changed. */
const planetWith = (changes: Partial<PlanetSettings>): PlanetSettings => ({
	...DEFAULT_PLANET,
	...changes,
});

const TILTS = [0, 23.44, 60, 90];

/** Days in each month of Earth's calendar, for placing real dates. */
const CALENDAR_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The fraction of Earth's year at noon on a calendar date. */
const dateFraction = (month: number, day: number): number => {
	let days = day - 0.5;
	for (let earlier = 0; earlier < month - 1; earlier++) {
		days += CALENDAR_DAYS[earlier] as number;
	}
	return days / 365;
};

const JUNE_SOLSTICE = NORTHERN_SOLSTICE_FRACTION;
const DECEMBER_SOLSTICE = NORTHERN_SOLSTICE_FRACTION + 0.5;
const MARCH_EQUINOX = NORTHERN_SOLSTICE_FRACTION - 0.25;
const SEPTEMBER_EQUINOX = NORTHERN_SOLSTICE_FRACTION + 0.25;

/**
 * Expects two sunlight values to agree to single precision, or to within a
 * thousandth of a W/m² near zero.
 */
const expectNearlyEqual = (
	actual: number,
	expected: number,
	message: string,
): void => {
	expect(Math.abs(actual - expected), message).toBeLessThanOrEqual(
		Math.max(1e-3, 1e-6 * Math.abs(expected)),
	);
};

/** A month's mean daily sunlight by brute force: many evenly spaced days. */
const referenceMonthMean = (
	latitudeDeg: number,
	month: number,
	planet: PlanetSettings,
): number => {
	const samples = 4000;
	let total = 0;
	for (let sample = 0; sample < samples; sample++) {
		const yearFraction = (month + (sample + 0.5) / samples) / MONTHS_PER_YEAR;
		total += dailyInsolation(latitudeDeg, yearFraction, planet);
	}
	return total / samples;
};

/** The area-weighted mean over the globe of the twelve months' mean. */
const globalAnnualMean = (
	planet: PlanetSettings,
	resolution: number,
): number => {
	const grid = getGrid(resolution);
	const months = monthlyInsolation(cellLatitudes(grid), planet);
	let weighted = 0;
	let area = 0;
	for (let cell = 0; cell < grid.cellCount; cell++) {
		const cellArea = grid.areas[cell] as number;
		let annual = 0;
		for (const field of months) {
			annual += field[cell] as number;
		}
		weighted += cellArea * (annual / MONTHS_PER_YEAR);
		area += cellArea;
	}
	return weighted / area;
};

describe('the star overhead', () => {
	it('is at the tilt north at the June solstice and south at the December one', () => {
		expect(subsolarLatitude(JUNE_SOLSTICE, DEFAULT_PLANET)).toBeCloseTo(
			23.44,
			10,
		);
		expect(subsolarLatitude(DECEMBER_SOLSTICE, DEFAULT_PLANET)).toBeCloseTo(
			-23.44,
			10,
		);
	});

	it('is over the equator at the equinoxes', () => {
		expect(subsolarLatitude(MARCH_EQUINOX, DEFAULT_PLANET)).toBeCloseTo(0, 10);
		expect(subsolarLatitude(SEPTEMBER_EQUINOX, DEFAULT_PLANET)).toBeCloseTo(
			0,
			10,
		);
	});

	it('puts the solstice about 21 June and the equinoxes about 22 March and 21 September', () => {
		const day = 1 / 365;
		expect(Math.abs(JUNE_SOLSTICE - dateFraction(6, 21))).toBeLessThan(
			1.5 * day,
		);
		expect(Math.abs(MARCH_EQUINOX - dateFraction(3, 22))).toBeLessThan(2 * day);
		expect(Math.abs(SEPTEMBER_EQUINOX - dateFraction(9, 21))).toBeLessThan(
			2 * day,
		);
	});

	it('puts the solstices and equinoxes in their months of twelve equal months', () => {
		const monthOf = (yearFraction: number): number =>
			Math.floor((yearFraction % 1) * MONTHS_PER_YEAR);
		expect(monthOf(MARCH_EQUINOX)).toBe(2);
		expect(monthOf(JUNE_SOLSTICE)).toBe(5);
		expect(monthOf(SEPTEMBER_EQUINOX)).toBe(8);
		expect(monthOf(DECEMBER_SOLSTICE)).toBe(11);
	});

	it('stays over the equator all year at tilt 0', () => {
		const planet = planetWith({ axialTiltDeg: 0 });
		for (let step = 0; step < 24; step++) {
			expect(subsolarLatitude(step / 24, planet)).toBe(0);
		}
	});

	it('reaches the poles at tilt 90', () => {
		const planet = planetWith({ axialTiltDeg: 90 });
		expect(subsolarLatitude(JUNE_SOLSTICE, planet)).toBeCloseTo(90, 10);
		expect(subsolarLatitude(DECEMBER_SOLSTICE, planet)).toBeCloseTo(-90, 10);
	});

	it('repeats every year', () => {
		expect(subsolarLatitude(0.3 + 2, DEFAULT_PLANET)).toBeCloseTo(
			subsolarLatitude(0.3, DEFAULT_PLANET),
			10,
		);
	});

	it('refuses a time of year that is not finite', () => {
		expect(() => subsolarLatitude(Number.NaN, DEFAULT_PLANET)).toThrow(
			RangeError,
		);
		expect(() =>
			subsolarLatitude(Number.POSITIVE_INFINITY, DEFAULT_PLANET),
		).toThrow(RangeError);
	});
});

describe('daily sunlight', () => {
	it('at the north pole at the June solstice is the solar constant times the sine of the tilt, about 541 W/m², on a circular orbit with no eccentricity', () => {
		const expected = SOLAR_CONSTANT_W_M2 * Math.sin(23.44 * (Math.PI / 180));
		expect(expected).toBeCloseTo(541.4, 1);
		const value = dailyInsolation(90, JUNE_SOLSTICE, DEFAULT_PLANET);
		expect(Math.abs(value - 541) / 541).toBeLessThan(0.01);
		expect(value).toBeCloseTo(expected, 6);
	});

	it('scales with star brightness and the inverse square of orbit distance', () => {
		const planet = planetWith({ starBrightness: 3, orbitDistanceAu: 2 });
		for (const latitude of [-70, 0, 35, 90]) {
			for (const time of [0.1, JUNE_SOLSTICE, 0.8]) {
				expect(dailyInsolation(latitude, time, planet)).toBeCloseTo(
					(3 / 4) * dailyInsolation(latitude, time, DEFAULT_PLANET),
					9,
				);
			}
		}
	});

	it('is nothing at the north pole at the December solstice', () => {
		expect(dailyInsolation(90, DECEMBER_SOLSTICE, DEFAULT_PLANET)).toBe(0);
	});

	it('at the equator at an equinox is the solar constant over π', () => {
		expect(dailyInsolation(0, MARCH_EQUINOX, DEFAULT_PLANET)).toBeCloseTo(
			SOLAR_CONSTANT_W_M2 / Math.PI,
			6,
		);
	});

	it('is finite and never negative at every latitude, time and tilt, poles included', () => {
		for (const tilt of [...TILTS, 89.999, 0.001]) {
			const planet = planetWith({ axialTiltDeg: tilt });
			for (let latitude = -90; latitude <= 90; latitude += 0.5) {
				for (let step = 0; step < 48; step++) {
					const value = dailyInsolation(latitude, step / 48, planet);
					expect(Number.isFinite(value)).toBe(true);
					expect(value).toBeGreaterThanOrEqual(0);
				}
			}
			for (const latitude of [90, -90, 89.9999999, -89.9999999]) {
				for (const yearFraction of [
					JUNE_SOLSTICE,
					DECEMBER_SOLSTICE,
					MARCH_EQUINOX,
				]) {
					const value = dailyInsolation(latitude, yearFraction, planet);
					expect(Number.isFinite(value)).toBe(true);
					expect(value).toBeGreaterThanOrEqual(0);
				}
			}
		}
	});

	it('changes smoothly across the edge of polar night', () => {
		// At the December solstice polar night begins at 90 - 23.44 degrees.
		const edge = 90 - 23.44;
		const inside = dailyInsolation(
			edge + 0.01,
			DECEMBER_SOLSTICE,
			DEFAULT_PLANET,
		);
		const outside = dailyInsolation(
			edge - 0.01,
			DECEMBER_SOLSTICE,
			DEFAULT_PLANET,
		);
		expect(inside).toBe(0);
		expect(outside).toBeGreaterThan(0);
		expect(outside).toBeLessThan(0.01);
	});

	it('refuses a latitude beyond a pole or NaN', () => {
		for (const latitude of [90.001, -90.001, Number.NaN]) {
			expect(() => dailyInsolation(latitude, 0.5, DEFAULT_PLANET)).toThrow(
				RangeError,
			);
		}
	});
});

describe('monthly sunlight', () => {
	it('gives twelve months, each one value per latitude', () => {
		const months = monthlyInsolation([0, 45, -45], DEFAULT_PLANET);
		expect(months).toHaveLength(MONTHS_PER_YEAR);
		for (const field of months) {
			expect(field).toBeInstanceOf(Float32Array);
			expect(field).toHaveLength(3);
		}
		for (const field of monthlyInsolation([], DEFAULT_PLANET)) {
			expect(field).toHaveLength(0);
		}
	});

	it('averages to a quarter of the sunlight received over the globe and the year', () => {
		for (const tilt of TILTS) {
			const planet = planetWith({ axialTiltDeg: tilt });
			const expected =
				(SOLAR_CONSTANT_W_M2 * sunlightRelativeToEarth(planet)) / 4;
			const mean = globalAnnualMean(planet, 64);
			expect(Math.abs(mean - expected) / expected, `tilt ${tilt}`).toBeLessThan(
				0.001,
			);
		}
	});

	it('matches a brute-force mean of daily sunlight within 0.05 W/m², near the polar day and night edges too', () => {
		const latitudes = [
			0, 12.345, 33.3, 45, 60.02, 65.9, 66.37, 66.56, 66.61, 66.83, 67.4, 70.01,
			80.5, 89.97, 89.999, 90,
		];
		const signed = [...latitudes, ...latitudes.map((latitude) => -latitude)];
		for (const tilt of TILTS) {
			const planet = planetWith({ axialTiltDeg: tilt });
			const months = monthlyInsolation(signed, planet);
			for (let month = 0; month < MONTHS_PER_YEAR; month++) {
				const field = months[month] as Float32Array;
				signed.forEach((latitude, index) => {
					const expected = referenceMonthMean(latitude, month, planet);
					expect(
						Math.abs((field[index] as number) - expected),
						`tilt ${tilt}, month ${month}, latitude ${latitude}`,
					).toBeLessThan(0.05);
				});
			}
		}
	});

	it('matches the brute-force mean at latitudes between table rows near the polar circles', () => {
		const planet = DEFAULT_PLANET;
		const latitudes: number[] = [];
		for (let latitude = 65; latitude <= 68; latitude += 0.0137) {
			latitudes.push(latitude);
		}
		const months = monthlyInsolation(latitudes, planet);
		for (const month of [0, 5, 6, 11]) {
			const field = months[month] as Float32Array;
			latitudes.forEach((latitude, index) => {
				const expected = referenceMonthMean(latitude, month, planet);
				expect(
					Math.abs((field[index] as number) - expected),
					`month ${month}, latitude ${latitude}`,
				).toBeLessThan(0.05);
			});
		}
	});

	it('is the same every month and the same in both hemispheres at tilt 0', () => {
		const latitudes = [0, 10, -10, 45, -45, 80, -80, 90, -90];
		const months = monthlyInsolation(
			latitudes,
			planetWith({ axialTiltDeg: 0 }),
		);
		const january = months[0] as Float32Array;
		for (const field of months) {
			expect(field).toEqual(january);
		}
		for (let index = 1; index < latitudes.length; index += 2) {
			expectNearlyEqual(
				january[index + 1] as number,
				january[index] as number,
				`latitude ${latitudes[index]}`,
			);
		}
		expect(january[0] as number).toBeGreaterThan(january[1] as number);
	});

	it('gives the north pole nothing in December at Earth’s tilt', () => {
		const months = monthlyInsolation([90], DEFAULT_PLANET);
		expect((months[11] as Float32Array)[0]).toBe(0);
		expect((months[5] as Float32Array)[0] as number).toBeGreaterThan(500);
	});

	it('mirrors the hemispheres six months apart', () => {
		const latitudes = [5, 23.44, 40, 66.5, 75, 90];
		const north = monthlyInsolation(latitudes, DEFAULT_PLANET);
		const south = monthlyInsolation(
			latitudes.map((latitude) => -latitude),
			DEFAULT_PLANET,
		);
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			const later = (month + 6) % MONTHS_PER_YEAR;
			latitudes.forEach((latitude, index) => {
				expectNearlyEqual(
					(south[later] as Float32Array)[index] as number,
					(north[month] as Float32Array)[index] as number,
					`month ${month}, latitude ${latitude}`,
				);
			});
		}
	});

	it('gives a pole more over the year than the equator at tilt 90', () => {
		const months = monthlyInsolation(
			[0, 90, -90],
			planetWith({ axialTiltDeg: 90 }),
		);
		const annual = [0, 0, 0];
		for (const field of months) {
			for (let index = 0; index < 3; index++) {
				annual[index] = (annual[index] as number) + (field[index] as number);
			}
		}
		expect(annual[1] as number).toBeGreaterThan(annual[0] as number);
		expect(annual[2] as number).toBeGreaterThan(annual[0] as number);
	});

	it('is never negative at any tilt', () => {
		const latitudes = cellLatitudes(getGrid(64));
		for (const tilt of TILTS) {
			for (const field of monthlyInsolation(
				latitudes,
				planetWith({ axialTiltDeg: tilt }),
			)) {
				let lowest = Number.POSITIVE_INFINITY;
				for (const value of field) {
					lowest = Math.min(lowest, value);
				}
				expect(lowest, `tilt ${tilt}`).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it('scales with the star’s brightness and the inverse square of the distance', () => {
		const latitudes = [-70, -20, 0, 35, 80];
		const base = monthlyInsolation(latitudes, DEFAULT_PLANET);
		const brighter = monthlyInsolation(
			latitudes,
			planetWith({ starBrightness: 3 }),
		);
		const farther = monthlyInsolation(
			latitudes,
			planetWith({ orbitDistanceAu: 2 }),
		);
		for (let month = 0; month < MONTHS_PER_YEAR; month++) {
			latitudes.forEach((_, index) => {
				const value = (base[month] as Float32Array)[index] as number;
				expect((brighter[month] as Float32Array)[index]).toBeCloseTo(
					3 * value,
					3,
				);
				expect((farther[month] as Float32Array)[index]).toBeCloseTo(
					value / 4,
					3,
				);
			});
		}
	});

	it('does not depend on the star’s mass', () => {
		const latitudes = [-50, 0, 50];
		expect(monthlyInsolation(latitudes, planetWith({ starMass: 4 }))).toEqual(
			monthlyInsolation(latitudes, DEFAULT_PLANET),
		);
	});

	it('refuses a latitude beyond a pole or NaN', () => {
		for (const latitude of [91, -91, Number.NaN]) {
			expect(() => monthlyInsolation([0, latitude], DEFAULT_PLANET)).toThrow(
				RangeError,
			);
		}
	});

	it('computes twelve months for a 256 world well within the time allowed', () => {
		const latitudes = cellLatitudes(getGrid(256));
		const start = performance.now();
		const months = monthlyInsolation(latitudes, DEFAULT_PLANET);
		const elapsed = performance.now() - start;
		expect(months).toHaveLength(MONTHS_PER_YEAR);
		expect((months[0] as Float32Array).length).toBe(393216);
		// About 40 ms uninstrumented and about 300 ms under coverage. Integrating
		// every cell separately instead would take several seconds, which is
		// what this bound is here to catch.
		expect(elapsed).toBeLessThan(1500);
	});
});

describe('cell latitudes', () => {
	it('match the latitude of each cell’s centre', () => {
		for (const resolution of [64, 256]) {
			const grid = getGrid(resolution);
			const latitudes = cellLatitudes(grid);
			expect(latitudes).toHaveLength(grid.cellCount);
			for (let cell = 0; cell < grid.cellCount; cell += 997) {
				expect(latitudes[cell] as number).toBeCloseTo(
					directionToLatLon(cellCentre(grid, cell)).latitudeDeg,
					10,
				);
			}
			const last = grid.cellCount - 1;
			expect(latitudes[last] as number).toBeCloseTo(
				directionToLatLon(cellCentre(grid, last)).latitudeDeg,
				10,
			);
		}
	});

	it('are built once per grid and shared', () => {
		const grid = getGrid(64);
		expect(cellLatitudes(grid)).toBe(cellLatitudes(grid));
	});

	it('lie from -90 to 90', () => {
		for (const latitude of cellLatitudes(getGrid(128))) {
			expect(latitude).toBeGreaterThanOrEqual(-90);
			expect(latitude).toBeLessThanOrEqual(90);
		}
	});
});
