/**
 * The climate process diagram: how the climate is to be worked out once
 * every part up to the biomes is built, drawn as an SVG from the data below.
 *
 * It is a design, mostly of parts not built yet. The inputs feed a loop of
 * temperature, pressure, winds and ocean currents, with the heat the winds
 * and currents carry and the ice feeding back into the temperature; what is
 * worked out from the loop's settled state lies below it; the layers that
 * can be viewed and what stays outside the loop lie beside it. Which parts
 * are built today is said under the diagram.
 *
 * Positions are in the units of a page 842 wide, with `y` counted upwards
 * from its foot; the drawing turns them over for the screen. Colours come
 * from the page's theme, through classes.
 */

import { createElement } from '../fields';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** The width of the drawing, in its own units. */
export const DIAGRAM_WIDTH = 842;

/** The height of the drawing, in its own units. */
export const DIAGRAM_HEIGHT = 480;

/** The `y` the drawing is turned over about: its top, on the page's scale. */
const TOP = 530;

/** What a box stands for, which sets its colours. */
export type BoxKind = 'input' | 'loop' | 'downstream';

/** A rounded box of centred text. */
export type DiagramBox = {
	/** What the box is called, for the arrows that join it. */
	readonly id: string;
	readonly kind: BoxKind;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	/** The lines of text, the first in the stronger voice. */
	readonly lines: readonly string[];
	/** Whether every line is in the stronger voice, as for one name. */
	readonly allBold?: boolean;
};

/** The boxes: the inputs, the loop's parts and what is worked out from it. */
export const DIAGRAM_BOXES: readonly DiagramBox[] = [
	{
		id: 'star',
		kind: 'input',
		x: 150,
		y: 492,
		width: 220,
		height: 30,
		lines: ['Star, orbit, tilt, day length'],
	},
	{
		id: 'terrain',
		kind: 'input',
		x: 400,
		y: 492,
		width: 160,
		height: 30,
		lines: ['Terrain and sea level'],
	},
	{
		id: 'temperature',
		kind: 'loop',
		x: 60,
		y: 330,
		width: 130,
		height: 50,
		lines: ['Temperature', 'twelve months'],
	},
	{
		id: 'pressure',
		kind: 'loop',
		x: 240,
		y: 335,
		width: 100,
		height: 40,
		lines: ['Pressure'],
	},
	{
		id: 'winds',
		kind: 'loop',
		x: 370,
		y: 335,
		width: 90,
		height: 40,
		lines: ['Winds'],
	},
	{
		id: 'currents',
		kind: 'loop',
		x: 490,
		y: 335,
		width: 95,
		height: 40,
		lines: ['Ocean currents'],
	},
	{
		id: 'ice',
		kind: 'loop',
		x: 60,
		y: 265,
		width: 130,
		height: 40,
		lines: ['Sea ice and', 'snow cover'],
		allBold: true,
	},
	{
		id: 'rain',
		kind: 'downstream',
		x: 150,
		y: 180,
		width: 180,
		height: 40,
		lines: ['Rain and snowfall', 'from winds and temperature'],
	},
	{
		id: 'storms',
		kind: 'downstream',
		x: 400,
		y: 180,
		width: 180,
		height: 40,
		lines: ['Storm zones', 'from sea temperature and winds'],
	},
	{
		id: 'climate',
		kind: 'downstream',
		x: 160,
		y: 110,
		width: 160,
		height: 40,
		lines: ['Climate zones', 'from temperature and rain'],
	},
	{
		id: 'biomes',
		kind: 'downstream',
		x: 360,
		y: 110,
		width: 160,
		height: 40,
		lines: ['Biome map', 'from temperature and rain'],
	},
];

/** The loop's own frame; its title and note are among the labels. */
export const DIAGRAM_LOOP = {
	x: 40,
	y: 250,
	width: 560,
	height: 220,
} as const;

/** How an arrow reads: a step forward, or heat or ice feeding back. */
export type ArrowKind = 'forward' | 'feedback';

/** A line along the axes, with a head at its end. */
export type DiagramArrow = {
	/** `from>to`, naming the boxes or the places it joins. */
	readonly id: string;
	readonly kind: ArrowKind;
	/** The corners the line passes through, ending at the head. */
	readonly points: readonly (readonly [number, number])[];
};

