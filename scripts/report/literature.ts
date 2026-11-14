/**
 * What published studies report, as the wind report quotes them beside
 * the model's own winds: the papers, how each was read, and for each check
 * the question, the papers' words with where they stand, and the caveats.
 *
 * @remarks
 * Every quotation is the paper's own words, copied exactly; nothing here
 * says more of any paper than those words and the places they were read.
 * Where a result was read only in a paper's abstract, or read off one of
 * its plots, its label says so.
 */

/** How a paper's result was read: in which of its parts, and how fully. */
export const HOW_READ = {
	text: 'The paper’s own text',
	abstract: 'Abstract only; the full text could not be reached',
	plot: 'Read off the plot by this project, to about ±2°',
} as const;

/** One of the {@link HOW_READ} labels. */
export type HowRead = (typeof HOW_READ)[keyof typeof HOW_READ];

/** A paper the report quotes, and how it was read. */
export type PaperAccess = {
	/** Its authors, title, journal and year. */
	readonly paper: string;
	/** How it was read: its own text, its abstract only, or a plot. */
	readonly howRead: string;
	/** The parts of it that were read. */
	readonly where: string;
};

/** Every paper the report quotes, and how each was read. */
export const ACCESS: readonly PaperAccess[] = [
	{
		paper:
			'Ferreira, Marshall, O’Gorman and Seager, “Climate at high-obliquity”, Icarus 243 (2014) 236–248',
		howRead: HOW_READ.text,
		where: 'Abstract; section 3.2; Appendix A; Fig. 7',
	},
	{
		paper:
			'Lobo and Bordoni, “Atmospheric dynamics in high obliquity planets”, Icarus 340 (2020) 113592',
		howRead: HOW_READ.abstract,
		where: 'Abstract',
	},
	{
		paper:
			'Kaspi and Showman, “Atmospheric dynamics of terrestrial exoplanets over a wide range of orbital and atmospheric parameters”, The Astrophysical Journal 804 (2015) 60',
		howRead: `${HOW_READ.text}; Fig. 6a’s values read off the plot, to about ±2°`,
		where: 'Sections 3.1 and 4; Fig. 6a',
	},
	{
		paper:
			'Held and Hou, “Nonlinear axially symmetric circulations in a nearly inviscid atmosphere”, Journal of the Atmospheric Sciences 37 (1980) 515–533',
		howRead: HOW_READ.text,
		where: 'Eq. (16) and the paragraph after it, p. 519',
	},
	{
		paper:
			'Way, Del Genio, Aleinov, Clune, Kelley and Kiang, “Climates of warm Earth-like planets I: 3-D model simulations”, The Astrophysical Journal Supplement Series (2018), arXiv:1808.06480',
		howRead: HOW_READ.text,
		where: 'Sections 3.1 and 3.2; Fig. 9’s caption',
	},
];

/** What one paper reports at one place in it. */
export type PaperReport = {
	/** The paper, short, and the place in it: its abstract, a section, a figure. */
	readonly source: string;
	readonly howRead: HowRead;
	/** The planet and season the words are about, as a phrase. */
	readonly setting?: string;
	/** The paper's own words, each exactly as it stands; there may be none. */
	readonly quotations: readonly string[];
	/** What else is known of this place in the paper, as sentences. */
	readonly note?: string;
};

/** A paper's planets, as a sentence: what it simulated. */
export type Simulated = {
	/** The paper, short. */
	readonly paper: string;
	readonly simulated: string;
};

/** One check of the model against published studies. */
export type LiteratureCheck = {
	/** The check's name, for headings. */
	readonly title: string;
	/** What is asked of the model, as sentences. */
	readonly question: string;
	/** What the papers quoted simulated. */
	readonly simulated: readonly Simulated[];
	/** What the papers report, in the order to show it. */
	readonly reports: readonly PaperReport[];
	/** What to bear in mind in setting the model beside the papers. */
	readonly caveats: readonly string[];
};

const FERREIRA = 'Ferreira et al. (2014)';
const LOBO = 'Lobo and Bordoni (2020)';
const KASPI = 'Kaspi and Showman (2015)';
const HELD = 'Held and Hou (1980)';
const WAY = 'Way et al. (2018)';

