/**
 * The measures the wind report sets beside published studies, and the
 * three checks made from them. Every measure is taken from a model's
 * output, its mean eastward wind and mean sea-level pressure by latitude
 * ({@link zonalMean}), never from the model's own settings for its bands.
 * The checks hold the numbers measured and no judgement of them.
 */

import {
	getGrid,
	summariseWinds,
	type WindResult,
	type ZonalMean,
	zonalMean,
} from '../../src/core/index';
import { ACCESS, type PaperAccess } from './literature';
import type { BuiltCase, ModelFault } from './page';

/**
 * The bands of latitude every measure takes its means in: 90, of 2° each,
 * fine enough to place a low or a turn of the wind to a degree or so, and
 * coarse enough that every band holds cells on the report's 64 grid.
 */
export const MEASURE_BANDS = 90;

/**
 * The mid-latitudes, in degrees from the equator in either hemisphere: the
 * bands whose middles lie from 40° to 60°. Centred on the "near 50°S" at
 * which Ferreira et al. (2014) find the summer's surface westerlies, and
 * reaching 10° either side of it, so a belt of westerlies a little north or
 * south of the paper's is still taken in whole.
 */
export const MID_LATITUDES_DEG = { from: 40, to: 60 } as const;

/**
 * The deep tropics, in degrees from the equator: the bands whose middles
 * lie within 10° of it. Ferreira et al. (2014) find "trades winds in the
 * deep tropics" and "trade winds exist at the equator" without naming a
 * latitude; 10° keeps to the inner half of the Earth's tropics, which reach
 * 23.4°, where the trades meet near the equator.
 */
export const DEEP_TROPICS_DEG = 10;

/**
 * The weakest mean eastward wind, in metres a second either way, that
 * counts towards a band of wind or a turn between bands. A band whose mean
 * is weaker is passed over, so that a near-calm wobble about zero is not
 * counted as two turns. It is a tenth or so of the Earth's zonal-mean
 * trades and westerlies, of 5 to 8 m/s.
 */
export const WEAK_WIND_M_PER_S = 0.5;

/** The cases the two steep-tilt checks are made on, in the order shown. */
export const STEEP_TILT_CASE_IDS = ['ocean-tilt-60', 'earth-tilt-60'] as const;

/** The cases the day-length check is made on, the Earth first. */
export const DAY_LENGTH_CASE_IDS = [
	'earth',
	'earth-day-8h',
	'earth-day-96h',
] as const;

/** The months the steep-tilt checks read: January and July, from 0. */
export const SOLSTICE_MONTHS = [0, 6] as const;

/** January or July, by index from 0. */
export type SolsticeMonth = (typeof SOLSTICE_MONTHS)[number];

export type Hemisphere = 'southern' | 'northern';

/** The hemisphere in which it is summer in a solstice month. */
export const summerOf = (month: SolsticeMonth): Hemisphere =>
	month === 0 ? 'southern' : 'northern';

const otherHemisphere = (hemisphere: Hemisphere): Hemisphere =>
	hemisphere === 'southern' ? 'northern' : 'southern';

/** A measured number, or why it could not be taken. */
export type Measure =
	| { readonly value: number }
	| {
			readonly value: null;
			/** Why the measure could not be taken, as a phrase. */
			readonly missing: string;
	  };

const measured = (value: number): Measure => ({ value });
const unmeasurable = (missing: string): Measure => ({ value: null, missing });

/** The bands of a profile that hold a mean. */
const bandsOf = (
	profile: ZonalMean,
): { readonly latitude: number; readonly mean: number }[] =>
	profile.latitudes.flatMap((latitude, band) => {
		const mean = profile.means[band];
		return mean === null || mean === undefined ? [] : [{ latitude, mean }];
	});

/**
 * The mean of a profile's bands whose middles lie from one latitude to
 * another, each band weighted by its area.
 *
 * @remarks
 * A band of equal width has an area in proportion to the cosine of its
 * middle's latitude, which is its weight.
 *
 * @param profile - A mean by latitude, as {@link zonalMean} gives it. Not
 * changed.
 * @param from - The southern limit, in degrees north; a band's middle on it
 * is taken in.
 * @param to - The northern limit, in degrees north; a middle on it is taken
 * in.
 * @returns The mean, or a {@link Measure} saying no band in the range holds
 * a mean.
 */
