/**
 * The view controls: how much relief is exaggerated, where the sea level
 * is, whether the winds are drawn as arrows or as streaks, and the unit
 * their speeds are written in. Whether the cell grid is drawn, the globe
 * is lit by the sun and the winds are shown is chosen on the dock over the
 * globe, and on the measured Earth whether the winds are the simulated or
 * the observed on the top bar.
 */

import {
	DEFAULT_EXAGGERATION,
	MAX_DRAWN_SEA_LEVEL_M,
	MAX_EXAGGERATION,
	MIN_DRAWN_SEA_LEVEL_M,
	MIN_EXAGGERATION,
} from '../globe/material';
import {
	DEFAULT_WIND_STYLE,
	WIND_STYLE_LABELS,
	WIND_STYLES,
	type WindStyle,
} from '../globe/windMotion';
import { DEFAULT_WIND_UNIT, WIND_UNITS, type WindUnit } from '../windUnits';
import { createRangeField, createSelectField, type RangeScale } from './fields';

/** The step between sea levels the slider can be set to, in metres. */
export const SEA_LEVEL_SLIDER_STEP_M = 10;

/** What the view panel starts with and whom it tells about changes. */
export type ViewPanelOptions = {
	/** The relief exaggeration shown at first; defaults to the view's own. */
	readonly exaggeration?: number;
	/** The sea level shown at first, in metres against the datum. */
	readonly seaLevel: number;
	/** How the winds are drawn at first; as arrows by default. */
	readonly windStyle?: WindStyle;
	/** The unit wind speeds are written in at first; m/s by default. */
	readonly windUnit?: WindUnit;
	/** Called with the new factor when the exaggeration slider moves. */
	readonly onExaggeration: (factor: number) => void;
	/** Called with the new level in metres when the sea-level slider moves. */
	readonly onSeaLevel: (metres: number) => void;
	/** Called with the way chosen when another is chosen to draw the winds. */
	readonly onWindStyle: (style: WindStyle) => void;
	/** Called with the unit when another is chosen for wind speeds. */
	readonly onWindUnit: (unit: WindUnit) => void;
};

/** The view controls on the page. */
export type ViewPanel = {
	/**
	 * Moves the sea-level slider and rewrites the level beside its label,
	 * for a sea level that changed without the slider. `onSeaLevel` is not
	 * called.
	 *
	 * @param metres - The level to show, in metres against the datum: one
	 * the slider can be set to, a whole number of
	 * {@link SEA_LEVEL_SLIDER_STEP_M} within the drawn range.
	 */
	setSeaLevel(metres: number): void;
};

/**
 * A relief exaggeration as the panel shows it, such as `40×`.
 *
 * @param factor - The exaggeration factor.
 */
export const formatExaggeration = (factor: number): string =>
	`${Math.round(factor)}×`;

/**
 * A height in metres as the panel shows it, such as `1,250 m` or `−40 m`.
 *
 * @param metres - The height; rounded to a whole metre.
 */
export const formatMetres = (metres: number): string => {
	const rounded = Math.round(metres);
	const digits = Math.abs(rounded).toLocaleString('en-GB');
	return `${rounded < 0 ? '−' : ''}${digits} m`;
};

/**
 * Adds the view controls to the View section of the side panel.
 *
 * @remarks
 * Under the sliders is the Winds drawn as choice, a drop-down of Arrows
 * and Streaks, and under it the Wind speed choice, a drop-down labelled
 * so, both shown whether or not the winds are.
 *
 * @param body - The section's body, to add the controls to, after what it
 * holds.
 * @param options - The starting values and the callbacks for changes.
 * @returns The controls that were added.
 */
export const createViewPanel = (
	body: HTMLElement,
	options: ViewPanelOptions,
): ViewPanel => {
	const seaLevelScale = (metres: number): RangeScale => ({
		min: MIN_DRAWN_SEA_LEVEL_M,
		max: MAX_DRAWN_SEA_LEVEL_M,
		step: SEA_LEVEL_SLIDER_STEP_M,
		value: metres,
		format: formatMetres,
	});
	const seaLevel = createRangeField({
		id: 'view-sea-level',
		label: 'Sea level',
		...seaLevelScale(options.seaLevel),
		onInput: options.onSeaLevel,
	});

	body.append(
		createRangeField({
			id: 'view-exaggeration',
			label: 'Relief exaggeration',
			min: MIN_EXAGGERATION,
			max: MAX_EXAGGERATION,
			step: 1,
			value: options.exaggeration ?? DEFAULT_EXAGGERATION,
			format: formatExaggeration,
			onInput: options.onExaggeration,
		}).element,
		seaLevel.element,
		createSelectField({
			id: 'view-wind-style',
			label: 'Winds drawn as',
			choices: WIND_STYLES.map((style) => ({
				value: style,
				label: WIND_STYLE_LABELS[style],
			})),
			value: options.windStyle ?? DEFAULT_WIND_STYLE,
			onChange: options.onWindStyle,
		}),
		createSelectField({
			id: 'view-wind-unit',
			label: 'Wind speed',
			choices: WIND_UNITS.map((unit) => ({ value: unit, label: unit })),
			value: options.windUnit ?? DEFAULT_WIND_UNIT,
			onChange: options.onWindUnit,
		}),
	);
	return {
		setSeaLevel: (metres) => seaLevel.setScale(seaLevelScale(metres)),
	};
};
