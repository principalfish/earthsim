/**
 * The planet controls: the tilt of the planet's axis, the brightness and
 * mass of its star, the radius of its orbit and the strength of its
 * greenhouse effect, with the sunlight and year that follow from them.
 */

import {
	DEFAULT_PLANET,
	EARTH_YEAR_DAYS,
	PLANET_LIMITS,
	type PlanetLimit,
	type PlanetSetting,
	type PlanetSettings,
	type RoughSide,
	sunlightRelativeToEarth,
	trustNote,
	yearLengthDays,
} from '../../core/index';
import { createButton, createElement, createRangeField } from './fields';

/**
 * How the positions of a slider stand for the values of a setting. The
 * positions are the whole numbers from 0, the setting's lowest value, up to
 * {@link PlanetSliderScale.steps}, its highest, and one of them is exactly
 * Earth's value.
 */
export type PlanetSliderScale = {
	/** The highest position. */
	readonly steps: number;
	/** The position that stands for Earth's value. */
	readonly earthPosition: number;
	/**
	 * The value a position stands for.
	 *
	 * @param position - A whole number from 0 to `steps`.
	 */
	toSetting(position: number): number;
	/**
	 * The position whose value is nearest a value. A value half way between
	 * two stops goes to one of the two, as rounding falls. On a logarithmic
	 * scale, nearest is in the logarithm of the value.
	 *
	 * @param setting - A value within the setting's limits; one beyond them
	 * gives the end it lies beyond.
	 */
	toPosition(setting: number): number;
};

/** A position brought to a whole number from 0 to the highest. */
const wholePosition = (position: number, steps: number): number =>
	Math.min(steps, Math.max(0, Math.round(position)));

/**
 * A scale whose positions are equally far apart, except that the one
 * nearest Earth's value is Earth's value exactly.
 *
 * @param limit - The setting's lowest and highest values, which the ends
 * stand for exactly.
 * @param step - How far apart the positions are; one that does not divide
 * the range is changed to the nearest that does.
 * @param earth - Earth's value, within the limits.
 */
export const linearSliderScale = (
	limit: PlanetLimit,
	step: number,
	earth: number,
): PlanetSliderScale => {
	const { min, max } = limit;
	const steps = Math.round((max - min) / step);
	/** Where a value lies, in positions from the lowest. */
	const along = (setting: number): number =>
		((setting - min) / (max - min)) * steps;
	const earthPosition = wholePosition(along(earth), steps);
	const toSetting = (position: number): number => {
		if (position === earthPosition) {
			return earth;
		}
		// Dividing last gives the value nearest each round step, such as
		// 0.15 rather than 0.15000000000000002.
		return position === steps ? max : min + ((max - min) * position) / steps;
	};
	return {
		steps,
		earthPosition,
		toSetting,
		toPosition: (setting) => {
			// Earth's stop lies less than half a step from where it would
			// otherwise be, so the nearest stop in value is one of the two
			// either side of the value, though not always the nearer in
			// position.
			const lower = wholePosition(Math.floor(along(setting)), steps);
			const higher = Math.min(steps, lower + 1);
			return Math.abs(toSetting(higher) - setting) <=
				Math.abs(toSetting(lower) - setting)
				? higher
				: lower;
		},
	};
};

/**
 * A scale whose positions are equally far apart in the logarithm of the
 * value, so that each multiplies the value by about the same factor, with
 * Earth's value and both limits exactly on positions.
 *
 * @remarks
 * The positions below Earth's and those above are spaced apart each on
 * their own, shared out in proportion to the range of the logarithm on
 * each side, so the factor between neighbours differs a little on the two
 * sides where the range is not split evenly.
 *
 * @param limit - The setting's lowest and highest values, both above zero.
 * @param steps - The highest position.
 * @param earth - Earth's value, between the limits.
 */
