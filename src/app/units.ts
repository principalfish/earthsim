/**
 * The units the page writes its quantities in: the five quantities, the
 * units each can be written in, how a metric value converts to each, the
 * two systems of units with a choice of unit per quantity over them, and
 * a store of the choice that tells its listeners of each change. Also the
 * eight points of the compass and a wind in words, such as `7 m/s NE`.
 *
 * The page works in metric values throughout: °C, hPa, m/s, m and km. A
 * unit changes only how a value is written.
 */

import { CALM_SPEED } from './globe/wind';

/** The quantities the page writes, in the order Settings offers them. */
export const QUANTITIES = [
	'temperature',
	'pressure',
	'windSpeed',
	'height',
	'distance',
] as const;

/** One of {@link QUANTITIES}. */
export type Quantity = (typeof QUANTITIES)[number];

/** What a quantity is called in Settings. */
export const QUANTITY_LABELS: Readonly<Record<Quantity, string>> = {
	temperature: 'Temperature',
	pressure: 'Pressure',
	windSpeed: 'Wind speed',
	height: 'Heights and depths',
	distance: 'Distances',
};

/** How a unit is written and how a metric value converts to it. */
export type UnitSpec = {
	/** What follows a value written in the unit, such as `°F`. */
	readonly label: string;
	/** How many of the unit make one of the metric unit. */
	readonly scale: number;
	/**
	 * What is added after scaling: the unit's value at zero of the metric
	 * unit, such as 32 for °F. A difference takes the scale alone.
	 */
	readonly offset: number;
	/** How many decimals a value in the unit is written with. */
	readonly decimals: number;
};

/**
 * The units of each quantity, by name, each quantity's in the order
 * Settings offers them: its metric unit, its imperial unit, then any
 * others.
 */
export const UNITS = {
	temperature: {
		'°C': { label: '°C', scale: 1, offset: 0, decimals: 0 },
		'°F': { label: '°F', scale: 1.8, offset: 32, decimals: 0 },
		K: { label: 'K', scale: 1, offset: 273.15, decimals: 0 },
	},
	pressure: {
		hPa: { label: 'hPa', scale: 1, offset: 0, decimals: 0 },
		inHg: { label: 'inHg', scale: 1 / 33.8638866667, offset: 0, decimals: 2 },
	},
	windSpeed: {
		'm/s': { label: 'm/s', scale: 1, offset: 0, decimals: 0 },
		mph: { label: 'mph', scale: 3600 / 1609.344, offset: 0, decimals: 0 },
		'km/h': { label: 'km/h', scale: 3.6, offset: 0, decimals: 0 },
		knots: { label: 'knots', scale: 3600 / 1852, offset: 0, decimals: 0 },
	},
	height: {
		m: { label: 'm', scale: 1, offset: 0, decimals: 0 },
		ft: { label: 'ft', scale: 1 / 0.3048, offset: 0, decimals: 0 },
	},
	distance: {
		km: { label: 'km', scale: 1, offset: 0, decimals: 0 },
		mi: { label: 'mi', scale: 1 / 1.609344, offset: 0, decimals: 0 },
	},
} as const satisfies {
	readonly [Q in Quantity]: Readonly<Record<string, UnitSpec>>;
};

/** A unit a quantity can be written in, by its name in {@link UNITS}. */
export type UnitOf<Q extends Quantity> = keyof (typeof UNITS)[Q] & string;

/** A unit a wind speed can be written in. */
export type WindUnit = UnitOf<'windSpeed'>;

/** The systems of units, in the order Settings offers them. */
export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;

/** One of {@link UNIT_SYSTEMS}. */
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

/** What a system is called in Settings. */
export const UNIT_SYSTEM_LABELS: Readonly<Record<UnitSystem, string>> = {
	metric: 'Metric',
	imperial: 'Imperial',
};

/** The system until another is chosen. */
export const DEFAULT_UNIT_SYSTEM: UnitSystem = 'metric';

/** A unit for each quantity. */
export type ResolvedUnits = { readonly [Q in Quantity]: UnitOf<Q> };

/** The unit each system gives each quantity. */
export const SYSTEM_UNITS: Readonly<Record<UnitSystem, ResolvedUnits>> = {
	metric: {
		temperature: '°C',
		pressure: 'hPa',
		windSpeed: 'm/s',
		height: 'm',
		distance: 'km',
	},
	imperial: {
		temperature: '°F',
		pressure: 'inHg',
		windSpeed: 'mph',
		height: 'ft',
		distance: 'mi',
	},
};

/** The units chosen: a system, and over it a unit for any quantity. */
export type UnitChoice = {
	/** The system, which gives each quantity without an override its unit. */
	readonly system: UnitSystem;
	/** The unit chosen for a quantity whatever the system, if any. */
	readonly overrides: { readonly [Q in Quantity]?: UnitOf<Q> };
};

