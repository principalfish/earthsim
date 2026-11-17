/**
 * The top bar: along the top of the globe's area, beside the dock, what of
 * the layer on screen is shown. While a computed layer is on screen, its
 * Show choice, of the views of its year it offers; and on the measured
 * Earth, the one comparison control, where the layer on screen and the
 * winds come from.
 */

import { SCALAR_LAYERS, type ScalarLayerSpec } from '../layers/scalarLayer';
import type { PageView, ScalarLayerId, Source, Summary } from '../layers/view';
import { type ComparisonContent, createComparisonControls } from './comparison';
import { createElement, createSelectField } from './fields';

/** The label of each layer's Show choice. */
export const SHOW_LABEL = 'Show';

/** What the top bar starts with and whom it tells of a choice. */
export type TopBarOptions = {
	/**
	 * The computed layers offered, each with a Show choice of its own;
	 * {@link SCALAR_LAYERS} when left out.
	 */
	readonly layers?: readonly Pick<
		ScalarLayerSpec,
		'id' | 'summaries' | 'summaryControlId'
	>[];
	/** The view settings shown at first. */
	readonly view: PageView;
	/** Called with a layer and the view of its year chosen for it. */
	readonly onSummary: (layer: ScalarLayerId, summary: Summary) => void;
	/** Called with the source chosen on the comparison control. */
	readonly onSource: (source: Source) => void;
};

/** The top bar on the page. */
export type TopBar = {
	/** The bar, to put in its place over the globe. */
	readonly element: HTMLElement;
	/**
	 * Shows the view settings: the Show choice of the layer on screen alone,
	 * none in Terrain view, each on the view of its year the settings give.
	 * Nothing is called back.
	 */
	showView(view: PageView): void;
	/**
	 * Shows the comparison control as given, or hides it when nothing is
	 * offered. Nothing is called back.
	 */
	showComparison(content: ComparisonContent): void;
};

/**
 * Creates the top bar, on the view given, with the comparison control
 * hidden.
 *
 * @remarks
 * Each layer's Show choice is a labelled drop-down of the views of its
 * year it offers, with the id its description gives; after them all comes
 * the comparison control of {@link createComparisonControls}. The bar is
 * hidden while it shows nothing, as in Terrain view off the measured
 * Earth.
 *
 * @param options - The layers offered, the starting view settings and whom
 * to tell of a choice.
 * @returns The bar, with its element not yet on the page.
 */
export const createTopBar = (options: TopBarOptions): TopBar => {
	const element = createElement('div', 'top-bar');
	const shows = (options.layers ?? SCALAR_LAYERS).map((layer) => {
		const field = createSelectField({
			id: layer.summaryControlId,
			label: SHOW_LABEL,
			choices: layer.summaries.map(({ id, label }) => ({ value: id, label })),
			value: options.view.summaries[layer.id],
			onChange: (summary) => options.onSummary(layer.id, summary),
		});
		field.classList.add('top-bar__show');
		element.append(field);
		const select = [...field.children].find(
			(child): child is HTMLSelectElement => child.tagName === 'SELECT',
		);
		if (select === undefined) {
			throw new Error('A select field has no select');
		}
		return { id: layer.id, field, select };
	});
	const comparison = createComparisonControls(element, {
		source: options.view.source,
		onSource: options.onSource,
	});
	/** Hides the bar while neither a Show choice nor the comparison shows. */
	const hideIfEmpty = (): void => {
		element.hidden =
			comparison.element.hidden && shows.every(({ field }) => field.hidden);
	};

	const showView = (view: PageView): void => {
		for (const { id, field, select } of shows) {
			field.hidden = id !== view.layer;
			select.value = view.summaries[id];
		}
		hideIfEmpty();
	};
	showView(options.view);
	return {
		element,
		showView,
		showComparison: (content) => {
			comparison.show(content);
			hideIfEmpty();
		},
	};
};
