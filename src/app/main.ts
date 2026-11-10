import './styles.css';
import { CORE_VERSION, generateWorld, normaliseSeaLevel } from '../core/index';
import { attachViewInput } from './globe/input';
import { createGlobe, type Globe } from './globe/renderer';
import { parseStartOptions } from './startOptions';
import { createViewPanel } from './ui/viewPanel';

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
	attachViewInput(canvas, globe);
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
