/**
 * Every model's chosen numbers in one place, as data.
 *
 * Each model has a section of titled groups. A setting is an entry: its
 * value, its unit, what it controls, what raising and lowering it do, where
 * its value comes from and whether it was tuned. The models build their
 * plain value objects from these entries (see {@link valuesOf}), so the
 * numbers a model runs on and any list of them are always the same ones.
 *
 * @remarks
 * This file is a leaf: it imports nothing from the models, so that any of
 * them may read it. A setting is changed by editing its `value` here.
 */

/** One setting of a model: its value and everything said about it. */
export type ConfigEntry = {
	/** The value the model runs on. */
	readonly value: number;
	/** What the value is measured in; never empty. */
	readonly unit: string;
	/** What the setting controls, in a sentence or two. */
	readonly what: string;
	/** What raising it does, everything else left as it is. */
	readonly raising: string;
	/** What lowering it does, everything else left as it is. */
	readonly lowering: string;
	/**
	 * Where the starting value comes from: an observed figure, a published
	 * figure with its source, or a guess.
	 */
	readonly source: string;
	/** What it was tuned against, or null when it was not tuned. */
	readonly tuned: string | null;
};

/** A titled group of settings, in the order the model lists them. */
export type ConfigGroup = {
	readonly title: string;
	/**
	 * True for a group that is numerical, not physical: it sets how the model
	 * is solved, not what it describes.
	 */
	readonly numerical?: boolean;
	/** The group's entries by name, in order. */
	readonly settings: Readonly<Record<string, ConfigEntry>>;
};

/**
 * A model's settings: the groups its value object is built from, and the
 * constants it reads directly, which a run cannot override.
 */
export type ConfigSection<
	G extends readonly ConfigGroup[] = readonly ConfigGroup[],
	C extends ConfigGroup = ConfigGroup,
> = {
	/** The model's name, as a list of the settings titles it. */
	readonly name: string;
	readonly groups: G;
	readonly constants: C;
};

type Intersection<U> = (
	U extends unknown
		? (value: U) => void
		: never
) extends (value: infer I) => void
	? I
	: never;

/** The plain number of every setting in a section's groups, by name. */
export type ValuesOf<S extends ConfigSection> = {
	readonly [K in keyof Intersection<S['groups'][number]['settings']>]: number;
};

/** The plain number of every constant in a section, by name. */
export type ConstantsOf<S extends ConfigSection> = {
	readonly [K in keyof S['constants']['settings']]: number;
};

const deepFreeze = <T extends object>(value: T): T => {
	for (const inner of Object.values(value)) {
		if (typeof inner === 'object' && inner !== null) {
			deepFreeze(inner);
		}
	}
	return Object.freeze(value);
};

/**
 * Builds a section, frozen throughout.
 *
 * @throws RangeError if a name appears twice among the groups and the
 * constants, or an entry's value is not a finite number.
 */
export const defineSection = <
	const G extends readonly ConfigGroup[],
	const C extends ConfigGroup,
>(
	name: string,
	groups: G,
	constants: C,
): ConfigSection<G, C> => {
	const seen = new Set<string>();
	for (const group of [...groups, constants]) {
		for (const [key, entry] of Object.entries(group.settings)) {
			if (seen.has(key)) {
				throw new RangeError(`${name}: the setting ${key} appears twice`);
			}
			seen.add(key);
			if (!Number.isFinite(entry.value)) {
				throw new RangeError(`${name}: the setting ${key} is not finite`);
			}
		}
	}
	return deepFreeze({ name, groups, constants });
};

/**
 * The numbers of a section's settings as one frozen object, in the order
 * the groups list them.
 */
export const valuesOf = <S extends ConfigSection>(section: S): ValuesOf<S> => {
	const values: Record<string, number> = {};
	for (const group of section.groups) {
		for (const [key, entry] of Object.entries(group.settings)) {
			values[key] = entry.value;
		}
	}
	return Object.freeze(values) as ValuesOf<S>;
};

/** The numbers of a section's constants as one frozen object. */
export const constantsOf = <S extends ConfigSection>(
	section: S,
): ConstantsOf<S> => {
	const values: Record<string, number> = {};
	for (const [key, entry] of Object.entries(section.constants.settings)) {
		values[key] = entry.value;
	}
	return Object.freeze(values) as ConstantsOf<S>;
};

