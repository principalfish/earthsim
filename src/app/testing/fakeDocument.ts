/**
 * A stand-in for the few parts of the document the panels are built with,
 * for the tests of what they build: elements that hold their properties,
 * classes, attributes and children, and send the events a test fires.
 *
 * Nothing on the page imports this module.
 */

/** An element of the stand-in document. */
export type FakeElement = {
	readonly tagName: string;
	className: string;
	readonly classList: {
		add(name: string): void;
		remove(name: string): void;
		toggle(name: string, force?: boolean): boolean;
		contains(name: string): boolean;
	};
	textContent: string | null;
	hidden: boolean;
	id: string;
	type: string;
	name: string;
	value: string | number;
	checked: boolean;
	disabled: boolean;
	min: string;
	max: string | number;
	step: string;
	title: string;
	/** For a label, the `id` it is for; for an output, its token list. */
	htmlFor: string | { add(id: string): void };
	readonly valueAsNumber: number;
	readonly style: Record<string, string>;
	readonly children: FakeElement[];
	parentNode: FakeElement | null;
	setAttribute(name: string, value: string): void;
	getAttribute(name: string): string | null;
	removeAttribute(name: string): void;
	append(...children: FakeElement[]): void;
	replaceChildren(...children: FakeElement[]): void;
	addEventListener(type: string, listener: () => void): void;
	focus(): void;
	/** Sends the element an event of a type, as the browser would. */
	fire(type: string): void;
};

/** The stand-in document and what tests ask of it. */
export type FakeDocument = {
	/** The stand-in, as the document it stands for. */
	readonly document: Document;
	/** Makes an element, as the page does, to put things in. */
	createElement(tag: string): FakeElement;
	/**
	 * Picks a radio button as a click on it does: it is checked, the others
	 * of its group are cleared, and it alone is sent `change`.
	 */
	pick(radio: FakeElement): void;
};

const createFakeElement = (
	tag: string,
	all: FakeElement[],
	onFocus: (element: FakeElement) => void,
): FakeElement => {
	const attributes = new Map<string, string>();
	const listeners = new Map<string, (() => void)[]>();
	let text: string | null = '';
	let value: string | number = '';
	const classes = (): string[] =>
		element.className.split(/\s+/).filter((name) => name !== '');
	const element: FakeElement = {
		tagName: tag.toUpperCase(),
		className: '',
		classList: {
			add: (name) => {
				if (!classes().includes(name)) {
					element.className = [...classes(), name].join(' ');
				}
			},
			remove: (name) => {
				element.className = classes()
					.filter((other) => other !== name)
					.join(' ');
			},
			toggle: (name, force) => {
				const on = force ?? !classes().includes(name);
				if (on) {
					element.classList.add(name);
				} else {
					element.classList.remove(name);
				}
				return on;
			},
			contains: (name) => classes().includes(name),
		},
		get textContent() {
			return text;
		},
		set textContent(next) {
			text = next;
			element.children.length = 0;
		},
		hidden: false,
		id: '',
		type: '',
		name: '',
		get value() {
			return value;
		},
		set value(next) {
			value = next;
			attributes.set('value', String(next));
		},
		checked: false,
		disabled: false,
		min: '',
		max: '',
		step: '',
		title: '',
		htmlFor: { add: () => {} },
		get valueAsNumber() {
			return Number(value);
		},
		style: {},
		children: [],
		parentNode: null,
		setAttribute: (name, next) => {
			attributes.set(name, next);
		},
		getAttribute: (name) => attributes.get(name) ?? null,
		removeAttribute: (name) => {
			attributes.delete(name);
		},
		append: (...children) => {
			for (const child of children) {
				child.parentNode = element;
				element.children.push(child);
			}
		},
		replaceChildren: (...children) => {
			for (const child of element.children) {
				child.parentNode = null;
			}
			element.children.length = 0;
			element.append(...children);
		},
		addEventListener: (type, listener) => {
			listeners.set(type, [...(listeners.get(type) ?? []), listener]);
		},
		focus: () => onFocus(element),
		fire: (type) => {
			for (const listener of listeners.get(type) ?? []) {
				listener();
			}
		},
	};
	all.push(element);
	return element;
};

/**
 * Makes a stand-in document.
 *
 * @returns The document, with nothing focused, and what tests ask of it.
 */
export const createFakeDocument = (): FakeDocument => {
	const all: FakeElement[] = [];
	let focused: FakeElement | null = null;
	const createElement = (tag: string): FakeElement =>
		createFakeElement(tag, all, (element) => {
			focused = element;
		});
	const document = {
		createElement,
		// Elements of another namespace, such as SVG's, are made as any other.
		createElementNS: (_namespace: string, tag: string) => createElement(tag),
		get activeElement() {
			return focused;
		},
	} as unknown as Document;
	return {
		document,
		createElement,
		pick: (radio) => {
			for (const other of all) {
				if (other.type === 'radio' && other.name === radio.name) {
					other.checked = other === radio;
				}
			}
			radio.fire('change');
		},
	};
};

/**
 * Every element under one, itself included, that passes a test, in
 * document order.
 */
export const findAll = (
	root: FakeElement,
	test: (element: FakeElement) => boolean,
): FakeElement[] => [
	...(test(root) ? [root] : []),
	...root.children.flatMap((child) => findAll(child, test)),
];

/** Every element under one, itself included, that carries a class. */
export const byClass = (root: FakeElement, name: string): FakeElement[] =>
	findAll(root, (element) => element.classList.contains(name));

/** The one element under another that carries a class. */
export const oneByClass = (root: FakeElement, name: string): FakeElement => {
	const [found, ...more] = byClass(root, name);
	if (found === undefined || more.length > 0) {
		throw new Error(
			`Expected one element with the class ${name}; found ${more.length + (found === undefined ? 0 : 1)}`,
		);
	}
	return found;
};
