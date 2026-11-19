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
	/** The values a search may give it, when it has any bounds. */
	readonly bounds?: ConfigBounds;
	/**
	 * The place of this setting among those a tuning search varies together,
	 * counting from 1; left out for a setting a search does not vary.
	 */
	readonly searchOrder?: number;
};

/**
 * The values a setting may take in a search: above `above` and no more than
 * `atMost`, either left out for no bound on that side.
 */
export type ConfigBounds = {
	readonly above?: number;
	readonly atMost?: number;
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
	/** The model's name, which titles its settings where they are listed. */
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

/**
 * A setting's value and unit as they are written for a reader: numbers of
 * a million and over or under a thousandth in the form `2.5e8`, the degree
 * sign set against the number.
 */
export const formatConfigValue = (entry: ConfigEntry): string => {
	const size = Math.abs(entry.value);
	const number =
		size !== 0 && (size >= 1e6 || size < 1e-3)
			? entry.value.toExponential().replace('e+', 'e')
			: String(entry.value);
	return `${number}${entry.unit === '°' ? '' : ' '}${entry.unit}`;
};

/**
 * Every setting of some groups with its name, in the order the groups list
 * them. The name's type may be narrowed to the names the groups hold.
 */
export const entriesOf = <K extends string = string>(
	groups: readonly ConfigGroup[],
): (readonly [K, ConfigEntry])[] =>
	groups.flatMap(
		(group) => Object.entries(group.settings) as [K, ConfigEntry][],
	);

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
	for (const [key, entry] of entriesOf([...groups, constants])) {
		if (seen.has(key)) {
			throw new RangeError(`${name}: the setting ${key} appears twice`);
		}
		seen.add(key);
		if (!Number.isFinite(entry.value)) {
			throw new RangeError(`${name}: the setting ${key} is not finite`);
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
	for (const [key, entry] of entriesOf(section.groups)) {
		values[key] = entry.value;
	}
	return Object.freeze(values) as ValuesOf<S>;
};

/** The numbers of a section's constants as one frozen object. */
export const constantsOf = <S extends ConfigSection>(
	section: S,
): ConstantsOf<S> => {
	const values: Record<string, number> = {};
	for (const [key, entry] of entriesOf([section.constants])) {
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
				 * heat linear in temperature, lowered by the share of its poleward
				 * heat transport that the currents carry: on the Earth at 64, in the
				 * climate loop, the transport by the sea's diffusivity across 15°,
				 * 30°, 45° and 60° north and south sums to 16.37 PW without the
				 * currents, and the currents carry 2.05 PW across the same eight
				 * circles, 12.5%; 0.55 × (1 − 0.125) = 0.48. The winds' flowing
				 * part carries 0.05 PW or less across any of them, so nothing is
				 * taken off for the winds.
				 */
				diffusivity: {
					value: 0.48,
					unit: 'W/m²/K',
					what:
						'How readily heat spreads between neighbouring places over the' +
						' sea. It stands in for the heat carried sideways there that' +
						" the climate's winds and currents do not carry: the eddies" +
						' and storms of the air and the sea, and the currents the' +
						' gyres leave out.',
					raising:
						'Heat spreads further: the poles warm and the tropics cool, so' +
						' the equator-to-pole difference shrinks, with less polar ice' +
						' and milder coasts.',
					lowering:
						'Each place keeps more of its own heat: hotter tropics, colder' +
						' poles, more ice, and sharper differences between neighbours.',
					source:
						'Published (North, Cahalan and Coakley, 1981) as 0.55 W/m²/K,' +
						' less the share of its poleward transport the currents carry' +
						' in the climate loop: on the Earth at 64, across 15°, 30°,' +
						' 45° and 60° north and south, 2.05 of 16.37 PW, 12.5%.',
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
						" interiors with smaller seasons. At the sea's published value," +
						" 0.55, the interiors' seasonal range was about halved.",
					lowering:
						'Continents keep more of their own seasons: hotter summers and' +
						' colder winters inland.',
					source: "Started at the sea's published value, 0.55.",
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
				 * The column of air alone, as over land: 10⁴ kg m⁻² of air at
				 * 1004 J kg⁻¹ K⁻¹.
				 */
				seaAirHeatCapacity: {
					value: 1e7,
					unit: 'J/m²/K',
					what:
						'The heat the air over the sea stores for each kelvin it warms:' +
						' the column of air alone, apart from the sea below it, which' +
						' has a temperature of its own.',
					raising:
						'The air over the sea follows the sea and the winds more slowly.',
					lowering:
						'The air over the sea follows the sea and the winds more' +
						' closely; over sea ice, where it is cut off from the water, its' +
						' winters are colder.',
					source:
						"Taken equal to land's: the column of air alone, 10 t/m² of air" +
						' at 1004 J/kg/K.',
					tuned: null,
				},
				/**
				 * Bulk formulas for the heat flux between the sea and the air, with
				 * transfer coefficients of 1.2e-3 (Large and Pond, 1982, "Sensible
				 * and latent heat flux measurements over the ocean", J. Phys.
				 * Oceanogr. 12) and a wind of 5 m s⁻¹, at 10 °C: sensible heat
				 * ρ c_p C U ≈ 7, latent heat ρ L C U dq_s/dT ≈ 9 and long-wave
				 * 4σT³ ≈ 5 W m⁻² K⁻¹.
				 */
				airSeaExchange: {
					value: 20,
					unit: 'W/m²/K',
					what:
						'How readily heat passes between the sea and the air over it,' +
						' for each kelvin the two differ: sensible heat, evaporation and' +
						' long-wave radiation together. Sea ice cuts it.',
					raising:
						'The air over the sea follows the sea more closely: milder' +
						' winters and cooler summers over the sea and downwind of it.',
					lowering:
						'The air over the sea is freer of it: larger seasons over the' +
						' sea. At 0 the two exchange nothing.',
					source:
						'Bulk formulas (Large and Pond, 1982) at a wind of 5 m/s and' +
						' 10 °C: sensible heat about 7, evaporation about 9 and' +
						' long-wave about 5 W/m²/K.',
					tuned: null,
				},
				/**
				 * The heat capacity of about a kilometre of air, the depth the surface
				 * wind blows in, at the sea-level density of 1.2 kg m⁻³ and
				 * 1004 J kg⁻¹ K⁻¹. Set from that estimate, not tuned. Its check is the
				 * Earth's west-east coast contrast at 40-60°N, kept in the temperature
				 * baseline: with it the winds give western Europe 2.8 K milder than East
				 * Asia over the year and 6.3 K in January, against 0.7 and 2.4 K
				 * without them and 11.5 and 22.9 K observed; for North America -0.1
				 * and 2.8 K, against about -0.8 and -0.6 K and 5.8 and 15.1 K
				 * observed.
				 */
				windHeatCapacity: {
					value: 1.2e6,
					unit: 'J/m²/K',
					what:
						'How strongly the wind carries heat: the heat the moving air' +
						' holds for each kelvin, per square metre, which is set by the' +
						' depth of the air the wind moves heat in. It only matters once' +
						' the winds are fed back into the temperature.',
					raising:
						'The wind carries more heat: milder west coasts and colder' +
						' east coasts at mid-latitudes, the sea reaching further' +
						' inland downwind, and a smaller difference between the tropics' +
						' and the poles.',
					lowering:
						'The wind carries less heat, down to none at 0, where the' +
						' temperature is what it is without the winds.',
					source:
						'Physics: about a kilometre of air, the depth the surface wind' +
						' blows in, at the sea-level density of 1.2 kg/m³ and 1004' +
						" J/kg/K. Checked against the Earth's west-east coast contrast:" +
						' about a quarter to a third of the observed for western Europe' +
						" against East Asia, a sixth in North America's January, and" +
						" none for North America's year.",
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
				/**
				 * A cell's mixed layer within about 2 K of freezing is taken to be
				 * partly iced over: the ice edge of a cell over 100 km across.
				 */
				seaIceStartC: {
					value: 0,
					unit: '°C',
					what:
						'The sea temperature below which the sea starts to ice over. The' +
						' ice share then rises smoothly to the whole at seaFreezingC; it' +
						' brightens the sea and cuts the exchange with the air.',
					raising:
						'The sea ices over from milder temperatures: more sea ice, and' +
						' colder polar air.',
					lowering:
						'A sharper ice edge, nearer freezing. It must stay above' +
						' seaFreezingC; the model refuses it otherwise.',
					source:
						'Chosen: a mixed layer within about 2 K of freezing is partly' +
						' iced over, across a cell over 100 km wide.',
					tuned: null,
				},
				/**
				 * The freezing point of sea water of salinity 33–35 at the surface,
				 * −1.8 to −1.9 °C (UNESCO, 1983, "Algorithms for computation of
				 * fundamental properties of seawater").
				 */
				seaFreezingC: {
					value: -1.8,
					unit: '°C',
					what:
						'The freezing point of sea water. The sea is wholly iced over' +
						' there and does not cool below it, though the air over it can.',
					raising:
						'The sea freezes at a milder temperature: more sea ice. It must' +
						' stay below seaIceStartC; the model refuses it otherwise.',
					lowering: 'The sea cools further before it freezes: less sea ice.',
					source:
						'The freezing point of sea water of salinity 33 to 35 (UNESCO,' +
						' 1983).',
					tuned: null,
				},
			},
		},
		{
			title: 'The climate loop',
			numerical: true,
			settings: {
				/** Below the 0.1 °C that a map of the temperature can show. */
				climateToleranceC: {
					value: 0.1,
					unit: '°C',
					what:
						'How small the root-mean-square change a pass of the climate' +
						' loop makes to the monthly temperature, over the whole globe and' +
						' the year, must be for the climate to count as settled.',
					raising: 'The loop stops sooner, on a climate a little less settled.',
					lowering:
						'More passes, to a climate settled more finely; below about 0.05' +
						" the temperature's own tolerance sets the limit.",
					source:
						'Chosen: below what a map of the temperature shows. The' +
						' root-mean-square rather than the largest change, which a few' +
						' cells of spring snow and ice keep above 0.1 for many passes.',
					tuned: null,
				},
				climateMaxPasses: {
					value: 8,
					unit: 'passes',
					what:
						'The most passes of the loop, each a temperature solve with the' +
						" last pass's winds and currents, then the winds from the new" +
						' temperature, then the currents from those winds.',
					raising:
						'A world whose climate settles slowly gets further; the climate' +
						' takes longer to appear.',
					lowering:
						'The loop gives up sooner, leaving the climate less settled on' +
						' such a world. At 1, no climate settles, and none is carried on' +
						' from.',
					source:
						'Chosen: the Earth settles in four passes, and the generated' +
						' worlds measured in four.',
					tuned: null,
				},
				climateOvershootShare: {
					value: 0.5,
					unit: 'fraction',
					what:
						"How much of a pass's change is applied when the pass changes" +
						' the temperature by more than the pass before did (an' +
						' overshoot, where the winds and the temperature chase each other).' +
						' It only stops a pass from growing on the one before; it does' +
						' not bring down an oscillation at a stronger feedback than the' +
						" model's, which the loop then leaves unsettled at its limit.",
					raising:
						'Overshoots are damped less; at 1 they are not damped at all.',
					lowering: 'Overshoots are damped harder; the loop moves more slowly.',
					source: 'Chosen: half.',
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

/**
 * The wind model's settings.
 *
 * @remarks
 * Some start from a published or textbook figure, the rest are guesses, and
 * several were then tuned by hand against the observed Earth, or against
 * the invented cases, so that the winds are right in kind; they are not
 * physical truth. The model's value object is `DEFAULT_WIND_SETTINGS`.
 */
export const WIND_CONFIG = defineSection(
	'Winds',
	[
		{
			title: 'How wide the circulation cells are',
			settings: {
				/**
				 * The Earth's equator-to-pole contrast of zonal-mean sea-level
				 * temperature, in kelvin, as `zonalBands` measures it: the
				 * temperature at the hottest latitude less the mean of the two polar
				 * bands'. The contrast of other planets is taken against it. The
				 * simulated Earth's on the 64 grid is 41.8 K in January and 39.9 K in
				 * July, and 41.6 K over the twelve months; this is the mean of January's
				 * and July's, rounded. Not tuned.
				 */
				earthContrastK: {
					value: 41,
					unit: 'K',
					what:
						"The Earth's temperature difference from its hottest latitude" +
						" to its poles. Every planet's difference is measured against" +
						' it to set how wide its circulation cells are.',
					raising:
						"Every planet's difference counts as smaller, so its cells" +
						' come out narrower: the subtropical highs and the bands' +
						' beyond move towards the equator, and the bands weaken a' +
						' little, as their strength follows the width. At 50 K the' +
						" Earth's 30° cells would narrow to about 28.5°.",
					lowering:
						'The opposite: wider cells, the highs further from the' +
						' equator, and slightly stronger bands.',
					source:
						"The simulated Earth's own difference: 41.8 K in January and" +
						' 39.9 K in July.',
					tuned: null,
					bounds: { above: 0 },
					searchOrder: 1,
				},
				/**
				 * How the cells' width follows the rotation rate: as `(Ω_E / Ω)` to this
				 * power.
				 *
				 * @remarks
				 * The power ½ is the eddy-limited Hadley cell of Held (2000), "The
				 * general circulation of the atmosphere" (Woods Hole lectures), whose
				 * edge lies at `φ_H ≈ (g H Δ_v / (Ω² a²))^¼` radians: where the shear of
				 * a wind that keeps its angular momentum first becomes baroclinically
				 * unstable. It sits between the axisymmetric cell of Held and Hou (1980),
				 * whose width goes as `1/Ω`, and the weaker dependence general
				 * circulation models find at fast rotation. The same power for the cells
				 * beyond follows the Rhines scale, `π (2U / β)^½` with
				 * `β = 2Ω cos φ / a`, which sets the spacing of eddy-driven jets. It
				 * gives about 17° and five cells in each hemisphere for an 8-hour day,
				 * 30° and three for 24 hours, 60° and one and a half for 96 hours, and
				 * one cell reaching the pole from about 216 hours. Not tuned.
				 */
				rotationPower: {
					value: 0.5,
					unit: 'power',
					what:
						"How strongly the cells' width follows the length of the day:" +
						' the width goes as (day length ÷ 24 hours) to this power.',
					raising:
						"No change at the Earth's 24-hour day. A slower-turning" +
						' planet gets wider cells and fewer bands, a faster one' +
						' narrower cells and more bands. At 1, an 8-hour day would' +
						' give cells of 10° rather than 17°.',
					lowering:
						"No change at the Earth's day. The day length matters less;" +
						" at 0 every planet has cells as wide as the Earth's, before" +
						' its temperature difference is counted.',
					source: 'Published theory: the square-root rule of Held (2000).',
					tuned: null,
					bounds: { above: 0 },
				},
				/**
				 * How the cells' width follows the equator-to-pole contrast: as the
				 * contrast over `earthContrastK` to this power.
				 *
				 * @remarks
				 * Held's (2000) edge goes as the quarter power of the vertical contrast
				 * of potential temperature, and Held and Hou's (1980) as the half power
				 * of the horizontal one; the horizontal contrast is what the model has,
				 * so it takes the quarter power, the weaker of the two. A guess, not
				 * tuned.
				 */
				contrastPower: {
					value: 0.25,
					unit: 'power',
					what:
						"How strongly the cells' width follows the planet's" +
						' equator-to-pole temperature difference, against the' +
						" Earth's.",
					raising:
						"A planet with a larger difference than the Earth's gets" +
						' wider cells, one with a smaller difference narrower cells.' +
						' On the Earth, whose difference runs from 35 to 49 K through' +
						" the year, the cells' width swings more than its 28.9° to" +
						' 31.4° today.',
					lowering:
						'The difference matters less; at 0 it does not change the' +
						' width at all.',
					source:
						'A guess from theory: the weaker of two published powers' +
						' (Held 2000; Held and Hou 1980).',
					tuned: null,
					bounds: { above: 0 },
				},
				/**
				 * The lowest contrast taken, as a share of `earthContrastK`, so that a
				 * planet with almost none, or a negative one, keeps cells of a sane
				 * width: about 0.7 times the Earth's at the Earth's rotation. A guess,
				 * not tuned.
				 */
				minContrastRatio: {
					value: 0.25,
					unit: 'ratio',
					what:
						'The smallest temperature difference counted, as a share of' +
						" the Earth's (about 10 K), so a planet with almost none, or" +
						' a reversed one, still has cells of a sensible width.',
					raising:
						'Planets whose difference falls below it get wider cells than' +
						' their temperature gives. The Earth is untouched unless it' +
						' is raised past about 0.86; the Earth tilted 60° is held by' +
						' it already in October and November, when its difference' +
						' falls to 9 K and below.',
					lowering:
						'Lets planets with very little difference have narrower' +
						" cells. Today the narrowest is about 0.7 of the Earth's" +
						" width at the Earth's day length.",
					source: 'A guess: a guard for extreme worlds.',
					tuned: null,
					bounds: { above: 0 },
				},
				/**
				 * The highest contrast taken, as a share of `earthContrastK`, so that a
				 * planet with a huge one keeps cells of a sane width: about 1.4 times
				 * the Earth's at the Earth's rotation. A guess, not tuned.
				 */
				maxContrastRatio: {
					value: 4,
					unit: 'ratio',
					what:
						'The largest temperature difference counted, as a share of' +
						" the Earth's (about 164 K), so a planet with a huge one" +
						' still has cells of a sensible width.',
					raising:
						"Does nothing until a planet's difference passes 4 times the" +
						" Earth's. Such planets may then have still wider cells.",
					lowering:
						'Caps the width sooner on planets with a large difference.' +
						' The Earth is untouched unless it is lowered below about' +
						" 1.2. Today the widest is about 1.4 times the Earth's at the" +
						" Earth's day length.",
					source: 'A guess: a guard for extreme worlds.',
					tuned: null,
					bounds: { above: 0 },
				},
			},
		},
		{
			title: 'Where the band of low pressure sits',
			settings: {
				/**
				 * How far below the hottest band, in kelvin, a band still counts towards
				 * the hottest latitude: the mean latitude of the bands within this of
				 * the hottest, each weighted by how far above that it is and by its
				 * area. It keeps the hottest latitude from jumping between two bands
				 * about as hot as each other. Started at 2 K; tuned by hand to 4 K, which
				 * moves the simulated Earth's hottest latitude a little further from the
				 * equator.
				 */
				hotWindowK: {
					value: 4,
					unit: 'K',
					what:
						'How close to the hottest temperature a latitude must be to' +
						' count towards the hottest latitude, which places the band' +
						' of low pressure. Latitudes within this many kelvin are' +
						' averaged.',
					raising:
						'Mixed: the low is placed from a broader warm belt, so it' +
						' jumps less between two latitudes about as warm, and where' +
						" it ends up depends on the belt's shape. From 2 to 4 K it" +
						" moved the Earth's hottest latitude a little further from" +
						" the equator; from 2 to 8 K, a run moved the Earth's" +
						' tropical cell edges by 0.1° at most.',
					lowering:
						'The low follows the single warmest latitude more closely,' +
						' and can jump between two latitudes about as warm as each' +
						' other.',
					source: 'Started at 2 K.',
					tuned: 'Tuned by hand against the observed Earth, from 2 K.',
					bounds: { above: 0 },
					searchOrder: 5,
				},
				/**
				 * How many times as far from the equator as the hottest latitude the low
				 * lies, near the equator.
				 *
				 * @remarks
				 * On the observed Earth the zonal-mean low moves from about 5°S in
				 * January to about 15°N in July, with the hottest latitude. The simulated
				 * Earth's hottest latitude moves only from about 4°S to 5°N, a bias of
				 * the temperature model (its July land in the northern subtropics is too
				 * cool against its sea), so without this the low sits too near the
				 * equator in July and South Asia has no south-westerly monsoon. Tuned by
				 * hand against the observed Earth; 1 would be the rule as it stands.
				 *
				 * The low lies at `φ (1 + (G − 1) exp(−(φ / F)²))` for the hottest
				 * latitude `φ`, this `G` and `lowShiftFadeDeg` `F`: about `G φ` near the
				 * equator, where the temperature model's seasons are too weak, and the
				 * hottest latitude itself well away from it, short of the limit
				 * `lowLimitDeg` sets.
				 */
				lowShiftGain: {
					value: 2.5,
					unit: 'factor',
					what:
						'How many times further from the equator than the hottest' +
						' latitude the low sits, near the equator. It makes up for' +
						" the temperature model's seasons being too weak.",
					raising:
						'The low, and the subtropical highs with it, swing further' +
						' into the summer hemisphere each year, giving stronger' +
						' monsoons.',
					lowering:
						'The low stays nearer the equator. At 1 it sits at the' +
						' hottest latitude itself, and South Asia has no' +
						' south-westerly monsoon in July.',
					source: '1 is the plain rule.',
					tuned:
						"Tuned by hand against the observed Earth's low in January and July.",
					bounds: { above: 0 },
					searchOrder: 10,
				},
				/**
				 * Over how many degrees from the equator `lowShiftGain` fades: by a
				 * factor of e at this latitude, to almost nothing at twice it. The
				 * simulated Earth's hottest latitude stays within 5° of the equator,
				 * where the gain is almost whole; a planet with a steep tilt, whose
				 * hottest latitude can reach a pole, has its low at the hottest latitude
				 * or held short of it by `lowLimitDeg`.
				 * A guess, not tuned; the mapping from the hottest latitude to the low
				 * rises at every latitude with it.
				 */
				lowShiftFadeDeg: {
					value: 20,
					unit: '°',
					what:
						'The latitude over which that extra push fades. Well beyond' +
						' it, the low sits at the hottest latitude itself.',
					raising:
						'The push reaches further from the equator, so the low swings' +
						' further wherever the hottest latitude lies well off it:' +
						' over hot land, and on steeply tilted planets. Little change' +
						" to the Earth's band as a whole, whose hottest latitude" +
						' stays within about 6.5° of the equator, where the push is' +
						' nearly whole.',
					lowering:
						'The push fades sooner and the low stays nearer the hottest' +
						' latitude. Towards 5° it weakens the push on the Earth too,' +
						' and the low moves back towards the equator.',
					source: 'A guess.',
					tuned: null,
					bounds: { above: 0 },
				},
				/**
				 * How far the tropical cell's edges follow the low off the equator, as a
				 * share of the low's latitude, at the Earth's cell width: on the observed
				 * Earth the subtropical highs move about half as far through the year as
				 * the band of low pressure between them. The share falls to nothing as
				 * the cell widens to reach the poles. Not tuned.
				 */
				edgeShiftShare: {
					value: 0.5,
					unit: 'share',
					what:
						"How far the subtropical highs (the tropical cell's edges)" +
						" follow the low off the equator, as a share of the low's" +
						' move. It counts for less as the cells widen, and not at all' +
						' once they reach the poles.',
					raising:
						'The subtropical highs swing further north and south through' +
						' the year with the low; at 1 they move as far as it does.',
					lowering:
						'The highs stay more nearly where they are while the low' +
						' moves; at 0 they hardly move at all.',
					source:
						'The observed Earth: its subtropical highs move about half as' +
						' far through the year as the low.',
					tuned: null,
					bounds: { above: 0, atMost: 1 },
				},
				/**
				 * The farthest from the equator, in degrees, the low may lie on a planet
				 * whose cells are no wider than the Earth's: a low whose place would lie
				 * further out is held short of it.
				 *
				 * @remarks
				 * On a planet with a steep tilt the hottest latitude can lie near the
				 * summer pole, but how far from the equator the rising branch of the
				 * tropical cell can lie is bounded mainly by the rotation rate.
				 * Guendelman and Kaspi, "An axisymmetric limit for the width of the
				 * Hadley cell on planets with large obliquity and long seasonality"
				 * (arXiv:1903.11656, version 1, a manuscript submitted to Geophysical
				 * Research Letters), state in their key points that "The Hadley cell
				 * ascending branch position in planets with strong seasonal variation of
				 * temperature is mainly bounded by the rotation rate", and from their
				 * simulations of ocean-covered planets tilted 90°, at the Earth's
				 * rotation rate and at a quarter of it, that shifting the hottest
				 * temperature poleward "does not result in a global pole-to-pole Hadley
				 * circulation for simulations with an Earth-like rotation rate (Fig.
				 * 4b), even when the temperature gradient is increased (Fig. 4c).
				 * However, slowing down the rotation rate, allows the ascending branch
				 * to reach the pole". The paper gives no such limit as a number: the 70°,
				 * and the way the limit moves to the pole as the cells widen (see
				 * `lowLimitFromWidthDeg`), are this project's own choices. A guess, not
				 * tuned.
				 */
				lowLimitDeg: {
					value: 70,
					unit: '°',
					what:
						'The farthest from the equator the low may sit, on a planet' +
						' turning as fast as the Earth or faster. It matters only at' +
						' a steep tilt, where the hottest latitude can near a summer' +
						' pole.',
					raising:
						'The low may sit nearer the summer pole on steeply tilted' +
						' worlds. No effect on the Earth: its low never comes near' +
						' the limit.',
					lowering:
						'The low is held nearer the equator on steeply tilted worlds.' +
						" The Earth's lows reach at most 23.5° from the equator (over" +
						' land in August), so it would touch them only below about' +
						' 46°.',
					source:
						'Our choice, after a paper by Guendelman and Kaspi on tilted' +
						' planets, which gives no figure.',
					tuned: null,
					bounds: { above: 0, atMost: 90 },
				},
				/**
				 * The cells' width, in degrees, up to which the low's limit is
				 * `lowLimitDeg`: the Earth's, `EARTH_CELL_WIDTH_DEG`, so a planet
				 * turning as fast as the Earth or faster has its low held at about 70°.
				 * As the cells widen beyond it the limit moves smoothly, as `s²(3 − 2s)`
				 * of the share `s` of the way to `lowLimitToWidthDeg`, to the pole.
				 * Not tuned.
				 */
				lowLimitFromWidthDeg: {
					value: 30,
					unit: '°',
					what:
						'The cell width up to which that limit stays at 70°: the' +
						" Earth's width, so every planet turning as fast as the Earth" +
						' or faster keeps it. As cells widen beyond, the limit moves' +
						' to the pole.',
					raising:
						'Slower-turning planets keep the 70° limit too, so their low' +
						' is held further from the summer pole. No effect on the' +
						' Earth.',
					lowering:
						"The limit starts moving towards the pole even at the Earth's" +
						' day length, so the low of the Earth tilted 60° could sit' +
						' nearer its pole. No effect on the untilted Earth. Keep it' +
						' below lowLimitToWidthDeg.',
					source: "Our choice: the Earth's cell width.",
					tuned: null,
					bounds: { above: 0, atMost: 90 },
				},
				/**
				 * The cells' width, in degrees, from which the low's limit is the pole:
				 * 60°, the cells' width at a 4-day day, a quarter of the Earth's
				 * rotation rate, the slower of the two rotation rates whose simulations
				 * Guendelman and Kaspi report (see `lowLimitDeg`). A guess, not tuned.
				 */
				lowLimitToWidthDeg: {
					value: 60,
					unit: '°',
					what:
						'The cell width from which the low may reach the pole: the' +
						' width at a 4-day day.',
					raising:
						'Only slower-turning planets let the low reach the pole, and' +
						' between the two widths the limit rises more slowly. No' +
						' effect on the Earth.',
					lowering:
						'Planets with days between 1 and 4 Earth days let the low' +
						' near the pole sooner. No effect on the Earth. Keep it above' +
						' lowLimitFromWidthDeg.',
					source:
						"Our choice, after the slower of the paper's two spins, a" +
						" quarter of the Earth's.",
					tuned: null,
					bounds: { above: 0, atMost: 90 },
				},
				/**
				 * How the low is held short of its limit, as a share of the limit's
				 * distance from the pole: a low whose place lies within that share
				 * of that distance below the limit, or beyond the limit, is brought in
				 * by `K + E tanh((φ − K) / E)` for its place `φ` from the equator, the
				 * ease `E` this share times the limit's distance from the pole and the
				 * knee `K` the limit less it. The low follows its place in full up to
				 * the knee, 60° for a limit of 70°, and nears the limit smoothly beyond
				 * it, so neither the low nor the bands make a step or a corner as the
				 * hottest latitude moves; with the limit at the pole the low is not
				 * held at all. A guess, not tuned.
				 */
				lowLimitEaseShare: {
					value: 0.5,
					unit: 'share',
					what:
						'How gently the low is held short of its limit. It follows' +
						' the hottest latitude in full up to a knee (60° today), then' +
						' slows smoothly towards the limit.',
					raising:
						'The knee comes nearer the equator: the low is held back from' +
						' lower latitudes, but more gently. No effect on the Earth.',
					lowering:
						'The low follows the hottest latitude further, then stops' +
						' more sharply; at 0 it stops dead at the limit. No effect on' +
						' the Earth.',
					source: 'A guess.',
					tuned: null,
					bounds: { above: 0, atMost: 1 },
				},
			},
		},
		{
			title: 'Steep tilts',
			settings: {
				/**
				 * The narrowest the tropical cell may be on the side of the low towards
				 * the summer pole, as a share of the cells' width, so that a low far from
				 * the equator still has a side of some width; a side that would reach
				 * beyond the pole is cut short there. A guess, not tuned.
				 */
				minSummerCellShare: {
					value: 0.3,
					unit: 'share',
					what:
						'The narrowest the tropical cell may be on the summer side of' +
						" the low, as a share of a cell's width, when the low lies" +
						' far from the equator.',
					raising:
						'That side stays wider, so pressure rises more gently from' +
						' the low towards the summer pole. Matters mostly for a low' +
						' far out, at a steep tilt; on the Earth only over hot land' +
						' late in the northern summer, where the low lies furthest' +
						' out.',
					lowering:
						'The side can be squeezed narrower, giving a steeper,' +
						' ridge-like rise of pressure, and stronger winds there.',
					source: 'A guess.',
					tuned: null,
					bounds: { above: 0, atMost: 1 },
				},
				/**
				 * How far from the equator the low lies, as a share of the cells' width,
				 * when the narrowest side of the tropical cell starts to widen from
				 * `minSummerCellShare` of a cell: up to a whole cell at
				 * `wideSummerToShare`.
				 *
				 * @remarks
				 * The summer side of a cell carries a whole band's rise of pressure
				 * whatever its width, so squeezed to a third of a cell it rises three
				 * times as steeply as a band in full: on the case tilted 60°, whose July
				 * low lies near 58°N, it made a ridge 12.5 hPa high within 8° of the low,
				 * over air only 3 K cooler. Widening it as the low moves out past where
				 * the subtropical high would be keeps the rise as gentle as a band's,
				 * reaching the pole, the coolest place on that side, as a high. On the
				 * simulated Earth the low as a whole lies at most 0.51 of a cell from the
				 * equator, where the widened side is still narrower than the band's own,
				 * so those bands are unchanged. The lows placed by longitude lie up to
				 * 0.79 of a cell out over hot land from July to September, and there the
				 * widening acts. Set by hand against the tilted case, not against the
				 * observed Earth.
				 */
				wideSummerFromShare: {
					value: 0.4,
					unit: 'share',
					what:
						"How far out the low must lie, as a share of a cell's width," +
						' before a squeezed summer side starts to widen again towards' +
						' a whole cell.',
					raising:
						'The widening starts later, so a low far from the equator' +
						' keeps a narrower summer side and a steeper rise of' +
						' pressure.',
					lowering:
						'The widening starts sooner, keeping the rise gentler. On the' +
						' Earth it already acts over hot land from July to September,' +
						' where the low placed by longitude lies up to 0.79 of a cell' +
						' out; its band as a whole lies at most 0.51 out, and is' +
						' untouched.',
					source:
						'Set by hand against the Earth tilted 60°, before the bands' +
						' varied by longitude.',
					tuned: null,
					bounds: { above: 0, atMost: 1 },
				},
				/**
				 * How far from the equator the low lies, as a share of the cells' width,
				 * when the narrowest side of the tropical cell is a whole cell: see
				 * `wideSummerFromShare`. Set by hand with it.
				 */
				wideSummerToShare: {
					value: 0.8,
					unit: 'share',
					what:
						"How far out the low lies, as a share of a cell's width, when" +
						' the summer side is a whole cell again.',
					raising:
						'The widening is spread further, so for lows in between the' +
						' summer side is narrower and the rise steeper.',
					lowering:
						'The side is a whole cell again sooner, and the rise gentler.' +
						' Keep it above wideSummerFromShare. On the Earth, it acts' +
						' only over hot land from July to September.',
					source: 'Set by hand against the Earth tilted 60°.',
					tuned: null,
					bounds: { above: 0, atMost: 1 },
				},
				/**
				 * How much cooler, in kelvin, a side's pole must be than the low for the
				 * bands on that side to be in full.
				 *
				 * @remarks
				 * The bands stand for the overturning driven by the warmth of the low
				 * against the cold towards the poles. On the side of a low near a summer
				 * pole as warm as itself, nothing drives a cell, and a high there would
				 * cap the hottest place on the planet. Each side's slope is scaled by
				 * `s²(3 − 2s)` of `s`, its pole's drop below the low's temperature over
				 * this, from 0 to 1, fading to none as the pole on its side warms to the
				 * low's temperature.
				 *
				 * Started at 20 K; set by hand to 30 K against the case tilted 60°, whose
				 * July Arctic, 16 K cooler than its hottest latitude near 58°N, had a
				 * high rising 15 hPa within 8° of the low. Both sides of the simulated
				 * Earth's low keep their bands all but in full: its poles are about 30 K
				 * and more cooler than it in every month.
				 */
				sideContrastK: {
					value: 30,
					unit: 'K',
					what:
						'How much cooler a pole must be than the low for the bands on' +
						' its side to be at full strength. On a side whose pole is' +
						' nearly as warm as the low, the bands fade away.',
					raising:
						'The bands weaken on any side whose pole is not much colder' +
						" than the low. The Earth's poles are about 30 K or more" +
						' cooler than its low, so its summer bands weaken too:' +
						' already in January its southern side is at 98% strength.',
					lowering:
						'The bands stay strong even beside a pole only a little' +
						' cooler than the low. At 20 K, the Earth tilted 60° had a' +
						' high rising 15 hPa within 8° of its July low, over a warm' +
						' Arctic.',
					source: 'Started at 20 K. Set by hand against the Earth tilted 60°.',
					tuned: null,
					bounds: { above: 0 },
					searchOrder: 9,
				},
			},
		},
		{
			title: 'The bands far from the low',
			settings: {
				/**
				 * The share of the bands' slope that is kept in the bands beyond
				 * `fullBandsReachDeg` (and never within two cells of the low), eased in
				 * over the first quarter of a cell beyond: the observed surface polar
				 * easterlies are weak, about a fifth as strong in the zonal mean as the
				 * westerlies. Started at 1; tuned by hand against the observed Earth's
				 * polar winds.
				 */
				outerCellShare: {
					value: 0.3,
					unit: 'share',
					what:
						'The share of strength kept by the bands beyond the second' +
						' cell from the low: the polar easterlies, which are weak on' +
						' the real Earth.',
					raising:
						'Stronger polar easterlies, and more pressure difference' +
						' between the subpolar lows and the poles. At 1 every band is' +
						' as strong as the first two.',
					lowering:
						'Weaker polar winds; at 0 the bands beyond the second are' +
						' flat.',
					source: "Started at 1; moved for the Earth's polar winds.",
					tuned: "Tuned by hand against the observed Earth's polar winds.",
					bounds: { above: 0, atMost: 1 },
					searchOrder: 11,
				},
				/**
				 * How far from the low, in degrees of latitude at the Earth's contrast,
				 * the bands keep their full strength on a planet spinning faster than
				 * the Earth: two of the Earth's cell widths, the reach of its tropical
				 * cell and the cell beyond.
				 *
				 * @remarks
				 * In the bands' phase, the cells counted from the low, the weakening to
				 * `outerCellShare` starts at the larger of 2 and this over the cells'
				 * width as the spin alone sets it (`EARTH_CELL_WIDTH_DEG` times
				 * `(Ω_E / Ω)` to `rotationPower`, the contrast left out), the two joined
				 * smoothly over `FULL_BANDS_EASE_CELLS`: so at 2, as when every
				 * band beyond the second was weakened, at the Earth's spin and slower,
				 * whatever the contrast, and at about 3.3 for an 8-hour day, whose extra
				 * bands are then as strong as the Earth's westerlies. The contrast is
				 * left out so that every planet with the Earth's spin, the Earth itself
				 * and the Earth tilted 60° among them, keeps its bands beyond the second
				 * weak, the winter's weak winds included, and nothing changes at the
				 * Earth's spin. Since the phase is counted in cells of the width the
				 * contrast scales, the reach in latitude is this times the contrast's
				 * share of the Earth's to `contrastPower`, less an eighth of a cell for
				 * the easing: from about 42° to 85° over the contrasts taken, 60° at the
				 * Earth's. A guess, not tuned.
				 */
				fullBandsReachDeg: {
					value: 60,
					unit: '°',
					what:
						'On a planet spinning faster than the Earth, how far from the' +
						" low the bands keep full strength. At the Earth's spin and" +
						' slower, only the first two cells are at full strength.',
					raising:
						'Fast-spinning planets keep more of their extra bands at full' +
						" strength. Above 60° it reaches past the Earth's second" +
						" cell, so the Earth's polar easterlies strengthen too.",
					lowering:
						"No effect at the Earth's spin or slower. Fast-spinning" +
						' planets keep fewer bands at full strength, down to the' +
						' first two, as on the Earth.',
					source: "Our choice: two of the Earth's cell widths.",
					tuned: null,
					bounds: { above: 0 },
				},
				/**
				 * Over how many degrees from each pole the bands' slope is eased to
				 * nothing, so that the pressure has no point at the pole when the cells
				 * do not fit a whole number of times between the tropical cell and the
				 * pole. Started at 15°; 10° keeps more of the polar cell. Not tuned
				 * against the observed Earth.
				 */
				poleTaperDeg: {
					value: 10,
					unit: '°',
					what:
						'The distance from each pole over which the bands ease out to' +
						' nothing, so the pressure does not come to a point at the' +
						' pole.',
					raising:
						'The bands fade over a wider polar cap: weaker winds near the' +
						' poles.',
					lowering:
						'The bands keep their strength closer to each pole, the polar' +
						' winds reaching further poleward.',
					source:
						'Started at 15°. Moved by hand to keep more of the polar' +
						' cell, not against the observed Earth.',
					tuned: null,
					bounds: { above: 0, atMost: 90 },
					searchOrder: 8,
				},
			},
		},
		{
			title: 'Bands that follow land and sea',
			settings: {
				/**
				 * The share, 0 to 1, of where the low lies, and with it the tropical
				 * cell's edges, that is taken from the temperature near each longitude
				 * rather than from the whole latitude's, at its full in the tropics and
				 * subtropics (see `localBandsFullToDeg`).
				 *
				 * @remarks
				 * With the low placed from the whole globe's hottest latitude, a large
				 * continent's seasons move the bands over the open ocean on the far side
				 * of the planet as far as over the land: on the one-continent world the
				 * oceanic subtropical highs moved about 20° of latitude between January
				 * and July, where the observed Earth's move 5° to 10°. Placed from the
				 * temperature within `localWindowDeg` of longitude, the low over the
				 * open ocean follows the ocean's own seasons, and over land the land's.
				 * Only the low's place varies by longitude: the cells' width, each
				 * side's strength, the low's limit and the outer bands are still worked
				 * out from the whole latitude's temperature, and so are the thermal highs
				 * and lows. At 0 the bands are one pattern round the globe, the model as
				 * it was before they varied by longitude, exactly. This project's
				 * choice, not tuned against the observed Earth.
				 */
				localBandsShare: {
					value: 1,
					unit: 'share',
					what:
						"How much of the low's place, in the tropics and subtropics," +
						' is taken from the temperature near each longitude rather' +
						" than the whole latitude's: the bands over an ocean follow" +
						" the ocean's seasons, those over a continent the" +
						" continent's.",
					raising:
						'Already at its full value. Above 1 it would overshoot the' +
						' local placing, which it is not meant for.',
					lowering:
						'The bands become more nearly one pattern round the globe. At' +
						' 0, the model before the bands varied by longitude, the far' +
						" ocean's subtropical highs on the one-continent world move" +
						' 18° and 23° between January and July, against 5° and 7°' +
						" now, and the Earth's July south-west monsoon falls from" +
						' (+4.5, +3.2) to (+2.0, +1.3) m/s.',
					source: 'Our choice.',
					tuned: null,
					bounds: { above: 0, atMost: 1 },
				},
				/**
				 * The full width, in degrees of longitude, of the window the
				 * temperature is taken in to place the low at a longitude: long enough
				 * that the low follows a continent or an ocean as a whole rather than
				 * its coasts, and short enough that the far side of a planet with one
				 * large continent sees mostly its ocean. Its weight is whole over the
				 * middle half of the window and tapers to nothing at its ends (see
				 * `localWindowTaperShare`).
				 *
				 * @remarks
				 * 120° and 180° were tried. Both leave the one-continent world's open
				 * ocean much the same, its subtropical highs moving about 5° and 7°
				 * between January and July against 18° and 23° with one pattern round
				 * the globe. 120° follows the land more closely, which strengthens the
				 * Earth's July south-west monsoon more, but it weakens the annual mean
				 * winds of the Earth tilted 60° in the north to under 0.5 m/s at every
				 * latitude, so that its one band there is no longer counted; 180° keeps
				 * every case's bands as they were, and moves the Earth's whole-year
				 * figures less. This project's choice, not tuned against the observed
				 * Earth.
				 */
				localWindowDeg: {
					value: 180,
					unit: '°',
					what:
						'The width in longitude of the window the temperature is' +
						' averaged over to place the low at each longitude.',
					raising:
						'The window takes in more of the globe, so the low follows a' +
						' continent or an ocean less, and the bands come nearer one' +
						' pattern round the globe.',
					lowering:
						'The low follows the land beneath it more closely. At 120°' +
						" the open ocean's bands move as little and the Earth's July" +
						' south-west monsoon is stronger, but the Earth tilted 60°' +
						' loses its northern band of yearly winds.',
					source: 'Our choice, after trying 120° and 180°.',
					tuned: null,
					bounds: { above: 0, atMost: 360 },
				},
				/**
				 * The share of each half of the window, from its ends inwards, over
				 * which its weight tapers, as the square of a cosine, from whole to
				 * nothing: the window's smoothing round the globe, so that the low moves
				 * gently as the window slides from sea onto land. This project's
				 * choice, not tuned against the observed Earth.
				 */
				localWindowTaperShare: {
					value: 0.5,
					unit: 'share',
					what:
						'How much of each half of the window fades out gradually' +
						' towards its end, rather than counting in full.',
					raising:
						'Softer edges, and the part counting in full shrinks: the low' +
						' moves more gently as the window slides from sea onto land,' +
						' and follows nearby land a little more.',
					lowering:
						'The window counts evenly almost to its ends, so the low' +
						' changes more abruptly from one longitude to the next as a' +
						' coast enters or leaves it. At 0 it is a plain box.',
					source: 'Our choice.',
					tuned: null,
					bounds: { above: 0, atMost: 1 },
				},
				/**
				 * The latitude, in degrees from the equator, up to which the bands'
				 * place follows the temperature near each longitude in full
				 * (`localBandsShare` of it): the tropics and subtropics, the tropical
				 * cell's edges and the subtropical highs among them. Beyond it the local
				 * bands blend into the one pattern round the globe, as `s²(3 − 2s)` of
				 * the share `s` of the way to `localBandsGlobalFromDeg`, which must lie
				 * beyond it, or the share would fall at once to none here and leave a
				 * step in the pressure (`windSettings` refuses such a pair). This
				 * project's choice, not tuned against the observed Earth.
				 */
				localBandsFullToDeg: {
					value: 40,
					unit: '°',
					what:
						'The latitude up to which the bands follow the temperature' +
						' near each longitude in full. Beyond it they blend into one' +
						' pattern round the globe.',
					raising:
						'Land and sea shape the bands further from the equator, and' +
						' the blend is squeezed into a narrower belt. It must stay' +
						' below localBandsGlobalFromDeg; the model refuses it' +
						' otherwise.',
					lowering:
						'The blend starts nearer the equator and is spread wider, so' +
						' every band from the new value to 70°, the subtropical highs' +
						' among them, follows the land and sea beneath it less.',
					source: 'Our choice.',
					tuned: null,
					bounds: { above: 0, atMost: 90 },
				},
				/**
				 * The latitude, in degrees from the equator, from which the bands are
				 * the one pattern round the globe: towards a pole every longitude meets,
				 * so the pressure there must not depend on the side it is approached
				 * from. Past the subpolar lows, and short of where the bands fade to
				 * nothing at the poles (see `poleTaperDeg`). It must lie beyond
				 * `localBandsFullToDeg`, so that the blend between them has some width
				 * (`windSettings` refuses it otherwise). This project's choice, not
				 * tuned against the observed Earth.
				 */
				localBandsGlobalFromDeg: {
					value: 70,
					unit: '°',
					what:
						'The latitude from which the bands are one pattern round the' +
						' globe, as they must be towards a pole, where every' +
						' longitude meets.',
					raising:
						'Land and sea shape the bands further towards the poles, and' +
						' the blend is spread over a wider belt.',
					lowering:
						'The bands are one pattern from nearer the equator, and the' +
						' blend is squeezed. It must stay above localBandsFullToDeg.',
					source:
						'Our choice: past the subpolar lows, short of the fade at the' +
						' poles.',
					tuned: null,
					bounds: { above: 0, atMost: 90 },
				},
			},
		},
		{
			title: 'How strong the bands are',
			settings: {
				/**
				 * Half the rise of the Earth's tropical cell, in hectopascals, before the
				 * rise is scaled by latitude (see `zonalBands`): it sets the speed
				 * of the bands' winds, about 6.5 m/s over the sea at the middle of the
				 * first two cells, and a third of that in the cells beyond. The observed
				 * zonal-mean sea-level pressure rises about 8 hPa from the low to the
				 * subtropical highs and falls 15 to 25 hPa from them to the subpolar
				 * lows. Started at 5; tuned by hand against the observed Earth's winds.
				 */
				bandAmplitudeHpa: {
					value: 9,
					unit: 'hPa',
					what:
						'How strong the pressure bands are: the rise from the low to' +
						' the subtropical highs, and so how fast the trade winds and' +
						' westerlies blow.',
					raising:
						'Higher subtropical highs, deeper subpolar lows, and faster' +
						' trades and westerlies, in proportion. At 9 hPa they blow' +
						' about 6.5 m/s over the sea in the first two cells.',
					lowering:
						'Weaker bands and slower winds, in proportion; the highs and' +
						' lows over land and sea then count for more beside them.',
					source: "Started at 5 hPa; moved for the Earth's winds.",
					tuned:
						"Tuned by hand against the observed Earth's winds, from 5 hPa.",
					bounds: { above: 0 },
					searchOrder: 2,
				},
			},
		},
		{
			title: 'Highs and lows over land and sea',
			settings: {
				/**
				 * Hectopascals of pressure for each kelvin a place's sea-level
				 * temperature lies below its latitude's mean, on low land.
				 *
				 * @remarks
				 * By the hypsometric equation, a layer of air `h` deep colder by `ΔT`
				 * than its surroundings at temperature `T` weighs more by
				 * `p h ΔT / (T H)` at the ground, with `H` the scale height, about 8 km.
				 * For a layer 1.5 km deep, as the shallow cold highs over winter
				 * continents are, that is about 0.7 hPa a kelvin at 1,000 hPa and 270 K,
				 * which is where it started. Tuned by hand to 3 against the observed
				 * Earth's Siberian high and its summer low over South Asia, which the
				 * simulated temperature makes too weak at the start's value, and put
				 * back to 0.7 when the winds began to carry heat: at 3 the winds' own
				 * feedback on the temperature did not settle.
				 */
				thermalHpaPerK: {
					value: 0.7,
					unit: 'hPa/K',
					what:
						'Pressure added for each kelvin a place is colder than its' +
						" latitude's average, and taken away for each kelvin warmer:" +
						' the winter highs over cold continents and summer lows over' +
						' hot ones.',
					raising:
						'Stronger winter highs, such as the Siberian high, deeper' +
						' summer lows, and stronger monsoon winds out of and into the' +
						' continents. Once the winds carry heat it also strengthens the' +
						" loop's feedback: at 3 the climate loop's passes shrank by" +
						' about 0.7 each and the Earth did not settle in eight.',
					lowering:
						'Weaker highs and lows over land; the bands dominate. At 0.7,' +
						" the physical figure, the Earth's Siberian high and South Asian" +
						' summer low come out weaker than observed.',
					source: 'Physics: 0.7 hPa/K for a cold layer 1.5 km deep.',
					tuned:
						"Tuned by hand to 3 against the observed Earth's Siberian high and its summer low over South Asia, then put back to the physical 0.7 when the winds began to carry heat, so that the climate loop settles; retuning waits for the winds' own tuning step.",
					bounds: { above: 0 },
					searchOrder: 3,
				},
				/**
				 * How far the thermal highs and lows are smoothed, in kilometres, as
				 * `smoothField` takes it: about the size of the observed Siberian
				 * high and the summer lows over the continents. Started at 750 km; tuned
				 * by hand to 900.
				 */
				thermalSmoothingKm: {
					value: 900,
					unit: 'km',
					what:
						'How far those highs and lows over land and sea are spread' +
						' out: about the size of the Siberian winter high.',
					raising:
						'Broader, shallower highs and lows: their centres weaken, and' +
						' the winds round them are gentler but reach over a wider' +
						' area.',
					lowering:
						'Tighter, sharper highs and lows that follow each coast and' +
						' patch of land more closely, with stronger winds close to' +
						' them.',
					source: 'Started at 750 km.',
					tuned: 'Tuned by hand against the observed Earth, from 750 km.',
					bounds: { above: 0 },
					searchOrder: 4,
				},
				/**
				 * The share of the thermal response over the sea.
				 *
				 * @remarks
				 * Air over a sea warmer or colder than its latitude is mixed deep by
				 * convection or sits over a sea whose warmth lies in the water, not the
				 * air, so it does not make the shallow dome of cold or hot air that land
				 * does; and in winter the subtropical oceans, warm against cold land,
				 * would otherwise carry lows where the observed Earth has its
				 * subtropical highs and trade winds. A guess, brought in at 0.3 while
				 * tuning by hand against the observed Earth's Pacific trades and kept
				 * there; 1, the land's, was the rule before it.
				 */
				seaThermalShare: {
					value: 0.3,
					unit: 'share',
					what:
						"The share of that response the sea gets, against land's. Air" +
						' over a warm or cold sea does not pool into a shallow dome' +
						' as it does over land.',
					raising:
						'Seas warmer or colder than their latitude make more of their' +
						' own highs and lows. Near 1, warm subtropical seas in winter' +
						' carry lows where the Earth has its subtropical highs and' +
						' trade winds.',
					lowering:
						'Pressure over the sea comes more from the bands alone; at 0' +
						" the sea's own warmth or cold makes no pressure.",
					source:
						"Was 1, the land's value; brought in for the Earth's Pacific" +
						' trade winds.',
					tuned:
						"Tuned by hand against the observed Earth's Pacific trade winds.",
					bounds: { above: 0, atMost: 1 },
					searchOrder: 12,
				},
				/**
				 * The warmth, in kelvin above a latitude's mean, at which a warm place's
				 * low stops deepening as fast: a warmth `w` counts as `W tanh(w / W)`.
				 *
				 * @remarks
				 * Cold air pools in a shallow, stable dome, so a cold high keeps growing
				 * with the cold, up to `coldKneeK`; hot air mixes deep, and the low it makes is partly
				 * undone by a high above it. The simulated Earth's continental interiors
				 * are far hotter in summer than its coasts at the same latitude, which
				 * without a limit gives a deep low over Siberia and none to speak of over
				 * South Asia. A guess, first tried at 5 K, then at 4, 6 and 8 K by hand
				 * against the observed Earth's July, and kept at 6; with no limit at all,
				 * the rule before it, a warm place's low deepens without end.
				 */
				warmLimitK: {
					value: 6,
					unit: 'K',
					what:
						"Caps how deep a hot place's low gets: warmth above the" +
						" latitude's average counts less and less beyond about this" +
						' many kelvin, so a low is at most about 4 hPa deep before' +
						' smoothing at 0.7 hPa/K (18 hPa at 3 hPa/K).',
					raising:
						"Hot places' lows deepen further. With no cap, the Earth's" +
						' hot continental interiors give a deep summer low over' +
						' Siberia and none to speak of over South Asia.',
					lowering:
						'Shallower summer lows over hot land, and weaker winds drawn' +
						" into them. 4, 6 and 8 K were tried against the Earth's" +
						' July.',
					source: 'First tried at 5 K; no cap before.',
					tuned:
						"Tuned by hand against the observed Earth's July, trying 5, 4, 6 and 8 K.",
					bounds: { above: 0 },
					searchOrder: 13,
				},
				/**
				 * The cold, in kelvin below a latitude's mean, up to which a cold place's
				 * high grows in full with the cold: beyond it the cold counts less and
				 * less, levelling off at `coldLimitK`.
				 *
				 * @remarks
				 * Without a limit a cold high grows without end, `thermalHpaPerK` for
				 * every kelvin, so an extreme world could carry a high far beyond any on
				 * the Earth, whose record is about 1,084 hPa. The simulated Earth's
				 * coldest place against its latitude, on the 64 grid over the year, is
				 * 17.0 K below it (in January, at 43°N 88°E, in the basins north of
				 * Tibet), so a knee at 20 K leaves the Earth's pressure exactly as it
				 * was; the Earth tilted 60° reaches 24.3 K, and is limited a little. A
				 * guess, not tuned.
				 */
				coldKneeK: {
					value: 20,
					unit: 'K',
					what:
						'Up to this many kelvin colder than its latitude, a cold' +
						" place's high grows in full with the cold; beyond it, extra" +
						' cold counts less and less.',
					raising:
						'No effect on the Earth, whose coldest place is 17 K below' +
						' its latitude. Very cold places on extreme worlds build' +
						' higher highs. At coldLimitK or above, the cold is cut off' +
						' here.',
					lowering:
						"No effect until below 17 K. Then the Earth's strongest" +
						' winter highs, in the basins north of Tibet, start to be' +
						' trimmed.',
					source: 'A guess: a guard for extreme worlds.',
					tuned: null,
					bounds: { above: 0 },
				},
				/**
				 * The most cold, in kelvin below a latitude's mean, that a cold place's
				 * high counts, however cold the place: a cold `c` beyond `coldKneeK` `K`
				 * counts as `K + (L − K) tanh((c − K) / (L − K))` for this `L`, which
				 * follows the cold in full at the knee and levels off smoothly. At
				 * `thermalHpaPerK`'s 0.7 hPa a kelvin it gives a high on low land at
				 * most 17.5 hPa above its latitude before smoothing; at the 3 hPa a
				 * kelvin it was tuned at, 75 hPa, which with the reference pressure of
				 * 1,011 hPa is about the Earth's record of 1,084 hPa. A guess, not
				 * tuned.
				 */
				coldLimitK: {
					value: 25,
					unit: 'K',
					what:
						'The most cold a high counts, however cold the place. At 0.7' +
						' hPa/K it keeps a high on low land within 17.5 hPa of its' +
						' latitude before smoothing; at 3 hPa/K, 75 hPa, about the' +
						" Earth's record of 1,084 hPa.",
					raising:
						'No effect on the Earth. Very cold places on extreme worlds' +
						' get higher highs.',
					lowering:
						'No effect on the Earth. Highs on extreme worlds level off' +
						' sooner; at or below coldKneeK the cold is cut off at the' +
						' knee. The Earth tilted 60°, 24.3 K at its coldest, is held' +
						' back a little already.',
					source: 'A guess: a guard for extreme worlds.',
					tuned: null,
					bounds: { above: 0 },
				},
				/**
				 * The height, in metres, over which the thermal response of high ground
				 * falls by a factor of e.
				 *
				 * @remarks
				 * The temperature of a plateau brought down to sea level stands for air
				 * that is not there: the cold of the Tibetan Plateau in winter is not a
				 * dome of cold air above the sea, and taken in full it centres the Asian
				 * winter high on the plateau rather than on Mongolia and Siberia, with
				 * winds of 15 to 20 m/s down into India. A guess, first tried at 1,500 m,
				 * which took too much of the Siberian high on the Mongolian plateau, then
				 * set by hand to 2,500 m; with no fall at all, the rule before it, high
				 * ground counts in full.
				 */
				thermalHeightM: {
					value: 2500,
					unit: 'm',
					what:
						"Fades the land's response over high ground, by a factor of" +
						' about 2.7 for every this many metres of height, so a cold' +
						' plateau is not taken for a dome of cold air.',
					raising:
						'High ground counts for more. In full, the Asian winter high' +
						' sits on the Tibetan Plateau rather than Mongolia and' +
						' Siberia, with winds of 15 to 20 m/s down into India.',
					lowering:
						'High ground counts for less. At 1,500 m too much of the' +
						' Siberian high on the Mongolian plateau was lost.',
					source: 'First tried at 1,500 m; no fade before.',
					tuned:
						"Tuned by hand against the observed Earth's Asian winter high, from 1,500 m.",
					bounds: { above: 0 },
					searchOrder: 14,
				},
			},
		},
		{
			title: 'The wind from the pressure',
			settings: {
				/**
				 * The linear friction on the wind over the sea, per second.
				 *
				 * @remarks
				 * With friction `k` and Coriolis parameter `f` the wind crosses the
				 * isobars at `atan(k / f)`. The 10-metre wind over the sea crosses them
				 * at about 20° in mid-latitudes, where `f` is about 1.0e-4 s⁻¹, which
				 * gives `k` about 3.7e-5 s⁻¹, a spin-down time of about 7.5 hours; that
				 * is where it started. Tuned by hand to 2.5e-5 s⁻¹, about 14° in
				 * mid-latitudes and 34° at 15°, for trade winds less across the isobars.
				 */
				seaFrictionPerS: {
					value: 2.5e-5,
					unit: '1/s',
					what:
						'Friction on the wind over the sea. It sets how far the wind' +
						' cuts across the lines of equal pressure towards the low,' +
						" and slows it. Land's friction is a multiple of it.",
					raising:
						'The wind crosses the pressure lines more steeply towards the' +
						' low and blows more slowly, most of all over land. At 3.7e-5' +
						' /s it crosses at about 20° in mid-latitudes.',
					lowering:
						'The wind follows the pressure lines more closely and blows' +
						' faster. Today it crosses at about 14° in mid-latitudes and' +
						' 34° at 15° from the equator.',
					source: 'Started at 3.7e-5 /s, from the observed crossing angle.',
					tuned:
						"Tuned by hand against the observed Earth's trade winds, from 3.7e-5 /s.",
					bounds: { above: 0 },
					searchOrder: 6,
				},
				/**
				 * How many times the sea's friction the land's is. Started at 2, for the
				 * 10-metre wind over land crossing the isobars at about 35° against the
				 * sea friction's starting value of 3.7e-5 s⁻¹; tuned by hand to 5, which
				 * brings the simulated Earth's mean speed over land near the observed
				 * 1.8 m/s, at the cost of crossing the isobars at about 50° in
				 * mid-latitudes.
				 */
				landFrictionFactor: {
					value: 5,
					unit: 'factor',
					what:
						"How many times the sea's friction the land's is: how much" +
						' land slows the wind.',
					raising:
						'Slower winds over land, crossing the pressure lines more' +
						" steeply. At 5 the Earth's land winds average near the" +
						' observed 1.8 m/s, but cross at about 50°, more than' +
						' observed.',
					lowering:
						'Faster winds over land, following the pressure lines more' +
						" closely: at 2, with the sea's starting friction, they" +
						' crossed at about 35°.',
					source: "Started at 2; moved for the Earth's winds over land.",
					tuned:
						"Tuned by hand against the observed Earth's mean wind speed over land, from 2.",
					bounds: { above: 0 },
					searchOrder: 7,
				},
				/**
				 * The slope of the ground, rise over run, at which high ground takes
				 * away half of the wind's part up or down that slope, turning the wind
				 * along it: a rise of 1 km over 200 km, a little over a cell's width on
				 * the 64 grid. A guess, not tuned.
				 */
				blockingSlope: {
					value: 0.005,
					unit: 'slope',
					what:
						'The slope (1 km in 200 km) at which high ground takes away' +
						" half of the wind's part up or down it, so the wind slows" +
						' and turns along the slope.',
					raising:
						'Mountains block less: steeper ground is needed to slow the' +
						' wind across it, so more of it blows straight over ranges.',
					lowering:
						'Even gentle slopes slow the wind across them and turn it' +
						' along ranges and high coasts.',
					source: 'A guess.',
					tuned: null,
					bounds: { above: 0 },
				},
			},
		},
	],
	{
		title: 'Fixed choices (not overridable for a run)',
		settings: {
			/**
			 * The globe's area-weighted mean sea-level pressure, in hectopascals,
			 * that every month's pressure is shifted to. The observed Earth's mean
			 * of 1981 to 2010, over every month, on the 64 grid, rounded to a whole
			 * hectopascal; it is below the standard atmosphere's 1,013.25 hPa
			 * because the observed pressure is reduced to sea level over high
			 * ground too.
			 */
			referencePressureHpa: {
				value: 1011,
				unit: 'hPa',
				what:
					"The globe's area-weighted mean sea-level pressure, which every" +
					" month's pressure is shifted to: the model neither makes air nor" +
					' loses it.',
				raising:
					'Every pressure is higher by the same amount. The winds follow' +
					' pressure differences, so they do not change.',
				lowering:
					'Every pressure is lower by the same amount; the winds do not change.',
				source:
					"The observed Earth's mean of 1981 to 2010 on the 64 grid, rounded" +
					' to a whole hectopascal.',
				tuned: null,
			},
			/**
			 * The density of the air near the surface, in kilograms a cubic metre:
			 * the standard atmosphere's 1.225 kg m⁻³ at sea level and 15 °C,
			 * rounded down for air a little warmer and higher on average.
			 */
			airDensityKgM3: {
				value: 1.2,
				unit: 'kg/m³',
				what:
					'The density of the air near the surface, which turns a pressure' +
					" gradient into the push on the wind's momentum.",
				raising:
					'The same pressure gradient pushes the wind less: weaker winds' +
					' everywhere, in proportion.',
				lowering:
					'The same gradient pushes harder: stronger winds everywhere, in proportion.',
				source:
					"The standard atmosphere's 1.225 kg/m³, rounded down for air a" +
					' little warmer and higher on average.',
				tuned: null,
			},
			/**
			 * The width of the Earth's tropical (Hadley) cell, in degrees of
			 * latitude from the low to the subtropical high: the observed
			 * subtropical highs lie near 30° in both hemispheres. It is also the
			 * width of each cell beyond: the observed subpolar lows lie near 60°
			 * and the polar highs at the poles.
			 */
			earthCellWidthDeg: {
				value: 30,
				unit: '°',
				what:
					"The width of the Earth's tropical cell, from the low to the" +
					' subtropical high, and of each cell beyond it: the width every' +
					" other planet's cells are scaled from.",
				raising:
					"Every planet's cells come out wider in proportion. Settings in" +
					" degrees written against the Earth's 30° (lowLimitFromWidthDeg," +
					' fullBandsReachDeg) do not follow it.',
				lowering:
					'The opposite: narrower cells, with the same settings left behind.',
				source:
					'The observed Earth: its subtropical highs lie near 30° in both' +
					' hemispheres, and its subpolar lows near 60°.',
				tuned: null,
			},
			/**
			 * Over how many cells of phase the start of the outer bands' weakening
			 * turns from the third band to `fullBandsReachDeg` from the low, so
			 * that the bands have no corner as the day length changes.
			 */
			fullBandsEaseCells: {
				value: 0.25,
				unit: 'cells',
				what:
					"Over how many cells the start of the outer bands' weakening turns" +
					' from the third band to fullBandsReachDeg from the low, so that' +
					' the bands have no corner as the day length changes.',
				raising:
					'A gentler turn: the start of the weakening changes over a wider' +
					' run of day lengths.',
				lowering:
					'A sharper turn, nearer a corner in the bands as the day length' +
					' changes.',
				source: 'A guess.',
				tuned: null,
			},
		},
	},
);

/**
 * The ocean model's settings: the wind-driven gyres.
 *
 * @remarks
 * Each starts from a published or physical figure, or a figure worked out
 * from observed ones; none was tuned. The model's value object is
 * `DEFAULT_GYRE_SETTINGS`.
 */
export const OCEAN_CONFIG = defineSection(
	'Ocean',
	[
		{
			title: "The wind's push on the sea",
			settings: {
				/**
				 * The bulk drag coefficient of the sea's surface for the wind at 10 m:
				 * Large and Pond (1981), "Open ocean momentum flux measurements in
				 * moderate to strong winds", Journal of Physical Oceanography 11, give
				 * 1.2e-3 for winds of 4 to 11 m/s.
				 */
				dragCoefficient: {
					value: 1.2e-3,
					unit: 'ratio',
					what:
						"How hard the wind pushes on the sea: the push is the air's" +
						' density times this times the wind speed squared. The push' +
						' drives the gyres and the Ekman transport.',
					raising:
						'Every current driven by the wind is stronger, in proportion:' +
						' the gyres, their western boundary currents and the Ekman' +
						' transport.',
					lowering:
						'Every current driven by the wind is weaker, in proportion.',
					source:
						'Published: Large and Pond (1981), 1.2e-3 for winds of 4 to' +
						' 11 m/s.',
					tuned: null,
				},
			},
		},
		{
			title: 'The gyres',
			settings: {
				/**
				 * The friction rate of Stommel's gyre, which sets its western boundary
				 * current's width `r / β`: 100 km at 30° latitude, where `β` is about
				 * 2e-11 m⁻¹ s⁻¹, the width of the observed Gulf Stream off the
				 * American coast. The 256 grid resolves it; on the 64 and 128 grids
				 * the solve spreads the current over about a cell (see
				 * `createCornerSolver`).
				 */
				frictionPerS: {
					value: 2e-6,
					unit: '1/s',
					what:
						"Friction on the sea's wind-driven flow. With the change of" +
						" the Earth's turning with latitude it sets the width of each" +
						" gyre's western boundary current: this over about 2e-11 /m/s" +
						' at 30° latitude, 100 km.',
					raising:
						'A wider, slower western boundary current, and a little less' +
						' carried round each gyre. At 6e-6 /s the current is about' +
						' 300 km wide, and a gyre 60° wide carries about a third less.',
					lowering:
						'A narrower, faster boundary current, down to about a cell' +
						' of the grid, where the solve adds its own spreading.',
					source:
						"Stommel's boundary-layer width r/β set to the observed Gulf" +
						" Stream's, about 100 km at 30°.",
					tuned: null,
				},
				/**
				 * The friction in the channel round a land that reaches round the
				 * globe, as Antarctica does: on every corner whose circle of latitude
				 * crosses no land. There the flow round the globe is held back by
				 * friction alone, and carries the wind's push over this rate, so with
				 * the gyres' friction it would grow without bound as that is lowered.
				 * The observed circumpolar current is held back mostly by the
				 * pressure on the sea floor's ridges; as a linear drag, about
				 * 0.15 N/m² of wind stress over a channel about 2000 km wide carrying
				 * about 140 Sv (Cunningham et al. 2003, "Transport and variability of
				 * the Antarctic Circumpolar Current in Drake Passage", Journal of
				 * Geophysical Research 108) is `0.15 × 2e6 / (1025 × 1.4e8)`, about
				 * 2e-6 s⁻¹.
				 */
				channelFrictionPerS: {
					value: 2e-6,
					unit: '1/s',
					what:
						'The friction on the sea where it can flow round the globe,' +
						' along circles of latitude that cross no land, as between' +
						' Antarctica and the southern tips of the continents. It' +
						' stands for the pressure on the sea floor that holds the' +
						' observed circumpolar current back, and keeps that current' +
						" from following the gyres' friction.",
					raising:
						'Less flows round the globe, in proportion: a weaker' +
						' circumpolar current.',
					lowering:
						'More flows round the globe, in proportion: a stronger' +
						' circumpolar current.',
					source:
						'Worked out from the observed circumpolar current: about' +
						' 140 Sv (Cunningham et al., 2003) under about 0.15 N/m² of' +
						' wind stress across about 2000 km.',
					tuned: null,
				},
				/**
				 * The depth the transport is spread over for the surface current: the
				 * Florida Current carries about 32 Sv (Meinen, Baringer and Garcia
				 * 2010, "Florida Current transport variability: an analysis of annual
				 * and longer-period signals", Deep-Sea Research I 57) at about
				 * 1.8 m/s at the surface across about 90 km, which is
				 * `3.2e7 / (1.8 × 9e4)`, about 200 m.
				 */
				layerDepthM: {
					value: 200,
					unit: 'm',
					what:
						"The depth the gyres' transport is taken to be spread over:" +
						' the surface current is the transport over this depth, and' +
						' so are the flows across the edges the heat is carried by.',
					raising:
						'Slower surface currents and smaller flows for the same' +
						' transport.',
					lowering:
						'Faster surface currents and larger flows for the same' +
						' transport.',
					source:
						"Worked out from the Florida Current's observed transport," +
						' surface speed and width (Meinen et al., 2010).',
					tuned: null,
				},
				/**
				 * The Ekman transport, `τ / (ρ f)`, has no limit where `f` passes
				 * through zero at the equator, where the balance it comes from no
				 * longer holds; within about 5° of the equator the observed surface
				 * flow follows the wind rather than turning from it.
				 */
				equatorFloorDeg: {
					value: 5,
					unit: '°',
					what:
						'Within this latitude of the equator the Coriolis parameter in' +
						' the Ekman transport is held at its value here, so the' +
						' transport stays finite where the parameter passes through' +
						' zero.',
					raising:
						'A wider band of capped transport: a weaker Ekman transport' +
						' near the equator.',
					lowering:
						'A narrower band: a stronger Ekman transport close to the' +
						' equator, without limit as the floor nears 0°.',
					source:
						'Physical: the Ekman balance fails within a few degrees of' +
						' the equator.',
					tuned: null,
				},
			},
		},
		{
			title: 'Upwelling',
			settings: {
				/**
				 * The Ekman transport, held finite within `equatorFloorDeg`, turns
				 * poleward on both sides of the equator under the trades and draws
				 * the water apart there. Held at its value at 5°, it draws about
				 * 150 Sv apart round the globe on the Earth at 64, against about
				 * 50 Sv observed across the equatorial Pacific (Wyrtki, 1981, "An
				 * estimate of equatorial upwelling in the Pacific", Journal of
				 * Physical Oceanography 11), so the band is 0 until the floor is
				 * physical: the sea wells up only beside the coasts. 5°, the floor's
				 * width, would take in the equatorial cold tongues.
				 */
				upwellingEquatorDeg: {
					value: 0,
					unit: '°',
					what:
						'Within this latitude of the equator, the sea wells up from' +
						' below wherever the Ekman transport draws the water apart;' +
						' beyond it, only beside a coast. At 0 the sea wells up only' +
						' beside the coasts.',
					raising:
						'A band in which the open sea wells up as well: at 5°, the' +
						" width of equatorFloorDeg, the trades' sea along the equator" +
						' is cooled from below, by about three times the observed' +
						' upwelling there.',
					lowering: 'At 0, the least, no band: only the coasts well up.',
					source:
						'Chosen: off, because the 5° floor on the Coriolis term' +
						' (equatorFloorDeg) gives about three times the observed' +
						' equatorial upwelling, about 150 Sv against about 50 Sv' +
						' (Wyrtki, 1981); on until the floor is physical.',
					tuned: null,
				},
				/**
				 * The water below the thermocline: about 4 °C at 1000 m at low and
				 * middle latitudes in the World Ocean Atlas's annual mean.
				 */
				deepSeaC: {
					value: 4,
					unit: '°C',
					what:
						'The temperature the sea tends to with depth, below its' +
						' thermocline. The water that wells up into the mixed layer' +
						' lies between the surface and this temperature.',
					raising:
						'The water that wells up is warmer: upwelling cools the sea' +
						' less.',
					lowering:
						'The water that wells up is colder: upwelling cools the sea' +
						' more.',
					source:
						'Estimated: about 4 °C at 1000 m at low and middle latitudes,' +
						' the World Ocean Atlas annual mean as remembered, not checked' +
						' against its data files.',
					tuned: null,
				},
				/**
				 * Upwelled water rises from about 100 to 200 m below the surface
				 * off Oregon, Peru and northwest Africa and at the equator, where
				 * the Equatorial Undercurrent's core lies (Talley et al., 2011,
				 * Descriptive Physical Oceanography, chapters 7 and 10).
				 */
				upwellingSourceDepthM: {
					value: 150,
					unit: 'm',
					what:
						'The depth the water that wells up into the mixed layer rises' +
						" from. Its temperature is the thermocline's there.",
					raising:
						'Colder water wells up: upwelling cools the sea more. At or' +
						" above the mixed layer's depth it cools it not at all.",
					lowering: 'Warmer water wells up: upwelling cools the sea less.',
					source:
						'Estimated: 100 to 200 m off the coasts where the sea wells' +
						' up and at the equator (Talley et al., 2011), not checked' +
						' against the World Ocean Atlas data files.',
					tuned: null,
				},
				/**
				 * The upper ocean's annual mean temperature between about 40°S and
				 * 40°N in the World Ocean Atlas falls from about 21 °C at the
				 * surface toward 4 °C, by about 1/e of its excess in 300 m.
				 */
				thermoclineScaleM: {
					value: 300,
					unit: 'm',
					what:
						'How fast the sea cools with depth below its mixed layer: the' +
						' depth in which its excess over deepSeaC falls by 1/e. The' +
						" water a cell's sea wells up from is taken that much nearer" +
						' deepSeaC than the sea itself.',
					raising:
						'A deeper thermocline: the water that wells up is nearer the' +
						" surface's temperature, and cools the sea less.",
					lowering:
						'A sharper thermocline: the water that wells up is colder, and' +
						' cools the sea more.',
					source:
						"Estimated: the e-folding depth of the upper ocean's mean" +
						' temperature between about 40°S and 40°N, the World Ocean' +
						' Atlas annual mean as remembered, not checked against its' +
						' data files. With the other two it gives about 13 to 14 °C' +
						' at the source under Peru, against 13 to 15 °C observed at' +
						' 100 to 150 m.',
					tuned: null,
				},
			},
		},
		{
			title: 'How the gyres are solved (numerical, not physical)',
			numerical: true,
			settings: {
				/**
				 * Each island is one more unknown on every level of the corner
				 * solver down to its coarsest, which is solved densely; the Earth has
				 * 26 islands on the 64 grid and more on the finer ones.
				 */
				maxIslands: {
					value: 32,
					unit: 'islands',
					what:
						'The most islands whose value of the streamfunction is found' +
						' from the circulation round them, the largest first; the' +
						' sea flows over the rest, and each is then held to one value,' +
						' so the flow goes round it. The cap is on the islands found:' +
						' an island in the lagoon of one flowed over can add one more.',
					raising:
						'More small islands block the flow as islands do, at more' +
						' cost to build the solver.',
					lowering:
						'Fewer islands block the flow; the sea flows over the rest' +
						' and round them.',
					source:
						'Chosen: the 26 islands of the Earth on the 64 grid, and a few more.',
					tuned: null,
				},
				/**
				 * The flows are the differences of the streamfunction, so whatever its
				 * error they carry nothing net in or out of any cell; the tolerance
				 * only sets how close the gyre is to the equation's answer. At 1e-4
				 * the streamfunction is within 3e-4 of its largest value of the
				 * answer at 1e-10 on the Earth.
				 */
				gyreTolerance: {
					value: 1e-4,
					unit: 'ratio',
					what:
						"How closely each month's solve must meet the equation, as a" +
						' share of the forcing.',
					raising:
						'Fewer iterations, a gyre further from the answer; the flows' +
						' still carry nothing net in or out of any cell.',
					lowering: 'More iterations, a gyre closer to the answer.',
					source: 'Chosen by measurement on the Earth.',
					tuned: null,
				},
			},
		},
	],
	{
		title: 'Fixed choices (not overridable for a run)',
		settings: {
			/** The density of sea water near the surface, rounded. */
			seaWaterDensityKgM3: {
				value: 1025,
				unit: 'kg/m³',
				what:
					"The density of the sea's water, which turns the wind's push" +
					' into a push on the water.',
				raising: 'The same push moves the water less: weaker currents.',
				lowering: 'The same push moves the water more: stronger currents.',
				source: 'A physical figure: sea water near the surface, rounded.',
				tuned: null,
			},
			/**
			 * The figure the sea's mixed layer is reckoned at in the temperature
			 * model's `oceanHeatCapacity`, so that the heat the currents carry and
			 * the heat the sea stores agree.
			 */
			seaWaterHeatCapacityJM3K: {
				value: 4.18e6,
				unit: 'J/m³/K',
				what:
					'The heat a cubic metre of sea water holds for each kelvin: the' +
					" currents' water carries the sea's temperature with it at this" +
					' much heat for each cubic metre.',
				raising:
					'The currents carry more heat for the same flow: the warm' +
					' currents warm the seas they reach more.',
				lowering: 'The currents carry less heat for the same flow.',
				source:
					'A physical figure: the density of sea water times its specific' +
					' heat, about 4 kJ/kg/K, rounded as for the mixed layer.',
				tuned: null,
			},
		},
	},
);
