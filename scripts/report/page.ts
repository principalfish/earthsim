/**
 * The wind report's page: one self-contained HTML file, put together from
 * winds already worked out, that needs no script and nothing from outside
 * it.
 */

import {
	DIRECTION_MIN_SPEED_M_PER_S,
	DIRECTION_TOLERANCE_DEG,
	getGrid,
	MONTH_NAMES,
	type WindErrorFigures,
	type WindResult,
	type World,
	windErrorFigures,
	windMonth,
	zonalMean,
} from '../../src/core/index';
import { CASE_RESOLUTION, landShare, type ReportCase } from './cases';
import { drawZonalChart } from './chart';
import {
	ARROW_FULL_SPEED_M_PER_S,
	ARROW_MAX_UNITS,
	ARROW_MIN_UNITS,
	ARROW_SPACING_DEG,
	CALM_M_PER_S,
	drawMap,
	GRATICULE_STEP_DEG,
	HEAD_SHARE,
	PRESSURE_HIGH_HPA,
	PRESSURE_LOW_HPA,
	PRESSURE_MIDDLE_HPA,
	REFERENCE_SPEEDS_M_PER_S,
	UNITS_PER_DEGREE,
} from './map';
import { escapeText, figure } from './markup';

/** The id of the case that is compared with the observed Earth. */
export const EARTH_CASE_ID = 'earth';

/** The months the report shows, by index from January. */
const SHOWN_MONTHS = [0, 6] as const;

/** A case with its world built. */
export type BuiltCase = {
	readonly case: ReportCase;
	/** The world, on the {@link CASE_RESOLUTION} grid. */
	readonly world: World;
};

/** How long a model took on the Earth at one resolution. */
export type ModelTiming = {
	/** Cells along a face edge. */
	readonly resolution: number;
	/** The model's own time, not the temperature's, in seconds. */
	readonly seconds: number;
};

/** The three fields of a model's result. */
export type WindField = 'east' | 'north' | 'pressure';

/** The names of the fields, as the page and the warnings give them. */
export const WIND_FIELD_NAMES: { readonly [K in WindField]: string } = {
	east: 'eastward wind',
	north: 'northward wind',
	pressure: 'sea-level pressure',
};

/**
 * Where a model's result first holds a value that is not a finite number:
 * the earliest month that holds one, and in it the first field that does,
 * in the order eastward wind, northward wind, pressure.
 */
export type ModelFault = {
	/** The month, from 0 for January. */
	readonly month: number;
	readonly field: WindField;
};

/** One model's winds on every case, and its times. */
export type ModelRun = {
	/** The model's name, for headings. */
	readonly name: string;
	/** Its winds and pressure on each case, under the case's id. */
	readonly results: ReadonlyMap<string, WindResult>;
	/**
	 * The cases whose result holds a value that is not a finite number,
	 * under the case's id, with where the first such value is. Their maps,
	 * figures and chart are not drawn. None when left out.
	 */
	readonly faults?: ReadonlyMap<string, ModelFault>;
	/** Its times on the Earth, from the coarsest grid. */
	readonly timings: readonly ModelTiming[];
};

/** What the page is made from. */
export type ReportInput = {
	/**
	 * The cases, in the order to show them, one of them with the id
	 * {@link EARTH_CASE_ID}: the Earth, whose coast the observed maps show.
	 */
	readonly cases: readonly BuiltCase[];
	/** The observed Earth's winds and pressure on the Earth case's cells. */
	readonly observed: WindResult;
	/** The models, in the order to show them; there may be none. */
	readonly models: readonly ModelRun[];
};

