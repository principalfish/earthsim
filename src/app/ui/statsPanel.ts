/**
 * The statistics readout: how much of the world is land, and how high and
 * deep its terrain is.
 */

import type { TerrainStats } from '../../core/index';
import { createElement } from './fields';
import { formatMetres } from './viewPanel';

/** One figure of the readout, as it is written on the page. */
export type StatsFigure = {
	/** What the figure is. */
	readonly label: string;
	/** Its value, with its unit. */
	readonly value: string;
};

/** The readout of terrain statistics on the page. */
export type StatsPanel = {
	/** The section that was added to the panel. */
	readonly element: HTMLElement;
	/**
	 * Shows statistics in place of whatever the readout showed before.
	 * They stay on the page until the next call of any method.
	 */
	show(stats: TerrainStats): void;
	/** Says in place of the figures that there are no statistics to show. */
	showUnavailable(): void;
	/**
	 * Puts the readout back to saying that statistics are being calculated,
	 * as it does at first: {@link STATS_PENDING_TEXT} in place of the
	 * figures, and the note hidden.
	 */
	showPending(): void;
};

/** What the readout says while it has no statistics for its world yet. */
export const STATS_PENDING_TEXT = 'Calculating…';

/** What the readout says when statistics cannot be computed. */
export const STATS_UNAVAILABLE_TEXT = 'Statistics unavailable';

/**
 * What the readout says under the figures, so that the two that are
 * measured against the datum are not taken for heights above the sea.
 */
export const STATS_NOTE_TEXT =
	'Highest and deepest points are elevations on the scale of the sea level slider. The means are measured from the sea level.';

/**
 * A share of the surface as the readout shows it, such as `29.8%`.
 *
 * @remarks
 * A share that is not quite none or not quite all is never rounded to
 * `0.0%` or `100.0%`: under a thousandth is written `<0.1%` and over 999
 * thousandths `>99.9%`, so those two figures mean exactly none and all.
 *
 * @param fraction - The share, from 0 to 1; written as a percentage to one
 * decimal place.
 */
export const formatLandFraction = (fraction: number): string => {
	if (fraction > 0 && fraction < 0.001) {
		return '<0.1%';
	}
	if (fraction > 0.999 && fraction < 1) {
		return '>99.9%';
	}
	const percent = (fraction * 100).toLocaleString('en-GB', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1,
	});
	return `${percent}%`;
};

/** The figures of the readout, in the order they are shown. */
const FIGURES: readonly {
	readonly label: string;
	readonly format: (stats: TerrainStats) => string;
}[] = [
	{ label: 'Land', format: (stats) => formatLandFraction(stats.landFraction) },
	{ label: 'Highest point', format: (stats) => formatMetres(stats.highestM) },
	{ label: 'Deepest point', format: (stats) => formatMetres(stats.deepestM) },
	{
		label: 'Mean land height',
		format: (stats) => formatMetres(stats.meanLandHeightM),
	},
	{
		label: 'Mean ocean depth',
		format: (stats) => formatMetres(stats.meanOceanDepthM),
	},
];

/**
 * The figures of the readout for a world's statistics.
 *
 * @remarks
 * The highest and deepest points are written as signed elevations against
 * the datum, the scale the sea level is set on, so that the deepest point
 * of an ocean reads as a negative number and so does the highest point of
 * a world with no land. The two means are distances from the sea level and
 * are never negative.
 *
 * @param stats - The statistics to show.
 * @returns Land, highest point, deepest point, mean land height and mean
 * ocean depth, in that order.
 */
export const statsFigures = (stats: TerrainStats): StatsFigure[] =>
	FIGURES.map(({ label, format }) => ({ label, value: format(stats) }));

/**
 * Adds the statistics readout to the side panel.
 *
 * @remarks
 * The readout starts by saying that statistics are being calculated. Once
 * it has figures they stay on the page, unchanged, until others replace
 * them, so nothing flickers while newer ones are computed. Only
 * `showPending` and `showUnavailable` take them away.
 *
 * What changes is in a polite live region: a screen reader announces new
 * figures and the loss of them when it is next idle, without the focus
 * moving. Only the values that differ are rewritten, so only those are
 * announced. The note under the figures never changes and is outside the
 * region.
 *
 * @param panel - The panel to add the readout to, after what it holds.
 * @returns The readout.
 */
export const createStatsPanel = (panel: HTMLElement): StatsPanel => {
	const section = createElement('section', 'panel__section');
	const heading = createElement('h2', 'panel__heading');
	heading.textContent = 'Statistics';

	const region = createElement('div', 'stats');
	region.setAttribute('aria-live', 'polite');

	const status = createElement('p', 'stats__status');
	status.textContent = STATS_PENDING_TEXT;

	const list = createElement('dl', 'stats__list');
	const values = FIGURES.map(({ label }) => {
		const row = createElement('div', 'stats__row');
		const term = createElement('dt', 'stats__label');
		term.textContent = label;
		const value = createElement('dd', 'stats__value');
		row.append(term, value);
		list.append(row);
		return value;
	});

	const note = createElement('p', 'stats__note');
	note.textContent = STATS_NOTE_TEXT;
	note.hidden = true;

	region.append(status);
	section.append(heading, region, note);
	panel.append(section);

	/** Says something in place of the figures, with the note hidden. */
	const showStatus = (text: string): void => {
		status.textContent = text;
		if (status.parentNode !== region) {
			region.replaceChildren(status);
			note.hidden = true;
		}
	};

	return {
		element: section,
		show: (stats) => {
			statsFigures(stats).forEach((figure, index) => {
				const value = values[index];
				if (value !== undefined && value.textContent !== figure.value) {
					value.textContent = figure.value;
				}
			});
			if (list.parentNode !== region) {
				region.replaceChildren(list);
				note.hidden = false;
			}
		},
		showUnavailable: () => showStatus(STATS_UNAVAILABLE_TEXT),
		showPending: () => showStatus(STATS_PENDING_TEXT),
	};
};
