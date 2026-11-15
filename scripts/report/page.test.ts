import { describe, expect, it } from 'vitest';
import {
	decodeEarth,
	decodeObservedPressure,
	decodeObservedWind,
	getGrid,
	MONTHS_PER_YEAR,
	observedPressure,
	observedWind,
	type WindResult,
} from '../../src/core/index';
import {
	readEarthDataFile,
	readObservedPressureFile,
	readObservedWindFile,
} from '../earth/dataFile.mjs';
import { cases } from './cases';
import { ACCESS, HOW_READ, LITERATURE_CHECKS, SLOW_END } from './literature';
import { escapeText } from './markup';
import { type BuiltCase, buildReport, type ModelRun } from './page';
import { summariseChecks } from './summary';
import { parseXml } from './testing/xml';

const earth = decodeEarth(readEarthDataFile());
const observed: WindResult = {
	...observedWind(decodeObservedWind(readObservedWindFile()), 64),
	pressure: observedPressure(
		decodeObservedPressure(readObservedPressureFile()),
		64,
	),
};
// The Earth and two invented worlds keep the page small.
const shownCases: BuiltCase[] = cases
	.filter(({ id }) => ['earth', 'ocean', 'one-continent'].includes(id))
	.map((shown) => ({ case: shown, world: shown.build(earth) }));

const { cellCount } = getGrid(64);

/** A year of one wind and pressure everywhere. */
const steady = (east: number, north: number, pressure: number): WindResult => {
	const months = (value: number) =>
		Array.from({ length: MONTHS_PER_YEAR }, () =>
			new Float32Array(cellCount).fill(value),
		);
	return {
		east: months(east),
		north: months(north),
		pressure: months(pressure),
	};
};

/** A made-up model's run: the same result on every case. */
const run = (name: string, result: WindResult): ModelRun => ({
	name,
	results: new Map(shownCases.map(({ case: shown }) => [shown.id, result])),
	timings: [
		{ resolution: 64, seconds: 0.012 },
		{ resolution: 128, seconds: 0.034 },
		{ resolution: 256, seconds: 0.156 },
	],
});

const count = (text: string, part: string): number =>
	text.split(part).length - 1;

/** Each drawing on the page, as it stands in its figure. */
const drawingsOf = (page: string): string[] =>
	[
		...page.matchAll(
			/<figcaption>[^<]*<\/figcaption>(<svg.*?<\/svg>)<\/figure>/g,
		),
	].map((match) => match[1] as string);

const ECHO = 'Echo';
const ODD_NAME = `Steady <b>&"east"</b> 'wind'`;