/**
 * The temperature model's settings.
 *
 * @remarks
 * Almost all of them are tuning parameters, not physical truth; where each
 * starts from is given by its entry. The numerical ones were chosen by
 * measurement. The model's value object is `TEMPERATURE_MODEL`.
 */
export const TEMPERATURE_CONFIG = defineSection(
	'Temperature',
	[
		{
			title: 'How heat moves and is stored',
			settings: {
				/**
				 * 0.55 W m⁻² K⁻¹, a little below the value North, Cahalan and
				 * Coakley (1981), "Energy balance climate models", Reviews of
				 * Geophysics 19, use for diffusion on the unit sphere with outgoing
				 * heat linear in temperature.
				 */
				diffusivity: {
					value: 0.55,
					unit: 'W/m²/K',
					what:
						'How readily heat spreads between neighbouring places over the' +
						' sea. It stands in for all the heat the winds and currents' +
						' carry, which the model does not yet work out.',
					raising:
						'Heat spreads further: the poles warm and the tropics cool, so' +
						' the equator-to-pole difference shrinks, with less polar ice' +
						' and milder coasts.',
					lowering:
						'Each place keeps more of its own heat: hotter tropics, colder' +
						' poles, more ice, and sharper differences between neighbours.',
					source:
						'Published (North, Cahalan and Coakley, 1981), set a little below.',
					tuned: null,
				},
				/**
				 * Tuned down to 0.35 so that continents keep more of their own
				 * seasons; with one diffusivity everywhere, the ocean's heat reaches
				 * too far inland and halves the seasonal range of the continents'
				 * interiors.
				 */
				landDiffusivity: {
					value: 0.35,
					unit: 'W/m²/K',
					what:
						'The same over land. An edge between land and sea takes the mean' +
						' of the two, so its coupling is the same seen from either side.',
					raising:
						"The sea's heat reaches further inland: milder continental" +
						" interiors with smaller seasons. At the sea's value the" +
						" interiors' seasonal range was about halved.",
					lowering:
						'Continents keep more of their own seasons: hotter summers and' +
						' colder winters inland.',
					source: "Started at the sea's value, 0.55.",
					tuned: "Lowered against the observed Earth's continental seasons.",
				},
				/**
				 * A mixed layer of 60 m of sea water at 4.18 MJ m⁻³ K⁻¹.
				 */
				oceanHeatCapacity: {
					value: 2.5e8,
					unit: 'J/m²/K',
					what:
						'The heat the sea stores for each kelvin it warms: a mixed top' +
						' layer of 60 m of water.',
					raising:
						'The sea warms and cools more slowly: smaller, later seasons' +
						' over the sea and on nearby coasts.',
					lowering:
						'The sea follows the sun more closely: larger seasons over the' +
						' sea and coasts, peaking sooner after midsummer.',
					source: 'A physical figure: 60 m of sea water at 4.18 MJ/m³/K.',
					tuned: null,
				},
				/**
				 * About the atmosphere's column alone, 10⁴ kg m⁻² of air at
				 * 1004 J kg⁻¹ K⁻¹, as simple seasonal models with continents take
				 * it.
				 */
				landHeatCapacity: {
					value: 1e7,
					unit: 'J/m²/K',
					what:
						'The heat land stores for each kelvin it warms: about that of' +
						' the column of air above it alone.',
					raising:
						'Land warms and cools more slowly: smaller, later seasons' +
						" inland, more like the sea's.",
					lowering:
						'Land follows the sun even more closely: larger seasons,' +
						' peaking nearer midsummer.',
					source: 'As simple seasonal models with continents take it.',
					tuned: null,
				},
				/**
				 * Taken equal to land's, as ice insulates the water below; without
				 * it the Arctic winter is 10 K too warm.
				 */
				seaIceHeatCapacity: {
					value: 1e7,
					unit: 'J/m²/K',
					what:
						'The heat stored by sea wholly covered in ice. Ice cuts the air' +
						' off from the water below, so frozen sea warms and cools like' +
						' land; partly frozen sea takes a blend with open sea.',
					raising:
						'Frozen seas cool more slowly in winter: milder polar winters.' +
						" At the open sea's value the Arctic winter was 10 K too warm.",
					lowering: 'Frozen seas swing faster: colder polar winters.',
					source: "Taken equal to land's.",
					tuned: null,
				},
				/** The standard atmosphere's 6.5 K km⁻¹ (ICAO, 1993). */
				lapseRate: {
					value: 6.5e-3,
					unit: 'K/m',
					what:
						'How fast the air cools with height above sea level. The winds' +
						' read the temperature brought back to sea level at the same' +
						' rate.',
					raising:
						'Mountains and plateaux are colder, with more snow and ice on' +
						' high ground.',
					lowering: 'High ground is warmer, with less snow and ice on it.',
					source: 'The standard atmosphere, 6.5 K/km (ICAO, 1993).',
					tuned: null,
				},
				/**
				 * Chosen so Earth (`g = 1`) radiates with emissivity about 0.61, the
				 * ratio of its outgoing 239 W m⁻² (Trenberth, Fasullo and Kiehl,
				 * 2009, "Earth's global energy budget", BAMS 90) to a black body at
				 * its mean surface temperature of 288 K. The planet's own
				 * `GREENHOUSE_FACTOR` reads this value too.
				 */
				greenhouseFactor: {
					value: 0.633,
					unit: 'factor',
					what:
						"How strongly the Planet section's greenhouse strength (the" +
						" Earth's is 1) holds back the planet's outgoing heat: the heat" +
						' is divided by 1 + this × the strength, so the Earth keeps back' +
						' about 39% of it. It does nothing on a planet whose greenhouse' +
						' strength is 0.',
					raising: 'Warmer everywhere, with less ice.',
					lowering:
						'Colder everywhere, with more ice; at 0 the greenhouse strength' +
						' stops having any effect.',
					source:
						"The Earth's energy budget: it lets the Earth radiate as it is" +
						' measured to (Trenberth, Fasullo and Kiehl, 2009).',
					tuned: null,
				},
			},
		},
		{
			title: 'Reflected sunlight',
			settings: {
				/**
				 * Tuned, starting from the form North, Cahalan and Coakley (1981)
				 * use for ground clear of ice, a constant plus a multiple of the
				 * second Legendre polynomial of the sine of latitude, with a higher
				 * value over ice. This one sets the global mean, here to the
				 * observed one.
				 */
				albedo: {
					value: 0.27,
					unit: 'fraction',
					what:
						'The share of sunlight reflected, on average over the globe, by' +
						' ground clear of ice and snow.',
					raising:
						'Colder everywhere; the colder poles grow more ice, which cools' +
						' them further. Raised far enough, the planet can freeze over.',
					lowering: 'Warmer everywhere, with less ice.',
					source:
						'The form of North, Cahalan and Coakley (1981) for ground clear' +
						' of ice.',
					tuned: 'Set to the observed global mean.',
				},
				/** As `albedo`: tuned from the published form. */
				albedoPoleward: {
					value: 0.078,
					unit: 'fraction',
					what:
						'How much more clear ground reflects towards the poles than near' +
						' the equator. It averages to nothing over the globe.',
					raising:
						'Colder poles and warmer tropics: a larger equator-to-pole' +
						" difference and more polar ice. Mixed for the globe's average:" +
						' the sunnier tropics gain, the extra ice cools.',
					lowering:
						'Milder poles and cooler tropics: a smaller equator-to-pole' +
						' difference. Below 0 the tropics would reflect more than the' +
						' poles.',
					source: 'A published form (North, Cahalan and Coakley, 1981).',
					tuned: 'Tuned against the observed Earth.',
				},
				/** 0: no starting point; left for tuning. */
				landAlbedoExtra: {
					value: 0,
					unit: 'fraction',
					what: "Extra reflection from land clear of ice, on top of the sea's.",
					raising:
						"Inert at today's 0. Raised, land reflects more: cooler" +
						' continents, most of all where they are sunniest.',
					lowering: 'Below 0, land is darker than sea: warmer continents.',
					source: 'No starting point; left at 0 for later tuning.',
					tuned: null,
				},
				/** As `albedo`: tuned from the published form. */
				iceAlbedo: {
					value: 0.62,
					unit: 'fraction',
					what:
						'The share of sunlight reflected by ground wholly covered in ice' +
						' or snow.',
					raising:
						'Icy places are colder and the ice spreads further, as the cold' +
						' makes more ice: a stronger feedback, so a planet near' +
						' freezing freezes over more easily.',
					lowering:
						'Ice cools its surroundings less and spreads less: milder poles' +
						' and winters.',
					source: 'A published form (North, Cahalan and Coakley, 1981).',
					tuned: 'Tuned against the observed Earth.',
				},
				/**
				 * Ice comes in over a smooth ramp from 0 °C to −10 °C rather than at
				 * a single temperature.
				 */
				iceStartC: {
					value: 0,
					unit: '°C',
					what: 'The air temperature below which ice and snow start to come in.',
					raising:
						'Ice starts in milder places: more ice and snow, and so colder.',
					lowering:
						'Ice starts only in colder places: less ice, and milder high' +
						' latitudes. It must stay above iceFullC; the model refuses it' +
						' otherwise.',
					source: 'A smooth ramp rather than a single freezing point.',
					tuned: null,
				},
				/** As `iceStartC`. */
				iceFullC: {
					value: -10,
					unit: '°C',
					what:
						'The air temperature at and below which a place is wholly' +
						' covered in ice or snow.',
					raising:
						'Places are wholly icy at milder temperatures: more ice, and so' +
						' colder, with a sharper switch from clear to icy. It must stay' +
						' below iceStartC; the model refuses it otherwise.',
					lowering: 'A wider, gentler ramp: less ice at a given temperature.',
					source: 'A smooth ramp rather than a single freezing point.',
					tuned: null,
				},
			},
		},
		{
			title: 'The solver (numerical, not physical)',
			numerical: true,
			settings: {
				/**
				 * Chosen by measurement on the Earth at 64 cells per face edge
				 * against 24 steps a month solved to 1e-4 K: two steps a month
				 * differ from it by at most 0.4 K in any month's root-mean-square and
				 * 0.07 K in the annual mean, about a tenth of the model's error
				 * against the observed Earth, for half the time of four steps.
				 */
				stepsPerMonth: {
					value: 2,
					unit: 'steps per month',
					what: 'How many time steps each month is solved in.',
					raising:
						'More exact, and slower in proportion; 48 at most. Two steps' +
						" differ from 24 by at most 0.4 K in any month's root-mean-square" +
						' and 0.07 K in the yearly average, in half the time of four.',
					lowering: '1 is the least: faster, and less exact.',
					source: 'Chosen by measurement on the Earth.',
					tuned: null,
				},
				/** Chosen by measurement, with `stepsPerMonth`. */
				solverToleranceK: {
					value: 5e-3,
					unit: 'K',
					what: "How closely each step's balance of heat is solved.",
					raising: 'Faster, less exact temperatures.',
					lowering:
						'Slower, more exact temperatures. Set too low for a step to' +
						' reach, no year counts as settled: the solve runs its full' +
						' limit of years (60 unless set) and is marked as not settled.',
					source: 'Chosen by measurement on the Earth.',
					tuned: null,
				},
				/**
				 * The solver normally needs 5 to 25, so 200 only stops a solve that
				 * would not converge. The exchange solver's own default reads this
				 * value too.
				 */
				solverMaxIterations: {
					value: 200,
					unit: 'iterations',
					what:
						'The most rounds one solve of a step may take before it gives' +
						' up. It normally needs 5 to 25.',
					raising:
						'No effect unless a solve is struggling, which then has longer' +
						' to finish. 10,000 at most.',
					lowering:
						'No effect until near 25. Below that, steps stop short and no' +
						' year counts as settled: the solve runs its full limit of years' +
						' (60 unless set) and is marked as not settled.',
					source: 'A safety limit, shared with the heat exchange solver.',
					tuned: null,
				},
				/**
				 * Chosen, not derived. Measured at 64 cells per face edge on the
				 * Earth, a generated world and worlds near freezing: away from a
				 * freezing tipping point, a state carried on agrees with a solve
				 * from nothing within 0.3 K at every drift tried, up to 5.7 K (every
				 * land cell raised 3 km). On a world that sits at such a point no
				 * limit keeps them together: a wholly frozen Earth whose surface is
				 * lowered until a solve from nothing thaws stays frozen when carried
				 * on, 45 K out in places, and stays so until a solve from nothing.
				 * The limit sets how long that can last. 0.25 K is about 40 m of
				 * height over the whole surface. On the Earth's land it is about 25
				 * patches of 500 km radius raised 1,000 m throughout (0.01 K each),
				 * so about every twenty-fifth such edit is solved from nothing; or
				 * about 80 dabs of that radius raising 1,000 m at the centre
				 * (0.003 K each), which is what the page's default brush lays in a
				 * second, so some 80 seconds of it swept over land; or about 17
				 * strokes of five such dabs (0.015 K each). The whole surface raised
				 * to a 3 km plateau moves the drift by 18 K.
				 *
				 * No limit reaches one case: an edit that tips a partly frozen world
				 * to a wholly frozen one can leave the carried solve stopped while
				 * the world is still freezing (44 K out in places on an Earth with
				 * its sea 5 km down), until the next solve finishes it.
				 */
				terrainDriftLimitK: {
					value: 0.25,
					unit: 'K',
					what:
						'After terrain edits, the temperature carries on from the last' +
						' result until the terrain has changed by this much, measured as' +
						' cooling with height (about 40 m over the whole surface); then' +
						' it starts afresh.',
					raising:
						'It starts afresh less often, so edits update sooner; but a' +
						' world at a freezing tipping point can stay in the wrong' +
						' climate longer.',
					lowering:
						'It starts afresh more often: slower, but a wrong climate lasts' +
						' less long. At 0 it always starts afresh.',
					source:
						'Chosen, not derived, from measurements on the Earth, a' +
						' generated world and worlds near freezing.',
					tuned: null,
				},
				/**
				 * Chosen by measurement. On the Earth at 64 cells per face edge,
				 * solving only the first pass of a correction under 1 K moves no
				 * monthly value by more than 0.001 K.
				 */
				correctionRefineK: {
					value: 1,
					unit: 'K',
					what:
						"Each year's solve ends with a correction towards the settled" +
						' climate. One smaller than this skips its later, finer passes.',
					raising:
						'Mixed. A small rise skips those passes more often: a little' +
						' faster, a little less exact. A large one lets big corrections' +
						' skip them too, and those overshoot, by thousands of kelvin' +
						' after a big change of planet.',
					lowering:
						'More passes are solved: slower. At 0 every pass is. Below 1 K' +
						' the skipped passes move no month on the Earth by more than' +
						' 0.001 K.',
					source: 'Chosen by measurement on the Earth.',
					tuned: null,
				},
			},
		},
	],
	{
		title: 'Fixed choices inside the solver (not overridable for a run)',
		numerical: true,
		settings: {
			/**
			 * Keeps the year-end correction bounded where the outgoing heat's rise
			 * and the rise of absorbed sunlight as ice retreats nearly cancel.
			 */
			minDampingShare: {
				value: 0.5,
				unit: 'fraction',
				what:
					"The least share of its outgoing heat's rise with temperature that" +
					" a cell's damping is taken to be when the year's end is corrected.",
				raising:
					'The correction is held further from the point where ice feedback' +
					' cancels the outgoing heat: steadier, with smaller corrections' +
					' there.',
				lowering:
					'Where the two nearly cancel the correction can grow large: a' +
					' risk of overshoot on a world near a freezing tipping point.',
				source: 'Chosen.',
				tuned: null,
			},
			/** A shift under `correctionRefineK` stops after the first pass. */
			correctionPasses: {
				value: 4,
				unit: 'passes',
				what:
					'The times the year-end correction is solved, each with a better' +
					' slope for the outgoing heat over the shift.',
				raising: 'A little more exact after a big change of planet; slower.',
				lowering:
					'Faster; after a big change of planet the correction is less' +
					' exact. 1 uses the tangent only.',
				source: 'Chosen.',
				tuned: null,
			},
			/** Newton's method on the balance from a uniform start. */
			guessIterations: {
				value: 20,
				unit: 'iterations',
				what: 'The most steps the first guess for a solve from nothing takes.',
				raising: 'No effect unless the guess is slow to settle.',
				lowering:
					'The guess may stop short, leaving the solve more years to run.',
				source: 'Chosen.',
				tuned: null,
			},
			/** The guess only spares years; it need not be exact. */
			guessChangeK: {
				value: 0.1,
				unit: 'K',
				what: 'The change below which the first guess stops.',
				raising: 'The guess stops sooner and is less exact.',
				lowering: 'The guess takes more steps and is more exact.',
				source: 'Chosen.',
				tuned: null,
			},
			/**
			 * A guess at the years left is read from the shrink of a year's change;
			 * a change that shrank by less than a quarter says too little.
			 */
			slowestShrinkTrusted: {
				value: 0.75,
				unit: 'fraction',
				what:
					"The most of the year before's change that a year's change may be" +
					' for the two to give a guess at the years left.',
				raising: 'A guess is given more often, from slower-shrinking changes.',
				lowering:
					'A guess is given less often, only from quickly shrinking changes.',
				source: 'Chosen.',
				tuned: null,
			},
		},
	},
);
