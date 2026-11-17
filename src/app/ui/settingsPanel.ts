/**
 * The settings: whether the winds are drawn as arrows or as streaks, and
 * the unit their speeds are written in. Both are preferences of the
 * browser, kept apart from the world.
 */

import {
	WIND_STYLE_LABELS,
	WIND_STYLES,
	type WindStyle,
} from '../globe/windMotion';
import { WIND_UNITS, type WindUnit } from '../windUnits';
import { createSelectField } from './fields';

/** What the settings start with and whom they tell about changes. */
export type SettingsPanelOptions = {
	/** How the winds are drawn at first. */
	readonly windStyle: WindStyle;
	/** The unit wind speeds are written in at first. */
	readonly windUnit: WindUnit;
	/** Called with the way chosen when another is chosen to draw the winds. */
	readonly onWindStyle: (style: WindStyle) => void;
	/** Called with the unit when another is chosen for wind speeds. */
	readonly onWindUnit: (unit: WindUnit) => void;
};

/**
 * Adds the settings to the Settings section of the side panel.
 *
 * @remarks
 * First is the Winds drawn as choice, a drop-down of Arrows and Streaks,
 * and under it the Wind speed choice, a drop-down of the units, both shown
 * whether or not the winds are.
 *
 * @param body - The section's body, to add the controls to, after what it
 * holds.
 * @param options - The starting values and the callbacks for changes.
 */
export const createSettingsPanel = (
	body: HTMLElement,
	options: SettingsPanelOptions,
): void => {
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
		createSelectField({
			id: 'settings-wind-unit',
			label: 'Wind speed',
			choices: WIND_UNITS.map((unit) => ({ value: unit, label: unit })),
			value: options.windUnit,
			onChange: options.onWindUnit,
		}),
	);
};