export const rangeMean = (
	profile: ZonalMean,
	from: number,
	to: number,
): Measure => {
	let total = 0;
	let weights = 0;
	for (const { latitude, mean } of bandsOf(profile)) {
		if (latitude >= from && latitude <= to) {
			const weight = Math.cos((latitude * Math.PI) / 180);
			total += weight * mean;
			weights += weight;
		}
	}
	return weights > 0
		? measured(total / weights)
		: unmeasurable('no band in the range holds a cell');
};

/** The {@link MID_LATITUDES_DEG} of one hemisphere, south to north. */
const midLatitudes = (hemisphere: Hemisphere): [number, number] =>
	hemisphere === 'northern'
		? [MID_LATITUDES_DEG.from, MID_LATITUDES_DEG.to]
		: [-MID_LATITUDES_DEG.to, -MID_LATITUDES_DEG.from];

/** The mean eastward wind at a steep tilt in one month, as check (a) measures it. */
export type TiltWinds = {
	/**
	 * The mean eastward wind in the summer hemisphere's
	 * {@link MID_LATITUDES_DEG}, in metres a second: westerly above zero.
	 */
	readonly summerMidLatitudesEast: Measure;
	/** The same in the winter hemisphere. */
	readonly winterMidLatitudesEast: Measure;
	/**
	 * The size of the winter's mean against the size of the summer's, either
	 * way; not measured when the summer's is under
	 * {@link WEAK_WIND_M_PER_S}.
	 */
	readonly winterToSummerSize: Measure;
	/**
	 * The mean eastward wind within {@link DEEP_TROPICS_DEG} of the equator,
	 * in metres a second: easterly below zero.
	 */
	readonly tropicsEast: Measure;
	/**
	 * How many bands within {@link DEEP_TROPICS_DEG} of the equator have a
	 * mean easterly of at least {@link WEAK_WIND_M_PER_S}.
	 */
	readonly tropicsEasterlyBands: number;
	/** How many bands within {@link DEEP_TROPICS_DEG} hold a mean. */
	readonly tropicsBands: number;
	/**
	 * The most easterly band's mean within {@link DEEP_TROPICS_DEG}, in
	 * metres a second; not measured when no band is easterly by at least
	 * {@link WEAK_WIND_M_PER_S}, as {@link tropicsEasterlyBands} counts them.
	 */
	readonly tropicsStrongestEasterly: Measure;
};

const NO_EASTERLY = `no band is easterly by ${WEAK_WIND_M_PER_S} m/s or more`;

/**
 * Check (a)'s measures of a month's mean eastward wind by latitude.
 *
 * @param east - The mean eastward wind by latitude, in metres a second.
 * Not changed.
 * @param summer - The hemisphere in which it is summer.
 */
export const tiltWinds = (east: ZonalMean, summer: Hemisphere): TiltWinds => {
	const summerMean = rangeMean(east, ...midLatitudes(summer));
	const winterMean = rangeMean(east, ...midLatitudes(otherHemisphere(summer)));
	let winterToSummerSize: Measure;
	if (summerMean.value === null || winterMean.value === null) {
		winterToSummerSize = unmeasurable('a hemisphere’s mean is not measured');
	} else if (Math.abs(summerMean.value) < WEAK_WIND_M_PER_S) {
		winterToSummerSize = unmeasurable(
			`the summer’s is under ${WEAK_WIND_M_PER_S} m/s`,
		);
	} else {
		winterToSummerSize = measured(
			Math.abs(winterMean.value) / Math.abs(summerMean.value),
		);
	}
	const tropics = bandsOf(east).filter(
		({ latitude }) => Math.abs(latitude) <= DEEP_TROPICS_DEG,
	);
	const strongest = Math.min(...tropics.map(({ mean }) => mean));
	return {
		summerMidLatitudesEast: summerMean,
		winterMidLatitudesEast: winterMean,
		winterToSummerSize,
		tropicsEast: rangeMean(east, -DEEP_TROPICS_DEG, DEEP_TROPICS_DEG),
		tropicsEasterlyBands: tropics.filter(
			({ mean }) => mean <= -WEAK_WIND_M_PER_S,
		).length,
		tropicsBands: tropics.length,
		tropicsStrongestEasterly:
			tropics.length > 0 && strongest <= -WEAK_WIND_M_PER_S
				? measured(strongest)
				: unmeasurable(NO_EASTERLY),
	};
};

