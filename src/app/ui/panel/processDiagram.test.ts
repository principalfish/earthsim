import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	byClass,
	createFakeDocument,
	type FakeElement,
	findAll,
	oneByClass,
} from '../../testing/fakeDocument';
import {
	createProcessDiagram,
	DIAGRAM_DESCRIPTION,
	DIAGRAM_HEIGHT,
	DIAGRAM_INTRO,
	DIAGRAM_STATUS,
	DIAGRAM_WIDTH,
} from './processDiagram';

// The designed drawing, written out again here and not read from the data the
// diagram is built from, so that a box, arrow or label that moves, changes or
// goes missing is caught. The page is 842 units wide with `y` counted up from
// its foot. Each box is [id, x, y, width, height, lines, kind]. The first
// line of a box is in the strong voice and the rest in the quiet one, but
// for the sea ice box, whose two lines are one name.
type ExpectedBox = readonly [
	string,
	number,
	number,
	number,
	number,
	readonly string[],
	'input' | 'loop' | 'downstream',
];

const EXPECTED_BOXES: readonly ExpectedBox[] = [
	['star', 150, 492, 220, 30, ['Star, orbit, tilt, day length'], 'input'],
	['terrain', 400, 492, 160, 30, ['Terrain and sea level'], 'input'],
	['temperature', 60, 330, 130, 50, ['Temperature', 'twelve months'], 'loop'],
	['pressure', 240, 335, 100, 40, ['Pressure'], 'loop'],
	['winds', 370, 335, 90, 40, ['Winds'], 'loop'],
	['currents', 490, 335, 95, 40, ['Ocean currents'], 'loop'],
	['ice', 60, 265, 130, 40, ['Sea ice and', 'snow cover'], 'loop'],
	[
		'rain',
		150,
		180,
		180,
		40,
		['Rain and snowfall', 'from winds and temperature'],
		'downstream',
	],
	[
		'storms',
		400,
		180,
		180,
		40,
		['Storm zones', 'from sea temperature and winds'],
		'downstream',
	],
	[
		'climate',
		160,
		110,
		160,
		40,
		['Climate zones', 'from temperature and rain'],
		'downstream',
	],
	[
		'biomes',
		360,
		110,
		160,
		40,
		['Biome map', 'from temperature and rain'],
		'downstream',
	],
];

// Each arrow as [id, kind, corners], the corners as designed.
const EXPECTED_ARROWS: readonly (readonly [
	string,
	'forward' | 'feedback',
	readonly (readonly [number, number])[],
])[] = [
	[
		'star>loop',
		'forward',
		[
			[260, 492],
			[260, 472],
		],
	],
	[
		'terrain>loop',
		'forward',
		[
			[480, 492],
			[480, 472],
		],
	],
	[
		'temperature>pressure',
		'forward',
		[
			[190, 355],
			[240, 355],
		],
	],
	[
		'pressure>winds',
		'forward',
		[
			[340, 355],
			[370, 355],
		],
	],
	[
		'winds>currents',
		'forward',
		[
			[460, 355],
			[490, 355],
		],
	],
	[
		'temperature>ice',
		'forward',
		[
			[100, 330],
			[100, 305],
		],
	],
	[
		'winds>temperature',
		'feedback',
		[
			[415, 375],
			[415, 404],
			[150, 404],
			[150, 380],
		],
	],
	[
		'currents>temperature',
		'feedback',
		[
			[537, 375],
			[537, 430],
			[100, 430],
			[100, 380],
		],
	],
	[
		'ice>temperature',
		'feedback',
		[
			[150, 305],
			[150, 330],
		],
	],
	[
		'settled>rain',
		'forward',
		[
			[240, 236],
			[240, 220],
		],
	],
	[
		'settled>storms',
		'forward',
		[
			[490, 236],
			[490, 220],
		],
	],
	[
		'rain>climate',
		'forward',
		[
			[240, 180],
			[240, 150],
		],
	],
	[
		'climate>biomes',
		'forward',
		[
			[320, 130],
			[360, 130],
		],
	],
	[
		'legend-forward',
		'forward',
		[
			[40, 78],
			[76, 78],
		],
	],
	[
		'legend-feedback',
		'feedback',
		[
			[190, 78],
			[226, 78],
		],
	],
];

