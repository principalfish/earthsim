/**
 * The tuning script's printout, as Markdown: tables of the Earth's figures,
 * the cases' measures and checks, and the diagnostic. Each function gives
 * lines of text and prints nothing.
 */

import type { Measure } from '../report/summary';
import type { Box, Extreme, MeanWind } from './faults';
import {
	ASIA_BOX,
	MONSOON_BOX,
	SUBTROPICS_BOX,
	WINTER_HIGH_BOX,
} from './faults';
import type { EarthFigures, SearchResult, SweepRow } from './search';
import type { CasesRun, Diagnostic, DiagnosticColumn } from './tuning';

/** A Markdown table, with the minimal separator line, and a blank line. */
export const markdownTable = (
	header: readonly string[],
	rows: readonly (readonly string[])[],
): string[] => [
	`| ${header.join(' | ')} |`,
	`|${header.map(() => '-').join('|')}|`,
	...rows.map((row) => `| ${row.join(' | ')} |`),
	'',
];

/** The Earth's figures' column headings. */
export const FIGURE_HEADER = [
	'Wind RMS, m/s',
	'Direction within 45°',
	'Pressure RMS, hPa',
] as const;

/** The Earth's figures as table cells. */
export const figureCells = (figures: EarthFigures): string[] => [
	figures.windRms.toFixed(3),
	`${(100 * figures.directionShare).toFixed(2)}%`,
	figures.pressureRms.toFixed(3),
];

/** A setting's value as text, short but exact enough to set again. */
export const valueText = (value: number): string =>
	String(Number(value.toPrecision(6)));

/** A sweep's rows: the value and the figures it gave. */
export const sweepText = (name: string, rows: readonly SweepRow[]): string[] =>
	markdownTable(
		[name, ...FIGURE_HEADER],
		rows.map(({ value, figures }) => [
			valueText(value),
			...figureCells(figures),
		]),
	);

/** A search's start and end, the settings searched, and its steps. */
export const searchText = (
	names: readonly string[],
	result: SearchResult,
	fixed: Readonly<Record<string, number>> = {},
): string[] => [
	...markdownTable(
		['Settings', ...FIGURE_HEADER],
		[
			['Start', ...figureCells(result.start.figures)],
			['End', ...figureCells(result.end.figures)],
		],
	),
	...markdownTable(
		['Setting', 'Start', 'End'],
		names.map((name) => [
			name,
			valueText(result.start.settings[name] as number),
			valueText(result.end.settings[name] as number),
		]),
	),
	`${result.steps.length} steps taken, ${result.evaluations} runs of the Earth.`,
	'',
	...(result.boundStops.length === 0
		? []
		: [
				'Steps not tried, lying outside their setting’s bounds:',
				'',
				...result.boundStops.map(
					({ name, value, bounds }) =>
						`- ${name}=${String(value)} (${[
							bounds.above === undefined ? '' : `above ${bounds.above}`,
							bounds.atMost === undefined ? '' : `at most ${bounds.atMost}`,
						]
							.filter((part) => part !== '')
							.join(', ')})`,
				),
				'',
			]),
	`To run again with the end's settings: ${runAgainText(names, result, fixed)}`,
	'',
];

/**
 * The command that runs every case with a search's end settings: the
 * settings held through the search and those it moved, each in full, so
 * that it gives the search's end exactly.
 */
export const runAgainText = (
	names: readonly string[],
	result: SearchResult,
	fixed: Readonly<Record<string, number>> = {},
): string =>
	[
		'npm run tune:winds -- cases',
		...Object.entries(fixed)
			.filter(([name]) => !names.includes(name))
			.map(([name, value]) => `${name}=${String(value)}`),
		...names
			.filter(
				(name) =>
					name in fixed ||
					result.end.settings[name] !== result.start.settings[name],
			)
			.map((name) => `${name}=${String(result.end.settings[name])}`),
	].join(' ');

const measureText = (measure: Measure, digits: number): string =>
	measure.value === null ? measure.missing : measure.value.toFixed(digits);

const MONTH_NAMES = { 0: 'January', 6: 'July' } as const;