const FERREIRA_SIMULATED: Simulated = {
	paper: FERREIRA,
	simulated:
		'An ocean-covered planet with a coupled ocean, atmosphere and sea ice model, at tilts of 23.5°, 54° and 90°.',
};

const BETWEEN_TILTS =
	'The report’s cases are at 60°, between the paper’s 54° and 90°.';

/** Check (a): the winds at a steep tilt. */
export const WINDS_AT_TILT: LiteratureCheck = {
	title: '(a) Winds at a steep tilt',
	question:
		'On the ocean world tilted 60°, and as a second look on the Earth tilted 60°, in January and in July: are the summer hemisphere’s mid-latitude winds westerly, are there easterlies in the deep tropics, and are the winter hemisphere’s winds weak?',
	simulated: [FERREIRA_SIMULATED],
	reports: [
		{
			source: `${FERREIRA}, abstract`,
			howRead: HOW_READ.text,
			quotations: [
				'despite reversed temperature gradients, mid-latitudes surface winds are westerly and trade winds exist at the equator (as for φ = 23.5°) although the westerlies are confined to the summer hemisphere',
			],
		},
		{
			source: `${FERREIRA}, section 3.2`,
			howRead: HOW_READ.text,
			setting: 'At 90° in January (southern summer)',
			quotations: [
				'the eddy momentum convergence sustains surface westerly winds near 50°S and trades winds in the deep tropics (Fig. 7)',
				'In Aqua90, surface winds vanish in winter because there are no eddies to sustain them.',
			],
		},
		{
			source: `${FERREIRA}, Appendix A`,
			howRead: HOW_READ.text,
			setting: 'At 54°',
			quotations: [
				'the synoptic scale activity is weak in both hemispheres as are surface winds in the midlatitudes.',
			],
		},
	],
	caveats: [
		BETWEEN_TILTS,
		'The Earth tilted 60° has the Earth’s continents; the paper’s planet is ocean-covered, as the ocean world tilted 60° is.',
	],
};

/** Check (b): the overturning cell at a steep tilt. */
export const LOW_AT_TILT: LiteratureCheck = {
	title: '(b) The overturning cell at a steep tilt',
	question:
		'On the same cases and months: does the rising branch of the tropical overturning cell lie far into the summer hemisphere, as one broad cell crossing the equator? The latitude of the lowest mean pressure stands in for where the air rises.',
	simulated: [
		{
			paper: LOBO,
			simulated:
				'An ocean-covered planet in an idealised model with a shallow slab ocean.',
		},
		FERREIRA_SIMULATED,
	],
	reports: [
		{
			source: `${LOBO}, abstract`,
			howRead: HOW_READ.abstract,
			quotations: [
				'dominated by seasonally reversing broad cross-equatorial Hadley cells',
				'the associated ascending branches and precipitation convergence zones becoming progressively broader and more poleward shifted into the summer hemisphere with higher obliquities',
				'While not embedded within the Hadley cell ascending branches, the hot summer poles of high obliquity planets experience nonnegligible precipitation',
			],
			note: 'The abstract gives no latitudes.',
		},
		{
			source: `${FERREIRA}, section 3.2`,
			howRead: HOW_READ.text,
			setting: 'At 90°',
			quotations: [
				'the atmospheric meridional overturning circulation in January (Fig. 8, top) is thermally direct as in Aqua23 (upwelling in the summer/southern hemisphere and downwelling in the winter/northern hemisphere), but has an hemispheric latitudinal extent',
				'In July, the upwelling branch approaches the north pole and the overturning cell is of counterclockwise from 5°S to 70°N (not shown).',
			],
		},
		{
			source: `${FERREIRA}, Appendix A`,
			howRead: HOW_READ.text,
			setting: 'At 54°',
			quotations: [
				'As in Aqua90, a Hadley circulation develops with an upper flow from the summer to the winter hemisphere (not shown). It is weaker than in Aqua90 (by a factor 2)',
			],
		},
	],
	caveats: [
		'Neither paper speaks of surface pressure. The latitude of the lowest mean pressure is this project’s stand-in for where the air rises.',
		BETWEEN_TILTS,
	],
};

