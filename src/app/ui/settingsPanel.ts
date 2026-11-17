/**
 * The settings: whether the winds are drawn as arrows or as streaks, and
 * the units: a system, Metric or Imperial, and a unit for any quantity
 * whatever the system. All are preferences of the browser, kept apart
 * from the world.
 */

import {
	WIND_STYLE_LABELS,
	WIND_STYLES,
	type WindStyle,
} from '../globe/windMotion';
import {
	isUnitOf,
	QUANTITIES,
	QUANTITY_LABELS,
	type Quantity,
	type ResolvedUnits,
	SYSTEM_UNITS,
	UNIT_SYSTEM_LABELS,
	UNIT_SYSTEMS,
	type UnitChoice,
	type UnitOf,
	type UnitSystem,
	unitLabel,
	unitsOf,
} from '../units';
import {
	createElement,
	createSegmentedChoice,
	createSelectChoice,
	createSelectField,
	type SelectChoice,
} from './fields';

/** What a unit drop-down holds for following the system. */
export const AS_THE_SYSTEM = 'system';

/** The name of the system's group of radio buttons. */
export const UNIT_SYSTEM_NAME = 'unit-system';

/**
 * What the first choice of a quantity's unit drop-down says, naming the
 * unit a system gives it, such as `As the system (°C)`.
 *
 * @param system - The system.
 * @param quantity - The quantity.
 */
export const asTheSystemLabel = <Q extends Quantity>(
	system: UnitSystem,
	quantity: Q,
): string =>
	`As the system (${unitLabel(quantity, SYSTEM_UNITS[system][quantity])})`;

/**
 * The `id` of a quantity's unit drop-down, such as
 * `settings-unit-windSpeed`.
 *
 * @param quantity - The quantity.
 */
export const unitSelectId = (quantity: Quantity): string =>
	`settings-unit-${quantity}`;

/** What the settings start with and whom they tell about changes. */
export type SettingsPanelOptions = {
	/** How the winds are drawn at first. */
	readonly windStyle: WindStyle;
	/** The units chosen at first. */
	readonly units: UnitChoice;
	/** Called with the way chosen when another is chosen to draw the winds. */
	readonly onWindStyle: (style: WindStyle) => void;
	/** Called with the system when the other is chosen. */
	readonly onUnitSystem: (system: UnitSystem) => void;
	/**
	 * Called with a quantity and its unit when one is chosen for it, or
	 * null when As the system is.
	 */
	readonly onUnitOverride: <Q extends Quantity>(
		quantity: Q,
		unit: UnitOf<Q> | null,
	) => void;
};

/** The settings, with a way to show units chosen elsewhere. */
export type SettingsPanel = {
	/**
	 * Shows the units chosen, without calling back: the system, each
	 * quantity's override, and in each As the system the unit the system
	 * gives.
	 */
	showUnits(choice: UnitChoice): void;
};

/**
 * A quantity's unit drop-down: As the system, naming the unit the system
 * gives, then each of the quantity's units.
 */
const createUnitSelect = <Q extends Quantity>(
	quantity: Q,
	choice: UnitChoice,
	onUnitOverride: SettingsPanelOptions['onUnitOverride'],
): SelectChoice<UnitOf<Q> | typeof AS_THE_SYSTEM> =>
	createSelectChoice<UnitOf<Q> | typeof AS_THE_SYSTEM>({
		id: unitSelectId(quantity),
		label: QUANTITY_LABELS[quantity],
		choices: [
			{
				value: AS_THE_SYSTEM,
				label: asTheSystemLabel(choice.system, quantity),
			},
			...unitsOf(quantity).map((unit) => ({
				value: unit,
				label: unitLabel(quantity, unit),
			})),
		],
		value: choice.overrides[quantity] ?? AS_THE_SYSTEM,
		onChange: (value) =>
			onUnitOverride(quantity, isUnitOf(quantity, value) ? value : null),
	});

/**
 * Adds the settings to the Settings section of the side panel.
 *
 * @remarks
 * First is the Winds drawn as choice, a drop-down of Arrows and Streaks.
 * Under it is the Units group: a row of Metric and Imperial, then a
 * drop-down for each quantity, Temperature, Pressure, Wind speed, Heights
 * and depths and Distances, whose first choice, As the system, follows
 * the system and names the unit it gives, and whose others are the
 * quantity's units. All are shown whether or not the winds are.
 *
 * @param body - The section's body, to add the controls to, after what it
 * holds.
 * @param options - The starting values and the callbacks for changes.
 * @returns The way to show units chosen elsewhere.
 */
export const createSettingsPanel = (
	body: HTMLElement,
	options: SettingsPanelOptions,
): SettingsPanel => {
	const { units } = options;
	const group = createElement('div', 'settings-units');
	group.setAttribute('role', 'group');
	group.setAttribute('aria-labelledby', 'settings-units-heading');
	const heading = createElement('div', 'settings-units__heading');
	heading.id = 'settings-units-heading';
	heading.textContent = 'Units';
	const system = createSegmentedChoice({
		name: UNIT_SYSTEM_NAME,
		legend: 'Unit system',
		choices: UNIT_SYSTEMS.map((value) => ({
			value,
			label: UNIT_SYSTEM_LABELS[value],
		})),
		value: units.system,
		onChange: options.onUnitSystem,
	});
	const selects: readonly (readonly [
		Quantity,
		SelectChoice<ResolvedUnits[Quantity] | typeof AS_THE_SYSTEM>,
	])[] = QUANTITIES.map((quantity) => [
		quantity,
		createUnitSelect(quantity, units, options.onUnitOverride),
	]);
	group.append(
		heading,
		system.element,
		...selects.map(([, select]) => select.element),
	);
	body.append(
		createSelectField({
			id: 'settings-wind-style',
			label: 'Winds drawn as',
			choices: WIND_STYLES.map((style) => ({
				value: style,
				label: WIND_STYLE_LABELS[style],
			})),
			value: options.windStyle,
			onChange: options.onWindStyle,
		}),
		group,
	);
	return {
		showUnits: (choice) => {
			system.setValue(choice.system);
			for (const [quantity, select] of selects) {
				select.setLabel(
					AS_THE_SYSTEM,
					asTheSystemLabel(choice.system, quantity),
				);
				select.setValue(choice.overrides[quantity] ?? AS_THE_SYSTEM);
			}
		},
	};
};