/** Every case's measures and the three checks' observations. */
export const casesText = (run: CasesRun): string[] => {
	const { checks } = run;
	return [
		...markdownTable([...FIGURE_HEADER], [figureCells(run.earth)]),
		'Bands of wind and the tropical cell’s edge, on the annual mean:',
		'',
		...markdownTable(
			[
				'Case',
				'Bands, south',
				'Bands, north',
				'Edge, south, °',
				'Edge, north, °',
			],
			run.cases.map((shown) => [
				shown.title,
				String(shown.bands.southern),
				String(shown.bands.northern),
				measureText(shown.edges.southern, 1),
				measureText(shown.edges.northern, 1),
			]),
		),
		'Check (a), winds at a steep tilt (mean eastward wind, m/s):',
		'',
		...markdownTable(
			[
				'Case',
				'Month',
				'Summer 40–60°',
				'Winter 40–60°',
				'Winter over summer',
				'Tropics',
				'Easterly bands',
				'Strongest easterly',
			],
			checks.windsAtTilt.rows.map(({ title, month, measures }) => [
				title,
				MONTH_NAMES[month],
				measureText(measures.summerMidLatitudesEast, 2),
				measureText(measures.winterMidLatitudesEast, 2),
				measureText(measures.winterToSummerSize, 2),
				measureText(measures.tropicsEast, 2),
				`${measures.tropicsEasterlyBands} of ${measures.tropicsBands}`,
				measureText(measures.tropicsStrongestEasterly, 2),
			]),
		),
		'Check (b), the lowest mean pressure at a steep tilt:',
		'',
		...markdownTable(
			[
				'Case',
				'Month',
				'Latitude, °N',
				'Into summer, °',
				'Lowest, hPa',
				'Spread, hPa',
			],
			checks.lowAtTilt.rows.map(({ title, month, measures }) => [
				title,
				MONTH_NAMES[month],
				measureText(measures.latitude, 0),
				measureText(measures.intoSummerDeg, 0),
				measureText(measures.pressureHpa, 1),
				measureText(measures.spreadHpa, 1),
			]),
		),
		'Check (c), the tropical cell and bands of wind against day length:',
		'',
		...markdownTable(
			[
				'Case',
				'Day, h',
				'Edge, south, °',
				'Over the Earth’s',
				'Bands, south',
				'Edge, north, °',
				'Over the Earth’s',
				'Bands, north',
			],
			checks.dayLength.rows.map((row) => [
				row.title,
				String(row.dayLengthHours),
				measureText(row.southern.edgeDeg, 1),
				measureText(row.southern.edgeToEarth, 2),
				String(row.southern.bands),
				measureText(row.northern.edgeDeg, 1),
				measureText(row.northern.edgeToEarth, 2),
				String(row.northern.bands),
			]),
		),
	];
};

const latitudeText = (latitude: number): string =>
	`${Math.abs(latitude).toFixed(1)}°${latitude >= 0 ? 'N' : 'S'}`;

const longitudeText = (longitude: number): string =>
	`${Math.abs(longitude).toFixed(1)}°${longitude >= 0 ? 'E' : 'W'}`;

const extremeText = (extreme: Extreme): string =>
	`${extreme.value.toFixed(1)} hPa at ${latitudeText(extreme.latitude)} ${longitudeText(extreme.longitude)}`;

const windText = (wind: MeanWind): string =>
	`(${wind.east >= 0 ? '+' : ''}${wind.east.toFixed(1)}, ${wind.north >= 0 ? '+' : ''}${wind.north.toFixed(1)}) m/s`;

const boxText = (box: Box): string =>
	`${latitudeText(box.south)}–${latitudeText(box.north)}, ${longitudeText(box.west)}–${longitudeText(box.east)}`;

/** The diagnostic, one row for each figure and fault. */
export const diagnosticText = (diagnostic: Diagnostic): string[] => {
	const columns: readonly DiagnosticColumn[] = [
		diagnostic.simulated,
		diagnostic.observedTemperature,
		diagnostic.observed,
	];
	const figure = (column: DiagnosticColumn, index: number): string =>
		column.figures === null
			? '—'
			: (figureCells(column.figures)[index] as string);
	const row = (
		label: string,
		cell: (column: DiagnosticColumn) => string,
	): string[] => [label, ...columns.map(cell)];
	return markdownTable(
		[
			'',
			'Model, simulated temperature',
			'Model, observed temperature',
			'Observed',
		],
		[
			...FIGURE_HEADER.map((label, index) =>
				row(`Whole year: ${label}`, (column) => figure(column, index)),
			),
			row(`July: lowest pressure over ${boxText(ASIA_BOX)}`, (column) =>
				extremeText(column.faults.julyAsiaLow),
			),
			row(
				`July: mean pressure over ${boxText(SUBTROPICS_BOX)}`,
				(column) => `${column.faults.julySubtropicsHpa.toFixed(1)} hPa`,
			),
			row(`January: mean wind over ${boxText(MONSOON_BOX)}`, (column) =>
				windText(column.faults.januaryMonsoon),
			),
			row(`July: mean wind over ${boxText(MONSOON_BOX)}`, (column) =>
				windText(column.faults.julyMonsoon),
			),
			row(
				`January: highest pressure over ${boxText(WINTER_HIGH_BOX)}`,
				(column) => extremeText(column.faults.januaryAsiaHigh),
			),
		],
	);
};