export const logSliderScale = (
	limit: PlanetLimit,
	steps: number,
	earth: number,
): PlanetSliderScale => {
	const { min, max } = limit;
	const earthPosition = Math.round(
		(steps * Math.log(earth / min)) / Math.log(max / min),
	);
	const above = steps - earthPosition;
	const logBelow = Math.log(min / earth);
	const logAbove = Math.log(max / earth);
	return {
		steps,
		earthPosition,
		toSetting: (position) => {
			if (position === 0) {
				return min;
			}
			if (position === steps) {
				return max;
			}
			if (position === earthPosition) {
				return earth;
			}
			return position < earthPosition
				? earth *
						Math.exp((logBelow * (earthPosition - position)) / earthPosition)
				: earth * Math.exp((logAbove * (position - earthPosition)) / above);
		},
		toPosition: (setting) => {
			// Below the lowest, which may be zero or less, has no logarithm.
			if (setting <= min) {
				return 0;
			}
			const ratio = Math.log(setting / earth);
			const position =
				setting < earth
					? earthPosition - (earthPosition * ratio) / logBelow
					: earthPosition + (above * ratio) / logAbove;
			return wholePosition(position, steps);
		},
	};
};

/** One of the planet's sliders. */
export type PlanetSlider = {
	/** The setting it sets. */
	readonly setting: PlanetSetting;
	/** The slider's `id`, unique on the page. */
	readonly id: string;
	/** The text of its label. */
	readonly label: string;
	/** How its positions stand for the setting's values. */
	readonly scale: PlanetSliderScale;
	/** How a value of the setting is written beside the label. */
	readonly format: (value: number) => string;
	/**
	 * What follows the value as written when it is Earth's exactly; empty
	 * where the value as written already says so.
	 */
	readonly earthSuffix: string;
};

/** What follows a value as written when it is Earth's exactly. */
const EARTH_SUFFIX = ' (Earth)';

/**
 * An axial tilt as the panel shows it, such as `23.44°`, `23.5°` or `0°`.
 *
 * @param degrees - The tilt; rounded to a hundredth of a degree.
 */
export const formatTilt = (degrees: number): string =>
	`${Number(degrees.toFixed(2))}°`;

/**
 * A multiple of the Sun's brightness or mass as the panel shows it, to
 * three significant figures, such as `0.861 × Sun` or `10.0 × Sun`.
 *
 * @param multiple - The multiple, from 0.1 to 10.
 */
export const formatSolar = (multiple: number): string =>
	`${multiple.toPrecision(3)} × Sun`;

/**
 * An orbit's radius as the panel shows it, to three significant figures,
 * such as `1.52 AU` or `0.300 AU`.
 *
 * @param au - The radius in astronomical units, from 0.3 to 3.
 */
export const formatAu = (au: number): string => `${au.toPrecision(3)} AU`;

/**
 * A greenhouse strength as the panel shows it, to a hundredth, such as
 * `1.00 × Earth`.
 *
 * @param strength - The strength as a multiple of Earth's.
 */
export const formatGreenhouse = (strength: number): string =>
	`${strength.toFixed(2)} × Earth`;

/** The planet's sliders, in the order the panel shows them. */
export const PLANET_SLIDERS: readonly PlanetSlider[] = Object.freeze([
	{
		setting: 'axialTiltDeg',
		id: 'planet-axial-tilt',
		label: 'Axial tilt',
		scale: linearSliderScale(
			PLANET_LIMITS.axialTiltDeg,
			0.5,
			DEFAULT_PLANET.axialTiltDeg,
		),
		format: formatTilt,
		earthSuffix: EARTH_SUFFIX,
	},
	{
		setting: 'starBrightness',
		id: 'planet-star-brightness',
		label: 'Star brightness',
		scale: logSliderScale(
			PLANET_LIMITS.starBrightness,
			200,
			DEFAULT_PLANET.starBrightness,
		),
		format: formatSolar,
		earthSuffix: EARTH_SUFFIX,
	},
	{
		setting: 'starMass',
		id: 'planet-star-mass',
		label: 'Star mass',
		scale: logSliderScale(PLANET_LIMITS.starMass, 200, DEFAULT_PLANET.starMass),
		format: formatSolar,
		earthSuffix: EARTH_SUFFIX,
	},
	{
		setting: 'orbitDistanceAu',
		id: 'planet-orbit-distance',
		label: 'Orbit distance',
		scale: logSliderScale(
			PLANET_LIMITS.orbitDistanceAu,
			200,
			DEFAULT_PLANET.orbitDistanceAu,
		),
		format: formatAu,
		earthSuffix: EARTH_SUFFIX,
	},
	{
		setting: 'greenhouseStrength',
		id: 'planet-greenhouse',
		label: 'Greenhouse strength',
		scale: linearSliderScale(
			PLANET_LIMITS.greenhouseStrength,
			0.05,
			DEFAULT_PLANET.greenhouseStrength,
		),
		format: formatGreenhouse,
		// Its values are written as multiples of Earth's.
		earthSuffix: '',
	},
]);

