import './styles.css';
import { CORE_VERSION } from '../core/index';

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

requireElement('#globe', HTMLCanvasElement);
requireElement('#panel', HTMLElement);

document.documentElement.dataset.coreVersion = CORE_VERSION;
