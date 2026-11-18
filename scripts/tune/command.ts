/**
 * The tuning script's command line: what to run, read from its arguments.
 */

import {
	type ConfigBounds,
	DEFAULT_WIND_SETTINGS,
	entriesOf,
	WIND_CONFIG,
	WIND_SETTING_NAMES,
	type WindSettingName,
	type WindSettings,
} from '../../src/core/index';
import { sweepValues } from './search';

/**
 * What `search tuned` searches: the settings the config gives a
 * `searchOrder`, in that order. Which settings those are, and why, is said
 * in their entries in `WIND_CONFIG`.
 */
export const TUNED_SETTINGS: readonly WindSettingName[] =
	entriesOf<WindSettingName>(WIND_CONFIG.groups)
		.flatMap(([name, entry]) =>
			entry.searchOrder === undefined
				? []
				: [{ name, order: entry.searchOrder }],
		)
		.sort((a, b) => a.order - b.order)
		.map(({ name }) => name);

/**
 * The values a search may give each setting, as its entry in the config
 * says: a share above 0 and at most 1, a latitude or a cells' width above 0
 * and at most 90°, a width in longitude above 0 and at most 360°, and every
 * other setting above 0.
 */
export const SETTING_BOUNDS: Readonly<Record<WindSettingName, ConfigBounds>> =
	Object.freeze(
		Object.fromEntries(
			entriesOf<WindSettingName>(WIND_CONFIG.groups).map(([name, entry]) => [
				name,
				entry.bounds ?? {},
			]),
		) as Record<WindSettingName, ConfigBounds>,
	);

/** What the script is asked to do. */
export type TuneCommand =
	/** List the settings and how to run the script. */
	| { readonly kind: 'list' }
	/** Try one setting at each of some values. */
	| {
			readonly kind: 'sweep';
			readonly name: WindSettingName;
			readonly values: readonly number[];
			readonly fixed: Partial<WindSettings>;
	  }
	/** Search over several settings. */
	| {
			readonly kind: 'search';
			readonly names: readonly WindSettingName[];
			readonly fixed: Partial<WindSettings>;
			readonly step: number;
			readonly rounds: number;
	  }
	/** Every case's measures for some settings. */
	| { readonly kind: 'cases'; readonly fixed: Partial<WindSettings> }
	/** The Earth on the simulated and on the observed temperature. */
	| { readonly kind: 'diagnose'; readonly fixed: Partial<WindSettings> };

/** How the script is run, for its listing and its errors. */
export const USAGE = [
	'npm run tune:winds -- sweep <setting> <from> <to> <count> [<setting>=<value> ...]',
	'npm run tune:winds -- search <setting> ... | tuned [<setting>=<value> ...] [--step=0.1] [--rounds=3]',
	'npm run tune:winds -- cases [<setting>=<value> ...]',
	'npm run tune:winds -- diagnose [<setting>=<value> ...]',
];

const isName = (name: string): name is WindSettingName =>
	(WIND_SETTING_NAMES as readonly string[]).includes(name);

const settingName = (name: string): WindSettingName => {
	if (!isName(name)) {
		throw new RangeError(
			`${name} is not one of the wind model's settings: ${WIND_SETTING_NAMES.join(', ')}`,
		);
	}
	return name;
};

const numberOf = (text: string, what: string): number => {
	const value = Number(text);
	if (text.trim() === '' || !Number.isFinite(value)) {
		throw new RangeError(`${what} must be a finite number; got ${text}`);
	}
	return value;
};

/** The `<setting>=<value>` arguments, and the rest in order. */
const split = (
	args: readonly string[],
): { fixed: Partial<WindSettings>; rest: string[] } => {
	const fixed: Record<string, number> = {};
	const rest: string[] = [];
	for (const arg of args) {
		const equals = arg.indexOf('=');
		if (equals > 0 && !arg.startsWith('--')) {
			const name = settingName(arg.slice(0, equals));
			fixed[name] = numberOf(arg.slice(equals + 1), `The value of ${name}`);
		} else {
			rest.push(arg);
		}
	}
	return { fixed: fixed as Partial<WindSettings>, rest };
};

/** An `--option=value` among the arguments, as a number, or its default. */
const option = (rest: string[], name: string, fallback: number): number => {
	const prefix = `--${name}=`;
	const found = rest.find((arg) => arg.startsWith(prefix));
	if (found === undefined) {
		return fallback;
	}
	rest.splice(rest.indexOf(found), 1);
	return numberOf(found.slice(prefix.length), `--${name}`);
};

const noMore = (rest: readonly string[]): void => {
	if (rest.length > 0) {
		throw new RangeError(
			`Unknown arguments ${rest.join(' ')}; run as one of: ${USAGE.join('; ')}`,
		);
	}
};

/**
 * The command the script's arguments ask for.
 *
 * @param args - The arguments after the script's path. Not changed.
 * @throws RangeError naming the argument, if they are not one of
 * {@link USAGE}'s forms.
 */
export const parseCommand = (args: readonly string[]): TuneCommand => {
	const [kind, ...others] = args;
	if (kind === undefined) {
		return { kind: 'list' };
	}
	const { fixed, rest } = split(others);
	switch (kind) {
		case 'sweep': {
			const [name, from, to, count, ...more] = rest;
			if (count === undefined || name === undefined) {
				throw new RangeError(`A sweep is run as ${USAGE[0]}`);
			}
			noMore(more);
			return {
				kind,
				name: settingName(name),
				values: sweepValues(
					numberOf(from as string, 'The sweep’s first value'),
					numberOf(to as string, 'The sweep’s last value'),
					numberOf(count, 'The sweep’s count'),
				),
				fixed,
			};
		}
		case 'search': {
			const step = option(rest, 'step', 0.1);
			const rounds = option(rest, 'rounds', 3);
			const names =
				rest.length === 1 && rest[0] === 'tuned'
					? [...TUNED_SETTINGS]
					: rest.map(settingName);
			if (names.length === 0) {
				throw new RangeError(`A search is run as ${USAGE[1]}`);
			}
			return { kind, names, fixed, step, rounds };
		}
		case 'cases':
		case 'diagnose':
			noMore(rest);
			return { kind, fixed };
		default:
			throw new RangeError(
				`Unknown command ${kind}; run as one of: ${USAGE.join('; ')}`,
			);
	}
};

/** A setting's value as the search starts it: the fixed one or the default. */
export const startingValue = (
	name: WindSettingName,
	fixed: Partial<WindSettings>,
): number => fixed[name] ?? DEFAULT_WIND_SETTINGS[name];
