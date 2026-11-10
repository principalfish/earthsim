import './styles.css';
import { CORE_VERSION, generateWorld, normaliseSeaLevel } from '../core/index';
import { attachViewInput } from './globe/input';
import { createGlobe, type Globe } from './globe/renderer';
import {
	createSculptController,
	DEFAULT_TOOL,
	rotateButtonFor,
} from './sculpt';
import { parseStartOptions } from './startOptions';
import { createToolPanel } from './ui/toolPanel';
import { createViewPanel } from './ui/viewPanel';
import { createUndoController, handleHistoryKey } from './undo';

/** Looks up an element the page markup is required to contain. */
const requireElement = <T extends Element>(
	selector: string,
	type: new () => T,
): T => {
	const element = document.querySelector(selector);
	if (!(element instanceof type)) {
		throw new Error(`index.html is missing the ${selector} element`);
	}
	return element;
};

/** Replaces the globe with a message saying why it cannot be shown. */
const showFailure = (canvas: HTMLCanvasElement, reason: string): void => {
	const message = document.createElement('p');
	message.className = 'viewport__message';
	message.setAttribute('role', 'alert');
	message.textContent = reason;
	canvas.replaceWith(message);
};

const canvas = requireElement('#globe', HTMLCanvasElement);
const panel = requireElement('#panel', HTMLElement);

document.documentElement.dataset.coreVersion = CORE_VERSION;

/** Creates the globe, or explains on the page why there cannot be one. */
const createGlobeOrExplain = (): Globe | null => {
	try {
		return createGlobe(canvas);
	} catch (error) {
		console.error(error);
		showFailure(
			canvas,
			'The globe cannot be shown because this browser or device does not provide WebGL 2. Try a current desktop Chrome or Firefox with hardware acceleration turned on.',
		);
		return null;
	}
};

const globe = createGlobeOrExplain();
if (globe !== null) {
	const world = generateWorld(parseStartOptions(window.location.search));
	globe.setWorld(world);
	const viewInput = attachViewInput(
		canvas,
		globe,
		rotateButtonFor(DEFAULT_TOOL),
	);
	// The history is cleared from the sculpt controller's own hook, so that
	// replacing the world through `sculpt.setWorld` can never leave the
	// strokes of the old one to be undone on the new.
	const sculpt = createSculptController(globe, world, {
		canvas,
		onStrokeEnd: (changes) => edits.commit(changes),
		onWorldChange: (next) => edits.setWorld(next),
	});
	const tools = createToolPanel(panel, {
		onHistory: (action) => edits.perform(action),
		onTool: (tool) => {
			// The button that turns the globe changes first, so that a
			// drag never both turns it and sculpts.
			viewInput.setRotateButton(rotateButtonFor(tool));
			sculpt.setTool(tool);
		},
		onRadius: sculpt.setRadiusKm,
		onStrength: sculpt.setStrength,
		onSmoothSetting: sculpt.setSmoothSetting,
	});
	const edits = createUndoController({
		world,
		globe,
		isStrokeActive: sculpt.isStrokeActive,
		onHistoryChange: tools.setHistoryState,
	});
	window.addEventListener('keydown', (event) =>
		handleHistoryKey(event, edits.perform),
	);
	createViewPanel(panel, {
		seaLevel: world.seaLevel,
		onExaggeration: globe.setExaggeration,
		onSeaLevel: (metres) => {
			world.seaLevel = normaliseSeaLevel(metres);
			globe.setSeaLevel(world.seaLevel);
		},
		onGridVisible: globe.setGridVisible,
	});
}