const STYLE = `
:root { color-scheme: light dark; --muted: #555; --rule: #ccc; }
@media (prefers-color-scheme: dark) {
	:root { --muted: #aaa; --rule: #444; }
}
body { margin: 0; padding: 1.5rem 1rem 3rem; font: 16px/1.5 system-ui, sans-serif; background: #fff; color: #1b1b1b; }
@media (prefers-color-scheme: dark) { body { background: #121314; color: #e6e6e3; } }
h1 { font-size: 1.7rem; margin: 0 0 .5rem; }
h2 { font-size: 1.35rem; margin: 2.5rem 0 .5rem; border-bottom: 1px solid var(--rule); padding-bottom: .25rem; }
h3 { font-size: 1.1rem; margin: 1.75rem 0 .5rem; }
p, ul { max-width: 60rem; }
.muted { color: var(--muted); }
.note { border-left: 4px solid #d9730d; padding: .25rem .75rem; }
.pair { display: grid; grid-template-columns: 1fr; gap: 1rem 1.5rem; }
@media (min-width: 1260px) { .pair { grid-template-columns: 1fr 1fr; } }
figure { margin: 0; }
figcaption { font-weight: 600; margin-bottom: .25rem; }
svg { display: block; width: 100%; height: auto; }
.chart { max-width: 640px; }
table { border-collapse: collapse; margin: .5rem 0 1rem; }
th, td { border-bottom: 1px solid var(--rule); padding: .3rem .7rem; text-align: left; vertical-align: top; }
td.number { text-align: right; font-variant-numeric: tabular-nums; }
`;

/** The latitude bands' middles and a field's mean in each. */
const zonal = (world: World, field: ArrayLike<number>) =>
	zonalMean(getGrid(world.resolution), field);

/** A month's map of a world, in a figure with a caption. */
const mapFigure = (
	caption: string,
	world: World,
	result: WindResult | null,
	month: number,
): string =>
	`<figure><figcaption>${escapeText(caption)}</figcaption>${drawMap({
		title: caption,
		world,
		...(result === null ? {} : { month: windMonth(result, month) }),
	})}</figure>`;

const chartFigure = (svg: string, caption: string): string =>
	`<figure class="chart"><figcaption>${escapeText(caption)}</figcaption>${svg}</figure>`;

/** A table, its cells already HTML; a cell starting with a digit is a number. */
const table = (
	header: readonly string[],
	rows: readonly (readonly string[])[],
): string => {
	const cell = (text: string): string =>
		/^[−+]?\d/.test(text)
			? `<td class="number">${text}</td>`
			: `<td>${text}</td>`;
	return `<table><thead><tr>${header.map((text) => `<th scope="col">${text}</th>`).join('')}</tr></thead><tbody>${rows
		.map((row) => `<tr>${row.map(cell).join('')}</tr>`)
		.join('')}</tbody></table>`;
};

const monthName = (month: number): string => MONTH_NAMES[month] as string;

/**
 * What a fault is, as a sentence ending in a full stop: the field and the
 * month of the first value that is not a finite number.
 */
export const faultText = (fault: ModelFault): string =>
	`The ${WIND_FIELD_NAMES[fault.field]} in ${monthName(fault.month)} is the first value that is not a finite number.`;

/** What the maps show and how to read them. */
const legend = (): string => {
	const degrees = (units: number): string =>
		String(Number((units / UNITS_PER_DEGREE).toFixed(2)));
	return `<ul>
<li>Each map is flat: longitude across, from 180°W at the left to 180°E at the right, and latitude up, from 90°S at the bottom to 90°N at the top. Thin lines are drawn every ${GRATICULE_STEP_DEG}°.</li>
<li>Colours are the sea-level pressure on one scale for every map: white at ${PRESSURE_MIDDLE_HPA.toLocaleString('en-GB')} hPa, blue below it to full blue at ${PRESSURE_LOW_HPA} hPa, red above it to full red at ${PRESSURE_HIGH_HPA.toLocaleString('en-GB')} hPa. Highs are red and lows blue.</li>
<li>Arrows are the wind 10 m above the surface, every ${ARROW_SPACING_DEG}° of latitude and longitude, pointing the way the wind blows. Arrows start at about ${degrees(ARROW_MIN_UNITS)}° long for the lightest wind drawn and grow in step with the speed to ${degrees(ARROW_MAX_UNITS)}° at ${ARROW_FULL_SPEED_M_PER_S} m/s, and any stronger wind is drawn that long, so neighbouring arrows never meet. Each head is ${HEAD_SHARE * 100}% of its arrow’s length. Where the wind is under ${CALM_M_PER_S} m/s there is no arrow. The key shows arrows for ${REFERENCE_SPEEDS_M_PER_S.join(', ').replace(/, (?=[^,]*$)/, ' and ')} m/s at the maps’ own scale.</li>
<li>The black line is the coast. On a map with no winds, such as an invented world’s before any model is registered, land is pale sand and sea pale blue.</li>
</ul>`;
};

