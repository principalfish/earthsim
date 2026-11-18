/**
 * Writes `src/core/config.md`, the page that lists every model's settings,
 * from the config they are held in.
 *
 * Run with `npm run docs:config` after a setting is added, removed or
 * changed in `src/core/config.ts`, and commit the page with the change. A
 * test fails when the committed page is not the one this would write.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
	type ConfigEntry,
	type ConfigGroup,
	type ConfigSection,
	formatConfigValue,
	TEMPERATURE_CONFIG,
	WIND_CONFIG,
} from '../src/core/config';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Where the page is written. */
export const CONFIG_DOC_FILE = join(ROOT, 'src', 'core', 'config.md');

/** A model's section, and how the page introduces it. */
export type ConfigDocSection = {
	readonly section: ConfigSection;
	/** What follows the section's name in its first line, in Markdown. */
	readonly intro: string;
};

/** The sections the page lists, in order. */
export const CONFIG_DOC_SECTIONS: readonly ConfigDocSection[] = [
	{
		section: TEMPERATURE_CONFIG,
		intro:
			'The settings of the temperature model, read from `TEMPERATURE_CONFIG`' +
			' into `TEMPERATURE_MODEL`. How the model works is in' +
			' [Temperature](../../docs/temperature.md).',
	},
	{
		section: WIND_CONFIG,
		intro:
			'The settings of the wind model, read from `WIND_CONFIG` into' +
			' `DEFAULT_WIND_SETTINGS`. How the model works is in' +
			' [Winds](../../docs/winds.md).',
	},
];

const HEADINGS = [
	'Setting',
	'Value',
	'What it controls',
	'Raising it',
	'Lowering it',
	'Where it comes from',
	'Tuned',
] as const;

/** Text for a table cell: a pipe escaped, a line break made a space. */
const cell = (text: string): string =>
	text.replaceAll('|', '\\|').replaceAll(/\s*\n\s*/g, ' ');

const row = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;

const entryRow = (name: string, entry: ConfigEntry): string =>
	row([
		`\`${name}\``,
		cell(formatConfigValue(entry)),
		cell(entry.what),
		cell(entry.raising),
		cell(entry.lowering),
		cell(entry.source),
		entry.tuned === null ? 'No' : cell(entry.tuned),
	]);

const groupText = (group: ConfigGroup): string =>
	[
		`### ${group.title}`,
		'',
		row(HEADINGS),
		row(HEADINGS.map(() => '-')).replaceAll(' ', ''),
		...Object.entries(group.settings).map(([name, entry]) =>
			entryRow(name, entry),
		),
		'',
	].join('\n');

const settingsIn = (groups: readonly ConfigGroup[]): readonly ConfigEntry[] =>
	groups.flatMap((group) => Object.values(group.settings));

/** `1 setting`, `2 settings`. */
const counted = (count: number, one: string, many: string): string =>
	`${count} ${count === 1 ? one : many}`;

/** The sentence that counts a section's settings. */
const countText = (section: ConfigSection): string => {
	const all = settingsIn(section.groups);
	const numerical = settingsIn(
		section.groups.filter((group) => group.numerical === true),
	).length;
	const tuned = all.filter((entry) => entry.tuned !== null).length;
	const split =
		numerical === 0
			? ''
			: `: ${all.length - numerical} physical and ${numerical} for the solver`;
	const fixed = Object.keys(section.constants.settings).length;
	return (
		`${counted(all.length, 'setting', 'settings')}${split}, ${tuned} of them` +
		' tuned against the observed Earth. A run may override these. Beyond' +
		` them the code reads ${counted(fixed, 'fixed choice', 'fixed choices')}` +
		' directly, which a run cannot override.'
	);
};

const sectionText = ({ section, intro }: ConfigDocSection): string =>
	[
		`## ${section.name}`,
		'',
		intro,
		'',
		countText(section),
		'',
		...section.groups.map(groupText),
		groupText(section.constants),
	].join('\n');

/**
 * The page's text: a title and how to read it, then each section with its
 * groups as tables, the settings a run may override first and the fixed
 * choices last.
 *
 * @param sections - The sections to list, in order.
 */
export const configDocText = (
	sections: readonly ConfigDocSection[] = CONFIG_DOC_SECTIONS,
): string =>
	[
		'# Model settings',
		'',
		'Every setting the climate models run on, with its value and unit, what it' +
			' controls, what raising and lowering it do, where its value comes from and' +
			' whether it was tuned. Written by `npm run docs:config` from' +
			' [`config.ts`](config.ts), which is where a setting is changed; do not edit' +
			' this page by hand.',
		'',
		'Raising it and Lowering it say what moving a setting away from the value' +
			' shown does, everything else left as it is. K is a kelvin, a step of 1 °C.',
		'',
		...sections.map(sectionText),
	]
		.join('\n')
		.replace(/\n+$/, '\n');

/** The committed page's text, or null if there is none. */
const committedText = (): string | null => {
	try {
		return new TextDecoder().decode(readFileSync(CONFIG_DOC_FILE));
	} catch {
		return null;
	}
};

/**
 * Writes the page and says whether it changed.
 *
 * @param args - Not used; there are no options.
 */
export const main = (args: readonly string[]): void => {
	if (args.length > 0) {
		throw new Error(`Unknown option ${args.join(' ')}: there are no options`);
	}
	const text = configDocText();
	const before = committedText();
	writeFileSync(CONFIG_DOC_FILE, new TextEncoder().encode(text));
	stdout.write(
		before === text ? 'The page is unchanged.\n' : `Wrote ${CONFIG_DOC_FILE}\n`,
	);
};