/** The lowest mean pressure at a steep tilt in one month, as check (b) measures it. */
export type PressureLow = {
	/**
	 * The middle of the band of lowest mean pressure, in degrees north; the
	 * southernmost such band when several share it.
	 */
	readonly latitude: Measure;
	/**
	 * How far that band's middle lies into the summer hemisphere, in degrees
	 * of latitude: below zero when it lies in the winter hemisphere.
	 */
	readonly intoSummerDeg: Measure;
	/** The lowest mean pressure, in hectopascals. */
	readonly pressureHpa: Measure;
	/**
	 * The highest band's mean pressure less the lowest's, in hectopascals:
	 * how deep the low is against the rest of the profile.
	 */
	readonly spreadHpa: Measure;
};

/**
 * Check (b)'s measures of a month's mean sea-level pressure by latitude.
 *
 * @param pressure - The mean pressure by latitude, in hectopascals. Not
 * changed.
 * @param summer - The hemisphere in which it is summer.
 */
export const pressureLow = (
	pressure: ZonalMean,
	summer: Hemisphere,
): PressureLow => {
	let lowest: { readonly latitude: number; readonly mean: number } | null =
		null;
	let highest = Number.NEGATIVE_INFINITY;
	for (const band of bandsOf(pressure)) {
		if (lowest === null || band.mean < lowest.mean) {
			lowest = band;
		}
		highest = Math.max(highest, band.mean);
	}
	if (lowest === null) {
		const missing = unmeasurable('no band holds a cell');
		return {
			latitude: missing,
			intoSummerDeg: missing,
			pressureHpa: missing,
			spreadHpa: missing,
		};
	}
	return {
		latitude: measured(lowest.latitude),
		intoSummerDeg: measured(
			summer === 'northern' ? lowest.latitude : -lowest.latitude,
		),
		pressureHpa: measured(lowest.mean),
		spreadHpa: measured(highest - lowest.mean),
	};
};

/**
 * A hemisphere's bands that hold a mean, from the equator to the pole,
 * each with its middle's distance from the equator in degrees.
 */
const polewardOf = (
	east: ZonalMean,
	hemisphere: Hemisphere,
): { readonly distance: number; readonly mean: number }[] =>
	bandsOf(east)
		.filter(({ latitude }) =>
			hemisphere === 'northern' ? latitude > 0 : latitude < 0,
		)
		.map(({ latitude, mean }) => ({ distance: Math.abs(latitude), mean }))
		.sort((a, b) => a.distance - b.distance);

/**
 * A hemisphere's bands, from the equator to the pole, whose mean eastward
 * wind is at least {@link WEAK_WIND_M_PER_S} either way, each with its
 * middle's distance from the equator in degrees.
 */
const countedPoleward = (
	east: ZonalMean,
	hemisphere: Hemisphere,
): { readonly distance: number; readonly mean: number }[] =>
	polewardOf(east, hemisphere).filter(
		({ mean }) => Math.abs(mean) >= WEAK_WIND_M_PER_S,
	);

/**
 * The edge of the tropical cell in one hemisphere: where the mean eastward
 * wind first turns from easterly to westerly going poleward from the
 * equator.
 *
 * @remarks
 * The turn is found among the bands of at least {@link WEAK_WIND_M_PER_S}
 * either way: the first westerly band counted after an easterly one. The
 * edge is then put where the mean wind of every band from that easterly
 * band to that westerly one, weak bands too, first crosses from below zero
 * to zero or above, along a straight line between the two bands either side
 * of the crossing. Where the weak bands between cross zero several times,
 * the crossing nearest the equator is taken.
 *
 * @param east - The mean eastward wind by latitude, in metres a second.
 * Not changed.
 * @param hemisphere - The hemisphere to measure.
 * @returns The edge's distance from the equator in degrees, or a
 * {@link Measure} saying no such turn was found.
 */
