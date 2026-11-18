import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defineSection } from '../src/core/config';
import {
	CONFIG_DOC_FILE,
	CONFIG_DOC_SECTIONS,
	type ConfigDocSection,
	configDocText,
	main,
} from './write-config-doc';

const committedText = (): string =>
	new TextDecoder().decode(readFileSync(CONFIG_DOC_FILE));

const entry = {
	unit: 'K',
	what: 'What a | does',
	raising: 'Up\n  and up',
	lowering: 'Down',
	source: 'A guess.',
};

const small: ConfigDocSection = {
	intro: 'A made-up model.',
	section: defineSection(
		'Made up',
		[
			{
				title: 'Physical',
				settings: {
					tuned: { ...entry, value: 2.5e8, tuned: 'Against the Earth.' },
					plain: { ...entry, unit: '°', value: 20, tuned: null },
					tiny: { ...entry, unit: '1/s', value: 2.5e-5, tuned: null },
					zero: { ...entry, value: 0, tuned: null },
					million: { ...entry, value: 1e6, tuned: null },
					nearly: { ...entry, value: 999999, tuned: null },
					milli: { ...entry, value: 0.001, tuned: null },
					below: { ...entry, value: 0.00099, tuned: null },
				},
			},
			{
				title: 'The solver',
				numerical: true,
				settings: { steps: { ...entry, unit: 'steps', value: 2, tuned: null } },
			},
		],
		{
			title: 'Fixed',
			settings: { limit: { ...entry, value: 0.0065, tuned: null } },
		},
	),
};

describe('the config page', () => {
	it('is the very text the command would write', () => {
		expect(
			committedText(),
			'the page is out of date: run npm run docs:config',
		).toBe(configDocText());
	});

	it('lists every setting of every section once', () => {
		const text = configDocText();
		for (const { section } of CONFIG_DOC_SECTIONS) {
			const names = [
				...section.groups.flatMap((group) => Object.keys(group.settings)),
				...Object.keys(section.constants.settings),
			];
			for (const name of names) {
				expect(text.split(`| \`${name}\` |`).length - 1, name).toBe(1);
			}
		}
	});

	it('writes a made-up section as tables, the solver apart from the physical', () => {
		expect(configDocText([small])).toBe(
			[
				'# Model settings',
				'',
				'Every setting the climate models run on, with its value and unit, what it controls, what raising and lowering it do, where its value comes from and whether it was tuned. Written by `npm run docs:config` from [`config.ts`](config.ts), which is where a setting is changed; do not edit this page by hand.',
				'',
				'Raising it and Lowering it say what moving a setting away from the value shown does, everything else left as it is. K is a kelvin, a step of 1 °C.',
				'',
				'## Made up',
				'',
				'A made-up model.',
				'',
				'9 settings: 8 physical and 1 for the solver, 1 of them tuned against the observed Earth. A run may override these. Beyond them the code reads 1 fixed choice directly, which a run cannot override.',
				'',
				'### Physical',
				'',
				'| Setting | Value | What it controls | Raising it | Lowering it | Where it comes from | Tuned |',
				'|-|-|-|-|-|-|-|',
				'| `tuned` | 2.5e8 K | What a \\| does | Up and up | Down | A guess. | Against the Earth. |',
				'| `plain` | 20° | What a \\| does | Up and up | Down | A guess. | No |',
				'| `tiny` | 2.5e-5 1/s | What a \\| does | Up and up | Down | A guess. | No |',
				'| `zero` | 0 K | What a \\| does | Up and up | Down | A guess. | No |',
				'| `million` | 1e6 K | What a \\| does | Up and up | Down | A guess. | No |',
				'| `nearly` | 999999 K | What a \\| does | Up and up | Down | A guess. | No |',
				'| `milli` | 0.001 K | What a \\| does | Up and up | Down | A guess. | No |',
				'| `below` | 9.9e-4 K | What a \\| does | Up and up | Down | A guess. | No |',
				'',
				'### The solver',
				'',
				'| Setting | Value | What it controls | Raising it | Lowering it | Where it comes from | Tuned |',
				'|-|-|-|-|-|-|-|',
				'| `steps` | 2 steps | What a \\| does | Up and up | Down | A guess. | No |',
				'',
				'### Fixed',
				'',
				'| Setting | Value | What it controls | Raising it | Lowering it | Where it comes from | Tuned |',
				'|-|-|-|-|-|-|-|',
				'| `limit` | 0.0065 K | What a \\| does | Up and up | Down | A guess. | No |',
				'',
			].join('\n'),
		);
	});

	it('refuses an argument it does not know, writing nothing', () => {
		const text = committedText();
		expect(() => main(['x'])).toThrow('Unknown option x');
		expect(committedText()).toBe(text);
	});
});
