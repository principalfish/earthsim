/** Helpers for tests that read the source of the globe's shaders. */

/**
 * The source of a GLSL function, from its signature to its closing brace,
 * found by its name.
 */
export const glslFunction = (source: string, name: string): string => {
	const start = source.search(new RegExp(`\\n\\w+ ${name}\\(`));
	if (start < 0) {
		throw new Error(`No function ${name} in the shader`);
	}
	let depth = 0;
	for (let i = source.indexOf('{', start); i < source.length; i++) {
		if (source[i] === '{') {
			depth++;
		} else if (source[i] === '}') {
			depth--;
			if (depth === 0) {
				return source.slice(start + 1, i + 1);
			}
		}
	}
	throw new Error(`The function ${name} is not closed`);
};

/** The functions that read per-cell values, with whatever they call. */
export const SAMPLING_FUNCTIONS = [
	'faceOf',
	'cellPosition',
	'cellValue',
	'edgeShift',
	'smoothValue',
	'linearValue',
];
