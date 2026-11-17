/**
 * The view controls: how much relief is exaggerated and where the sea
 * level is. Whether the cell grid is drawn, the globe is lit by the sun
 * and the winds are shown is chosen on the dock over the globe, on the
 * measured Earth whether the winds are the simulated or the observed on
 * the top bar, and how the winds are drawn and the unit of their speeds in
 * the settings. The sea level is written in the unit of heights chosen in
 * the settings, while the slider steps through whole metres underneath.
 */

import {
	DEFAULT_EXAGGERATION,
	MAX_DRAWN_SEA_LEVEL_M,
	MAX_EXAGGERATION,
	MIN_DRAWN_SEA_LEVEL_M,
	MIN_EXAGGERATION,
} from '../../globe/material';
import {
	formatQuantity,
	SYSTEM_UNITS,
	type UnitOf,
} from '../../settings/units';
import { createRangeField, type RangeScale } from '../fields';

/** The step between sea levels the slider can be set to, in metres. */
export const SEA_LEVEL_SLIDER_STEP_M = 10;

/** What the view panel starts with and whom it tells about changes. */
export type ViewPanelOptions = {
	/** The relief exaggeration shown at first; defaults to the view's own. */
	readonly exaggeration?: number;
	/** The sea level shown at first, in metres against the datum. */
	readonly seaLevel: number;
	/** The unit the sea level is written in at first; metres when left out. */
	readonly heightUnit?: UnitOf<'height'>;
	/** Called with the new factor when the exaggeration slider moves. */
	readonly onExaggeration: (factor: number) => void;
	/** Called with the new level in metres when the sea-level slider moves. */
	readonly onSeaLevel: (metres: number) => void;
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
	/**
	 * Writes the sea level in a unit from now on, and the level shown in it
	 * at once. The slider does not move and `onSeaLevel` is not called.
	 */
	setHeightUnit(unit: UnitOf<'height'>): void;
};

/**
 * A relief exaggeration as the panel shows it, such as `40×`.
 *
 * @param factor - The exaggeration factor.
 */
export const formatExaggeration = (factor: number): string =>
	`${Math.round(factor)}×`;

/**
 * A height in metres as the panel shows it in a unit, such as `1,250 m`,
 * `−40 m` or `98 ft`.
 *
 * @param metres - The height, in metres; rounded to a whole one of the
 * unit once converted.
 * @param unit - The unit to write it in; metres when left out.
 */
export const formatMetres = (
	metres: number,
	unit: UnitOf<'height'> = SYSTEM_UNITS.metric.height,
): string => formatQuantity('height', unit, metres, 0);

/**
 * Adds the view controls to the View section of the side panel: the
 * Relief exaggeration slider, and under it the Sea level slider.
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
	let heightUnit = options.heightUnit ?? SYSTEM_UNITS.metric.height;
	const format = (metres: number): string => formatMetres(metres, heightUnit);
	const seaLevelScale = (metres: number): RangeScale => ({
		min: MIN_DRAWN_SEA_LEVEL_M,
		max: MAX_DRAWN_SEA_LEVEL_M,
		step: SEA_LEVEL_SLIDER_STEP_M,
		value: metres,
		format,
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
	);
	return {
		setSeaLevel: (metres) => seaLevel.setScale(seaLevelScale(metres)),
		setHeightUnit: (unit) => {
			heightUnit = unit;
			seaLevel.setFormat(format);
		},
	};
};
