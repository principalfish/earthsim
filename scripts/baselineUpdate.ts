/**
 * What the updates of the Earth baselines share: naming each number of a
 * baseline, saying which moved, and writing the file.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { stdout } from 'node:process';

/** What an update prints when every figure is the same as in the file before. */
export const UNCHANGED_LINE = 'The baseline is unchanged.';

/**
 * The figures of a baseline text as name and value, in the file's order.
 *
 * @param text - The baseline, as JSON.
 * @returns Each number in it, under its path: the keys that lead to it
 * joined by dots, an array's elements keyed by their index. Anything that
 * is not a number, an object or an array is left out.
 */
export const flatten = (text: string): Map<string, number> => {
	const figures = new Map<string, number>();
	const walk = (value: unknown, path: string): void => {
		if (typeof value === 'number') {
			figures.set(path, value);
		} else if (typeof value === 'object' && value !== null) {
			for (const [key, inner] of Object.entries(value)) {
				walk(inner, path === '' ? key : `${path}.${key}`);
			}
		}
	};
	walk(JSON.parse(text), '');
	return figures;
};

/**
 * What an update prints once it has written a baseline.
 *
 * @param before - The file's text before, or null if there was none.
 * @param now - The text written.
 * @param file - Where it was written.
 * @returns {@link UNCHANGED_LINE} if every figure of `before` and `now`
 * is the same in both; otherwise a line for each figure that moved, from
 * its value before to its value now (`none` where one of the two has no
 * number under that name, being null or missing), and a last line naming
 * the file. The figures of `now` come first, in its order, then those only
 * `before` had, in its order. Each line ends in a line break.
 */
export const baselineReport = (
	before: string | null,
	now: string,
	file: string,
): string => {
	const figures = flatten(now);
	const was = before === null ? new Map<string, number>() : flatten(before);
	const names = new Set([...figures.keys(), ...was.keys()]);
	const moved = [...names].filter(
		(name) => was.get(name) !== figures.get(name),
	);
	if (moved.length === 0) {
		return `${UNCHANGED_LINE}\n`;
	}
	const lines = moved.map(
		(name) =>
			`${name}: ${was.get(name) ?? 'none'} -> ${figures.get(name) ?? 'none'}\n`,
	);
	return `${lines.join('')}Wrote ${file}\n`;
};

/** A file's text, or null if there is none to read. */
const readText = (file: string): string | null => {
	try {
		return new TextDecoder().decode(readFileSync(file));
	} catch {
		return null;
	}
};

/**
 * Writes a baseline file and prints what moved, as
 * {@link baselineReport} words it.
 *
 * @param file - The baseline file's path.
 * @param text - Its whole new text.
 */
export const writeBaseline = (file: string, text: string): void => {
	const before = readText(file);
	writeFileSync(file, new TextEncoder().encode(text));
	stdout.write(baselineReport(before, text, file));
};