/** The arrows, in the order the diagram is read. */
export const DIAGRAM_ARROWS: readonly DiagramArrow[] = [
	{
		id: 'star>loop',
		kind: 'forward',
		points: [
			[260, 492],
			[260, 472],
		],
	},
	{
		id: 'terrain>loop',
		kind: 'forward',
		points: [
			[480, 492],
			[480, 472],
		],
	},
	{
		id: 'temperature>pressure',
		kind: 'forward',
		points: [
			[190, 355],
			[240, 355],
		],
	},
	{
		id: 'pressure>winds',
		kind: 'forward',
		points: [
			[340, 355],
			[370, 355],
		],
	},
	{
		id: 'winds>currents',
		kind: 'forward',
		points: [
			[460, 355],
			[490, 355],
		],
	},
	{
		id: 'temperature>ice',
		kind: 'forward',
		points: [
			[100, 330],
			[100, 305],
		],
	},
	{
		id: 'winds>temperature',
		kind: 'feedback',
		points: [
			[415, 375],
			[415, 404],
			[150, 404],
			[150, 380],
		],
	},
	{
		id: 'currents>temperature',
		kind: 'feedback',
		points: [
			[537, 375],
			[537, 430],
			[100, 430],
			[100, 380],
		],
	},
	{
		id: 'ice>temperature',
		kind: 'feedback',
		points: [
			[150, 305],
			[150, 330],
		],
	},
	{
		id: 'settled>rain',
		kind: 'forward',
		points: [
			[240, 236],
			[240, 220],
		],
	},
	{
		id: 'settled>storms',
		kind: 'forward',
		points: [
			[490, 236],
			[490, 220],
		],
	},
	{
		id: 'rain>climate',
		kind: 'forward',
		points: [
			[240, 180],
			[240, 150],
		],
	},
	{
		id: 'climate>biomes',
		kind: 'forward',
		points: [
			[320, 130],
			[360, 130],
		],
	},
];

/** A plain line, without a head: the trunk and bar of the settled state. */
export type DiagramLine = {
	readonly id: string;
	readonly from: readonly [number, number];
	readonly to: readonly [number, number];
};

/** The lines that take the loop's settled state to what is worked out. */
export const DIAGRAM_LINES: readonly DiagramLine[] = [
	{ id: 'settled-trunk', from: [320, 250], to: [320, 236] },
	{ id: 'settled-bar', from: [240, 236], to: [490, 236] },
];

/** How a piece of text is set. */
export type LabelTone = 'muted' | 'ink' | 'loop' | 'feedback' | 'downstream';

/** A piece of text on the drawing. */
export type DiagramLabel = {
	/** What the text says. */
	readonly text: string;
	readonly x: number;
	readonly y: number;
	readonly tone: LabelTone;
	/** The text's size, in the drawing's units. */
	readonly size: number;
	readonly bold?: boolean;
	/** Whether `x` is the text's middle rather than its left. */
	readonly centred?: boolean;
};

/** The free text: the loop's titles, the arrows' labels, the notes. */
export const DIAGRAM_LABELS: readonly DiagramLabel[] = [
	{ text: 'THE LOOP', x: 54, y: 453, tone: 'loop', size: 10.5, bold: true },
	{
		text: 'repeats until the temperature stops changing',
		x: 112,
		y: 453,
		tone: 'loop',
		size: 9.5,
	},
	{
		text: 'heat carried by winds',
		x: 282,
		y: 408,
		tone: 'feedback',
		size: 8.5,
		centred: true,
	},
	{
		text: 'heat carried by currents',
		x: 318,
		y: 434,
		tone: 'feedback',
		size: 8.5,
		centred: true,
	},
	{
		text: 'Ice and snow form where it is cold.',
		x: 200,
		y: 321,
		tone: 'muted',
		size: 8.5,
	},
	{
		text: 'They reflect sunlight, which cools it further.',
		x: 200,
		y: 310,
		tone: 'feedback',
		size: 8.5,
	},
	{
		text: 'Sea ice and snow cover do not drive the currents;',
		x: 200,
		y: 285,
		tone: 'muted',
		size: 8,
	},
	{
		text: 'they act on the temperature only.',
		x: 200,
		y: 275,
		tone: 'muted',
		size: 8,
	},
	{
		text: 'the settled state',
		x: 328,
		y: 241,
		tone: 'ink',
		size: 9,
		bold: true,
	},
	{ text: 'feeds the next step', x: 82, y: 75, tone: 'muted', size: 8.5 },
	{
		text: 'feeds back into the temperature',
		x: 232,
		y: 75,
		tone: 'feedback',
		size: 8.5,
	},
];

/** The arrows that show what the two kinds of arrow mean. */
export const DIAGRAM_LEGEND: readonly DiagramArrow[] = [
	{
		id: 'legend-forward',
		kind: 'forward',
		points: [
			[40, 78],
			[76, 78],
		],
	},
	{
		id: 'legend-feedback',
		kind: 'feedback',
		points: [
			[190, 78],
			[226, 78],
		],
	},
];

/** A framed column of text beside the loop. */
export type DiagramPanel = {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly labels: readonly DiagramLabel[];
};

