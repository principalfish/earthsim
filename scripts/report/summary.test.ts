import { describe, expect, it } from 'vitest';
import {
	cellLatitudes,
	decodeEarth,
	getGrid,
	MONTHS_PER_YEAR,
	type WindResult,
	type ZonalMean,
} from '../../src/core/index';
import { readEarthDataFile } from '../earth/dataFile.mjs';
import { cases } from './cases';
import { ACCESS } from './literature';
import type { BuiltCase } from './page';
import {
	DAY_LENGTH_CASE_IDS,
	MEASURE_BANDS,
	type Measure,
	pressureLow,
	rangeMean,
	STEEP_TILT_CASE_IDS,
	summariseChecks,
	summerOf,
	tiltWinds,
	tropicalEdge,
	WEAK_WIND_M_PER_S,
	windBandCount,
} from './summary';

/** A profile in {@link MEASURE_BANDS} bands, each band's mean `at` its middle. */
const profileOf = (at: (latitude: number) => number | null): ZonalMean => {
	const width = 180 / MEASURE_BANDS;
	const latitudes = Array.from(
		{ length: MEASURE_BANDS },
		(_, band) => -90 + (band + 0.5) * width,
	);
	return { latitudes, means: latitudes.map(at) };
};

/** A measure's value, failing the test when it was not measured. */
const measuredValue = (measure: Measure): number => {
	if (measure.value === null) {
		throw new Error(`Not measured: ${measure.missing}`);
	}
	return measure.value;
};

/**
 * An eastward wind with easterlies to 27° from the equator, westerlies to
 * 60° and easterlies beyond, the same in both hemispheres: three bands, and
 * the tropical edge at 27°.
 */
const threeBands = (latitude: number): number => {
	const distance = Math.abs(latitude);
	return distance < 45 ? 0.5 * (distance - 27) : 0.5 * (60 - distance);
};

/**
 * An eastward wind of -5 cos 6φ: easterly to 15°, westerly to 45°, easterly
 * to 75° and westerly beyond: four bands, and the tropical edge at 15°.
 */
const fourBands = (latitude: number): number =>
	-5 * Math.cos((6 * latitude * Math.PI) / 180);

describe('rangeMean', () => {
	it('weights each band by its area, and says when no band in the range holds a mean', () => {
		expect(
			measuredValue(
				rangeMean(
					profileOf(() => 3),
					40,
					60,
				),
			),
		).toBeCloseTo(3, 10);
		// A wind rising with latitude: the bands nearer the pole are smaller,
		// so the mean lies below the middle of the range.
		const rising = measuredValue(
			rangeMean(
				profileOf((latitude) => latitude),
				40,
				60,
			),
		);
		expect(rising).toBeLessThan(50);
		expect(rising).toBeGreaterThan(49);
		expect(
			rangeMean(
				profileOf(() => null),
				40,
				60,
			),
		).toEqual({
			value: null,
			missing: 'no band in the range holds a cell',
		});
	});
});

