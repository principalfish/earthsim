import { describe, expect, it } from 'vitest';
import {
	type ConfigSection,
	constantsOf,
	defineSection,
	TEMPERATURE_CONFIG,
	valuesOf,
	WIND_CONFIG,
} from './config';
import { GREENHOUSE_FACTOR } from './planet/planet';
import { EXCHANGE_MAX_ITERATIONS } from './temperature/exchange';
import { TEMPERATURE_MODEL } from './temperature/temperature';
import {
	AIR_DENSITY_KG_M3,
	DEFAULT_WIND_SETTINGS,
	EARTH_CELL_WIDTH_DEG,
	FULL_BANDS_EASE_CELLS,
	REFERENCE_PRESSURE_HPA,
	windSettings,
} from './wind/rules';

const entry = (value: number) => ({
	value,
	unit: 'm',
	what: 'what',
	raising: 'up',
	lowering: 'down',
	source: 'guess',
	tuned: null,
});

// A literal copy of the temperature model's values as they were before they
// moved into the config, in the order the model listed them.
const TEMPERATURE_LITERAL = {
	diffusivity: 0.55,
	landDiffusivity: 0.35,
	oceanHeatCapacity: 2.5e8,
	landHeatCapacity: 1e7,
	seaIceHeatCapacity: 1e7,
	lapseRate: 6.5e-3,
	greenhouseFactor: 0.633,
	albedo: 0.27,
	albedoPoleward: 0.078,
	landAlbedoExtra: 0,
	iceAlbedo: 0.62,
	iceStartC: 0,
	iceFullC: -10,
	stepsPerMonth: 2,
	solverToleranceK: 5e-3,
	solverMaxIterations: 200,
	terrainDriftLimitK: 0.25,
	correctionRefineK: 1,
};

describe('valuesOf', () => {
	it('flattens the groups in order into a frozen object', () => {
		const section = defineSection(
			'Test',
			[
				{ title: 'A', settings: { b: entry(2), a: entry(1) } },
				{ title: 'B', settings: { c: entry(3) } },
			],
			{ title: 'Fixed', settings: { d: entry(4) } },
		);
		const values = valuesOf(section);
		expect(Object.keys(values)).toEqual(['b', 'a', 'c']);
		expect(values).toEqual({ b: 2, a: 1, c: 3 });
		expect(Object.isFrozen(values)).toBe(true);
		expect(Object.isFrozen(section)).toBe(true);
		expect(Object.isFrozen(section.groups[0].settings.a)).toBe(true);
	});

	it('leaves the constants out of the values and reads them apart', () => {
		const section = defineSection(
			'Test',
			[{ title: 'A', settings: { a: entry(1) } }],
			{ title: 'Fixed', settings: { d: entry(4) } },
		);
		expect(valuesOf(section)).toEqual({ a: 1 });
		const constants = constantsOf(section);
		expect(constants).toEqual({ d: 4 });
		expect(Object.isFrozen(constants)).toBe(true);
	});
});

describe('defineSection', () => {
	it('refuses a name that appears twice, across groups or constants', () => {
		const fixed = { title: 'Fixed', settings: {} };
		expect(() =>
			defineSection(
				'Test',
				[
					{ title: 'A', settings: { a: entry(1) } },
					{ title: 'B', settings: { a: entry(2) } },
				],
				fixed,
			),
		).toThrow(/appears twice/);
		expect(() =>
			defineSection('Test', [{ title: 'A', settings: { a: entry(1) } }], {
				title: 'Fixed',
				settings: { a: entry(2) },
			}),
		).toThrow(/appears twice/);
	});

	it('refuses a value that is not finite', () => {
		expect(() =>
			defineSection(
				'Test',
				[{ title: 'A', settings: { a: entry(Number.NaN) } }],
				{ title: 'Fixed', settings: {} },
			),
		).toThrow(/not finite/);
		expect(() =>
			defineSection('Test', [{ title: 'A', settings: { a: entry(1) } }], {
				title: 'Fixed',
				settings: { d: entry(Number.POSITIVE_INFINITY) },
			}),
		).toThrow(/not finite/);
	});
});