/**
 * A setting's value as its slider writes it, saying so when it is Earth's,
 * such as `23.44° (Earth)` or `1.52 AU`.
 *
 * @param slider - The slider of the setting.
 * @param value - The setting's value.
 */
export const settingText = (slider: PlanetSlider, value: number): string =>
	value === DEFAULT_PLANET[slider.setting]
		? `${slider.format(value)}${slider.earthSuffix}`
		: slider.format(value);

/**
 * The sunlight a planet receives as the panel shows it: as a share of
 * Earth's while that rounds to under 200%, such as `86% of Earth's` or
 * `1.1% of Earth's`, and otherwise as a multiple to three significant
 * figures, such as `2.00 × Earth's` or `111 × Earth's`.
 *
 * @param sunlight - The sunlight as a multiple of Earth's.
 */
export const formatSunlight = (sunlight: number): string => {
	const percent = sunlight * 100;
	if (Math.round(percent) >= 200) {
		// Never under 2.00 here: a value a rounding short of twice Earth's
		// is written as twice, as its percent would be.
		return `${Math.max(2, sunlight).toPrecision(3)} × Earth's`;
	}
	// A tenth of a percent below 10%, so that a dim planet's sunlight is
	// not written as 1% or 0%.
	const rounded =
		Math.round(percent * 10) < 100
			? percent.toFixed(1)
			: String(Math.round(percent));
	return `${rounded}% of Earth's`;
};

/**
 * The length of a year as the panel shows it: under two Earth years in
 * whole days, such as `365 days`, and from two Earth years in Earth years
 * to a tenth, such as `3.2 years`.
 *
 * @param days - The length in Earth days.
 */
export const formatYear = (days: number): string =>
	days < 2 * EARTH_YEAR_DAYS
		? `${Math.round(days)} days`
		: `${(days / EARTH_YEAR_DAYS).toFixed(1)} years`;

/** What the panel says when the model's results are rough, by the side. */
export const ROUGH_NOTE_TEXT: Readonly<Record<RoughSide, string>> =
	Object.freeze({
		cold: 'The model is calibrated on the Earth, so its results for a planet far colder than the Earth are rough. This one may be frozen over.',
		hot: 'The model is calibrated on the Earth, so its results for a planet far hotter than the Earth are rough.',
	});

/**
 * What the panel says of how rough the model's results are for a planet.
 *
 * @param planet - The planet's settings.
 * @returns The note, or null for a planet the model is trusted for.
 */
export const roughNoteFor = (planet: PlanetSettings): string | null => {
	const side = trustNote(planet);
	return side === null ? null : ROUGH_NOTE_TEXT[side];
};

/** The text on the button that puts Earth's settings back. */
export const RESET_PLANET_LABEL = 'Reset to Earth';

/** What the planet panel starts with and whom it tells about changes. */
export type PlanetPanelOptions = {
	/** The settings shown at first. */
	readonly planet: PlanetSettings;
	/**
	 * Called with the new settings, all five, whenever a slider moves and
	 * when Earth's are put back.
	 */
	readonly onChange: (planet: PlanetSettings) => void;
};

/** The planet controls on the page. */
export type PlanetPanel = {
	/** The section that holds the controls. */
	readonly element: HTMLElement;
	/**
	 * Shows other settings, for settings that changed without the panel,
	 * as a new world's do. `onChange` is not called.
	 *
	 * @param planet - The settings to show, each within its limits. A value
	 * between two of a slider's positions moves the slider to the nearer,
	 * and is written as it is.
	 */
	setPlanet(planet: PlanetSettings): void;
};