describe('tiltWinds', () => {
	it('measures the summer’s westerlies, the winter’s winds and the trades', () => {
		// Southern summer: westerlies of 6 m/s from 40°S to 60°S, 1.5 m/s at
		// the same latitudes north, trades of 4 m/s within 10° of the equator.
		const east = profileOf((latitude) => {
			if (Math.abs(latitude) <= 10) {
				return -4;
			}
			if (latitude >= -60 && latitude <= -40) {
				return 6;
			}
			if (latitude >= 40 && latitude <= 60) {
				return 1.5;
			}
			return 0;
		});
		const measures = tiltWinds(east, summerOf(0));
		expect(measuredValue(measures.summerMidLatitudesEast)).toBeCloseTo(6, 10);
		expect(measuredValue(measures.winterMidLatitudesEast)).toBeCloseTo(1.5, 10);
		expect(measuredValue(measures.winterToSummerSize)).toBeCloseTo(0.25, 10);
		expect(measuredValue(measures.tropicsEast)).toBeCloseTo(-4, 10);
		expect(measures.tropicsEasterlyBands).toBe(10);
		expect(measures.tropicsBands).toBe(10);
		expect(measuredValue(measures.tropicsStrongestEasterly)).toBeCloseTo(
			-4,
			10,
		);
		// In July the same wind has its westerlies in the winter hemisphere.
		const july = tiltWinds(east, summerOf(6));
		expect(measuredValue(july.summerMidLatitudesEast)).toBeCloseTo(1.5, 10);
		expect(measuredValue(july.winterToSummerSize)).toBeCloseTo(4, 10);
	});

	it('finds no trades where the tropics are westerly, and no ratio to a weak summer', () => {
		const east = profileOf((latitude) => (Math.abs(latitude) <= 10 ? 2 : 0.1));
		const measures = tiltWinds(east, 'northern');
		expect(measures.tropicsEasterlyBands).toBe(0);
		expect(measures.tropicsStrongestEasterly).toEqual({
			value: null,
			missing: `no band is easterly by ${WEAK_WIND_M_PER_S} m/s or more`,
		});
		expect(measuredValue(measures.tropicsEast)).toBeCloseTo(2, 10);
		expect(measures.winterToSummerSize).toEqual({
			value: null,
			missing: `the summer’s is under ${WEAK_WIND_M_PER_S} m/s`,
		});
	});

	it('counts as easterly only a band of at least the weakest wind counted', () => {
		const east = profileOf((latitude) =>
			Math.abs(latitude) <= 4 ? -2 : Math.abs(latitude) <= 10 ? -0.2 : 0,
		);
		const measures = tiltWinds(east, 'southern');
		// The bands with middles at 1° and 3° either side of the equator.
		expect(measures.tropicsEasterlyBands).toBe(4);
		expect(measuredValue(measures.tropicsStrongestEasterly)).toBeCloseTo(
			-2,
			10,
		);
		// A near-calm with easterlies too weak to count has no strongest
		// easterly either.
		const calm = tiltWinds(
			profileOf((latitude) => (Math.abs(latitude) <= 10 ? -0.2 : 0)),
			'southern',
		);
		expect(calm.tropicsEasterlyBands).toBe(0);
		expect(calm.tropicsStrongestEasterly.value).toBeNull();
	});

	it('says when a hemisphere’s mid-latitude mean is not measured', () => {
		const east = profileOf((latitude) =>
			latitude >= 40 && latitude <= 60 ? null : 3,
		);
		const measures = tiltWinds(east, 'southern');
		expect(measuredValue(measures.summerMidLatitudesEast)).toBeCloseTo(3, 10);
		expect(measures.winterMidLatitudesEast.value).toBeNull();
		expect(measures.winterToSummerSize).toEqual({
			value: null,
			missing: 'a hemisphere’s mean is not measured',
		});
	});
});

describe('pressureLow', () => {
	it('finds the lowest band, how far into the summer hemisphere it lies and how deep it is', () => {
		const pressure = profileOf(
			(latitude) => 1000 + 0.1 * Math.abs(latitude - 31),
		);
		const july = pressureLow(pressure, 'northern');
		expect(measuredValue(july.latitude)).toBe(31);
		expect(measuredValue(july.intoSummerDeg)).toBe(31);
		expect(measuredValue(july.pressureHpa)).toBeCloseTo(1000, 10);
		// The highest band is the one at 89°S, 120° away.
		expect(measuredValue(july.spreadHpa)).toBeCloseTo(12, 10);
		// In January the same low lies in the winter hemisphere.
		expect(measuredValue(pressureLow(pressure, 'southern').intoSummerDeg)).toBe(
			-31,
		);
	});

	it('takes the southernmost of bands that share the lowest mean, and says when no band holds one', () => {
		expect(
			measuredValue(
				pressureLow(
					profileOf(() => 1010),
					'northern',
				).latitude,
			),
		).toBe(-89);
		const none = pressureLow(
			profileOf(() => null),
			'northern',
		);
		expect(none.latitude).toEqual({
			value: null,
			missing: 'no band holds a cell',
		});
	});
});

