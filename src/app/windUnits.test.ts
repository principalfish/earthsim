import { describe, expect, it } from 'vitest';
import {
	COMPASS_POINTS,
	compassPoint,
	convertSpeed,
	DEFAULT_WIND_UNIT,
	formatWind,
	formatWindSpeed,
	isWindUnit,
	WIND_CALM_TEXT,
	WIND_UNITS,
	wholeSpeed,
	windFromDeg,
} from './windUnits';

describe('the wind units', () => {
	it('offers m/s, km/h and mph, starting on m/s', () => {
		expect(WIND_UNITS).toEqual(['m/s', 'km/h', 'mph']);
		expect(DEFAULT_WIND_UNIT).toBe('m/s');
	});

	it('knows its own units from anything else', () => {
		for (const unit of WIND_UNITS) {
			expect(isWindUnit(unit)).toBe(true);
		}
		for (const other of ['knots', 'M/S', '', null, undefined, 3.6]) {
			expect(isWindUnit(other)).toBe(false);
		}
	});
});

describe('convertSpeed', () => {
	it('converts metres a second to each unit', () => {
		expect(convertSpeed(10, 'm/s')).toBe(10);
		expect(convertSpeed(10, 'km/h')).toBeCloseTo(36, 12);
		expect(convertSpeed(10, 'mph')).toBeCloseTo(22.369362920544, 12);
	});
});

describe('wholeSpeed', () => {
	it('counts a speed in whole numbers of a unit, a half upwards, without the unit', () => {
		expect(wholeSpeed(10, 'm/s')).toBe('10');
		expect(wholeSpeed(10, 'km/h')).toBe('36');
		expect(wholeSpeed(10, 'mph')).toBe('22');
		expect(wholeSpeed(6.5, 'm/s')).toBe('7');
		expect(wholeSpeed(400, 'km/h')).toBe('1,440');
	});
});

describe('formatWindSpeed', () => {
	it('writes 10 m/s as 36 km/h and 22 mph, to a whole number', () => {
		expect(formatWindSpeed(10, 'm/s')).toBe('10 m/s');
		expect(formatWindSpeed(10, 'km/h')).toBe('36 km/h');
		expect(formatWindSpeed(10, 'mph')).toBe('22 mph');
	});

	it('writes the key’s speeds in each unit', () => {
		expect(formatWindSpeed(5, 'km/h')).toBe('18 km/h');
		expect(formatWindSpeed(5, 'mph')).toBe('11 mph');
	});

	it('rounds a half upwards', () => {
		expect(formatWindSpeed(6.5, 'm/s')).toBe('7 m/s');
		expect(formatWindSpeed(6.49, 'm/s')).toBe('6 m/s');
	});
});

describe('compassPoint', () => {
	it('names each of the eight points at its own direction', () => {
		expect([0, 45, 90, 135, 180, 225, 270, 315].map(compassPoint)).toEqual([
			...COMPASS_POINTS,
		]);
		expect(COMPASS_POINTS).toEqual([
			'north',
			'north-east',
			'east',
			'south-east',
			'south',
			'south-west',
			'west',
			'north-west',
		]);
	});

	it('starts each point at its lower boundary, 45° wide and centred on its direction', () => {
		const below = 1e-9;
		COMPASS_POINTS.forEach((point, index) => {
			const boundary = (index * 45 + 337.5) % 360;
			const before = COMPASS_POINTS.at(index - 1);
			expect(compassPoint(boundary), `${boundary}°`).toBe(point);
			expect(compassPoint(boundary - below), `just under ${boundary}°`).toBe(
				before,
			);
		});
	});

	it('takes 22.5° as north-east, just under it as north, and 337.5° as north', () => {
		expect(compassPoint(22.5)).toBe('north-east');
		expect(compassPoint(22.499)).toBe('north');
		expect(compassPoint(337.5)).toBe('north');
		expect(compassPoint(337.499)).toBe('north-west');
		expect(compassPoint(67.5)).toBe('east');
		expect(compassPoint(67.499)).toBe('north-east');
	});

	it('takes a bearing below 0° or from 360° up round the circle', () => {
		expect(compassPoint(360)).toBe('north');
		expect(compassPoint(-0)).toBe('north');
		expect(compassPoint(-1)).toBe('north');
		expect(compassPoint(-22.5)).toBe('north');
		expect(compassPoint(-22.501)).toBe('north-west');
		expect(compassPoint(-90)).toBe('west');
		expect(compassPoint(405)).toBe('north-east');
		expect(compassPoint(720 + 180)).toBe('south');
		expect(compassPoint(-720 - 135)).toBe('south-west');
	});
});

describe('windFromDeg', () => {
	it('gives the bearing the wind blows from, the other way from where it blows', () => {
		expect(windFromDeg(1, 0)).toBe(270);
		expect(windFromDeg(-1, 0)).toBe(90);
		expect(windFromDeg(0, 1)).toBe(180);
		expect(windFromDeg(0, -1)).toBe(0);
		expect(windFromDeg(-1, -1)).toBeCloseTo(45, 12);
		expect(windFromDeg(1, 1)).toBeCloseTo(225, 12);
	});

	it('stays within 0° up to but not including 360°', () => {
		for (const [east, north] of [
			[0, -1],
			[-0, -1],
			[1e-12, -1],
			[-1e-12, -1],
			[0, 0],
		] as const) {
			const deg = windFromDeg(east, north);
			expect(deg).toBeGreaterThanOrEqual(0);
			expect(deg).toBeLessThan(360);
		}
	});
});

describe('formatWind', () => {
	it('writes the speed in the unit and the point it blows from', () => {
		expect(formatWind(7.2, 45, 'm/s')).toBe('7 m/s from the north-east');
		expect(formatWind(10, 270, 'km/h')).toBe('36 km/h from the west');
		expect(formatWind(10, 180, 'mph')).toBe('22 mph from the south');
	});

	it('reads calm below 0.5 m/s in every unit, and not from 0.5 m/s', () => {
		expect(WIND_CALM_TEXT).toBe('calm');
		for (const unit of WIND_UNITS) {
			expect(formatWind(0, 0, unit), unit).toBe('calm');
			expect(formatWind(0.49, 90, unit), unit).toBe('calm');
			expect(formatWind(0.5, 90, unit), unit).not.toBe('calm');
		}
		expect(formatWind(0.5, 90, 'm/s')).toBe('1 m/s from the east');
		expect(formatWind(0.5, 90, 'km/h')).toBe('2 km/h from the east');
		expect(formatWind(0.5, 90, 'mph')).toBe('1 mph from the east');
	});

	it('writes a strong wind uncapped, its digits grouped in threes', () => {
		expect(formatWind(123.4, 0, 'm/s')).toBe('123 m/s from the north');
		expect(formatWind(300, 0, 'km/h')).toBe('1,080 km/h from the north');
	});
});
