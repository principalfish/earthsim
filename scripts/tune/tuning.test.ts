import { describe, expect, it } from 'vitest';
import {
	decodeEarth,
	decodeObservedPressure,
	decodeObservedWind,
	getGrid,
	observedPressure,
	observedWind,
	solveTemperature,
} from '../../src/core/index';
import {
	readEarthDataFile,
	readObservedPressureFile,
	readObservedTemperatureFile,
	readObservedWindFile,
} from '../earth/dataFile.mjs';
import { CASE_RESOLUTION, cases, ONE_CONTINENT_CASE_ID } from '../report/cases';
import { EARTH_CASE_ID } from '../report/page';
import { parseCommand } from './command';
import { search, sweep } from './search';
import {
	casesText,
	diagnosticText,
	markdownTable,
	runAgainText,
	searchText,
	sweepText,
	swingText,
} from './text';
import { diagnose, earthFigures, runCases, type Tuning } from './tuning';

/** The Earth case alone, its temperatures solved, as the script has it. */
const earthOnly = (): Tuning => {
	const shown = cases.find(({ id }) => id === EARTH_CASE_ID);
	if (shown === undefined) {
		throw new Error('The report has no Earth case');
	}
	const built = {
		case: shown,
		world: shown.build(decodeEarth(readEarthDataFile())),
	};
	const temperatures = solveTemperature(built.world).months;
	return {
		cases: [built],
		temperatures: [temperatures],
		observed: {
			...observedWind(
				decodeObservedWind(readObservedWindFile()),
				CASE_RESOLUTION,
			),
			pressure: observedPressure(
				decodeObservedPressure(readObservedPressureFile()),
				CASE_RESOLUTION,
			),
		},
		grid: getGrid(CASE_RESOLUTION),
		earth: { built, temperatures },
	};
};

describe('markdownTable', () => {
	it('writes the header, the minimal separator and the rows, then a blank line', () => {
		expect(markdownTable(['a', 'b'], [['1', '2']])).toEqual([
			'| a | b |',
			'|-|-|',
			'| 1 | 2 |',
			'',
		]);
	});
});

/** The thermal response the figures below were tuned at. */
const TUNED = { thermalHpaPerK: 3 };

describe('the tuning runs', () => {
	// A solve of the Earth's temperature, about a second, and five runs of
	// a year of winds, about half a second each, more under coverage, hence
	// the longer time allowed.
	it('give the Earth’s figures, its measures and the diagnostic, and print them', () => {
		const tuning = earthOnly();
		// The figures are those of 3 hPa a kelvin of thermal response, the
		// strength the model was tuned at, and of the temperature without winds,
		// which the tuning script works from; the model's own default is now
		// the physical 0.7.
		const figures = earthFigures(tuning, TUNED);
		expect(figures.windRms).toBeCloseTo(3.822, 3);
		expect(figures.directionShare).toBeCloseTo(0.6091, 4);
		expect(figures.pressureRms).toBeCloseTo(7.085, 3);
		// With the bands one pattern round the globe, the figures of the model
		// before they varied by longitude: 3.813 m/s, 60.60% and 7.113 hPa.
		const zonal = earthFigures(tuning, { ...TUNED, localBandsShare: 0 });
		expect(zonal.windRms).toBeCloseTo(3.813, 3);
		expect(zonal.directionShare).toBeCloseTo(0.606, 3);
		expect(zonal.pressureRms).toBeCloseTo(7.113, 3);
		const changed = earthFigures(tuning, { ...TUNED, bandAmplitudeHpa: 7 });
		expect(changed.windRms).not.toBe(figures.windRms);

		const run = runCases(tuning, TUNED);
		expect(run.earth).toEqual(figures);
		expect(run.cases).toHaveLength(1);
		expect(run.cases[0]?.bands).toEqual({ southern: 3, northern: 3 });
		// The checks' cases other than the Earth are not among these.
		expect(run.checks.lowAtTilt.unmeasured.length).toBeGreaterThan(0);
		// Nor is the one-continent world, whose open ocean is measured.
		expect(run.oceanicSwing).toBeNull();
		const printed = casesText(run).join('\n');
		expect(printed).toContain('| The Earth | 3 | 3 |');
		expect(printed).toContain('|-|-|-|-|-|');
		expect(printed).not.toContain('July less January');
		// The case measured is among the report's, so the table prints when
		// it runs; given a run with it, the cases' printout holds the table.
		expect(cases.map(({ id }) => id)).toContain(ONE_CONTINENT_CASE_ID);
		const places = {
			southHigh: { value: -30 },
			low: { value: 1 },
			northHigh: { value: 28 },
		};
		const withSwing = casesText({
			...run,
			oceanicSwing: { january: places, july: places, change: places },
		}).join('\n');
		expect(withSwing).toContain('| July less January | -30.0 | 1.0 | 28.0 |');
		expect(withSwing.indexOf('open ocean')).toBeLessThan(
			withSwing.indexOf('Check (a)'),
		);

		const diagnostic = diagnose(tuning, readObservedTemperatureFile(), TUNED);
		expect(diagnostic.simulated.figures).toEqual(figures);
		expect(diagnostic.observed.figures).toBeNull();
		const observedRun = diagnostic.observedTemperature;
		expect(observedRun.figures?.windRms).not.toBe(figures.windRms);
		// The observed Earth's July heat low lies over South Asia, south of
		// 40°N, and its January high over Mongolia and Siberia.
		expect(diagnostic.observed.faults.julyAsiaLow.latitude).toBeLessThan(40);
		expect(diagnostic.observed.faults.januaryAsiaHigh.value).toBeGreaterThan(
			1030,
		);
		const table = diagnosticText(diagnostic);
		expect(table[1]).toBe('|-|-|-|-|');
		expect(table.join('\n')).toContain('July: lowest pressure over');
	}, 60_000);
});

