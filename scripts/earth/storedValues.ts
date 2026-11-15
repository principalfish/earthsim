/**
 * The checks on what storing does to the observed values: the range of
 * the values, how far storing moved them, and whether that is within half
 * a step.
 */

/**
 * The lowest and highest of some months of values.
 *
 * @param months - The values, month by month.
 */
export const rangeOf = (
	months: readonly ArrayLike<number>[],
): { readonly low: number; readonly high: number } => {
	let low = Number.POSITIVE_INFINITY;
	let high = Number.NEGATIVE_INFINITY;
	for (const values of months) {
		for (let index = 0; index < values.length; index++) {
			const value = values[index] as number;
			low = Math.min(low, value);
			high = Math.max(high, value);
		}
	}
	return { low, high };
};

/**
 * The largest difference between some months of values and the values
 * stored for them.
 *
 * @param months - The values, month by month.
 * @param back - What the stored values stand for, laid out the same way.
 */
export const largestDifference = (
	months: readonly ArrayLike<number>[],
	back: readonly ArrayLike<number>[],
): number => {
	let largest = 0;
	months.forEach((values, month) => {
		const stored = back[month] as ArrayLike<number>;
		for (let index = 0; index < values.length; index++) {
			largest = Math.max(
				largest,
				Math.abs((stored[index] as number) - (values[index] as number)),
			);
		}
	});
	return largest;
};

/**
 * Checks that storing moved no value by more than half a step, allowing a
 * little for the rounding of the arithmetic, and says how far it moved them.
 *
 * @param largest - The largest difference storing made.
 * @param step - The step values are stored in.
 * @param noun - What a value is, as the lines name it, such as `value`.
 * @param units - The units, as the lines name them, such as `°C`.
 * @param say - Where the line saying how far values moved is written.
 * @throws Error if a value moved by more than half a step.
 */
export const checkStoringError = (
	largest: number,
	step: number,
	noun: string,
	units: string,
	say: (line: string) => void,
): void => {
	if (largest > step / 2 + 1e-9) {
		throw new Error(
			`A stored ${noun} is ${largest} ${units} from the source's; at most ${step / 2} was expected`,
		);
	}
	say(`Storing moves no ${noun} by more than ${largest.toFixed(4)} ${units}`);
};