// Every piece of free text of the page as [text, x, y, tone, size, bold,
// centred]: its left or middle and its baseline, `y` counted up from the
// page's foot, and how it is set.
type ExpectedText = readonly [
	string,
	number,
	number,
	'muted' | 'ink' | 'loop' | 'feedback' | 'downstream',
	number,
	boolean,
	boolean,
];

const EXPECTED_TEXTS: readonly ExpectedText[] = [
	['THE LOOP', 54, 453, 'loop', 10.5, true, false],
	[
		'repeats until the temperature stops changing',
		112,
		453,
		'loop',
		9.5,
		false,
		false,
	],
	['heat carried by winds', 282, 408, 'feedback', 8.5, false, true],
	['heat carried by currents', 318, 434, 'feedback', 8.5, false, true],
	['Ice and snow form where it is cold.', 200, 321, 'muted', 8.5, false, false],
	[
		'They reflect sunlight, which cools it further.',
		200,
		310,
		'feedback',
		8.5,
		false,
		false,
	],
	[
		'Sea ice and snow cover do not drive the currents;',
		200,
		285,
		'muted',
		8,
		false,
		false,
	],
	['they act on the temperature only.', 200, 275, 'muted', 8, false, false],
	['the settled state', 328, 241, 'ink', 9, true, false],
	['feeds the next step', 82, 75, 'muted', 8.5, false, false],
	['feeds back into the temperature', 232, 75, 'feedback', 8.5, false, false],
	['Layers you can view', 632, 453, 'ink', 10.5, true, false],
	['From the loop', 632, 436, 'loop', 9, true, false],
	['Temperature', 640, 424, 'ink', 8.5, false, false],
	['Pressure', 640, 413, 'ink', 8.5, false, false],
	['Winds', 640, 402, 'ink', 8.5, false, false],
	['Ocean currents', 640, 391, 'ink', 8.5, false, false],
	['Sea ice', 640, 380, 'ink', 8.5, false, false],
	['Downstream', 726, 436, 'downstream', 9, true, false],
	['Rainfall', 734, 424, 'ink', 8.5, false, false],
	['Climate zones', 734, 413, 'ink', 8.5, false, false],
	['Storm zones', 734, 402, 'ink', 8.5, false, false],
	['Biomes', 734, 391, 'ink', 8.5, false, false],
	['Outside the loop,', 632, 293, 'ink', 10.5, true, false],
	['stepping through time', 632, 280, 'ink', 10.5, true, false],
	['Ice sheets grow over thousands', 632, 263, 'muted', 8.5, false, false],
	['of years. Plates move over', 632, 252, 'muted', 8.5, false, false],
	['millions.', 632, 241, 'muted', 8.5, false, false],
	['They change the terrain and the', 632, 219, 'muted', 8.5, false, false],
	['ice cover, and the loop is then', 632, 208, 'muted', 8.5, false, false],
	['run again as a snapshot.', 632, 197, 'muted', 8.5, false, false],
];

/** A page `y` as the drawing writes it, turned over. */
const flipped = (y: number): number => 530 - y;