describe('tropicalEdge and windBandCount', () => {
	it('find the edge where the easterlies turn westerly, and count the bands', () => {
		for (const hemisphere of ['southern', 'northern'] as const) {
			// The bands at 25° and 29° hold −1 and +1 m/s; the one at 27° is
			// calm and passed over, and the line between them crosses at 27°.
			expect(
				measuredValue(tropicalEdge(profileOf(threeBands), hemisphere)),
			).toBe(27);
			expect(windBandCount(profileOf(threeBands), hemisphere)).toBe(3);
			expect(
				measuredValue(tropicalEdge(profileOf(fourBands), hemisphere)),
			).toBeCloseTo(15, 10);
			expect(windBandCount(profileOf(fourBands), hemisphere)).toBe(4);
		}
	});

	it('say plainly when there is no turn, and count no band in a calm', () => {
		const easterly = profileOf(() => -3);
		expect(tropicalEdge(easterly, 'northern')).toEqual({
			value: null,
			missing: 'no turn from easterlies to westerlies',
		});
		expect(windBandCount(easterly, 'northern')).toBe(1);
		const calm = profileOf(() => 0);
		expect(tropicalEdge(calm, 'southern').value).toBeNull();
		expect(windBandCount(calm, 'southern')).toBe(0);
	});

	it('pass over a wobble too weak to count', () => {
		// Easterlies to 20°, a wobble of ±0.3 m/s to 30°, westerlies beyond.
		const wobbly = profileOf((latitude) => {
			const distance = Math.abs(latitude);
			if (distance < 20) {
				return -4;
			}
			if (distance < 30) {
				return Math.round(distance) % 4 === 1 ? 0.3 : -0.3;
			}
			return 4;
		});
		expect(windBandCount(wobbly, 'northern')).toBe(2);
		// The wobble crosses zero several times; the edge is at the crossing
		// nearest the equator, between the bands at 19° (−4) and 21° (+0.3).
		expect(measuredValue(tropicalEdge(wobbly, 'northern'))).toBeCloseTo(
			19 + (2 * 4) / 4.3,
			10,
		);
	});

	it('put the edge at the true crossing inside a stretch of weak bands', () => {
		// Easterlies of 4 m/s to 17°, then a wind of 0.1 (φ − 22) m/s, weak
		// from 17° to 27°, then westerlies of 4 m/s from 30°: the counted
		// bands either side of the turn are at 15° and 31°, but the wind
		// crosses zero at 22°.
		const east = profileOf((latitude) => {
			const distance = Math.abs(latitude);
			if (distance < 17) {
				return -4;
			}
			return distance < 30 ? 0.1 * (distance - 22) : 4;
		});
		for (const hemisphere of ['southern', 'northern'] as const) {
			expect(measuredValue(tropicalEdge(east, hemisphere))).toBeCloseTo(22, 10);
		}
	});
});