/** Error figures as table cells, for one month or the year. */
const figureCells = (figures: WindErrorFigures): string[] => [
	figure(figures.rmsVectorDifference, 2),
	figure(figures.meanSpeedDifference, 2, true),
	figures.directionShare === null
		? 'none counted'
		: `${figure(100 * figures.directionShare, 1)}%`,
	`${figure(100 * figures.directionCountedShare, 1)}%`,
	figure(figures.pressureMeanDifference, 2, true),
	figure(figures.pressureRmsDifference, 2),
];

const ERROR_HEADER = [
	'Months',
	'RMS of the vector difference, m/s',
	'Mean speed difference, m/s',
	`Direction within ${DIRECTION_TOLERANCE_DEG}°`,
	'Surface counted for direction',
	'Mean pressure difference, hPa',
	'RMS pressure difference, hPa',
];

/** The page's section for one model. */
const modelSection = (
	model: ModelRun,
	cases: readonly BuiltCase[],
	observed: WindResult,
): string => {
	const name = escapeText(model.name);
	const parts = [`<h2>Model: ${name}</h2>`];
	parts.push(
		'<h3>Solve times on the Earth</h3>',
		'<p>The model’s own time for the year, given the temperatures; the temperatures’ own solve is not counted.</p>',
		table(
			['Cells per face edge', 'Seconds'],
			model.timings.map(({ resolution, seconds }) => [
				String(resolution),
				figure(seconds, 3),
			]),
		),
	);
	for (const { case: shown, world } of cases) {
		parts.push(
			`<h3>${name}: ${escapeText(shown.title)}</h3>`,
			`<p class="muted">${escapeText(shown.description)}</p>`,
		);
		const fault = model.faults?.get(shown.id);
		if (fault !== undefined) {
			parts.push(
				`<p class="note"><strong>Not drawn:</strong> the model gave a value that is not a finite number on this case. ${escapeText(faultText(fault))} Its maps${shown.id === EARTH_CASE_ID ? ', its figures against the observed Earth and its chart' : ''} for this case are left out.</p>`,
			);
			continue;
		}
		const result = model.results.get(shown.id);
		if (result === undefined) {
			throw new RangeError(
				`The model ${model.name} has no result for the case ${shown.id}`,
			);
		}
		if (shown.id !== EARTH_CASE_ID) {
			parts.push(
				`<div class="pair">${SHOWN_MONTHS.map((month) =>
					mapFigure(
						`${model.name}, ${monthName(month)}: ${shown.title}`,
						world,
						result,
						month,
					),
				).join('')}</div>`,
			);
			continue;
		}
		for (const month of SHOWN_MONTHS) {
			parts.push(
				`<div class="pair">${mapFigure(
					`Observed Earth, ${monthName(month)}`,
					world,
					observed,
					month,
				)}${mapFigure(
					`${model.name}, ${monthName(month)}: ${shown.title}`,
					world,
					result,
					month,
				)}</div>`,
			);
		}
		const comparison = windErrorFigures(
			result,
			observed,
			getGrid(world.resolution),
		);
		parts.push(
			'<h3>Against the observed Earth</h3>',
			`<p>Simulated less observed, each cell weighted by its area. The direction is judged only where the observed wind is at least ${DIRECTION_MIN_SPEED_M_PER_S} m/s, which is the share of the surface counted. The whole year takes every cell of every month together.</p>`,
			table(ERROR_HEADER, [
				...SHOWN_MONTHS.map((month) => [
					monthName(month),
					...figureCells(comparison.months[month] as WindErrorFigures),
				]),
				['The whole year', ...figureCells(comparison.year)],
			]),
			`<div class="pair">${SHOWN_MONTHS.map((month) => {
				const simulatedMean = zonal(world, result.east[month] as Float32Array);
				const observedMean = zonal(world, observed.east[month] as Float32Array);
				const caption = `Mean eastward wind by latitude, ${monthName(month)}: ${model.name} against observed`;
				return chartFigure(
					drawZonalChart({
						title: caption,
						latitudes: observedMean.latitudes,
						quantity: 'Eastward wind, m/s',
						series: [
							{
								label: 'Observed',
								values: observedMean.means,
								colour: 'currentColor',
							},
							{
								label: model.name,
								values: simulatedMean.means,
								colour: '#d9730d',
								dashed: true,
							},
						],
					}),
					caption,
				);
			}).join('')}</div>`,
		);
	}
	return parts.join('\n');
};