/** The two columns beside the loop: the layers, and what lies outside it. */
export const DIAGRAM_PANELS: readonly DiagramPanel[] = [
	{
		id: 'layers',
		x: 620,
		y: 330,
		width: 192,
		height: 140,
		labels: [
			{
				text: 'Layers you can view',
				x: 632,
				y: 453,
				tone: 'ink',
				size: 10.5,
				bold: true,
			},
			{
				text: 'From the loop',
				x: 632,
				y: 436,
				tone: 'loop',
				size: 9,
				bold: true,
			},
			...['Temperature', 'Pressure', 'Winds', 'Ocean currents', 'Sea ice'].map(
				(text, index): DiagramLabel => ({
					text,
					x: 640,
					y: 424 - index * 11,
					tone: 'ink',
					size: 8.5,
				}),
			),
			{
				text: 'Downstream',
				x: 726,
				y: 436,
				tone: 'downstream',
				size: 9,
				bold: true,
			},
			...['Rainfall', 'Climate zones', 'Storm zones', 'Biomes'].map(
				(text, index): DiagramLabel => ({
					text,
					x: 734,
					y: 424 - index * 11,
					tone: 'ink',
					size: 8.5,
				}),
			),
		],
	},
	{
		id: 'outside',
		x: 620,
		y: 180,
		width: 192,
		height: 130,
		labels: [
			{
				text: 'Outside the loop,',
				x: 632,
				y: 293,
				tone: 'ink',
				size: 10.5,
				bold: true,
			},
			{
				text: 'stepping through time',
				x: 632,
				y: 280,
				tone: 'ink',
				size: 10.5,
				bold: true,
			},
			...[
				'Ice sheets grow over thousands',
				'of years. Plates move over',
				'millions.',
				'',
				'They change the terrain and the',
				'ice cover, and the loop is then',
				'run again as a snapshot.',
			].flatMap((text, index): DiagramLabel[] =>
				text === ''
					? []
					: [{ text, x: 632, y: 263 - index * 11, tone: 'muted', size: 8.5 }],
			),
		],
	},
];

/** What the diagram says under its title. */
export const DIAGRAM_INTRO =
	'How the climate is to be worked out once every part up to the biomes is built. It is a design, mostly of parts not built yet.';

/** What is built today and what is planned, said under the drawing. */
export const DIAGRAM_STATUS = [
	{
		lead: 'Built today:',
		text: 'temperature, pressure and winds in a loop, with heat carried by winds.',
	},
	{
		lead: 'Planned, not built:',
		text: 'rain, ocean currents, ice, storm zones, biomes.',
	},
] as const;

/** What a screen reader is told of the drawing. */
export const DIAGRAM_DESCRIPTION =
	'Star, orbit, tilt, day length and terrain and sea level feed a loop of temperature, pressure, winds and ocean currents, which repeats until the temperature stops changing. Heat carried by winds and by currents, and sea ice and snow cover, feed back into the temperature. From the loop’s settled state come rain and snowfall and storm zones, then climate zones and the biome map. Beside the loop are the layers you can view, and what stays outside the loop: ice sheets and plates, which change the terrain and ice cover over long times.';

const svgElement = (
	tag: string,
	attributes: Readonly<Record<string, string | number>>,
): SVGElement => {
	const element = document.createElementNS(SVG_NAMESPACE, tag);
	for (const [name, value] of Object.entries(attributes)) {
		element.setAttribute(name, String(value));
	}
	return element as SVGElement;
};

/** A turned-over `y`: the drawing counts down from its top. */
const flip = (y: number): number => TOP - y;

const text = (
	content: string,
	x: number,
	y: number,
	className: string,
	size: number,
	anchor: 'start' | 'middle' = 'start',
): SVGElement => {
	const element = svgElement('text', {
		x,
		y: flip(y),
		class: className,
		'font-size': size,
		'text-anchor': anchor,
	});
	element.textContent = content;
	return element;
};

const drawLabel = (label: DiagramLabel): SVGElement =>
	text(
		label.text,
		label.x,
		label.y,
		`process-diagram__text process-diagram__text--${label.tone}${label.bold === true ? ' process-diagram__text--bold' : ''}`,
		label.size,
		label.centred === true ? 'middle' : 'start',
	);

const BOX_SIZE = 9.5;

const drawBox = (box: DiagramBox): SVGElement => {
	const group = svgElement('g', {
		class: `process-diagram__box process-diagram__box--${box.kind}`,
		'data-node': box.id,
	});
	group.append(
		svgElement('rect', {
			x: box.x,
			y: flip(box.y + box.height),
			width: box.width,
			height: box.height,
			rx: 6,
		}),
	);
	const leading = BOX_SIZE + 2.5;
	const top =
		box.y + box.height / 2 + (leading * box.lines.length) / 2 - BOX_SIZE + 1;
	box.lines.forEach((line, index) => {
		const bold = box.allBold === true || index === 0;
		group.append(
			text(
				line,
				box.x + box.width / 2,
				top - index * leading,
				`process-diagram__text process-diagram__text--${bold ? 'ink process-diagram__text--bold' : 'muted'}`,
				bold ? BOX_SIZE : BOX_SIZE - 1,
				'middle',
			),
		);
	});
	return group;
};