/** Check (c): the day length. */
export const DAY_LENGTH: LiteratureCheck = {
	title: '(c) Day length',
	question:
		'On the Earth with an 8-hour day and with a 4-day day, on the annual mean: how wide is the tropical cell, and how many bands of wind are there in each hemisphere, against the Earth’s?',
	simulated: [
		{
			paper: KASPI,
			simulated:
				'Ocean-covered planets with no tilt and no seasons, at many spin rates.',
		},
		{
			paper: WAY,
			simulated:
				'A planet with the Earth’s continents and no tilt, with day lengths from 1 to 256 Earth days.',
		},
	],
	reports: [
		{
			source: `${KASPI}, section 4`,
			howRead: HOW_READ.text,
			quotations: [
				'Planets with faster rotation rates are characterized by smaller and weaker Hadley cells, and smaller eddy length scales. ... The number of jets grows with rotation rate.',
			],
		},
		{
			source: `${KASPI}, section 3.1`,
			howRead: HOW_READ.text,
			quotations: [
				'At slow rotation rates, the Hadley cells are nearly global',
				'An axisymmetric picture predicts that the Hadley cell width should be proportional to Ω⁻¹ (Held & Hou 1980), however this is complicated by the existence of eddies',
			],
		},
		{
			source: `${KASPI}, Fig. 6a`,
			howRead: HOW_READ.plot,
			quotations: [],
			note: 'Fig. 6a plots the cell’s width against the spin rate, read off the plot by this project to about ±2°: about 25° at the Earth’s spin, about 15° at three times it and about 46° at a quarter of it, that is about 0.6 and 1.8 of the Earth’s.',
		},
		{
			source: `${HELD}, Eq. (16) and the paragraph after it, p. 519`,
			howRead: HOW_READ.text,
			quotations: [
				'θ_H = (5/3 R)^½',
				'The width of the Hadley cell in this limit is directly proportional to the square root of the horizontal temperature gradient, directly proportional to the square root of the height of the cell, inversely proportional to the rotation rate and independent of static stability.',
			],
		},
		{
			source: `${WAY}, Fig. 9’s caption and section 3.1`,
			howRead: HOW_READ.text,
			quotations: [
				'model stream function diagnostic showing increase in Hadley Cell size and decrease in number from Rotations X001 to X016',
				'until about X016, by which time the Hadley cell now stretches to the pole',
			],
			note: 'X016 is a day of 16 Earth days. They give no width for a day of 4 Earth days.',
		},
	],
	caveats: [
		'The report’s 8-hour and 4-day cases have the Earth’s continents and tilt; Kaspi and Showman’s planets are ocean-covered with no tilt.',
		'This project’s own rule, the cell’s width in proportion to one over the square root of the spin rate, gives 0.58 and 2.0 of the Earth’s width at three times and a quarter of the Earth’s spin. The rule is this project’s; no paper read states it.',
		'The widths from Kaspi and Showman’s Fig. 6a were read off the plot by this project, to about ±2°.',
	],
};

/** The three checks, in the order the report shows them. */
export const LITERATURE_CHECKS: readonly LiteratureCheck[] = [
	WINDS_AT_TILT,
	LOW_AT_TILT,
	DAY_LENGTH,
];

/** What the slowest-turning planets do, which no case of the report shows. */
export const SLOW_END: {
	readonly report: PaperReport;
	/** What the model shows, as a sentence. */
	readonly model: string;
} = {
	report: {
		source: `${WAY}, section 3.2`,
		howRead: HOW_READ.text,
		quotations: [
			'The second transition is from a circulation that transports heat poleward to a diurnally-driven circulation that transports heat from a dayside region of rising motion to a nightside region of sinking motion',
			'In our simulations the transition appears to occur between 32 d and 64 d rotation period.',
		],
	},
	model:
		'This model does not show a day-to-night circulation; its day length runs to 30 days.',
};
