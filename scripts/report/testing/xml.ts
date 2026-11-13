/**
 * A small, strict XML reader for the tests of the wind report's drawings:
 * it reads elements, attributes and text, and throws at anything that is
 * not well-formed.
 *
 * It reads only what the drawings use: no doctype, no processing
 * instructions, comments or CDATA sections, and only the five named
 * entities and numeric character references.
 */

/** An element, with its attributes and the elements within it. */
export type XmlElement = {
	readonly name: string;
	readonly attributes: ReadonlyMap<string, string>;
	readonly children: readonly XmlElement[];
	/** The text directly within the element, entities replaced. */
	readonly text: string;
};

const NAME = /^[A-Za-z_][\w.:-]*/;

const ENTITIES: Readonly<Record<string, string>> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
};

/** Text with its entities replaced; throws at a bare `&` or `<`. */
const replaceEntities = (text: string, where: number): string => {
	if (text.includes('<')) {
		throw new Error(`A bare < at ${where}`);
	}
	return text.replace(/&([^;]*);?/g, (whole, body: string) => {
		if (!whole.endsWith(';')) {
			throw new Error(`A bare & at ${where}`);
		}
		const named = ENTITIES[body];
		if (named !== undefined) {
			return named;
		}
		const number = /^#(\d+)$/.exec(body) ?? /^#x([0-9a-fA-F]+)$/.exec(body);
		if (number === null) {
			throw new Error(`An unknown entity &${body}; at ${where}`);
		}
		return String.fromCodePoint(
			Number.parseInt(number[1] as string, body.startsWith('#x') ? 16 : 10),
		);
	});
};

/**
 * Reads a well-formed XML document of a single root element.
 *
 * @param source - The document.
 * @returns The root element.
 * @throws Error at the first thing that is not well-formed: an unclosed or
 * mismatched tag, a repeated or unquoted attribute, a bare `<` or `&`, or
 * anything but white space around the root.
 */
export const parseXml = (source: string): XmlElement => {
	type Open = {
		name: string;
		attributes: Map<string, string>;
		children: XmlElement[];
		text: string;
	};
	const stack: Open[] = [];
	let root: XmlElement | null = null;
	let position = 0;
	while (position < source.length) {
		const next = source.indexOf('<', position);
		const text = source.slice(position, next < 0 ? source.length : next);
		const current = stack[stack.length - 1];
		if (current === undefined) {
			if (text.trim() !== '') {
				throw new Error(`Text outside the root at ${position}`);
			}
		} else {
			current.text += replaceEntities(text, position);
		}
		if (next < 0) {
			break;
		}
		position = next + 1;
		if (source[position] === '/') {
			const match = NAME.exec(source.slice(position + 1));
			const close = source.indexOf('>', position);
			if (match === null || close < 0) {
				throw new Error(`A broken closing tag at ${position}`);
			}
			if (source.slice(position + 1 + match[0].length, close).trim() !== '') {
				throw new Error(`Something after a closing tag's name at ${position}`);
			}
			const open = stack.pop();
			if (open === undefined || open.name !== match[0]) {
				throw new Error(
					`</${match[0]}> at ${position} closes ${open?.name ?? 'nothing'}`,
				);
			}
			const element: XmlElement = open;
			const parent = stack[stack.length - 1];
			if (parent === undefined) {
				if (root !== null) {
					throw new Error('A second root element');
				}
				root = element;
			} else {
				parent.children.push(element);
			}
			position = close + 1;
			continue;
		}
		const match = NAME.exec(source.slice(position));
		if (match === null) {
			throw new Error(`A bare < at ${position - 1}`);
		}
		const element: Open = {
			name: match[0],
			attributes: new Map(),
			children: [],
			text: '',
		};
		position += match[0].length;
		for (;;) {
			const space = /^\s*/.exec(source.slice(position))?.[0] ?? '';
			position += space.length;
			if (source.startsWith('/>', position)) {
				position += 2;
				const parent = stack[stack.length - 1];
				if (parent === undefined) {
					if (root !== null) {
						throw new Error('A second root element');
					}
					root = element;
				} else {
					parent.children.push(element);
				}
				break;
			}
			if (source[position] === '>') {
				position += 1;
				stack.push(element);
				break;
			}
			if (space === '') {
				throw new Error(`No space before an attribute at ${position}`);
			}
			const attribute =
				/^([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(
					source.slice(position),
				);
			if (attribute === null) {
				throw new Error(`A broken attribute at ${position}`);
			}
			const name = attribute[1] as string;
			if (element.attributes.has(name)) {
				throw new Error(`The attribute ${name} twice at ${position}`);
			}
			element.attributes.set(
				name,
				replaceEntities(attribute[2] ?? attribute[3] ?? '', position),
			);
			position += attribute[0].length;
		}
	}
	if (stack.length > 0) {
		throw new Error(`<${stack[stack.length - 1]?.name}> is never closed`);
	}
	if (root === null) {
		throw new Error('No root element');
	}
	return root;
};

/** Every element within an element, itself first, in document order. */
export const allElements = (element: XmlElement): XmlElement[] => [
	element,
	...element.children.flatMap(allElements),
];
