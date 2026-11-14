/**
 * Runs the wind model many times with its settings changed, and prints
 * what each run gives, as Markdown tables. It proposes; it does not judge,
 * and it changes no setting: a value it finds is applied, if at all, by
 * hand.
 *
 * Run with `npm run tune:winds`, which lists the settings and the forms
 * below; arguments follow `--`:
 *
 * - `sweep <setting> <from> <to> <count>`: one row for each of `count`
 *   values of the setting from `from` to `to`, with the Earth's three
 *   whole-year figures (the wind's difference as vectors, the share within
 *   45° in direction, and the pressure's difference);
 * - `search <setting> ...` or `search tuned`: a search over the settings
 *   named (or the eleven tuned by hand against the observed Earth and
 *   three moved by hand for other reasons) that lowers
 *   the Earth's wind difference and never takes a step that worsens the
 *   direction share or the pressure difference from where it started; it
 *   prints the figures and every case's measures at the start and the end;
 * - `cases`: every case's measures, as the wind report takes them, beside
 *   the Earth's figures;
 * - `diagnose`: the model run on the Earth with the observed temperature
 *   beside the run on the simulated one, with a number for each of the
 *   model's known faults on the Earth, and the observed Earth's beside
 *   them.
 *
 * Each form also takes `<setting>=<value>` arguments, which hold those
 * settings at those values throughout. Every case's temperatures are
 * solved once at the start, which takes about ten seconds; a run of the
 * Earth then takes about half a second.
 */

import { stdout } from 'node:process';
import {
	DEFAULT_WIND_SETTINGS,
	WIND_SETTING_NAMES,
	type WindSettings,
} from '../src/core/index';
import {
	readEarthDataFile,
	readObservedPressureFile,
	readObservedTemperatureFile,
	readObservedWindFile,
} from './earth/dataFile.mjs';
import {
	parseCommand,
	SETTING_BOUNDS,
	startingValue,
	TUNED_SETTINGS,
	USAGE,
} from './tune/command';
import { search, sweep } from './tune/search';
import {
	casesText,
	diagnosticText,
	searchText,
	sweepText,
	valueText,
} from './tune/text';
import {
	diagnose,
	earthFigures,
	prepareTuning,
	runCases,
	type Tuning,
} from './tune/tuning';

const say = (lines: string | readonly string[] = ''): void => {
	for (const line of typeof lines === 'string' ? [lines] : lines) {
		stdout.write(`${line}\n`);
	}
};

const fixedText = (fixed: Partial<WindSettings>): string => {
	const entries = Object.entries(fixed);
	return entries.length === 0
		? 'every setting at its default'
		: entries.map(([name, value]) => `${name}=${valueText(value)}`).join(' ');
};

const prepare = (): Tuning =>
	prepareTuning({
		earth: readEarthDataFile(),
		wind: readObservedWindFile(),
		pressure: readObservedPressureFile(),
	});

/**
 * Runs the command the arguments ask for and prints its tables.
 *
 * @param args - As the file's comment gives them.
 */
export const main = (args: readonly string[]): void => {
	const command = parseCommand(args);
	if (command.kind === 'list') {
		say(['Run as one of:', '', ...USAGE.map((form) => `    ${form}`), '']);
		say(
			`\`search tuned\` searches the eleven settings tuned by hand against the observed Earth and three moved by hand for other reasons (earthContrastK, poleTaperDeg, sideContrastK): ${TUNED_SETTINGS.join(', ')}. Each search step stays within its setting's bounds: a share above 0 and at most 1, a latitude or a cells' width at most 90°, every setting above 0.`,
		);
		say();
		say('The settings, with their values by default:');
		say();
		say(
			WIND_SETTING_NAMES.map(
				(name) => `- ${name} = ${valueText(DEFAULT_WIND_SETTINGS[name])}`,
			),
		);
		return;
	}
	const tuning = prepare();
	switch (command.kind) {
		case 'sweep': {
			say(`## A sweep of ${command.name}`);
			say();
			say(`Held: ${fixedText(command.fixed)}.`);
			say();
			const rows = sweep(command.values, (value) =>
				earthFigures(tuning, { ...command.fixed, [command.name]: value }),
			);
			say(sweepText(command.name, rows));
			return;
		}
		case 'search': {
			const start: Record<string, number> = {};
			for (const name of command.names) {
				start[name] = startingValue(name, command.fixed);
			}
			say(`## A search over ${command.names.join(', ')}`);
			say();
			say(
				`Held: ${fixedText(command.fixed)}. First step ${command.step * 100}%, ${command.rounds} rounds.`,
			);
			say();
			const result = search({
				start,
				names: command.names,
				step: command.step,
				rounds: command.rounds,
				bounds: SETTING_BOUNDS,
				evaluate: (settings) =>
					earthFigures(tuning, { ...command.fixed, ...settings }),
				onStep: ({ name, value, figures }) =>
					say(
						`- ${name}=${valueText(value)}: wind ${figures.windRms.toFixed(3)} m/s, direction ${(100 * figures.directionShare).toFixed(2)}%, pressure ${figures.pressureRms.toFixed(3)} hPa`,
					),
			});
			say();
			say(
				searchText(
					command.names,
					result,
					command.fixed as Record<string, number>,
				),
			);
			say('### Every case at the start');
			say();
			say(casesText(runCases(tuning, { ...command.fixed, ...start })));
			say('### Every case at the end');
			say();
			say(
				casesText(
					runCases(tuning, { ...command.fixed, ...result.end.settings }),
				),
			);
			return;
		}
		case 'cases':
			say(`## Every case, ${fixedText(command.fixed)}`);
			say();
			say(casesText(runCases(tuning, command.fixed)));
			return;
		case 'diagnose':
			say(
				`## The Earth on the simulated and on the observed temperature, ${fixedText(command.fixed)}`,
			);
			say();
			say(
				diagnosticText(
					diagnose(tuning, readObservedTemperatureFile(), command.fixed),
				),
			);
			return;
		default: {
			const unknown: never = command;
			throw new Error(`Unknown command ${JSON.stringify(unknown)}`);
		}
	}
};
