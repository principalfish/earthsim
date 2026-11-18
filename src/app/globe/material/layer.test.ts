import { describe, expect, it, vi } from 'vitest';
import { SEVEN_STOP_RAMP } from '../../testing/rampFixtures';
import { TEMPERATURE_RAMP } from '../ramp';
import { createGlobeMaterial, type GlobeUniforms } from './globeMaterial';
import { prepareLayer, replaceLayer, showLayer } from './layer';

describe('prepareLayer', () => {
	const field = new Float32Array(6 * 4);
	const range = { min: -40, max: 35 };

	it('makes the texture and keeps a copy of the range and the ramp', () => {
		const layer = prepareLayer(field, 2, range, TEMPERATURE_RAMP);
		expect(layer.faces[0]?.buffer).toBe(field.buffer);
		expect(layer.range).toEqual(range);
		expect(layer.range).not.toBe(range);
		expect(layer.ramp).toBe(TEMPERATURE_RAMP);
	});

	it.each([
		['no range', undefined, TEMPERATURE_RAMP],
		['no ramp', range, undefined],
		[
			'a range that is not a number',
			{ min: Number.NaN, max: 1 },
			TEMPERATURE_RAMP,
		],
		[
			'an infinite range',
			{ min: 0, max: Number.POSITIVE_INFINITY },
			TEMPERATURE_RAMP,
		],
		['a range with no width', { min: 3, max: 3 }, TEMPERATURE_RAMP],
		['a range the wrong way round', { min: 3, max: 1 }, TEMPERATURE_RAMP],
		['a ramp it cannot draw', range, { name: 'x', stops: [] }],
	])('refuses %s', (_, badRange, badRamp) => {
		expect(() => prepareLayer(field, 2, badRange, badRamp)).toThrow(RangeError);
	});

	it('refuses a field of another resolution', () => {
		expect(() => prepareLayer(field, 4, range, TEMPERATURE_RAMP)).toThrow(
			RangeError,
		);
	});
});

describe('showLayer', () => {
	it('sets the texture, the range and the ramp for the shaders', () => {
		const { uniforms } = createGlobeMaterial();
		const layer = prepareLayer(
			new Float32Array(6),
			1,
			{ min: -40, max: 35 },
			TEMPERATURE_RAMP,
		);
		showLayer(uniforms, layer);
		expect(uniforms.uLayerShown.value).toBe(true);
		expect(uniforms.uLayer.value).toBe(layer.texture);
		expect(uniforms.uLayerRange.value.toArray()).toEqual([-40, 35]);
		expect(uniforms.uRampCount.value).toBe(TEMPERATURE_RAMP.stops.length);
		expect(Array.from(uniforms.uRampAt.value.slice(0, 6))).toEqual(
			TEMPERATURE_RAMP.stops.map((stop) => Math.fround(stop.at)),
		);
		expect(Array.from(uniforms.uRampColour.value.slice(0, 3))).toEqual(
			[0x0b, 0x1d, 0x51].map((c) => Math.fround(c / 255)),
		);
		expect(Array.from(uniforms.uRampColour.value.slice(15, 18))).toEqual(
			[0xfd, 0xe9, 0xa9].map((c) => Math.fround(c / 255)),
		);
	});

	it('clears the stops a shorter ramp leaves over', () => {
		const { uniforms } = createGlobeMaterial();
		const field = new Float32Array(6);
		const range = { min: 0, max: 1 };
		showLayer(uniforms, prepareLayer(field, 1, range, SEVEN_STOP_RAMP));
		expect(uniforms.uRampAt.value[6]).toBe(1);
		showLayer(uniforms, prepareLayer(field, 1, range, TEMPERATURE_RAMP));
		expect(uniforms.uRampCount.value).toBe(6);
		expect(uniforms.uRampAt.value[6]).toBe(0);
		expect(Array.from(uniforms.uRampColour.value.slice(18, 21))).toEqual([
			0, 0, 0,
		]);
	});

	it('goes back to the height colours for no layer', () => {
		const { uniforms } = createGlobeMaterial();
		showLayer(
			uniforms,
			prepareLayer(
				new Float32Array(6),
				1,
				{ min: 0, max: 1 },
				TEMPERATURE_RAMP,
			),
		);
		showLayer(uniforms, null);
		expect(uniforms.uLayerShown.value).toBe(false);
		expect(uniforms.uLayer.value).toBeNull();
	});
});