/** The choice until another is made: metric, with no overrides. */
export const DEFAULT_UNIT_CHOICE: UnitChoice = {
	system: DEFAULT_UNIT_SYSTEM,
	overrides: {},
};

/**
 * The units a quantity can be written in, in the order of {@link UNITS}.
 *
 * @param quantity - The quantity.
 */
export const unitsOf = <Q extends Quantity>(
	quantity: Q,
): readonly UnitOf<Q>[] => Object.keys(UNITS[quantity]) as UnitOf<Q>[];

/** How a unit is written and converted. */
const specOf = <Q extends Quantity>(quantity: Q, unit: UnitOf<Q>): UnitSpec =>
	(UNITS[quantity] as Readonly<Record<string, UnitSpec>>)[unit] as UnitSpec;

/**
 * What follows a value written in a unit, such as `°F`.
 *
 * @param quantity - The quantity.
 * @param unit - The unit.
 */
export const unitLabel = <Q extends Quantity>(
	quantity: Q,
	unit: UnitOf<Q>,
): string => specOf(quantity, unit).label;

/**
 * Whether a value is one of {@link UNIT_SYSTEMS}.
 *
 * @param value - Anything, such as an entry read from the browser's storage.
 */
export const isUnitSystem = (value: unknown): value is UnitSystem =>
	(UNIT_SYSTEMS as readonly unknown[]).includes(value);

/**
 * Whether a value is a unit of a quantity.
 *
 * @param quantity - The quantity.
 * @param value - Anything, such as an entry read from the browser's storage.
 */
export const isUnitOf = <Q extends Quantity>(
	quantity: Q,
	value: unknown,
): value is UnitOf<Q> =>
	(unitsOf(quantity) as readonly unknown[]).includes(value);

/**
 * The unit for each quantity under a choice: its override, or else the
 * system's unit.
 *
 * @param choice - The units chosen.
 */
export const resolveUnits = (choice: UnitChoice): ResolvedUnits => {
	const system = SYSTEM_UNITS[choice.system];
	const { overrides } = choice;
	return {
		temperature: overrides.temperature ?? system.temperature,
		pressure: overrides.pressure ?? system.pressure,
		windSpeed: overrides.windSpeed ?? system.windSpeed,
		height: overrides.height ?? system.height,
		distance: overrides.distance ?? system.distance,
	};
};

/**
 * A metric value of a quantity in a unit, unrounded.
 *
 * @param quantity - The quantity.
 * @param unit - The unit to give it in.
 * @param metricValue - The value, in the quantity's metric unit.
 */
export const convert = <Q extends Quantity>(
	quantity: Q,
	unit: UnitOf<Q>,
	metricValue: number,
): number => {
	const spec = specOf(quantity, unit);
	return metricValue * spec.scale + spec.offset;
};

/**
 * A difference between two metric values of a quantity in a unit,
 * unrounded: scaled, without the unit's offset, so that a difference of
 * 10 °C is 18 °F and 10 K.
 *
 * @param quantity - The quantity.
 * @param unit - The unit to give it in.
 * @param metricDifference - The difference, in the quantity's metric unit.
 */
export const convertDifference = <Q extends Quantity>(
	quantity: Q,
	unit: UnitOf<Q>,
	metricDifference: number,
): number => metricDifference * specOf(quantity, unit).scale;

/**
 * A metric value of a quantity written in a unit, with the unit, such as
 * `22 mph`, `29.92 inHg` or `−4 °F`.
 *
 * @remarks
 * The value is rounded to the unit's decimals, or to those given, a half
 * upwards, and written with its digits grouped in threes and a true minus
 * sign; a value that rounds to zero is never `−0`.
 *
 * @param quantity - The quantity.
 * @param unit - The unit to write it in.
 * @param metricValue - The value, in the quantity's metric unit.
 * @param decimals - How many decimals to write; the unit's when left out.
 */