describe('TEMPERATURE_CONFIG', () => {
	const section: ConfigSection = TEMPERATURE_CONFIG;
	const entries = [
		...section.groups.flatMap((group) => Object.entries(group.settings)),
		...Object.entries(section.constants.settings),
	];

	it('gives the model the same values, in the same order, frozen', () => {
		expect(TEMPERATURE_MODEL).toEqual(TEMPERATURE_LITERAL);
		expect(Object.keys(TEMPERATURE_MODEL)).toEqual(
			Object.keys(TEMPERATURE_LITERAL),
		);
		expect(Object.isFrozen(TEMPERATURE_MODEL)).toBe(true);
	});

	it('keeps the two defaults other modules read unchanged', () => {
		expect(GREENHOUSE_FACTOR).toBe(0.633);
		expect(EXCHANGE_MAX_ITERATIONS).toBe(200);
	});

	it('keeps the fixed choices it moved in', () => {
		expect(constantsOf(TEMPERATURE_CONFIG)).toEqual({
			minDampingShare: 0.5,
			correctionPasses: 4,
			guessIterations: 20,
			guessChangeK: 0.1,
			slowestShrinkTrusted: 0.75,
		});
	});

	it('explains every setting', () => {
		for (const [name, setting] of entries) {
			expect(Number.isFinite(setting.value), name).toBe(true);
			for (const text of [
				setting.unit,
				setting.what,
				setting.raising,
				setting.lowering,
				setting.source,
			]) {
				expect(text.trim(), name).not.toBe('');
			}
			expect(setting.tuned === null || setting.tuned.trim() !== '', name).toBe(
				true,
			);
		}
	});

	it('lists each setting once, with the solver group numerical and last', () => {
		const names = entries.map(([name]) => name);
		expect(new Set(names).size).toBe(names.length);
		expect(section.groups.map((group) => group.numerical === true)).toEqual([
			false,
			false,
			true,
		]);
		expect(section.groups.map((group) => Object.keys(group.settings))).toEqual([
			[
				'diffusivity',
				'landDiffusivity',
				'oceanHeatCapacity',
				'landHeatCapacity',
				'seaIceHeatCapacity',
				'lapseRate',
				'greenhouseFactor',
			],
			[
				'albedo',
				'albedoPoleward',
				'landAlbedoExtra',
				'iceAlbedo',
				'iceStartC',
				'iceFullC',
			],
			[
				'stepsPerMonth',
				'solverToleranceK',
				'solverMaxIterations',
				'terrainDriftLimitK',
				'correctionRefineK',
			],
		]);
	});

	it('marks the four settings tuned against the Earth', () => {
		const tuned = entries
			.filter(([, setting]) => setting.tuned !== null)
			.map(([name]) => name);
		expect(tuned).toEqual([
			'landDiffusivity',
			'albedo',
			'albedoPoleward',
			'iceAlbedo',
		]);
	});
});

// A literal copy of the wind model's settings as they were before they moved
// into the config, in the order the model listed them.
const WIND_LITERAL = {
	earthContrastK: 41,
	rotationPower: 0.5,
	contrastPower: 0.25,
	minContrastRatio: 0.25,
	maxContrastRatio: 4,
	hotWindowK: 4,
	lowShiftGain: 2.5,
	lowShiftFadeDeg: 20,
	edgeShiftShare: 0.5,
	lowLimitDeg: 70,
	lowLimitFromWidthDeg: 30,
	lowLimitToWidthDeg: 60,
	lowLimitEaseShare: 0.5,
	minSummerCellShare: 0.3,
	wideSummerFromShare: 0.4,
	wideSummerToShare: 0.8,
	sideContrastK: 30,
	outerCellShare: 0.3,
	fullBandsReachDeg: 60,
	poleTaperDeg: 10,
	localBandsShare: 1,
	localWindowDeg: 180,
	localWindowTaperShare: 0.5,
	localBandsFullToDeg: 40,
	localBandsGlobalFromDeg: 70,
	bandAmplitudeHpa: 9,
	thermalHpaPerK: 3,
	thermalSmoothingKm: 900,
	seaThermalShare: 0.3,
	warmLimitK: 6,
	coldKneeK: 20,
	coldLimitK: 25,
	thermalHeightM: 2500,
	seaFrictionPerS: 2.5e-5,
	landFrictionFactor: 5,
	blockingSlope: 0.005,
};

