/**
 * The dock: tiles down the left edge of the globe's area, each an icon over
 * its name, that choose what the globe shows. Under "Layers", what it is
 * coloured by, Terrain or one of the computed layers, one choice among
 * them; under "Overlays", what is drawn on top, Winds, Sunlight and the
 * cell grid, each switched on and off on its own.
 */

import { SCALAR_LAYERS, type ScalarLayerSpec } from '../../layers/scalarLayer';
import { type Layer, type PageView, TERRAIN_LABEL } from '../../layers/view';
import { createElement } from '../fields';
import {
	gridIcon,
	pressureIcon,
	sunlightIcon,
	temperatureIcon,
	terrainIcon,
	windsIcon,
} from '../icons';

/** The icon each layer's tile shows. */
const LAYER_ICONS: Readonly<Record<Layer, () => SVGSVGElement>> = {
	terrain: terrainIcon,
	temperature: temperatureIcon,
	pressure: pressureIcon,
};

/** The heading over the tiles that choose the layer. */
export const DOCK_LAYERS_HEADING = 'Layers';

/** The heading over the tiles that switch the overlays. */
export const DOCK_OVERLAYS_HEADING = 'Overlays';

/** The name of the tile that switches the winds. */
export const WINDS_TILE_LABEL = 'Winds';

/** The name of the tile that switches the sunlight. */
export const SUNLIGHT_TILE_LABEL = 'Sunlight';

/** The name of the tile that switches the cell grid. */
export const GRID_TILE_LABEL = 'Grid';

/** What the dock starts with and whom it tells of a choice. */
export type LayerDockOptions = {
	/**
	 * The computed layers offered, in the order their tiles follow Terrain's;
	 * {@link SCALAR_LAYERS} when left out.
	 */
	readonly layers?: readonly Pick<ScalarLayerSpec, 'id' | 'label'>[];
	/** The view settings shown at first. */
	readonly view: PageView;
	/** Called with the layer when another is chosen. */
	readonly onLayer: (layer: Layer) => void;
	/** Called with whether the winds are now to be shown. */
	readonly onWinds: (on: boolean) => void;
	/** Called with whether the globe is now to be lit by the sun. */
	readonly onSunlight: (on: boolean) => void;
	/** Called with whether the cell grid is now to be shown. */
	readonly onGrid: (visible: boolean) => void;
};

/** The dock on the page. */
export type LayerDock = {
	/** The dock, to put in its place over the globe. */
	readonly element: HTMLElement;
	/**
	 * Shows the view settings: the layer's tile as the one chosen, and the
	 * Winds, Sunlight and Grid tiles on or off as they say. Nothing is
	 * called back.
	 */
	showView(view: PageView): void;
};

/** How far each arrow key moves the choice of layer, in tiles. */
const ARROW_STEPS: Readonly<Record<string, number>> = {
	ArrowDown: 1,
	ArrowRight: 1,
	ArrowUp: -1,
	ArrowLeft: -1,
};

/** The ids of the headings that name the dock's two groups. */
const LAYERS_HEADING_ID = 'layer-dock-layers';
const OVERLAYS_HEADING_ID = 'layer-dock-overlays';

/**
 * A tile: a button holding an icon and the name it goes by, which is its
 * accessible name and its tooltip.
 */
const createTile = (label: string, icon: SVGSVGElement): HTMLButtonElement => {
	const tile = createElement('button', 'layer-tile');
	tile.type = 'button';
	tile.title = label;
	const name = createElement('span', 'layer-tile__label');
	name.textContent = label;
	tile.append(icon, name);
	return tile;
};

/** A group of tiles under its heading, named by it for a screen reader. */
const createGroup = (
	headingId: string,
	heading: string,
	role: 'radiogroup' | 'group',
	tiles: readonly HTMLButtonElement[],
): HTMLElement => {
	const group = createElement('div', 'layer-dock__group');
	const title = createElement('div', 'layer-dock__heading');
	title.id = headingId;
	title.textContent = heading;
	const list = createElement('div', 'layer-dock__tiles');
	list.setAttribute('role', role);
	list.setAttribute('aria-labelledby', headingId);
	list.append(...tiles);
	group.append(title, list);
	return group;
};