export const tropicalEdge = (
	east: ZonalMean,
	hemisphere: Hemisphere,
): Measure => {
	const counted = countedPoleward(east, hemisphere);
	for (let index = 1; index < counted.length; index++) {
		const easterly = counted[index - 1] as { distance: number; mean: number };
		const westerly = counted[index] as { distance: number; mean: number };
		if (easterly.mean < 0 && westerly.mean > 0) {
			const stretch = polewardOf(east, hemisphere).filter(
				({ distance }) =>
					distance >= easterly.distance && distance <= westerly.distance,
			);
			for (let step = 1; step < stretch.length; step++) {
				const before = stretch[step - 1] as { distance: number; mean: number };
				const after = stretch[step] as { distance: number; mean: number };
				if (before.mean < 0 && after.mean >= 0) {
					return measured(
						before.distance +
							((after.distance - before.distance) * -before.mean) /
								(after.mean - before.mean),
					);
				}
			}
		}
	}
	return unmeasurable('no turn from easterlies to westerlies');
};

/**
 * How many bands of wind one hemisphere has: runs of easterlies and of
 * westerlies from the equator to the pole, one more than the turns between
 * them. Only bands of at least {@link WEAK_WIND_M_PER_S} either way are
 * counted; a hemisphere with none has no band of wind.
 *
 * @param east - The mean eastward wind by latitude, in metres a second.
 * Not changed.
 * @param hemisphere - The hemisphere to count.
 */
export const windBandCount = (
	east: ZonalMean,
	hemisphere: Hemisphere,
): number => {
	const bands = countedPoleward(east, hemisphere);
	let count = bands.length > 0 ? 1 : 0;
	for (let index = 1; index < bands.length; index++) {
		if (
			Math.sign((bands[index] as { mean: number }).mean) !==
			Math.sign((bands[index - 1] as { mean: number }).mean)
		) {
			count++;
		}
	}
	return count;
};

/** A case a check could not measure, and why. */
export type Unmeasured = {
	readonly caseId: string;
	/** The case's title, or its id when it is not in the report. */
	readonly title: string;
	/** Why, as a phrase. */
	readonly why: string;
};

/** What a check measured, case by case. */
export type CheckObservation<Row> = {
	readonly rows: readonly Row[];
	/** The check's cases that could not be measured. */
	readonly unmeasured: readonly Unmeasured[];
};

/** One case and month of a steep-tilt check. */
export type TiltRow<Measures> = {
	readonly caseId: string;
	readonly title: string;
	readonly month: SolsticeMonth;
	readonly summer: Hemisphere;
	readonly measures: Measures;
};

/** One hemisphere of a case of the day-length check. */
export type DayLengthHemisphere = {
	/** The {@link tropicalEdge}, in degrees from the equator. */
	readonly edgeDeg: Measure;
	/** That edge over the Earth case's in the same hemisphere. */
	readonly edgeToEarth: Measure;
	/** The {@link windBandCount}. */
	readonly bands: number;
};

/** One case of the day-length check, on its annual mean. */
export type DayLengthRow = {
	readonly caseId: string;
	readonly title: string;
	/** The planet's day, in hours. */
	readonly dayLengthHours: number;
	readonly southern: DayLengthHemisphere;
	readonly northern: DayLengthHemisphere;
};

/** Everything the report's section on published studies shows of a model. */
export type ChecksSummary = {
	/** How each paper quoted was read. */
	readonly access: readonly PaperAccess[];
	/** Check (a): winds at a steep tilt, January and July. */
	readonly windsAtTilt: CheckObservation<TiltRow<TiltWinds>>;
	/** Check (b): the lowest mean pressure at a steep tilt, January and July. */
	readonly lowAtTilt: CheckObservation<TiltRow<PressureLow>>;
	/** Check (c): the tropical cell and the bands of wind on the annual mean. */
	readonly dayLength: CheckObservation<DayLengthRow>;
};

/** What the checks are measured from. */
export type ChecksInput = {
	/** The report's cases, with their worlds. */
	readonly cases: readonly BuiltCase[];
	/** A model's result on each case, under the case's id. */
	readonly results: ReadonlyMap<string, WindResult>;
	/**
	 * The cases on which the model gave a value that is not a finite number;
	 * they are not measured. None when left out.
	 */
	readonly faults?: ReadonlyMap<string, ModelFault>;
};

