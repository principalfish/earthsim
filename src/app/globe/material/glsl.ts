/** The writing of numbers, colours and colour ramps as GLSL source. */

/** One colour of a ramp and the value it sits at. */
export type RampStop = {
	/** Where the colour sits along the ramp, in metres. */
	readonly at: number;
	/** The colour as a display (sRGB) value, `0xrrggbb`. */
	readonly colour: number;
};

/** A number as a GLSL float literal. */
export const glslFloat = (value: number): string => {
	const text = String(value);
	return /[.e]/.test(text) ? text : `${text}.0`;
};

/** A `0xrrggbb` colour as a GLSL `vec3` of components from 0 to 1. */
export const glslColour = (colour: number): string => {
	const channel = (shift: number): string =>
		(((colour >> shift) & 0xff) / 255).toFixed(4);
	return `vec3(${channel(16)}, ${channel(8)}, ${channel(0)})`;
};

/**
 * GLSL source for a function mapping a value to a colour along a ramp.
 *
 * @remarks
 * The function is `vec3 name(float x)`. Between two stops the colour is
 * blended linearly; below the first stop and above the last it is the
 * colour of that stop.
 *
 * @param name - Name of the GLSL function.
 * @param stops - At least one stop, in strictly increasing order of `at`.
 * @throws RangeError if there are no stops or they are out of order.
 */
export const glslRamp = (name: string, stops: readonly RampStop[]): string => {
	const [first, ...rest] = stops;
	if (first === undefined) {
		throw new RangeError('A colour ramp needs at least one stop');
	}
	const lines = [
		`vec3 ${name}(float x) {`,
		`\tvec3 colour = ${glslColour(first.colour)};`,
	];
	let previous = first;
	for (const stop of rest) {
		if (!(stop.at > previous.at)) {
			throw new RangeError(
				`Colour ramp stops must increase; ${stop.at} follows ${previous.at}`,
			);
		}
		const span = glslFloat(stop.at - previous.at);
		lines.push(
			`\tcolour = mix(colour, ${glslColour(stop.colour)}, clamp((x - ${glslFloat(previous.at)}) / ${span}, 0.0, 1.0));`,
		);
		previous = stop;
	}
	lines.push('\treturn colour;', '}');
	return lines.join('\n');
};