/**
 * Creates the dock, on the layer and with the overlays given.
 *
 * @remarks
 * The layer tiles are one radio group: each tile is a button with the
 * radio role, the chosen one checked, and only it reached with Tab, so
 * the group is one tab stop. The arrow keys move the choice to the next
 * tile or the one before, from the last to the first and back, as a radio
 * group does; a click, Space or Enter chooses the tile pressed. Choosing
 * the tile already chosen tells nothing.
 *
 * The overlay tiles are toggle buttons, each pressed while what it shows
 * is on, and pressed or released with a click, Space or Enter. All three
 * also follow {@link LayerDock.showView}.
 *
 * Each tile's name is written under its icon, and is the tile's
 * accessible name whether or not the stylesheet shows it, as in a narrow
 * window it does not; the icons are hidden from screen readers.
 *
 * @param options - The layers offered, the starting state and whom to
 * tell of a choice.
 * @returns The dock, with its element not yet on the page.
 */
export const createLayerDock = (options: LayerDockOptions): LayerDock => {
	const layers: readonly { readonly id: Layer; readonly label: string }[] = [
		{ id: 'terrain', label: TERRAIN_LABEL },
		...(options.layers ?? SCALAR_LAYERS),
	];
	let layer = options.view.layer;

	const layerTiles = layers.map(({ id, label }) => {
		const tile = createTile(label, LAYER_ICONS[id]());
		tile.setAttribute('role', 'radio');
		return { id, tile };
	});
	/** Marks the layer's tile chosen, and it alone reached with Tab. */
	const markLayer = (): void => {
		const chosen = layerTiles.some(({ id }) => id === layer);
		layerTiles.forEach(({ id, tile }, index) => {
			const checked = id === layer;
			tile.setAttribute('aria-checked', String(checked));
			// With no tile chosen the group is still reached, at its first.
			tile.tabIndex = checked || (!chosen && index === 0) ? 0 : -1;
		});
	};
	const choose = (next: Layer): void => {
		if (next === layer) {
			return;
		}
		layer = next;
		markLayer();
		options.onLayer(next);
	};
	layerTiles.forEach(({ id, tile }, index) => {
		tile.addEventListener('click', () => choose(id));
		tile.addEventListener('keydown', (event: KeyboardEvent) => {
			const step = ARROW_STEPS[event.key];
			if (
				step === undefined ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey
			) {
				return;
			}
			event.preventDefault();
			const count = layerTiles.length;
			const next = layerTiles[(index + step + count) % count];
			if (next !== undefined) {
				choose(next.id);
				next.tile.focus();
			}
		});
	});
	markLayer();

	/** A toggle tile, pressed or not, telling of each press. */
	const createToggle = (
		label: string,
		icon: SVGSVGElement,
		pressed: boolean,
		onChange: (on: boolean) => void,
	) => {
		const tile = createTile(label, icon);
		let on = pressed;
		const show = (next: boolean): void => {
			on = next;
			tile.setAttribute('aria-pressed', String(on));
		};
		show(pressed);
		tile.addEventListener('click', () => {
			show(!on);
			onChange(on);
		});
		return { tile, show };
	};
	const winds = createToggle(
		WINDS_TILE_LABEL,
		windsIcon(),
		options.view.winds,
		options.onWinds,
	);
	const sunlight = createToggle(
		SUNLIGHT_TILE_LABEL,
		sunlightIcon(),
		options.view.sunlight,
		options.onSunlight,
	);
	const grid = createToggle(
		GRID_TILE_LABEL,
		gridIcon(),
		options.view.grid,
		options.onGrid,
	);

	const element = createElement('div', 'layer-dock');
	element.append(
		createGroup(
			LAYERS_HEADING_ID,
			DOCK_LAYERS_HEADING,
			'radiogroup',
			layerTiles.map(({ tile }) => tile),
		),
		createGroup(OVERLAYS_HEADING_ID, DOCK_OVERLAYS_HEADING, 'group', [
			winds.tile,
			sunlight.tile,
			grid.tile,
		]),
	);
	return {
		element,
		showView: (view) => {
			layer = view.layer;
			markLayer();
			winds.show(view.winds);
			sunlight.show(view.sunlight);
			grid.show(view.grid);
		},
	};
};