/**
 * The whole report as one HTML page.
 *
 * @remarks
 * First the observed Earth in January and July side by side, with the
 * mean eastward wind by latitude in both months; then the cases and their
 * settings, with a coast-only map of each invented world while no model is
 * registered; then a section for each model: its solve times on the
 * Earth; for each case its January and July maps; and on the Earth the
 * observed beside the simulated, the error figures for January, July and
 * the whole year, and the mean eastward wind by latitude against the
 * observed. A case among a model's faults has in their place a note of
 * where its first value that is not a finite number is; the model's other
 * cases and its times are shown as ever. Every text put into the page is
 * escaped.
 *
 * @param input - The cases, the observed Earth and the models' results.
 * Not changed.
 * @returns The page, from its doctype to its closing tag.
 * @throws RangeError if no case is the Earth, or a model has no result for
 * a case that is not among its faults.
 */
export const buildReport = (input: ReportInput): string => {
	const { cases, observed, models } = input;
	const earth = cases.find(({ case: shown }) => shown.id === EARTH_CASE_ID);
	if (earth === undefined) {
		throw new RangeError(`The cases must include one named ${EARTH_CASE_ID}`);
	}
	const parts: string[] = [
		'<!doctype html>',
		'<html lang="en-GB">',
		'<head>',
		'<meta charset="utf-8">',
		'<meta name="viewport" content="width=device-width, initial-scale=1">',
		'<title>Winds: the observed Earth and the models</title>',
		`<style>${STYLE}</style>`,
		'</head>',
		'<body>',
		'<main>',
		'<h1>Winds: the observed Earth and the models</h1>',
		`<p>Monthly mean winds 10 m above the surface and sea-level pressure, January and July, on the grid of ${CASE_RESOLUTION} cells per face edge. The observed Earth is the mean of 1981 to 2010 from NOAA’s Twentieth Century Reanalysis, version 3.</p>`,
		models.length === 0
			? '<p><strong>No wind model is registered yet.</strong> The report shows the observed Earth and the cases the models will be run on.</p>'
			: `<p>Models: ${models.map(({ name }) => escapeText(name)).join(', ')}.</p>`,
		'<h2>How to read the maps</h2>',
		legend(),
		'<h2>The observed Earth</h2>',
		`<div class="pair">${SHOWN_MONTHS.map((month) =>
			mapFigure(
				`Observed Earth, ${monthName(month)}: sea-level pressure and wind`,
				earth.world,
				observed,
				month,
			),
		).join('')}</div>`,
	];
	const [january, july] = SHOWN_MONTHS.map((month) =>
		zonal(earth.world, observed.east[month] as Float32Array),
	);
	const zonalCaption =
		'Observed mean eastward wind by latitude, January and July';
	parts.push(
		chartFigure(
			drawZonalChart({
				title: zonalCaption,
				latitudes: january?.latitudes ?? [],
				quantity: 'Eastward wind, m/s; westerlies above zero',
				series: [
					{
						label: 'January',
						values: january?.means ?? [],
						colour: '#2f7fc1',
					},
					{
						label: 'July',
						values: july?.means ?? [],
						colour: '#d9730d',
						dashed: true,
					},
				],
			}),
			zonalCaption,
		),
	);

	parts.push(
		'<h2>The cases</h2>',
		`<p>Every model is run on each of these worlds, each on the grid of ${CASE_RESOLUTION} cells per face edge. Planet settings not listed are the Earth’s.</p>`,
		table(
			['Case', 'What it is', 'Tilt', 'Day length', 'Land'],
			cases.map(({ case: shown, world }) => [
				escapeText(shown.title),
				escapeText(shown.description),
				`${Number(world.planet.axialTiltDeg.toFixed(2))}°`,
				`${Number(world.planet.dayLengthHours.toFixed(2))} hours`,
				`${figure(100 * landShare(world), 1)}%`,
			]),
		),
	);
	if (models.length === 0) {
		const invented = cases.filter(({ case: shown }) => shown.invented);
		parts.push(
			'<h3>The invented worlds’ coasts</h3>',
			`<div class="pair">${invented
				.map(({ case: shown, world }) =>
					mapFigure(`${shown.title}: the coast`, world, null, 0),
				)
				.join('')}</div>`,
		);
	}
	for (const model of models) {
		parts.push(modelSection(model, cases, observed));
	}
	parts.push('</main>', '</body>', '</html>', '');
	return parts.join('\n');
};