describe('WIND_CONFIG', () => {
	const section: ConfigSection = WIND_CONFIG;
	const entries = [
		...section.groups.flatMap((group) => Object.entries(group.settings)),
		...Object.entries(section.constants.settings),
	];

	it('gives the model the same values, in the same order, frozen', () => {
		expect(DEFAULT_WIND_SETTINGS).toEqual(WIND_LITERAL);
		expect(Object.keys(DEFAULT_WIND_SETTINGS)).toEqual(
			Object.keys(WIND_LITERAL),
		);
		expect(Object.isFrozen(DEFAULT_WIND_SETTINGS)).toBe(true);
		expect(windSettings()).toBe(DEFAULT_WIND_SETTINGS);
	});

	it('keeps the fixed choices it moved in', () => {
		expect(constantsOf(WIND_CONFIG)).toEqual({
			referencePressureHpa: 1011,
			airDensityKgM3: 1.2,
			earthCellWidthDeg: 30,
			fullBandsEaseCells: 0.25,
		});
		expect(REFERENCE_PRESSURE_HPA).toBe(1011);
		expect(AIR_DENSITY_KG_M3).toBe(1.2);
		expect(EARTH_CELL_WIDTH_DEG).toBe(30);
		expect(FULL_BANDS_EASE_CELLS).toBe(0.25);
	});

	it('explains every setting', () => {
		for (const [name, setting] of entries) {
			expect(Number.isFinite(setting.value), name).toBe(true);
			for (const text of [
				setting.unit,
				setting.what,
				setting.raising,
				setting.lowering,
				setting.source,
			]) {
				expect(text.trim(), name).not.toBe('');
			}
			expect(setting.tuned === null || setting.tuned.trim() !== '', name).toBe(
				true,
			);
		}
	});

	it('lists each setting once, in eight groups, none numerical', () => {
		const names = entries.map(([name]) => name);
		expect(new Set(names).size).toBe(names.length);
		expect(section.groups.map((group) => group.title)).toEqual([
			'How wide the circulation cells are',
			'Where the band of low pressure sits',
			'Steep tilts',
			'The bands far from the low',
			'Bands that follow land and sea',
			'How strong the bands are',
			'Highs and lows over land and sea',
			'The wind from the pressure',
		]);
		expect(section.groups.some((group) => group.numerical)).toBe(false);
	});

	it('marks the eleven settings tuned against the Earth', () => {
		const tuned = entries
			.filter(([, setting]) => setting.tuned !== null)
			.map(([name]) => name);
		expect(tuned.sort()).toEqual(
			[
				'bandAmplitudeHpa',
				'hotWindowK',
				'landFrictionFactor',
				'lowShiftGain',
				'outerCellShare',
				'seaFrictionPerS',
				'seaThermalShare',
				'thermalHeightM',
				'thermalHpaPerK',
				'thermalSmoothingKm',
				'warmLimitK',
			].sort(),
		);
	});

	it('numbers the fourteen settings a search varies from 1, each once', () => {
		const orders = entries
			.map(([, setting]) => setting.searchOrder)
			.filter((order) => order !== undefined)
			.sort((a, b) => (a as number) - (b as number));
		expect(orders).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
	});

	it('bounds every setting with its value within', () => {
		for (const group of section.groups) {
			for (const [name, setting] of Object.entries(group.settings)) {
				const { above, atMost } = setting.bounds ?? {};
				expect(above, name).toBe(0);
				expect(setting.value, name).toBeGreaterThan(above as number);
				if (atMost !== undefined) {
					expect(setting.value, name).toBeLessThanOrEqual(atMost);
				}
			}
		}
	});
});