describe('buildReport', () => {
	it('with no model shows the observed Earth and the cases', () => {
		const page = buildReport({ cases: shownCases, observed, models: [] });
		expect(page.startsWith('<!doctype html>')).toBe(true);
		expect(page.trimEnd().endsWith('</html>')).toBe(true);
		expect(page).toContain('No wind model is registered yet');
		expect(page).toContain(
			'<figcaption>Observed Earth, January: sea-level pressure and wind</figcaption>',
		);
		expect(page).toContain(
			'<figcaption>Observed Earth, July: sea-level pressure and wind</figcaption>',
		);
		expect(page).toContain(
			'Observed mean eastward wind by latitude, January and July',
		);
		// A row of the cases' table for each case, with its settings.
		for (const { case: shown } of shownCases) {
			expect(page).toContain(`<td>${escapeText(shown.title)}</td>`);
		}
		expect(page).toContain('<td class="number">0.0%</td>');
		// A coast-only map of each invented world, and no model section.
		expect(page).toContain(
			'<figcaption>An ocean world: the coast</figcaption>',
		);
		expect(page).toContain(
			'<figcaption>A one-continent world: the coast</figcaption>',
		);
		expect(page).not.toContain('<h2>Model:');
		// Two observed maps, the chart and two coasts.
		const drawings = drawingsOf(page);
		expect(drawings).toHaveLength(5);
		for (const drawing of drawings) {
			parseXml(drawing);
		}
		// Nothing from outside the page, and no script.
		expect(page).not.toMatch(/<script|<link|src="http|href="http/);
	});

	it('with one model shows its maps, its figures against observed and its times', () => {
		const page = buildReport({
			cases: shownCases,
			observed,
			models: [run(ECHO, observed)],
		});
		expect(count(page, '<h2>Model:')).toBe(1);
		expect(page).toContain('<h2>Model: Echo</h2>');
		expect(page).toContain('<h3>Solve times on the Earth</h3>');
		for (const seconds of ['0.012', '0.034', '0.156']) {
			expect(page).toContain(`<td class="number">${seconds}</td>`);
		}
		// On the Earth, the observed beside the simulated in each month.
		for (const month of ['January', 'July']) {
			expect(page).toContain(
				`<div class="pair"><figure><figcaption>Observed Earth, ${month}</figcaption>`,
			);
			expect(page).toContain(
				`<figcaption>Echo, ${month}: The Earth</figcaption>`,
			);
			expect(page).toContain(
				`<figcaption>Echo, ${month}: A one-continent world</figcaption>`,
			);
			expect(page).toContain(
				`<figcaption>Mean eastward wind by latitude, ${month}: Echo against observed</figcaption>`,
			);
		}
		// The observed against itself: every difference zero, every
		// direction right.
		expect(page).toContain('<td>The whole year</td>');
		expect(page).toMatch(
			/<td>January<\/td><td class="number">0\.00<\/td><td class="number">0\.00<\/td><td class="number">100\.0%<\/td>/,
		);
		// No coast-only maps once there is a model.
		expect(page).not.toContain('the coast</figcaption>');
		// Observed twice at the top and twice beside the model; the model's
		// Earth twice and two more cases twice each; three charts.
		const drawings = drawingsOf(page);
		expect(drawings).toHaveLength(2 + 2 + 2 + 4 + 3);
		for (const drawing of drawings) {
			parseXml(drawing);
		}
	});

	it('with two models shows each, with names escaped and no ids to clash', () => {
		const page = buildReport({
			cases: shownCases,
			observed,
			models: [run(ECHO, observed), run(ODD_NAME, steady(5, 0, 1013))],
		});
		expect(count(page, '<h2>Model:')).toBe(2);
		expect(page).toContain(`<h2>Model: ${escapeText(ODD_NAME)}</h2>`);
		expect(escapeText(ODD_NAME)).toBe(
			'Steady &lt;b&gt;&amp;&quot;east&quot;&lt;/b&gt; &#39;wind&#39;',
		);
		expect(page).not.toContain('<b>');
		expect(page).not.toContain('"east"');
		// A steady 5 m/s east wind against the observed is not zero.
		const section = page.slice(page.indexOf('<h2>Model: Steady'));
		expect(section).not.toMatch(/<td>January<\/td><td class="number">0\.00</);
		// The drawings refer to nothing by id, so maps cannot clash.
		expect(page).not.toMatch(/ id="|url\(#/);
		for (const drawing of drawingsOf(page)) {
			parseXml(drawing);
		}
	});

	it('shows a note in place of each case a model gave a value that is not a finite number on, and the rest as ever', () => {
		const faulty: ModelRun = {
			...run(ECHO, observed),
			// No result is needed for a case among the faults.
			results: new Map([['one-continent', observed]]),
			faults: new Map([
				['earth', { month: 6, field: 'east' }],
				['ocean', { month: 0, field: 'pressure' }],
			]),
		};
		const page = buildReport({ cases: shownCases, observed, models: [faulty] });
		expect(count(page, '<strong>Not drawn:</strong>')).toBe(2);
		expect(page).toContain(
			'The eastward wind in July is the first value that is not a finite number. Its maps, its figures against the observed Earth and its chart for this case are left out.',
		);
		expect(page).toContain(
			'The sea-level pressure in January is the first value that is not a finite number. Its maps for this case are left out.',
		);
		// The times and the one good case are shown; nothing of the Earth's.
		expect(page).toContain('<td class="number">0.156</td>');
		expect(page).toContain(
			'<figcaption>Echo, July: A one-continent world</figcaption>',
		);
		expect(page).not.toContain('<figcaption>Echo, January: The Earth');
		expect(page).not.toContain('<td>The whole year</td>');
		expect(page).not.toContain('against observed</figcaption>');
		// Observed twice at the top, and the chart; the one good case twice.
		const drawings = drawingsOf(page);
		expect(drawings).toHaveLength(2 + 1 + 2);
		for (const drawing of drawings) {
			parseXml(drawing);
		}
	});

	it('with a model’s checks shows its section against published studies, quoting only the papers’ given words', () => {
		// The ocean world tilted 60°, nearly calm, fills a row of each
		// steep-tilt table.
		const tilted = cases.find(({ id }) => id === 'ocean-tilt-60');
		if (tilted === undefined) {
			throw new Error('No case ocean-tilt-60');
		}
		const withTilt = [
			...shownCases,
			{ case: tilted, world: tilted.build(earth) },
		];
		const echo = run(ECHO, observed);
		const results = new Map([
			...echo.results,
			['ocean-tilt-60', steady(0.1, 0, 1013)],
		]);
		const page = buildReport({
			cases: withTilt,
			observed,
			models: [
				{
					...echo,
					results,
					checks: summariseChecks({ cases: withTilt, results }),
				},
			],
		});
		const start = page.indexOf('<h2>Against published studies: Echo</h2>');
		expect(start).toBeGreaterThan(page.indexOf('<h2>Model: Echo</h2>'));
		const section = page.slice(start);
		// The access table: each paper, and each way a paper was read.
		expect(section).toContain('<h3>How each paper was read</h3>');
		for (const { paper, howRead, where } of ACCESS) {
			expect(section).toContain(
				`<tr><td>${escapeText(paper)}</td><td>${escapeText(howRead)}</td><td>${escapeText(where)}</td></tr>`,
			);
		}
		for (const label of Object.values(HOW_READ)) {
			expect(section).toContain(`(${escapeText(label)})`);
		}
		// Each check, with what the papers report and what the model shows.
		for (const check of LITERATURE_CHECKS) {
			expect(section).toContain(`<h3>${escapeText(check.title)}</h3>`);
			for (const caveat of check.caveats) {
				expect(section).toContain(`<li>${escapeText(caveat)}</li>`);
			}
		}
		expect(count(section, '<h4>What the papers report</h4>')).toBe(3);
		expect(count(section, '<h4>What the model shows</h4>')).toBe(3);
		expect(section).toContain('<h3>The slow end</h3>');
		expect(section).toContain(escapeText(SLOW_END.model));
		// The cases not shown here are noted; the Earth's annual mean is
		// measured.
		expect(section).toContain(
			'<strong>Not measured:</strong> earth-tilt-60: the case is not in the report.',
		);
		expect(section).toContain(
			'<td>The Earth</td><td class="number">24 hours</td>',
		);
		// The steep-tilt rows: a weak summer has no ratio and no easterly,
		// and the low's latitude is written with its side.
		for (const month of ['January', 'July']) {
			expect(section).toContain(
				`<td>An ocean world tilted 60°</td><td>${month}</td><td>${month === 'January' ? 'Southern' : 'Northern'}</td>`,
			);
		}
		expect(section).toMatch(
			/<td>the summer’s is under 0\.5 m\/s<\/td><td class="number">\+0\.1<\/td><td class="number">0 of 10<\/td><td>no band is easterly by 0\.5 m\/s or more<\/td>/,
		);
		expect(section).toMatch(
			/<td>Southern<\/td><td class="number">\d+°[NS]<\/td><td class="number">[−+]?\d+°<\/td><td class="number">1013\.0<\/td>/,
		);
		// A note after a quotation starts a sentence of its own.
		expect(section).toContain(
			'nonnegligible precipitation</q>. The abstract gives no latitudes.',
		);
		// Every quotation is one of the papers' given words, and each is
		// quoted.
		const given = [
			...LITERATURE_CHECKS.flatMap(({ reports }) => reports),
			SLOW_END.report,
		].flatMap(({ quotations }) => quotations.map(escapeText));
		const quoted = [...section.matchAll(/<q>(.*?)<\/q>/g)].map(
			(match) => match[1] as string,
		);
		expect(quoted.length).toBeGreaterThan(0);
		for (const text of quoted) {
			expect(given).toContain(text);
		}
		expect([...new Set(quoted)].sort()).toEqual([...new Set(given)].sort());
		expect(page.slice(0, start)).not.toContain('<q>');
		// Observations only: no word that judges the model.
		expect(section).not.toMatch(
			/\b(agrees?|fail(s|ed)?|pass(es|ed)?|wrong)\b/i,
		);
	});

	it('refuses cases without the Earth, or a model missing a case', () => {
		expect(() =>
			buildReport({
				cases: shownCases.slice(1),
				observed,
				models: [],
			}),
		).toThrow(/must include one named earth/);
		const partial: ModelRun = {
			...run(ECHO, observed),
			results: new Map([['earth', observed]]),
		};
		expect(() =>
			buildReport({ cases: shownCases, observed, models: [partial] }),
		).toThrow(/no result for the case ocean/);
	});
});
