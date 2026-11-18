import { describe, expect, it } from 'vitest';
import { MADE_UP_LAYER } from '../../testing/scalarLayerFixtures';
import { DEFAULT_SUMMARY, LAYERS, SCALAR_LAYER_IDS } from '../view';
import { PRESSURE_LAYER } from './pressure';
import {
	loadLayerObserved,
	SCALAR_LAYER_SPECS,
	SCALAR_LAYERS,
	scalarLayerOf,
} from './registry';
import { offersSummary } from './spec';
import { TEMPERATURE_LAYER, TEMPERATURE_OBSERVED } from './temperature';

describe('the layers the page offers', () => {
	it('are the Temperature and the Pressure, in that order, after Terrain', () => {
		expect(LAYERS).toEqual(['terrain', 'temperature', 'pressure']);
		expect(SCALAR_LAYERS).toEqual([TEMPERATURE_LAYER, PRESSURE_LAYER]);
	});

	it('describe every layer but the terrain, in the order of the choice', () => {
		expect(SCALAR_LAYER_IDS).toEqual(
			LAYERS.filter((layer) => layer !== 'terrain'),
		);
		expect(SCALAR_LAYERS.map((layer) => layer.id)).toEqual(SCALAR_LAYER_IDS);
		for (const id of SCALAR_LAYER_IDS) {
			expect(SCALAR_LAYER_SPECS[id].id).toBe(id);
		}
	});

	it('each offer the Month view, which a layer opens on', () => {
		for (const layer of [...SCALAR_LAYERS, MADE_UP_LAYER]) {
			expect(offersSummary(layer, DEFAULT_SUMMARY)).toBe(true);
		}
	});

	it('are found by their id, and the terrain is none', () => {
		expect(scalarLayerOf('temperature')).toBe(TEMPERATURE_LAYER);
		expect(scalarLayerOf('pressure')).toBe(PRESSURE_LAYER);
		expect(scalarLayerOf('terrain')).toBeNull();
	});
});

describe('loadLayerObserved', () => {
	it('loads through the layer’s own loader', async () => {
		const months = [new Float32Array(6)];
		const layer = {
			...TEMPERATURE_LAYER,
			observed: { ...TEMPERATURE_OBSERVED, load: async () => months },
		};
		await expect(loadLayerObserved(layer, 64)).resolves.toBe(months);
	});

	it('rejects for a layer with no observed year', async () => {
		await expect(loadLayerObserved(MADE_UP_LAYER, 64)).rejects.toThrow(
			'no observed year',
		);
	});
});
