/**
 * What the wind report's drawings and page share: escaping text for HTML
 * and SVG, and writing numbers short.
 */

const ESCAPES: Readonly<Record<string, string>> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#39;',
};

/**
 * Text made safe to put in HTML or SVG, as an element's content or inside
 * a quoted attribute.
 *
 * @param text - Any text.
 * @returns The text with `&`, `<`, `>`, `"` and `'` replaced by entities.
 */
export const escapeText = (text: string): string =>
	text.replace(/[&<>"']/g, (character) => ESCAPES[character] as string);

/**
 * A number rounded to a few decimal places and written as short as it can
 * be, for coordinates in a drawing.
 *
 * @param value - A finite number.
 * @param digits - Decimal places to keep, from 0. Defaults to 1.
 * @returns The rounded number with no trailing zeros, no leading zero
 * before the point and no minus sign on a zero: `-0.5` as `-.5`, `2.0` as
 * `2`.
 */
export const short = (value: number, digits = 1): string => {
	const scale = 10 ** digits;
	const rounded = Math.round(value * scale) / scale;
	if (rounded === 0) {
		return '0';
	}
	const text = String(rounded);
	if (text.startsWith('0.')) {
		return text.slice(1);
	}
	if (text.startsWith('-0.')) {
		return `-${text.slice(2)}`;
	}
	return text;
};

/**
 * A number for a reader: rounded to a fixed number of decimal places, with
 * a true minus sign and with no minus sign on a value that rounds to zero.
 *
 * @param value - A finite number.
 * @param digits - Decimal places, from 0.
 * @param signed - Whether a positive value takes a plus sign.
 */
export const figure = (
	value: number,
	digits: number,
	signed = false,
): string => {
	const text = value.toFixed(digits);
	if (Number(text) === 0) {
		return (0).toFixed(digits);
	}
	if (text.startsWith('-')) {
		return `−${text.slice(1)}`;
	}
	return signed ? `+${text}` : text;
};

/**
 * A latitude or longitude as a label: `0°`, or its size in whole degrees
 * and the letter of its side.
 *
 * @param value - Degrees: north or east positive.
 * @param positive - The letter for a positive value, `N` or `E`.
 * @param negative - The letter for a negative value, `S` or `W`.
 */
export const degreesLabel = (
	value: number,
	positive: string,
	negative: string,
): string =>
	value === 0 ? '0°' : `${Math.abs(value)}°${value > 0 ? positive : negative}`;