/**
 * Adds the planet controls to the side panel.
 *
 * @remarks
 * Each slider writes its value beside its label, and a screen reader hears
 * the value as written. Earth's value is marked under each track, and the
 * value as written says when it is Earth's. Each movement of a slider is a
 * change of the settings.
 *
 * Under the sliders, the sunlight the planet receives and the length of
 * its year follow the settings. Under those, a note says when the model's
 * results are rough, from {@link trustNote}. The note is in a polite live
 * region, written only when the side it is on changes, so a screen reader
 * announces it once as it appears rather than at every movement of a
 * slider. It takes no room while there is none: it comes and goes below
 * the sliders, so a slider being dragged does not move.
 *
 * The button that puts Earth's settings back is always usable. Pressed on
 * Earth's settings, it passes them on again.
 *
 * @param panel - The panel to add the controls to, after what it holds.
 * @param options - The starting settings and the callback for changes.
 * @returns The controls that were added.
 */
export const createPlanetPanel = (
	panel: HTMLElement,
	options: PlanetPanelOptions,
): PlanetPanel => {
	const section = createElement('section', 'panel__section');
	const heading = createElement('h2', 'panel__heading');
	heading.textContent = 'Planet';

	let current: PlanetSettings = { ...options.planet };

	const readout = createElement('div', 'planet-readout');
	const lines = createElement('dl', 'planet-readout__lines');
	/** Adds a line of the readout, and gives the element its value goes in. */
	const addLine = (label: string): HTMLElement => {
		const row = createElement('div', 'planet-readout__row');
		const term = createElement('dt', 'planet-readout__label');
		term.textContent = label;
		const value = createElement('dd', 'planet-readout__value');
		row.append(term, value);
		lines.append(row);
		return value;
	};
	const sunlight = addLine('Sunlight');
	const year = addLine('Year');

	const noteRegion = createElement('div', 'planet-readout__note-region');
	noteRegion.setAttribute('aria-live', 'polite');
	const note = createElement('p', 'planet-readout__note');
	readout.append(lines, noteRegion);
	let noteShown: string | null = null;

	/** Shows what follows from the settings: the two lines and the note. */
	const showDerived = (planet: PlanetSettings): void => {
		sunlight.textContent = formatSunlight(sunlightRelativeToEarth(planet));
		year.textContent = formatYear(yearLengthDays(planet));
		const text = roughNoteFor(planet);
		// Written only when it changes: the same words set again would be
		// announced again.
		if (text === noteShown) {
			return;
		}
		noteShown = text;
		if (text === null) {
			noteRegion.replaceChildren();
		} else {
			note.textContent = text;
			noteRegion.replaceChildren(note);
		}
	};

	/** Takes settings from the panel's own controls, and passes them on. */
	const change = (planet: PlanetSettings): void => {
		current = planet;
		showDerived(planet);
		options.onChange({ ...planet });
	};

	const fields = PLANET_SLIDERS.map((slider) => {
		const { scale, setting } = slider;
		const field = createRangeField({
			id: slider.id,
			label: slider.label,
			min: 0,
			max: scale.steps,
			step: 1,
			value: scale.toPosition(current[setting]),
			format: (position) => settingText(slider, scale.toSetting(position)),
			mark: {
				value: scale.earthPosition,
				title: `Earth: ${slider.format(DEFAULT_PLANET[setting])}`,
			},
			onInput: (position) =>
				change({ ...current, [setting]: scale.toSetting(position) }),
		});
		return { slider, field };
	});

	/** Shows settings on every control, passing nothing on. */
	const show = (planet: PlanetSettings): void => {
		current = { ...planet };
		for (const { slider, field } of fields) {
			const value = planet[slider.setting];
			field.setValue(
				slider.scale.toPosition(value),
				settingText(slider, value),
			);
		}
		showDerived(planet);
	};
	show(current);

	const reset = createButton({
		label: RESET_PLANET_LABEL,
		title: 'Set every planet setting back to Earth’s',
		onClick: () => {
			show(DEFAULT_PLANET);
			change({ ...DEFAULT_PLANET });
		},
	});
	reset.classList.add('button--compact');
	reset.classList.add('planet-reset');

	section.append(
		heading,
		...fields.map(({ field }) => field.element),
		readout,
		reset,
	);
	panel.append(section);
	return { element: section, setPlanet: show };
};