const pathOf = (points: readonly (readonly [number, number])[]): string =>
	points
		.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x} ${flip(y)}`)
		.join(' ');

const drawArrow = (arrow: DiagramArrow): SVGElement => {
	const group = svgElement('g', {
		class: `process-diagram__arrow process-diagram__arrow--${arrow.kind}`,
		'data-edge': arrow.id,
	});
	group.append(
		svgElement('path', {
			d: pathOf(arrow.points),
			'marker-end': `url(#process-diagram-head-${arrow.kind})`,
		}),
	);
	return group;
};

const drawLine = (line: DiagramLine): SVGElement => {
	const group = svgElement('g', {
		class: 'process-diagram__arrow process-diagram__arrow--forward',
		'data-line': line.id,
	});
	group.append(svgElement('path', { d: pathOf([line.from, line.to]) }));
	return group;
};

const drawPanel = (panel: DiagramPanel): SVGElement => {
	const group = svgElement('g', {
		class: 'process-diagram__panel',
		'data-panel': panel.id,
	});
	group.append(
		svgElement('rect', {
			x: panel.x,
			y: flip(panel.y + panel.height),
			width: panel.width,
			height: panel.height,
			rx: 8,
		}),
		...panel.labels.map(drawLabel),
	);
	return group;
};

/** The two arrow heads, one for each kind of arrow, as markers. */
const drawHeads = (): SVGElement => {
	const defs = svgElement('defs', {});
	for (const kind of ['forward', 'feedback'] as const) {
		const marker = svgElement('marker', {
			id: `process-diagram-head-${kind}`,
			viewBox: '0 0 10 10',
			refX: 10,
			refY: 5,
			markerUnits: 'userSpaceOnUse',
			markerWidth: 6,
			markerHeight: 6,
			orient: 'auto',
			class: `process-diagram__head process-diagram__head--${kind}`,
		});
		marker.append(svgElement('path', { d: 'M0 0 L10 5 L0 10 z' }));
		defs.append(marker);
	}
	return defs;
};

/**
 * Builds the climate process diagram: a short introduction, the drawing,
 * and under it what is built today and what is planned.
 *
 * @remarks
 * The drawing is an SVG with a title and description for a screen reader.
 * It keeps its full size and scrolls sideways in a window too narrow for
 * it, rather than shrinking its text out of reading. The tab's name and the
 * introduction stand for a title.
 *
 * @returns The element to put in a panel. It holds nothing that changes.
 */
export const createProcessDiagram = (): HTMLElement => {
	const root = createElement('div', 'process-diagram');
	const intro = createElement('p', 'process-diagram__intro');
	intro.textContent = DIAGRAM_INTRO;

	const svg = svgElement('svg', {
		class: 'process-diagram__drawing',
		viewBox: `0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`,
		role: 'img',
		'aria-labelledby': 'process-diagram-title',
		'aria-describedby': 'process-diagram-description',
	});
	const title = svgElement('title', { id: 'process-diagram-title' });
	title.textContent = 'How the climate is worked out';
	const description = svgElement('desc', { id: 'process-diagram-description' });
	description.textContent = DIAGRAM_DESCRIPTION;

	const loop = svgElement('g', {
		class: 'process-diagram__loop',
		'data-node': 'loop',
	});
	loop.append(
		svgElement('rect', {
			x: DIAGRAM_LOOP.x,
			y: flip(DIAGRAM_LOOP.y + DIAGRAM_LOOP.height),
			width: DIAGRAM_LOOP.width,
			height: DIAGRAM_LOOP.height,
			rx: 10,
		}),
	);
	svg.append(
		title,
		description,
		drawHeads(),
		loop,
		...DIAGRAM_PANELS.map(drawPanel),
		...DIAGRAM_BOXES.map(drawBox),
		...DIAGRAM_LINES.map(drawLine),
		...[...DIAGRAM_ARROWS, ...DIAGRAM_LEGEND].map(drawArrow),
		...DIAGRAM_LABELS.map(drawLabel),
	);

	const scroll = createElement('div', 'process-diagram__scroll');
	scroll.append(svg);

	const status = createElement('div', 'process-diagram__status');
	for (const { lead, text: said } of DIAGRAM_STATUS) {
		const line = createElement('p', 'process-diagram__status-line');
		const strong = createElement('strong', 'process-diagram__status-lead');
		strong.textContent = lead;
		const rest = createElement('span', 'process-diagram__status-text');
		rest.textContent = ` ${said}`;
		line.append(strong, rest);
		status.append(line);
	}
	root.append(intro, scroll, status);
	return root;
};
