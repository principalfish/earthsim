import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PRESSURE_LAYER,
	SCALAR_LAYERS,
	TEMPERATURE_LAYER,
} from '../scalarLayer';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { DEFAULT_PAGE_VIEW, type PageView } from '../view';
import {
	createLayerDock,
	DOCK_LAYERS_HEADING,
	DOCK_OVERLAYS_HEADING,
	GRID_TILE_LABEL,
	type LayerDockOptions,
	SUNLIGHT_TILE_LABEL,
	WINDS_TILE_LABEL,
} from './layerDock';

/** A key pressed on a tile, with whether the page's own use of it was stopped. */
const keyPress = (key: string, modifiers: { altKey?: boolean } = {}) => {
	const press = {
		key,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		...modifiers,
		prevented: false,
		preventDefault: () => {
			press.prevented = true;
		},
	};
	return press;
};

describe('createLayerDock', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** A dock on the view given, with the other options given. */
	const make = (
		view: Partial<PageView> = {},
		options: Partial<Pick<LayerDockOptions, 'layers' | 'gridVisible'>> = {},
	) => {
		const told: string[] = [];
		const dock = createLayerDock({
			...options,
			view: { ...DEFAULT_PAGE_VIEW, ...view },
			onLayer: (layer) => told.push(`layer ${layer}`),
			onWinds: (on) => told.push(`winds ${on}`),
			onSunlight: (on) => told.push(`sunlight ${on}`),
			onGrid: (visible) => told.push(`grid ${visible}`),
		});
		const element = dock.element as unknown as FakeElement;
		const [layerGroup, overlayGroup] = byClass(
			element,
			'layer-dock__tiles',
		) as [FakeElement, FakeElement];
		const layerTiles = byClass(layerGroup, 'layer-tile');
		const overlayTiles = byClass(overlayGroup, 'layer-tile');
		/** The name written on a tile. */
		const label = (tile: FakeElement): string | null =>
			oneByClass(tile, 'layer-tile__label').textContent;
		/** The tile of a name. */
		const tile = (name: string): FakeElement => {
			const found = [...layerTiles, ...overlayTiles].find(
				(each) => label(each) === name,
			);
			if (found === undefined) {
				throw new Error(`No tile ${name}`);
			}
			return found;
		};
		/** Which layer tiles are checked, by name. */
		const checked = (): (string | null)[] =>
			layerTiles
				.filter((each) => each.getAttribute('aria-checked') === 'true')
				.map(label);
		/** Whether each overlay tile is pressed, in order. */
		const pressed = (): (string | null)[] =>
			overlayTiles.map((each) => each.getAttribute('aria-pressed'));
		return {
			dock,
			told,
			element,
			layerGroup,
			overlayGroup,
			layerTiles,
			overlayTiles,
			label,
			tile,
			checked,
			pressed,
		};
	};

	it('makes Terrain’s tile then one for each computed layer in order, under Layers, then the Winds, Sunlight and Grid tiles under Overlays', () => {
		const { element, layerTiles, overlayTiles, label } = make();
		expect(
			byClass(element, 'layer-dock__heading').map(
				(heading) => heading.textContent,
			),
		).toEqual([DOCK_LAYERS_HEADING, DOCK_OVERLAYS_HEADING]);
		expect([DOCK_LAYERS_HEADING, DOCK_OVERLAYS_HEADING]).toEqual([
			'Layers',
			'Overlays',
		]);
		expect(layerTiles.map(label)).toEqual([
			'Terrain',
			...SCALAR_LAYERS.map((layer) => layer.label),
		]);
		expect(layerTiles.map(label)).toEqual([
			'Terrain',
			'Temperature',
			'Pressure',
		]);
		expect(overlayTiles.map(label)).toEqual([
			WINDS_TILE_LABEL,
			SUNLIGHT_TILE_LABEL,
			GRID_TILE_LABEL,
		]);
		expect(overlayTiles.map(label)).toEqual(['Winds', 'Sunlight', 'Grid']);
	});

	it('offers the computed layers it is given, in their order', () => {
		const { layerTiles, label } = make(
			{},
			{ layers: [PRESSURE_LAYER, TEMPERATURE_LAYER] },
		);
		expect(layerTiles.map(label)).toEqual([
			'Terrain',
			'Pressure',
			'Temperature',
		]);
	});

	it('makes the layer tiles one radio group and the overlay tiles a group, each named by its heading', () => {
		const { element, layerGroup, overlayGroup, layerTiles, overlayTiles } =
			make();
		const [layersHeading, overlaysHeading] = byClass(
			element,
			'layer-dock__heading',
		) as [FakeElement, FakeElement];
		expect(layerGroup.getAttribute('role')).toBe('radiogroup');
		expect(layerGroup.getAttribute('aria-labelledby')).toBe(layersHeading.id);
		expect(overlayGroup.getAttribute('role')).toBe('group');
		expect(overlayGroup.getAttribute('aria-labelledby')).toBe(
			overlaysHeading.id,
		);
		expect(layersHeading.id).not.toBe('');
		expect(overlaysHeading.id).not.toBe(layersHeading.id);
		for (const tile of layerTiles) {
			expect(tile.getAttribute('role')).toBe('radio');
			expect(tile.getAttribute('aria-pressed')).toBeNull();
		}
		for (const tile of overlayTiles) {
			expect(tile.getAttribute('role')).toBeNull();
			expect(tile.getAttribute('aria-checked')).toBeNull();
		}
	});

	it('makes every tile a button named by its label and its tooltip, with its icon hidden from screen readers, so that it keeps its name with the label unseen', () => {
		const { layerTiles, overlayTiles, label } = make();
		for (const tile of [...layerTiles, ...overlayTiles]) {
			expect(tile.tagName).toBe('BUTTON');
			expect(tile.type).toBe('button');
			const name = label(tile);
			expect(name).not.toBe('');
			expect(tile.title).toBe(name);
			const [icon, text, ...more] = tile.children as [FakeElement, FakeElement];
			expect(more).toEqual([]);
			expect(icon.tagName).toBe('SVG');
			expect(icon.getAttribute('aria-hidden')).toBe('true');
			// The label is the tile's only text, its accessible name however
			// the stylesheet hides it from the eye; nothing hides it from a
			// screen reader.
			expect(text.className).toBe('layer-tile__label');
			expect(text.getAttribute('aria-hidden')).toBeNull();
			expect(text.hidden).toBe(false);
		}
	});

	it('gives each tile the icon of what it stands for', () => {
		const { tile } = make();
		const icon = (name: string): string | null =>
			(tile(name).children[0] as FakeElement).getAttribute('class');
		expect(
			['Terrain', 'Temperature', 'Pressure', 'Winds', 'Sunlight', 'Grid'].map(
				icon,
			),
		).toEqual([
			'icon icon--terrain',
			'icon icon--temperature',
			'icon icon--pressure',
			'icon icon--winds',
			'icon icon--sunlight',
			'icon icon--grid',
		]);
	});

	it('starts on the layer given, its tile alone checked and alone reached with Tab', () => {
		const terrain = make();
		expect(terrain.checked()).toEqual(['Terrain']);
		expect(terrain.layerTiles.map((tile) => tile.tabIndex)).toEqual([
			0, -1, -1,
		]);
		const pressure = make({ layer: 'pressure' });
		expect(pressure.checked()).toEqual(['Pressure']);
		expect(pressure.layerTiles.map((tile) => tile.tabIndex)).toEqual([
			-1, -1, 0,
		]);
		expect(pressure.told).toEqual([]);
	});

	it('tells of the layer of a tile chosen and marks that tile alone', () => {
		const { tile, told, checked, layerTiles } = make();
		tile('Temperature').fire('click');
		expect(told).toEqual(['layer temperature']);
		expect(checked()).toEqual(['Temperature']);
		expect(layerTiles.map((each) => each.tabIndex)).toEqual([-1, 0, -1]);
		tile('Pressure').fire('click');
		tile('Terrain').fire('click');
		expect(told).toEqual([
			'layer temperature',
			'layer pressure',
			'layer terrain',
		]);
		expect(checked()).toEqual(['Terrain']);
	});

	it('tells nothing when the tile already chosen is chosen again', () => {
		const { tile, told, checked } = make({ layer: 'temperature' });
		tile('Temperature').fire('click');
		expect(told).toEqual([]);
		expect(checked()).toEqual(['Temperature']);
	});

	it('moves the choice to the next layer and back with the arrow keys, from the last to the first and back, taking the focus with it', () => {
		const { tile, told, checked } = make();
		const down = keyPress('ArrowDown');
		tile('Terrain').fire('keydown', down);
		expect(down.prevented).toBe(true);
		expect(checked()).toEqual(['Temperature']);
		expect(fake.document.activeElement).toBe(tile('Temperature'));
		tile('Temperature').fire('keydown', keyPress('ArrowRight'));
		expect(checked()).toEqual(['Pressure']);
		tile('Pressure').fire('keydown', keyPress('ArrowDown'));
		expect(checked()).toEqual(['Terrain']);
		expect(fake.document.activeElement).toBe(tile('Terrain'));
		tile('Terrain').fire('keydown', keyPress('ArrowUp'));
		expect(checked()).toEqual(['Pressure']);
		tile('Pressure').fire('keydown', keyPress('ArrowLeft'));
		expect(checked()).toEqual(['Temperature']);
		expect(told).toEqual([
			'layer temperature',
			'layer pressure',
			'layer terrain',
			'layer pressure',
			'layer temperature',
		]);
	});

	it('leaves other keys, and the arrows with Alt, Ctrl or Meta, to the page', () => {
		const { tile, told, checked } = make();
		const presses = [
			keyPress('Tab'),
			keyPress('a'),
			keyPress('ArrowDown', { altKey: true }),
			{ ...keyPress('ArrowDown'), ctrlKey: true },
			{ ...keyPress('ArrowDown'), metaKey: true },
		];
		for (const press of presses) {
			tile('Terrain').fire('keydown', press);
		}
		expect(presses.map((press) => press.prevented)).toEqual([
			false,
			false,
			false,
			false,
			false,
		]);
		expect(told).toEqual([]);
		expect(checked()).toEqual(['Terrain']);
	});

	it('starts each toggle as given: the winds and the sunlight from the view, the grid from its own option, each off when not given', () => {
		expect(make().pressed()).toEqual(['false', 'false', 'false']);
		expect(
			make({ winds: true, sunlight: true }, { gridVisible: true }).pressed(),
		).toEqual(['true', 'true', 'true']);
		expect(make({ sunlight: true }).pressed()).toEqual([
			'false',
			'true',
			'false',
		]);
	});

	it('tells of each press of a toggle with its new state, and shows it pressed or not', () => {
		const { tile, told, pressed } = make();
		tile('Winds').fire('click');
		expect(pressed()).toEqual(['true', 'false', 'false']);
		tile('Sunlight').fire('click');
		tile('Grid').fire('click');
		expect(pressed()).toEqual(['true', 'true', 'true']);
		tile('Winds').fire('click');
		tile('Sunlight').fire('click');
		tile('Grid').fire('click');
		expect(pressed()).toEqual(['false', 'false', 'false']);
		expect(told).toEqual([
			'winds true',
			'sunlight true',
			'grid true',
			'winds false',
			'sunlight false',
			'grid false',
		]);
	});

	it('shows a view as told, telling nothing and leaving the grid as it is', () => {
		const { dock, tile, told, checked, pressed, layerTiles } = make();
		tile('Grid').fire('click');
		told.length = 0;
		dock.showView({
			...DEFAULT_PAGE_VIEW,
			layer: 'pressure',
			winds: true,
			sunlight: true,
		});
		expect(checked()).toEqual(['Pressure']);
		expect(layerTiles.map((each) => each.tabIndex)).toEqual([-1, -1, 0]);
		expect(pressed()).toEqual(['true', 'true', 'true']);
		dock.showView(DEFAULT_PAGE_VIEW);
		expect(checked()).toEqual(['Terrain']);
		expect(pressed()).toEqual(['false', 'false', 'true']);
		expect(told).toEqual([]);
	});

	it('goes on from the view it was shown', () => {
		const { dock, tile, told, checked } = make();
		dock.showView({ ...DEFAULT_PAGE_VIEW, layer: 'temperature', winds: true });
		tile('Temperature').fire('click');
		expect(told).toEqual([]);
		tile('Temperature').fire('keydown', keyPress('ArrowDown'));
		expect(checked()).toEqual(['Pressure']);
		tile('Winds').fire('click');
		expect(told).toEqual(['layer pressure', 'winds false']);
	});
});
