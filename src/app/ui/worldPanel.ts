/**
 * The world controls: a line saying which world is being edited, and the
 * button that starts a new one.
 */

import type { World } from '../../core/index';
import { createButton, createElement } from './fields';

/** What separates the parts of the line that describes a world. */
const PART_SEPARATOR = ' · ';

/**
 * The significant digits a land percentage is written with when it is not a
 * whole number: enough to tell any two apart that a person would type, and
 * few enough to drop the noise of binary fractions.
 */
const LAND_PERCENT_DIGITS = 12;

/** What the world panel starts with and whom it tells. */
export type WorldPanelOptions = {
	/** The line describing the world shown at first. */
	readonly description: string;
	/** Called when the button for a new world is pressed. */
	readonly onNewWorld: () => void;
};

/** The world controls on the page. */
export type WorldPanel = {
	/** The section that holds the controls. */
	readonly element: HTMLElement;
	/**
	 * Shows another line describing the world being edited.
	 *
	 * @param description - The line, shown as plain text: see
	 * {@link describeWorld}.
	 */
	setDescription(description: string): void;
};

/**
 * The share of a generated world that was asked to be land, as the panel
 * shows it: `30%`.
 *
 * @remarks
 * A fraction that is exactly a whole number of hundredths, which is what
 * the new-world slider gives, is written as that whole percentage, so the
 * figure shown reproduces the world. Any other fraction is written with as
 * many decimals as it needs, to twelve significant digits, such as `12.5%`:
 * it is never rounded to a nearby whole percentage that would give another
 * world, unless it is within that precision of one.
 *
 * @param landFraction - The share, from 0 to 1.
 */
export const formatLandPercent = (landFraction: number): string => {
	const whole = Math.round(landFraction * 100);
	const percent =
		whole / 100 === landFraction
			? whole
			: Number((landFraction * 100).toPrecision(LAND_PERCENT_DIGITS));
	return `${percent}%`;
};

/**
 * One line saying how a world started: `Blank ocean · 128`, or
 * `Generated · 64 · seed 1977 · 30% land`.
 *
 * @remarks
 * The number after the first part is the resolution, in cells along a face
 * edge. The seed is written with no grouping of its digits, so that it can
 * be copied from the line into the new-world dialog as it stands. The line
 * describes the start only: sculpting and the sea level do not change it.
 *
 * @param world - The world to describe.
 */
export const describeWorld = (world: World): string => {
	const { origin, resolution } = world;
	switch (origin.kind) {
		case 'blank':
			return ['Blank ocean', resolution].join(PART_SEPARATOR);
		case 'generated':
			return [
				'Generated',
				resolution,
				`seed ${origin.seed}`,
				`${formatLandPercent(origin.landFraction)} land`,
			].join(PART_SEPARATOR);
	}
};

/**
 * Adds the world controls to the side panel.
 *
 * @remarks
 * The line describing the world is ordinary text, so the seed in it can be
 * selected and copied.
 *
 * @param panel - The panel to add the controls to, after what it holds.
 * @param options - The starting line and the callback for the button.
 * @returns The controls that were added.
 */
export const createWorldPanel = (
	panel: HTMLElement,
	options: WorldPanelOptions,
): WorldPanel => {
	const section = createElement('section', 'panel__section');
	const heading = createElement('h2', 'panel__heading');
	heading.textContent = 'World';

	const description = createElement('p', 'world-summary');
	description.textContent = options.description;

	section.append(
		heading,
		description,
		createButton({
			label: 'New world',
			title: 'Replace this world with a new one',
			onClick: options.onNewWorld,
		}),
	);
	panel.append(section);
	return {
		element: section,
		setDescription: (text) => {
			description.textContent = text;
		},
	};
};