describe('replaceLayer', () => {
	const range = { min: -40, max: 35 };

	/** A layer on show for a world of resolution 1, its disposal watched. */
	const onShow = (uniforms: GlobeUniforms) => {
		const layer = prepareLayer(new Float32Array(6), 1, range, TEMPERATURE_RAMP);
		const dispose = vi.spyOn(layer.texture, 'dispose');
		showLayer(uniforms, layer);
		return { layer, dispose };
	};

	it('refuses a field before any world is shown, leaving the layer on show', () => {
		const { uniforms } = createGlobeMaterial();
		const old = onShow(uniforms);
		expect(() =>
			replaceLayer(
				uniforms,
				old.layer,
				null,
				new Float32Array(6),
				range,
				TEMPERATURE_RAMP,
			),
		).toThrow(RangeError);
		expect(old.dispose).not.toHaveBeenCalled();
		expect(uniforms.uLayerShown.value).toBe(true);
		expect(uniforms.uLayer.value).toBe(old.layer.texture);
	});

	it('leaves the layer on show as it was when the new one is refused', () => {
		const { uniforms } = createGlobeMaterial();
		const old = onShow(uniforms);
		// One value short of a cell each for resolution 1.
		expect(() =>
			replaceLayer(
				uniforms,
				old.layer,
				1,
				new Float32Array(5),
				range,
				SEVEN_STOP_RAMP,
			),
		).toThrow(RangeError);
		expect(old.dispose).not.toHaveBeenCalled();
		expect(uniforms.uLayerShown.value).toBe(true);
		expect(uniforms.uLayer.value).toBe(old.layer.texture);
		expect(uniforms.uRampCount.value).toBe(TEMPERATURE_RAMP.stops.length);
	});

	it('disposes of the old texture once and shows the new layer', () => {
		const { uniforms } = createGlobeMaterial();
		const old = onShow(uniforms);
		const field = new Float32Array(6);
		const next = replaceLayer(
			uniforms,
			old.layer,
			1,
			field,
			range,
			SEVEN_STOP_RAMP,
		);
		expect(next).not.toBeNull();
		expect(next?.faces[0]?.buffer).toBe(field.buffer);
		expect(next?.ramp).toBe(SEVEN_STOP_RAMP);
		expect(old.dispose).toHaveBeenCalledTimes(1);
		expect(uniforms.uLayerShown.value).toBe(true);
		expect(uniforms.uLayer.value).toBe(next?.texture);
		expect(uniforms.uRampCount.value).toBe(SEVEN_STOP_RAMP.stops.length);
	});

	it('shows a first layer with none on show before', () => {
		const { uniforms } = createGlobeMaterial();
		const next = replaceLayer(
			uniforms,
			null,
			1,
			new Float32Array(6),
			range,
			TEMPERATURE_RAMP,
		);
		expect(uniforms.uLayer.value).toBe(next?.texture);
	});

	it('disposes of the old texture and shows none for no field', () => {
		const { uniforms } = createGlobeMaterial();
		const old = onShow(uniforms);
		expect(replaceLayer(uniforms, old.layer, 1, null)).toBeNull();
		expect(old.dispose).toHaveBeenCalledTimes(1);
		expect(uniforms.uLayerShown.value).toBe(false);
		expect(uniforms.uLayer.value).toBeNull();
		// With no world, as well: no field needs none.
		expect(replaceLayer(uniforms, null, null, null)).toBeNull();
	});
});