describe('createProcessDiagram', () => {
	let root: FakeElement;
	beforeEach(() => {
		const fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
		root = createProcessDiagram() as unknown as FakeElement;
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const attr = (element: FakeElement, name: string): string =>
		element.getAttribute(name) ?? '';
	const nodes = (): FakeElement[] =>
		findAll(root, (element) => element.getAttribute('data-node') !== null);
	const node = (id: string): FakeElement =>
		nodes().find((element) => attr(element, 'data-node') === id) as FakeElement;
	const edges = (): FakeElement[] =>
		findAll(root, (element) => element.getAttribute('data-edge') !== null);
	const textsIn = (element: FakeElement): FakeElement[] =>
		findAll(element, (inner) => inner.tagName === 'TEXT');

	it('draws a box for each box of the page, where it stood, with its lines', () => {
		const boxes = nodes().filter(
			(element) => attr(element, 'data-node') !== 'loop',
		);
		expect(boxes.map((box) => attr(box, 'data-node'))).toEqual(
			EXPECTED_BOXES.map(([id]) => id),
		);
		for (const [id, x, y, width, height, lines, kind] of EXPECTED_BOXES) {
			const box = node(id);
			const [rect] = findAll(box, (inner) => inner.tagName === 'RECT');
			expect(
				[
					rect?.getAttribute('x'),
					rect?.getAttribute('y'),
					rect?.getAttribute('width'),
					rect?.getAttribute('height'),
				],
				id,
			).toEqual([x, flipped(y + height), width, height].map(String));
			expect(
				textsIn(box).map((line) => line.textContent),
				id,
			).toEqual([...lines]);
			expect(attr(box, 'class'), id).toContain(`process-diagram__box--${kind}`);
			textsIn(box).forEach((line, index) => {
				const strong = id === 'ice' || index === 0;
				expect(attr(line, 'class'), `${id} ${index}`).toBe(
					strong
						? 'process-diagram__text process-diagram__text--ink process-diagram__text--bold'
						: 'process-diagram__text process-diagram__text--muted',
				);
				expect(attr(line, 'font-size'), `${id} ${index}`).toBe(
					strong ? '9.5' : '8.5',
				);
				expect(attr(line, 'text-anchor'), `${id} ${index}`).toBe('middle');
			});
		}
	});

	it('draws the loop as a frame round the temperature, pressure, winds, currents and ice', () => {
		const loop = node('loop');
		const [rect] = findAll(loop, (inner) => inner.tagName === 'RECT');
		expect(
			['x', 'y', 'width', 'height'].map((name) => rect?.getAttribute(name)),
		).toEqual(['40', String(flipped(250 + 220)), '560', '220']);
	});

	it('draws an arrow for each arrow of the page, through the same corners, with the same kind', () => {
		expect(
			edges()
				.map((edge) => attr(edge, 'data-edge'))
				.sort(),
		).toEqual(EXPECTED_ARROWS.map(([id]) => id).sort());
		for (const [id, kind, corners] of EXPECTED_ARROWS) {
			const edge = edges().find(
				(element) => attr(element, 'data-edge') === id,
			) as FakeElement;
			expect(attr(edge, 'class'), id).toContain(
				`process-diagram__arrow--${kind}`,
			);
			const [path] = findAll(edge, (inner) => inner.tagName === 'PATH');
			expect(path?.getAttribute('d'), id).toBe(
				corners
					.map(
						([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${flipped(y)}`,
					)
					.join(' '),
			);
			expect(path?.getAttribute('marker-end'), id).toBe(
				`url(#process-diagram-head-${kind})`,
			);
		}
	});

	it('draws the trunk and bar that take the settled state to the two boxes below it', () => {
		const lines = findAll(
			root,
			(element) => element.getAttribute('data-line') !== null,
		);
		expect(
			lines.map((line) => [
				attr(line, 'data-line'),
				findAll(line, (inner) => inner.tagName === 'PATH')[0]?.getAttribute(
					'd',
				),
			]),
		).toEqual([
			['settled-trunk', `M320 ${flipped(250)} L320 ${flipped(236)}`],
			['settled-bar', `M240 ${flipped(236)} L490 ${flipped(236)}`],
		]);
	});

	it('defines a head for each kind of arrow', () => {
		const heads = findAll(root, (element) => element.tagName === 'MARKER');
		expect(heads.map((head) => head.getAttribute('id'))).toEqual([
			'process-diagram-head-forward',
			'process-diagram-head-feedback',
		]);
		expect(heads.map((head) => attr(head, 'class'))).toEqual([
			'process-diagram__head process-diagram__head--forward',
			'process-diagram__head process-diagram__head--feedback',
		]);
		for (const head of heads) {
			expect(findAll(head, (inner) => inner.tagName === 'PATH')).toHaveLength(
				1,
			);
		}
	});

	it('writes every label of the page where it stood', () => {
		const found = findAll(
			root,
			(element) =>
				element.tagName === 'TEXT' &&
				!findAll(root, (box) => box.getAttribute('data-node') !== null).some(
					(box) => box.children.includes(element),
				),
		).map((label) => [
			label.textContent,
			Number(label.getAttribute('x')),
			Number(label.getAttribute('y')),
		]);
		expect(found.length).toBe(EXPECTED_TEXTS.length);
		for (const [text, x, y] of EXPECTED_TEXTS) {
			expect(found, text).toContainEqual([text, x, flipped(y)]);
		}
	});

	it('sets every label as the page did: its tone, size, weight and centring', () => {
		const labels = findAll(
			root,
			(element) =>
				element.tagName === 'TEXT' &&
				!findAll(root, (box) => box.getAttribute('data-node') !== null).some(
					(box) => box.children.includes(element),
				),
		);
		for (const [text, x, y, tone, size, bold, centred] of EXPECTED_TEXTS) {
			const label = labels.find(
				(element) =>
					element.textContent === text &&
					Number(element.getAttribute('x')) === x &&
					Number(element.getAttribute('y')) === flipped(y),
			) as FakeElement;
			expect(attr(label, 'class'), text).toBe(
				`process-diagram__text process-diagram__text--${tone}${bold ? ' process-diagram__text--bold' : ''}`,
			);
			expect(attr(label, 'font-size'), text).toBe(String(size));
			expect(attr(label, 'text-anchor'), text).toBe(
				centred ? 'middle' : 'start',
			);
		}
	});

	it('draws the two columns beside the loop as frames round their labels', () => {
		const panels = findAll(
			root,
			(element) => element.getAttribute('data-panel') !== null,
		);
		expect(panels.map((panel) => attr(panel, 'data-panel'))).toEqual([
			'layers',
			'outside',
		]);
		const frames = panels.map((panel) => {
			const [rect] = findAll(panel, (inner) => inner.tagName === 'RECT');
			return ['x', 'y', 'width', 'height'].map((name) =>
				Number(rect?.getAttribute(name)),
			);
		});
		expect(frames).toEqual([
			[620, flipped(330 + 140), 192, 140],
			[620, flipped(180 + 130), 192, 130],
		]);
		expect(textsIn(panels[0] as FakeElement)).toHaveLength(12);
		expect(textsIn(panels[1] as FakeElement)).toHaveLength(8);
	});

	it('says what is built today and what is planned, under the drawing', () => {
		const lines = byClass(root, 'process-diagram__status-line');
		expect(
			lines.map((line) => line.children.map((part) => part.textContent)),
		).toEqual([
			[
				'Built today:',
				' temperature, pressure and winds in a loop, with heat carried by winds.',
			],
			[
				'Planned, not built:',
				' rain, ocean currents, ice, storm zones, biomes.',
			],
		]);
		expect(DIAGRAM_STATUS).toHaveLength(2);
	});

	it('is an image with a title and a description for a screen reader', () => {
		const [svg] = findAll(root, (element) => element.tagName === 'SVG');
		expect(svg?.getAttribute('role')).toBe('img');
		expect(svg?.getAttribute('viewBox')).toBe(
			`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`,
		);
		const named = svg?.getAttribute('aria-labelledby');
		const described = svg?.getAttribute('aria-describedby');
		const [title] = findAll(root, (element) => element.tagName === 'TITLE');
		const [description] = findAll(
			root,
			(element) => element.tagName === 'DESC',
		);
		expect(named).toBe(title?.getAttribute('id'));
		expect(described).toBe(description?.getAttribute('id'));
		expect(title?.textContent).toBe('How the climate is worked out');
		expect(description?.textContent).toBe(DIAGRAM_DESCRIPTION);
	});

	it('holds no control: nothing in it can be pressed or changed', () => {
		expect(
			findAll(root, (element) =>
				['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(
					element.tagName,
				),
			),
		).toEqual([]);
	});

	it('says in an introduction what the diagram is', () => {
		expect(oneByClass(root, 'process-diagram__intro').textContent).toBe(
			DIAGRAM_INTRO,
		);
	});
});
