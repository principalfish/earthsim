import { describe, expect, it } from 'vitest';
import {
	type ConfigSection,
	constantsOf,
	defineSection,
	TEMPERATURE_CONFIG,
	valuesOf,
} from './config';
import { GREENHOUSE_FACTOR } from './planet/planet';
import { EXCHANGE_MAX_ITERATIONS } from './temperature/exchange';
import { TEMPERATURE_MODEL } from './temperature/temperature';

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