describe('summariseChecks', () => {
	const earth = decodeEarth(readEarthDataFile());
	const ids = [...STEEP_TILT_CASE_IDS, ...DAY_LENGTH_CASE_IDS];
	const built: BuiltCase[] = cases
		.filter(({ id }) => ids.includes(id as (typeof ids)[number]))
		.map((shown) => ({ case: shown, world: shown.build(earth) }));
	const latitudes = cellLatitudes(getGrid(64));

	/** A year of a wind and a pressure, each a function of the latitude. */
	const yearOf = (
		east: (latitude: number) => number,
		pressure: (latitude: number) => number,
	): WindResult => {
		const field = (at: (latitude: number) => number) =>
			Array.from({ length: MONTHS_PER_YEAR }, () =>
				Float32Array.from(latitudes, at),
			);
		return {
			east: field(east),
			north: field(() => 0),
			pressure: field(pressure),
		};
	};
	const flat = () => 1013;
	const results = new Map<string, WindResult>([
		[
			'ocean-tilt-60',
			yearOf(threeBands, (latitude) => 1000 + Math.abs(latitude - 41)),
		],
		['earth', yearOf(threeBands, flat)],
		['earth-day-8h', yearOf(fourBands, flat)],
		['earth-day-96h', yearOf(() => 0, flat)],
	]);

	it('assembles each check’s observation and the access table', () => {
		const summary = summariseChecks({
			cases: built,
			results,
			faults: new Map([['earth-tilt-60', { month: 0, field: 'east' }]]),
		});
		expect(summary.access).toBe(ACCESS);
		expect(summary.access).toHaveLength(5);

		// Check (a): the ocean world in January and July; the faulty case
		// is noted as not measured.
		const { windsAtTilt } = summary;
		expect(
			windsAtTilt.rows.map(({ caseId, month, summer }) => [
				caseId,
				month,
				summer,
			]),
		).toEqual([
			['ocean-tilt-60', 0, 'southern'],
			['ocean-tilt-60', 6, 'northern'],
		]);
		expect(windsAtTilt.unmeasured).toEqual([
			{
				caseId: 'earth-tilt-60',
				title: 'The Earth tilted 60°',
				why: 'the model gave a value that is not a finite number on this case',
			},
		]);
		const january = windsAtTilt.rows[0]?.measures;
		// The three-band wind is westerly at 40° to 60° and easterly in the
		// deep tropics.
		expect(
			measuredValue(january?.summerMidLatitudesEast as Measure),
		).toBeGreaterThan(2);
		expect(measuredValue(january?.tropicsEast as Measure)).toBeLessThan(-8);
		expect(january?.tropicsEasterlyBands).toBe(10);

		// Check (b): the low at 41°N, into the summer hemisphere in July
		// and out of it in January.
		const lows = summary.lowAtTilt.rows.map(({ measures }) => [
			measuredValue(measures.latitude),
			measuredValue(measures.intoSummerDeg),
		]);
		expect(lows).toEqual([
			[41, -41],
			[41, 41],
		]);
		expect(summary.lowAtTilt.unmeasured).toEqual(windsAtTilt.unmeasured);

		// Check (c): the edge at 27° on the Earth and 15° with a faster
		// spin; none on the calm case, whose ratio is not measured either.
		const [plain, fast, slow] = summary.dayLength.rows;
		expect(summary.dayLength.rows.map(({ caseId }) => caseId)).toEqual([
			'earth',
			'earth-day-8h',
			'earth-day-96h',
		]);
		expect(fast?.dayLengthHours).toBe(8);
		for (const hemisphere of ['southern', 'northern'] as const) {
			expect(measuredValue(plain?.[hemisphere].edgeDeg as Measure)).toBeCloseTo(
				27,
				0,
			);
			expect(measuredValue(plain?.[hemisphere].edgeToEarth as Measure)).toBe(1);
			expect(plain?.[hemisphere].bands).toBe(3);
			expect(
				measuredValue(fast?.[hemisphere].edgeToEarth as Measure),
			).toBeCloseTo(15 / 27, 1);
			expect(fast?.[hemisphere].bands).toBe(4);
			expect(slow?.[hemisphere].edgeDeg).toEqual({
				value: null,
				missing: 'no turn from easterlies to westerlies',
			});
			expect(slow?.[hemisphere].edgeToEarth.value).toBeNull();
			expect(slow?.[hemisphere].bands).toBe(0);
		}
		expect(summary.dayLength.unmeasured).toEqual([]);
	});

	it('measures no ratio to the Earth when the Earth is faulty or has no turn', () => {
		const faulty = summariseChecks({
			cases: built,
			results,
			faults: new Map([
				['earth', { month: 3, field: 'pressure' }],
				['earth-tilt-60', { month: 0, field: 'east' }],
			]),
		});
		expect(faulty.dayLength.unmeasured).toEqual([
			{
				caseId: 'earth',
				title: 'The Earth',
				why: 'the model gave a value that is not a finite number on this case',
			},
		]);
		expect(faulty.windsAtTilt.unmeasured.map(({ caseId }) => caseId)).toEqual([
			'earth-tilt-60',
		]);
		const calmEarth = summariseChecks({
			cases: built,
			results: new Map([...results, ['earth', yearOf(() => 0, flat)]]),
			faults: new Map([['earth-tilt-60', { month: 0, field: 'east' }]]),
		});
		for (const summary of [faulty, calmEarth]) {
			const fast = summary.dayLength.rows.find(
				({ caseId }) => caseId === 'earth-day-8h',
			);
			for (const hemisphere of ['southern', 'northern'] as const) {
				expect(fast?.[hemisphere].edgeDeg.value).not.toBeNull();
				expect(fast?.[hemisphere].edgeToEarth).toEqual({
					value: null,
					missing: 'the Earth’s edge is not measured',
				});
			}
		}
	});

	it('notes the cases not in the report, and refuses a case with no result', () => {
		const summary = summariseChecks({
			cases: built.filter(({ case: shown }) => shown.id === 'earth'),
			results,
		});
		expect(summary.windsAtTilt.rows).toEqual([]);
		expect(summary.windsAtTilt.unmeasured.map(({ why }) => why)).toEqual([
			'the case is not in the report',
			'the case is not in the report',
		]);
		expect(summary.dayLength.rows).toHaveLength(1);
		expect(() => summariseChecks({ cases: built, results: new Map() })).toThrow(
			/no result for the case ocean-tilt-60/,
		);
	});
});