const NOT_IN_REPORT = 'the case is not in the report';
const FAULTED =
	'the model gave a value that is not a finite number on this case';

/**
 * The three checks of a model against published studies, measured from its
 * results, with how each paper quoted was read.
 *
 * @remarks
 * A check's case that is not among the report's cases, or on which the
 * model gave a value that is not a finite number, is listed as not
 * measured, with why. The day-length check's ratios are to the Earth case;
 * when the Earth's edge is not measured, neither are they.
 *
 * @param input - The cases, the model's results and its faults. Not
 * changed.
 * @throws RangeError if a case measured has no result.
 */
export const summariseChecks = (input: ChecksInput): ChecksSummary => {
	const { cases, results, faults } = input;
	/** The cases among `ids` to measure, noting the rest. */
	const measurable = (ids: readonly string[]) => {
		const found: { readonly built: BuiltCase; readonly result: WindResult }[] =
			[];
		const missing: Unmeasured[] = [];
		for (const id of ids) {
			const built = cases.find(({ case: shown }) => shown.id === id);
			if (built === undefined) {
				missing.push({ caseId: id, title: id, why: NOT_IN_REPORT });
				continue;
			}
			if (faults?.has(id) === true) {
				missing.push({ caseId: id, title: built.case.title, why: FAULTED });
				continue;
			}
			const result = results.get(id);
			if (result === undefined) {
				throw new RangeError(`There is no result for the case ${id}`);
			}
			found.push({ built, result });
		}
		return { found, missing };
	};
	const profile = (built: BuiltCase, field: ArrayLike<number>): ZonalMean =>
		zonalMean(getGrid(built.world.resolution), field, MEASURE_BANDS);

	const tilted = measurable(STEEP_TILT_CASE_IDS);
	const tiltRows = <Measures>(
		measure: (
			built: BuiltCase,
			result: WindResult,
			month: SolsticeMonth,
		) => Measures,
	): TiltRow<Measures>[] =>
		tilted.found.flatMap(({ built, result }) =>
			SOLSTICE_MONTHS.map((month) => ({
				caseId: built.case.id,
				title: built.case.title,
				month,
				summer: summerOf(month),
				measures: measure(built, result, month),
			})),
		);
	const windsAtTilt = {
		rows: tiltRows((built, result, month) =>
			tiltWinds(
				profile(built, result.east[month] as Float32Array),
				summerOf(month),
			),
		),
		unmeasured: tilted.missing,
	};
	const lowAtTilt = {
		rows: tiltRows((built, result, month) =>
			pressureLow(
				profile(built, result.pressure[month] as Float32Array),
				summerOf(month),
			),
		),
		unmeasured: tilted.missing,
	};

	const days = measurable(DAY_LENGTH_CASE_IDS);
	const annual = days.found.map(({ built, result }) => {
		const east = profile(built, summariseWinds(result).east);
		return {
			built,
			southern: {
				edgeDeg: tropicalEdge(east, 'southern'),
				bands: windBandCount(east, 'southern'),
			},
			northern: {
				edgeDeg: tropicalEdge(east, 'northern'),
				bands: windBandCount(east, 'northern'),
			},
		};
	});
	const earth = annual.find(
		({ built }) => built.case.id === DAY_LENGTH_CASE_IDS[0],
	);
	const toEarth = (edge: Measure, hemisphere: Hemisphere): Measure => {
		const earthEdge = earth?.[hemisphere].edgeDeg;
		if (earthEdge === undefined || earthEdge.value === null) {
			return unmeasurable('the Earth’s edge is not measured');
		}
		if (edge.value === null) {
			return unmeasurable('this edge is not measured');
		}
		return measured(edge.value / earthEdge.value);
	};
	const dayLength = {
		rows: annual.map(({ built, southern, northern }) => ({
			caseId: built.case.id,
			title: built.case.title,
			dayLengthHours: built.world.planet.dayLengthHours,
			southern: {
				...southern,
				edgeToEarth: toEarth(southern.edgeDeg, 'southern'),
			},
			northern: {
				...northern,
				edgeToEarth: toEarth(northern.edgeDeg, 'northern'),
			},
		})),
		unmeasured: days.missing,
	};
	return { access: ACCESS, windsAtTilt, lowAtTilt, dayLength };
};
