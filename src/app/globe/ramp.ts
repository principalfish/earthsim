/**
 * The colour ramps a data layer is drawn with: which colour stands for
 * which part of the layer's range.
 *
 * A ramp runs from 0, the low end of the range, to 1, the high end. Between
 * two stops the colour is blended linearly in display (sRGB) values, the
 * way the globe's shader and a CSS gradient both blend them, so the legend
 * and the globe show the same colours.
 */

/** The values a ramp is stretched over, from its low end to its high end. */
export type ValueRange = {
	/** The value drawn with the ramp's first colour. */
	readonly min: number;
	/** The value drawn with the ramp's last colour; above `min`. */
	readonly max: number;
};

/** One colour of a data ramp and where along the ramp it sits. */
export type DataRampStop = {
	/** Where the colour sits, from 0 (the low end) to 1 (the high end). */
	readonly at: number;
	/** The colour as a display (sRGB) value, `0xrrggbb`. */
	readonly colour: number;
};

/** A colour ramp for a data layer. */
export type ColourRamp = {
	/** A short name for the ramp, as an error about it gives it. */
	readonly name: string;
	/**
	 * The stops, the first at 0 and the last at 1, in strictly increasing
	 * order; at least two, and at most {@link MAX_RAMP_STOPS}.
	 */
	readonly stops: readonly DataRampStop[];
};

/** The most stops a data ramp may have: what the shader has room for. */
export const MAX_RAMP_STOPS = 8;

/**
 * The ramp the temperature is drawn with: cold to hot through dark blue,
 * purple, red and orange to pale yellow.
 *
 * @remarks
 * Every step towards the hot end is lighter than the one before, so the
 * order reads from lightness alone, as it does for the common colour-vision
 * deficiencies and in greyscale: dark is cold and light is hot. The middle
 * of the range is red.
 */
export const TEMPERATURE_RAMP: ColourRamp = {
	name: 'temperature',
	stops: [
		{ at: 0, colour: 0x0b1d51 },
		{ at: 0.17, colour: 0x3b2d8f },
		{ at: 0.33, colour: 0x8f2f8c },
		{ at: 0.5, colour: 0xd8424f },
		{ at: 0.75, colour: 0xf68f3c },
		{ at: 1, colour: 0xfde9a9 },
	],
};

/**
 * The ramp the seasonal range is drawn with: one hue, purple, from near
 * white for a year that hardly changes to deep violet for the widest swing.
 *
 * @remarks
 * Every step towards the high end is darker than the one before, so the
 * order reads from lightness alone, as for {@link TEMPERATURE_RAMP}; it
 * runs the other way, light to dark, and in a hue of its own, so that the
 * range is not read as a temperature.
 *
 * Most of a world has a small range: the oceans and the tropics change
 * little through the year, and only the hearts of large continents swing
 * widely. So the low end is given most of the colour: the six colours are
 * evenly spaced along the square root of the range, their stops at the
 * squares of 0, 0.2, 0.4, 0.6, 0.8 and 1, with the colour blended in
 * straight pieces between them. The colour changes fastest at the low end:
 * a range 16% of the way up the scale has the colour that would sit at 40%
 * with the stops evenly spaced, and every range between the ends is drawn
 * darker than it would be with them. The scale itself stays linear: a value
 * sits as far along the legend as its share of the range, and the legend's
 * gradient, drawn from these stops, shows the same crowding of colour at
 * its low end.
 */
export const SEASONAL_RANGE_RAMP: ColourRamp = {
	name: 'seasonal range',
	stops: [
		{ at: 0, colour: 0xfcfbfd },
		{ at: 0.04, colour: 0xdadaeb },
		{ at: 0.16, colour: 0xbcbddc },
		{ at: 0.36, colour: 0x9e9ac8 },
		{ at: 0.64, colour: 0x6a51a3 },
		{ at: 1, colour: 0x3f007d },
	],
};

/**
 * Checks that a ramp is one the globe can draw.
 *
 * @param ramp - The ramp.
 * @returns The ramp, unchanged.
 * @throws RangeError if it has fewer than two or more than
 * {@link MAX_RAMP_STOPS} stops, if they do not run in strictly increasing
 * order from 0 to 1, or if a colour is not a whole number from 0 to
 * `0xffffff`.
 */
export const checkRamp = (ramp: ColourRamp): ColourRamp => {
	const { stops } = ramp;
	if (stops.length < 2 || stops.length > MAX_RAMP_STOPS) {
		throw new RangeError(
			`A data ramp needs from 2 to ${MAX_RAMP_STOPS} stops; ramp ${ramp.name} has ${stops.length}`,
		);
	}
	if (stops[0]?.at !== 0 || stops.at(-1)?.at !== 1) {
		throw new RangeError(
			`A data ramp must run from 0 to 1; ramp ${ramp.name} does not`,
		);
	}
	stops.forEach((stop, index) => {
		const previous = stops[index - 1];
		if (previous !== undefined && !(stop.at > previous.at)) {
			throw new RangeError(
				`Data ramp stops must increase; in ramp ${ramp.name}, ${stop.at} follows ${previous.at}`,
			);
		}
		if (
			!Number.isInteger(stop.colour) ||
			stop.colour < 0 ||
			stop.colour > 0xffffff
		) {
			throw new RangeError(
				`A ramp colour must be a whole number from 0 to 0xffffff; ramp ${ramp.name} has ${stop.colour}`,
			);
		}
	});
	return ramp;
};

/** One channel of a `0xrrggbb` colour, from 0 to 255. */
const channel = (colour: number, shift: number): number =>
	(colour >> shift) & 0xff;

/**
 * The colour of a ramp at a point along it, as the globe draws it.
 *
 * @param ramp - The ramp.
 * @param t - Where along the ramp, from 0 to 1; kept within them.
 * @returns The colour as display (sRGB) channels from 0 to 1, red, green
 * and blue, not rounded to whole steps.
 */
export const rampColourAt = (
	ramp: ColourRamp,
	t: number,
): readonly [number, number, number] => {
	const { stops } = ramp;
	const colour = [16, 8, 0].map(
		(shift) => channel(stops[0]?.colour ?? 0, shift) / 255,
	) as [number, number, number];
	stops.slice(1).forEach((stop, index) => {
		const previous = stops[index] as DataRampStop;
		const weight = Math.min(
			1,
			Math.max(0, (t - previous.at) / (stop.at - previous.at)),
		);
		[16, 8, 0].forEach((shift, index) => {
			const from = colour[index] as number;
			colour[index] =
				from + (channel(stop.colour, shift) / 255 - from) * weight;
		});
	});
	return colour;
};

/** A `0xrrggbb` colour as CSS writes it, such as `#0b1d51`. */
export const cssColour = (colour: number): string =>
	`#${colour.toString(16).padStart(6, '0')}`;

/**
 * The ramp as a CSS gradient running from left (the low end) to right.
 *
 * @param ramp - The ramp.
 * @returns A `linear-gradient` with a colour stop for each of the ramp's,
 * in percent; CSS blends between them in sRGB as the globe does.
 */
export const rampGradient = (ramp: ColourRamp): string => {
	const stops = ramp.stops.map(
		(stop) =>
			`${cssColour(stop.colour)} ${Number((stop.at * 100).toFixed(3))}%`,
	);
	return `linear-gradient(to right, ${stops.join(', ')})`;
};