describe('swingText', () => {
	it('prints the open ocean’s bands in January and July and their change, saying what is not measured', () => {
		const missing = { value: null, missing: 'not measured here' } as const;
		const printed = swingText({
			january: {
				southHigh: { value: -31 },
				low: { value: -2.04 },
				northHigh: { value: 29 },
			},
			july: {
				southHigh: { value: -27 },
				low: { value: 4 },
				northHigh: missing,
			},
			change: {
				southHigh: { value: 4 },
				low: { value: 6.04 },
				northHigh: missing,
			},
		});
		expect(printed[0]).toContain('131.6° to 228.4° east');
		expect(printed).toContain('| January | -31.0 | -2.0 | 29.0 |');
		expect(printed).toContain(
			'| July less January | 4.0 | 6.0 | not measured here |',
		);
		expect(printed).toContain('|-|-|-|-|');
	});
});

describe('sweepText and searchText', () => {
	it('print a row for each value tried, and the start and end of a search', () => {
		const figures = (value: number) => ({
			windRms: 4 - value / 10,
			directionShare: 0.6,
			pressureRms: 7,
		});
		const swept = sweepText('warmLimitK', sweep([5, 6], figures));
		expect(swept).toEqual([
			'| warmLimitK | Wind RMS, m/s | Direction within 45° | Pressure RMS, hPa |',
			'|-|-|-|-|',
			'| 5 | 3.500 | 60.00% | 7.000 |',
			'| 6 | 3.400 | 60.00% | 7.000 |',
			'',
		]);
		const result = search({
			start: { warmLimitK: 6 },
			names: ['warmLimitK'],
			rounds: 1,
			evaluate: ({ warmLimitK }) => figures(Math.min(7, warmLimitK as number)),
		});
		const fixed = { thermalHpaPerK: 2.5 };
		const printed = searchText(['warmLimitK'], result, fixed).join('\n');
		expect(printed).toContain('| Start | 3.400 | 60.00% | 7.000 |');
		// Up by 10% while the wind difference falls, which it does no more
		// past 7.
		expect(printed).toContain('| warmLimitK | 6 | 7.26 |');
		expect(printed).not.toContain('outside their setting’s bounds');
		// The line to run again holds the settings held and those moved, in
		// full, so that it runs the search's end exactly.
		const end = result.end.settings.warmLimitK as number;
		expect(end).not.toBe(7.26);
		const again = runAgainText(['warmLimitK'], result, fixed);
		expect(again).toBe(
			`npm run tune:winds -- cases thermalHpaPerK=2.5 warmLimitK=${String(end)}`,
		);
		expect(printed).toContain(again);
		expect(
			parseCommand(again.replace('npm run tune:winds -- ', '').split(' ')),
		).toEqual({ kind: 'cases', fixed: { ...fixed, warmLimitK: end } });
		// A setting held and searched but not moved keeps its held value.
		expect(
			runAgainText(
				['warmLimitK'],
				{ ...result, end: result.start },
				{ warmLimitK: 6 },
			),
		).toBe('npm run tune:winds -- cases warmLimitK=6');
	});

	it('notes the steps a bound stopped', () => {
		const result = search({
			start: { outerCellShare: 0.9 },
			names: ['outerCellShare'],
			rounds: 1,
			bounds: { outerCellShare: { above: 0, atMost: 1 } },
			evaluate: ({ outerCellShare }) => ({
				windRms: 2 - (outerCellShare as number),
				directionShare: 0.6,
				pressureRms: 7,
			}),
		});
		const printed = searchText(['outerCellShare'], result).join('\n');
		expect(printed).toContain(
			'Steps not tried, lying outside their setting’s bounds:',
		);
		// From 0.9 to 0.99, and then 1.089 would be past 1.
		const [stop] = result.boundStops;
		expect(result.end.settings.outerCellShare).toBeCloseTo(0.99, 12);
		expect(stop?.value).toBeCloseTo(1.089, 12);
		expect(printed).toContain(
			`- outerCellShare=${String(stop?.value)} (above 0, at most 1)`,
		);
	});
});