export const formatQuantity = <Q extends Quantity>(
	quantity: Q,
	unit: UnitOf<Q>,
	metricValue: number,
	decimals: number = specOf(quantity, unit).decimals,
): string => {
	const factor = 10 ** decimals;
	// Rounded once, so that the sign and the digits agree.
	const rounded = Math.round(convert(quantity, unit, metricValue) * factor);
	const digits = (Math.abs(rounded) / factor).toLocaleString('en-GB', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
	return `${rounded < 0 ? '−' : ''}${digits} ${unitLabel(quantity, unit)}`;
};

/** What the store of the units reads and writes the choice through. */
export type UnitPreferences = {
	/** The choice the browser remembers. */
	unitChoice(): UnitChoice;
	/** Remembers the system. */
	setUnitSystem(system: UnitSystem): void;
	/** Remembers a quantity's override, or that it has none, for null. */
	setUnitOverride<Q extends Quantity>(
		quantity: Q,
		unit: UnitOf<Q> | null,
	): void;
};

/** The units chosen, and whom to tell of a change. */
export type UnitStore = {
	/** The unit for each quantity, as {@link resolveUnits} gives it. */
	units(): ResolvedUnits;
	/** The choice the units are resolved from. */
	choice(): UnitChoice;
	/**
	 * Chooses a system, remembers it and tells the listeners; nothing at
	 * all for the system already chosen.
	 *
	 * @param system - The system.
	 */
	setSystem(system: UnitSystem): void;
	/**
	 * Chooses a quantity's unit whatever the system, or none for null,
	 * remembers it and tells the listeners; nothing at all for the
	 * override it already has.
	 *
	 * @param quantity - The quantity.
	 * @param unit - Its unit, or null to follow the system.
	 */
	setOverride<Q extends Quantity>(quantity: Q, unit: UnitOf<Q> | null): void;
	/**
	 * Adds a listener, called once after each change, in the order the
	 * listeners were added.
	 */
	addListener(listener: () => void): void;
};

/**
 * Makes the store of the units, starting on the choice the preferences
 * remember.
 *
 * @param preferences - Where the choice is read once and each change
 * written.
 */
export const createUnitStore = (preferences: UnitPreferences): UnitStore => {
	let choice = preferences.unitChoice();
	let units = resolveUnits(choice);
	const listeners: (() => void)[] = [];
	const change = (next: UnitChoice): void => {
		choice = next;
		units = resolveUnits(next);
		for (const listener of listeners) {
			listener();
		}
	};
	return {
		units: () => units,
		choice: () => choice,
		setSystem: (system) => {
			if (system === choice.system) {
				return;
			}
			preferences.setUnitSystem(system);
			change({ ...choice, system });
		},
		setOverride: (quantity, unit) => {
			if ((choice.overrides[quantity] ?? null) === unit) {
				return;
			}
			preferences.setUnitOverride(quantity, unit);
			const overrides: Partial<Record<Quantity, string>> = {
				...choice.overrides,
			};
			if (unit === null) {
				delete overrides[quantity];
			} else {
				overrides[quantity] = unit;
			}
			change({ ...choice, overrides: overrides as UnitChoice['overrides'] });
		},
		addListener: (listener) => {
			listeners.push(listener);
		},
	};
};

/** What a calm wind is called, whatever the unit. */
export const WIND_CALM_TEXT = 'calm';

/** The eight points of the compass, clockwise from north, abbreviated. */
export const COMPASS_POINTS = [
	'N',
	'NE',
	'E',
	'SE',
	'S',
	'SW',
	'W',
	'NW',
] as const;

/** One of the eight points of the compass. */
export type CompassPoint = (typeof COMPASS_POINTS)[number];

/**
 * The point of the compass a bearing falls in.
 *
 * @remarks
 * Each point is 45° wide and centred on its direction: north runs from
 * 337.5° up to but not including 22.5°, north-east from 22.5° up to but
 * not including 67.5°, and so on round the circle. A bearing below 0° or
 * from 360° up is first taken round the circle into that range.
 *
 * @param deg - A finite bearing in degrees, clockwise from north.
 */
export const compassPoint = (deg: number): CompassPoint => {
	const bearing = ((deg % 360) + 360) % 360;
	const index = Math.floor((bearing + 22.5) / 45) % COMPASS_POINTS.length;
	return COMPASS_POINTS[index] as CompassPoint;
};

/**
 * The bearing a wind blows from, in degrees clockwise from north, from 0
 * up to but not including 360: a wind blowing towards the east comes from
 * the west, 270°.
 *
 * @param east - The wind's eastward part.
 * @param north - The wind's northward part, in the same unit.
 */
export const windFromDeg = (east: number, north: number): number => {
	const towards = (Math.atan2(east, north) * 180) / Math.PI;
	return (towards + 540) % 360;
};

/**
 * A wind as the page writes it, its speed as {@link formatQuantity} writes
 * it, then the point of the compass it blows from, such as `7 m/s NE` for a
 * wind from the north-east, or {@link WIND_CALM_TEXT} below
 * {@link CALM_SPEED} metres a second, whatever the unit.
 *
 * @param speedMs - The wind's speed, in metres a second.
 * @param fromDeg - The bearing it blows from, in degrees clockwise from
 * north.
 * @param unit - The unit to write the speed in.
 */
export const formatWind = (
	speedMs: number,
	fromDeg: number,
	unit: WindUnit,
): string =>
	speedMs < CALM_SPEED
		? WIND_CALM_TEXT
		: `${formatQuantity('windSpeed', unit, speedMs)} ${compassPoint(fromDeg)}`;
