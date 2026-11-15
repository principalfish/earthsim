import { describe, expect, it } from 'vitest';
import { drawZonalChart } from './chart';
import { allElements, parseXml } from './testing/xml';

describe('drawZonalChart', () => {
	const svg = drawZonalChart({
		title: 'Winds <by> latitude',
		latitudes: [-60, 0, 60],
		quantity: 'Eastward wind, m/s',
		series: [
			{ label: 'Observed', values: [7, -4, 6], colour: 'currentColor' },
			{
				label: 'A & B',
				values: [5, null, 3],
				colour: '#d9730d',
				dashed: true,
			},
		],
	});
	const root = parseXml(svg);

	it('is well-formed SVG with its title and legend', () => {
		const texts = allElements(root).map(({ text }) => text);
		expect(texts).toContain('Winds <by> latitude');
		expect(texts).toContain('Observed');
		expect(texts).toContain('A & B');
		expect(texts).toContain('0°');
		expect(texts).toContain('60°N');
	});

	it('draws a line for each series, broken where a value is missing', () => {
		const lines = allElements(root).filter(
			(element) => element.attributes.get('stroke-width') === '2',
		);
		const d = lines.map((line) => line.attributes.get('d') as string);
		expect(d[0]).toMatch(/^M[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+$/);
		// Two separate points: a move to each, no line between them.
		expect(d[2]).toMatch(/^M[\d.]+ [\d.]+M[\d.]+ [\d.]+$/);
	});

	it('puts higher values higher up and takes in zero', () => {
		// The axis runs over whole steps of 2 from -4 to 8.
		const labels = allElements(root)
			.filter((element) => element.attributes.get('text-anchor') === 'end')
			.map(({ text }) => text);
		expect(labels).toEqual(['−4', '−2', '0', '2', '4', '6', '8']);
	});

	it('gives the axis as many decimals as a small step needs', () => {
		const calm = parseXml(
			drawZonalChart({
				title: 'Nearly calm',
				latitudes: [-60, 0, 60],
				quantity: 'm/s',
				series: [{ label: 'Weak', values: [0.03, -0.02, 0.01], colour: 'red' }],
			}),
		);
		const labels = allElements(calm)
			.filter((element) => element.attributes.get('text-anchor') === 'end')
			.map(({ text }) => text);
		expect(labels).toEqual(['−0.02', '−0.01', '0.00', '0.01', '0.02', '0.03']);
	});

	it('refuses a series of the wrong length', () => {
		expect(() =>
			drawZonalChart({
				title: 'Bad',
				latitudes: [0, 1],
				quantity: 'm/s',
				series: [{ label: 'One', values: [1], colour: 'red' }],
			}),
		).toThrow(RangeError);
	});
});
