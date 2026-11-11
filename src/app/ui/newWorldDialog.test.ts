import { describe, expect, it } from 'vitest';
import {
	BLANK_OCEAN_ELEVATION_M,
	computeTerrainStats,
	createBlankWorld,
	DEFAULT_RESOLUTION,
	DEFAULT_SEA_LEVEL_M,
	EARTH_DATA_CELLS,
	EARTH_DATA_RESOLUTION,
	type EarthData,
	earthWorld,
	FACE_COUNT,
	generateWorld,
	isSeed,
	MAX_SEED,
	SUPPORTED_RESOLUTIONS,
} from '../../core/index';
import {
	CONFIRM_LABEL,
	CREATE_FAILED_MESSAGE,
	type CreateSteps,
	DEFAULT_LAND_PERCENT,
	EARTH_FAILED_MESSAGE,
	EARTH_HINT,
	FIRST_NEW_WORLD_VALUES,
	formatPercent,
	GENERATING_LABEL,
	KIND_MESSAGE,
	LAND_MESSAGE,
	LAND_SLIDER_STEP_PERCENT,
	LOADING_EARTH_LABEL,
	MAX_LAND_PERCENT,
	MIN_LAND_PERCENT,
	type NewWorldChoice,
	type NewWorldValues,
	newWorldValuesFor,
	parseNewWorldValues,
	RESOLUTION_HINTS,
	RESOLUTION_MESSAGE,
	runCreate,
	SEED_MESSAGE,
	START_LABELS,
	stepsUntilClosed,
	type WorldSources,
	worldFromChoice,
} from './newWorldDialog';
import { describeWorld } from './worldPanel';

/** A source of random seeds that must not be asked. */
const noRandom = (): number => {
	throw new Error('no random seed was expected');
};

/** A source of the Earth's data that must not be asked. */
const noEarth: WorldSources = {
	loadEarth: () => {
		throw new Error('no Earth data was expected');
	},
};

/** Earth data that slopes from cell to cell, without the cost of the real file. */
const slopingEarth = (): EarthData => ({
	resolution: EARTH_DATA_RESOLUTION,
	elevation: Float32Array.from(
		{ length: EARTH_DATA_CELLS },
		(_, cell) => (cell % 9001) - 4500,
	),
});

const generatedValues = (
	overrides: Partial<NewWorldValues> = {},
): NewWorldValues => ({
	resolution: '64',
	kind: 'generated',
	seed: '1977',
	landPercent: 30,
	...overrides,
});

/** The choice a form stands for, which must be valid. */
const choiceOf = (
	values: NewWorldValues,
	randomSeed: () => number = noRandom,
): NewWorldChoice => {
	const parsed = parseNewWorldValues(values, { randomSeed });
	if (!parsed.ok) {
		throw new Error(`rejected: ${parsed.message}`);
	}
	return parsed.choice;
};

describe('parseNewWorldValues', () => {
	it('reads a blank world at each resolution', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			expect(
				parseNewWorldValues(
					{
						resolution: String(resolution),
						kind: 'blank',
						seed: '',
						landPercent: 30,
					},
					{ randomSeed: noRandom },
				),
			).toEqual({ ok: true, choice: { kind: 'blank', resolution } });
		}
	});

	it('reads a generated world at each resolution', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			expect(
				parseNewWorldValues(
					generatedValues({ resolution: String(resolution), seed: '7' }),
					{ randomSeed: noRandom },
				),
			).toEqual({
				ok: true,
				choice: { kind: 'generated', resolution, seed: 7, landFraction: 0.3 },
			});
		}
	});

	it('reads the Earth at each resolution', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			expect(
				parseNewWorldValues(
					{
						resolution: String(resolution),
						kind: 'earth',
						seed: '',
						landPercent: 30,
					},
					{ randomSeed: noRandom },
				),
			).toEqual({ ok: true, choice: { kind: 'earth', resolution } });
		}
	});

	it('reads nothing but the resolution for the Earth', () => {
		expect(
			choiceOf({
				resolution: '256',
				kind: 'earth',
				seed: 'not a seed',
				landPercent: 400,
			}),
		).toEqual({ kind: 'earth', resolution: 256 });
		expect(
			parseNewWorldValues(
				{ resolution: '100', kind: 'earth', seed: '', landPercent: 30 },
				{ randomSeed: noRandom },
			),
		).toEqual({ ok: false, field: 'resolution', message: RESOLUTION_MESSAGE });
	});

	it('reads nothing but the resolution for a blank world', () => {
		expect(
			choiceOf({
				resolution: '128',
				kind: 'blank',
				seed: 'not a seed',
				landPercent: 400,
			}),
		).toEqual({ kind: 'blank', resolution: 128 });
	});

	it('accepts whole numbers across the range of seeds', () => {
		const accepted: [string, number][] = [
			['1977', 1977],
			['0', 0],
			['4294967295', MAX_SEED],
			['007', 7],
		];
		for (const [text, seed] of accepted) {
			const choice = choiceOf(generatedValues({ seed: text }));
			expect(choice).toMatchObject({ kind: 'generated', seed });
		}
	});

	it('ignores white space around the seed', () => {
		for (const text of [' 42 ', '42\n', '\t42', ' 42']) {
			expect(choiceOf(generatedValues({ seed: text }))).toMatchObject({
				seed: 42,
			});
		}
	});

	it('takes a blank seed as a request for a random one', () => {
		for (const text of ['', ' ', ' \t\n ']) {
			let asked = 0;
			const choice = choiceOf(generatedValues({ seed: text }), () => {
				asked++;
				return 123456;
			});
			expect(choice).toEqual({
				kind: 'generated',
				resolution: 64,
				seed: 123456,
				landFraction: 0.3,
			});
			expect(asked).toBe(1);
		}
	});

	it('draws a random seed from the core when given no source', () => {
		const first = parseNewWorldValues(generatedValues({ seed: '' }));
		const second = parseNewWorldValues(generatedValues({ seed: '' }));
		if (!first.ok || !second.ok) {
			throw new Error('a blank seed was rejected');
		}
		if (first.choice.kind !== 'generated') {
			throw new Error('expected generated continents');
		}
		expect(isSeed(first.choice.seed)).toBe(true);
		// Two draws from four thousand million agree about once in that many.
		expect(second.choice).not.toEqual(first.choice);
	});

	it('does not ask for a random seed when one is given', () => {
		expect(choiceOf(generatedValues({ seed: '5' }))).toMatchObject({ seed: 5 });
	});

	it('rejects a seed that is not a whole number in range, with a message', () => {
		const rejected = [
			'4294967296',
			'99999999999999999999999999',
			'-1',
			'+1',
			'1.5',
			'1.0',
			'1e3',
			'0x10',
			'abc',
			'12abc',
			'١٢٣',
			'１２３',
			'1,977',
			'1 977',
			'1_000',
			'Infinity',
			'NaN',
			'<b>1</b>',
		];
		for (const text of rejected) {
			expect(
				parseNewWorldValues(generatedValues({ seed: text }), {
					randomSeed: noRandom,
				}),
			).toEqual({ ok: false, field: 'seed', message: SEED_MESSAGE });
		}
	});

	it('says what a seed is without repeating what was typed', () => {
		expect(SEED_MESSAGE).toBe(
			'Enter a whole number from 0 to 4294967295, or leave the field blank for a random seed.',
		);
	});

	it('turns the land percentage into the fraction the generator is given', () => {
		for (let percent = 0; percent <= 100; percent++) {
			const choice = choiceOf(generatedValues({ landPercent: percent }));
			expect(choice).toMatchObject({ landFraction: percent / 100 });
		}
		expect(choiceOf(generatedValues({ landPercent: 30 }))).toMatchObject({
			landFraction: 0.3,
		});
	});

	it('reads the land percentage from text as well as from a number', () => {
		const accepted: [string, number][] = [
			['30', 0.3],
			[' 45 ', 0.45],
			['0', 0],
			['100', 1],
			['12.5', 0.125],
		];
		for (const [text, landFraction] of accepted) {
			expect(choiceOf(generatedValues({ landPercent: text }))).toMatchObject({
				landFraction,
			});
		}
	});

	it('rejects land outside 0 to 100 per cent, with a message', () => {
		const rejected: (string | number)[] = [
			-1,
			-0.001,
			100.001,
			101,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			Number.NEGATIVE_INFINITY,
			'101',
			'-1',
			'',
			' ',
			'abc',
			'1e1',
			'0x10',
			'30%',
		];
		for (const landPercent of rejected) {
			expect(
				parseNewWorldValues(generatedValues({ landPercent }), {
					randomSeed: noRandom,
				}),
			).toEqual({ ok: false, field: 'landPercent', message: LAND_MESSAGE });
		}
		expect(LAND_MESSAGE).toBe('Land must be from 0% to 100%.');
	});

	it('rejects a resolution that is not supported, with a message', () => {
		for (const resolution of [
			'',
			'100',
			'32',
			'512',
			'064',
			'64.0',
			' 64',
			'6e1',
			'abc',
		]) {
			for (const kind of ['blank', 'generated']) {
				expect(
					parseNewWorldValues(generatedValues({ resolution, kind }), {
						randomSeed: noRandom,
					}),
				).toEqual({
					ok: false,
					field: 'resolution',
					message: RESOLUTION_MESSAGE,
				});
			}
		}
	});

	it('rejects an unknown way of starting, with a message', () => {
		for (const kind of [
			'',
			'Blank',
			'random',
			'generated ',
			'Earth',
			' earth',
		]) {
			expect(
				parseNewWorldValues(generatedValues({ kind }), {
					randomSeed: noRandom,
				}),
			).toEqual({ ok: false, field: 'kind', message: KIND_MESSAGE });
		}
	});

	it('reports the first value found wanting', () => {
		expect(
			parseNewWorldValues(
				{ resolution: '1', kind: 'nothing', seed: 'x', landPercent: 500 },
				{ randomSeed: noRandom },
			),
		).toMatchObject({ field: 'resolution' });
		expect(
			parseNewWorldValues(
				{ resolution: '64', kind: 'nothing', seed: 'x', landPercent: 500 },
				{ randomSeed: noRandom },
			),
		).toMatchObject({ field: 'kind' });
		expect(
			parseNewWorldValues(
				{ resolution: '64', kind: 'generated', seed: 'x', landPercent: 500 },
				{ randomSeed: noRandom },
			),
		).toMatchObject({ field: 'seed' });
	});
});

describe('the values the dialog opens with', () => {
	it('are one press away from generated continents on the default grid', () => {
		expect(FIRST_NEW_WORLD_VALUES).toEqual({
			resolution: '64',
			kind: 'generated',
			seed: '',
			landPercent: 30,
		});
		expect(choiceOf(FIRST_NEW_WORLD_VALUES, () => 99)).toEqual({
			kind: 'generated',
			resolution: DEFAULT_RESOLUTION,
			seed: 99,
			landFraction: 0.3,
		});
	});

	it('put the land slider on one of its steps, within its range', () => {
		expect(DEFAULT_LAND_PERCENT).toBe(30);
		expect(MIN_LAND_PERCENT).toBe(0);
		expect(MAX_LAND_PERCENT).toBe(100);
		expect(LAND_SLIDER_STEP_PERCENT).toBe(1);
	});
});

describe('newWorldValuesFor', () => {
	it('starts a blank world again, with the generated options at rest', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const values = newWorldValuesFor(createBlankWorld(resolution));
			expect(values).toEqual({
				resolution: String(resolution),
				kind: 'blank',
				seed: '',
				landPercent: DEFAULT_LAND_PERCENT,
			});
			expect(choiceOf(values)).toEqual({ kind: 'blank', resolution });
		}
	});

	it('starts an Earth world again, with the generated options at rest', () => {
		const data = slopingEarth();
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const values = newWorldValuesFor(earthWorld(data, resolution));
			expect(values).toEqual({
				resolution: String(resolution),
				kind: 'earth',
				seed: '',
				landPercent: DEFAULT_LAND_PERCENT,
			});
			expect(choiceOf(values)).toEqual({ kind: 'earth', resolution });
		}
	});

	it('starts a generated world again from its seed and land', () => {
		const world = generateWorld({ seed: 1977, landFraction: 0.3 });
		const values = newWorldValuesFor(world);
		expect(values).toEqual({
			resolution: '64',
			kind: 'generated',
			seed: '1977',
			landPercent: 30,
		});
		expect(choiceOf(values)).toEqual({
			kind: 'generated',
			resolution: 64,
			seed: 1977,
			landFraction: 0.3,
		});
	});

	it('gives back every land percentage the slider can be set to', () => {
		const blank = createBlankWorld(64);
		for (let percent = 0; percent <= 100; percent++) {
			const landFraction = percent / 100;
			const values = newWorldValuesFor({
				...blank,
				origin: { kind: 'generated', seed: MAX_SEED, landFraction },
			});
			expect(values.landPercent).toBe(percent);
			expect(values.seed).toBe('4294967295');
			expect(choiceOf(values)).toMatchObject({ landFraction });
		}
	});

	it('shows land that is not on a step at the nearest step in range', () => {
		const blank = createBlankWorld(64);
		const landOf = (landFraction: number): string | number =>
			newWorldValuesFor({
				...blank,
				origin: { kind: 'generated', seed: 1, landFraction },
			}).landPercent;
		expect(landOf(0.304)).toBe(30);
		expect(landOf(0.306)).toBe(31);
		expect(landOf(1.7)).toBe(100);
		expect(landOf(-0.2)).toBe(0);
	});
});

describe('worldFromChoice', () => {
	it('makes a blank ocean at each resolution', async () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const world = await worldFromChoice(
				{ kind: 'blank', resolution },
				noEarth,
			);
			expect(world.resolution).toBe(resolution);
			expect(world.origin).toEqual({ kind: 'blank' });
			expect(world.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
			expect(world.elevation).toHaveLength(
				FACE_COUNT * resolution * resolution,
			);
			expect(
				world.elevation.every((metres) => metres === BLANK_OCEAN_ELEVATION_M),
			).toBe(true);
		}
	});

	it('generates continents on the grid asked for, with the land asked for', async () => {
		// The finest grid goes through the same code and costs seconds here.
		for (const resolution of [64, 128] as const) {
			const world = await worldFromChoice(
				{ kind: 'generated', resolution, seed: 2024, landFraction: 0.4 },
				noEarth,
			);
			expect(world.resolution).toBe(resolution);
			expect(world.origin).toEqual({
				kind: 'generated',
				seed: 2024,
				landFraction: 0.4,
			});
			expect(world.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
			expect(world.elevation).toHaveLength(
				FACE_COUNT * resolution * resolution,
			);
			expect(computeTerrainStats(world).landFraction).toBeCloseTo(0.4, 3);
		}
	});

	it('makes the world the generator makes from the same options', async () => {
		const world = await worldFromChoice(
			{ kind: 'generated', resolution: 64, seed: 1977, landFraction: 0.3 },
			noEarth,
		);
		expect(world).toEqual(
			generateWorld({ resolution: 64, seed: 1977, landFraction: 0.3 }),
		);
	});

	it('reproduces a world from what the panel says about it', async () => {
		const first = await worldFromChoice(
			choiceOf(generatedValues({ seed: '', landPercent: 30 }), () => 31337),
			noEarth,
		);
		expect(describeWorld(first)).toBe('Generated · 64 · seed 31337 · 30% land');

		// Typed back in from the description, and from the pre-filled dialog.
		const typed = await worldFromChoice(
			choiceOf(generatedValues({ seed: '31337', landPercent: '30' })),
			noEarth,
		);
		const prefilled = await worldFromChoice(
			choiceOf(newWorldValuesFor(first)),
			noEarth,
		);
		expect(typed.elevation).toEqual(first.elevation);
		expect(prefilled.elevation).toEqual(first.elevation);

		const other = await worldFromChoice(
			choiceOf(generatedValues({ seed: '31338', landPercent: 30 })),
			noEarth,
		);
		expect(other.elevation).not.toEqual(first.elevation);
	});

	it('makes the Earth on the grid asked for, from the data it is given', async () => {
		const data = slopingEarth();
		let asked = 0;
		const sources: WorldSources = {
			loadEarth: async () => {
				asked++;
				return data;
			},
		};
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const world = await worldFromChoice(
				{ kind: 'earth', resolution },
				sources,
			);
			expect(world.resolution).toBe(resolution);
			expect(world.origin).toEqual({ kind: 'earth' });
			expect(world.seaLevel).toBe(DEFAULT_SEA_LEVEL_M);
			expect(world).toEqual(earthWorld(data, resolution));
			expect(world.elevation).not.toBe(data.elevation);
			expect(describeWorld(world)).toBe(`Earth · ${resolution}`);
		}
		expect(asked).toBe(SUPPORTED_RESOLUTIONS.length);
	});

	it('fails as the loading of the Earth data fails', async () => {
		const error = new Error('offline');
		await expect(
			worldFromChoice(
				{ kind: 'earth', resolution: 64 },
				{ loadEarth: () => Promise.reject(error) },
			),
		).rejects.toBe(error);
	});

	it('rejects rather than throws when a world cannot be generated', async () => {
		const made = worldFromChoice(
			{ kind: 'generated', resolution: 64, seed: 1, landFraction: 2 },
			noEarth,
		);
		await expect(made).rejects.toThrow(RangeError);
	});
});

describe('runCreate', () => {
	const generatedChoice: NewWorldChoice = {
		kind: 'generated',
		resolution: 64,
		seed: 1977,
		landFraction: 0.3,
	};
	const blankChoice: NewWorldChoice = { kind: 'blank', resolution: 64 };
	const earthChoice: NewWorldChoice = { kind: 'earth', resolution: 128 };

	/** Steps that only write down what was asked of them, in order. */
	const recordingSteps = (
		overrides: Partial<CreateSteps> = {},
	): { readonly calls: unknown[][]; readonly steps: CreateSteps } => {
		const calls: unknown[][] = [];
		const world = createBlankWorld(64);
		const steps: CreateSteps = {
			createWorld: (choice) => {
				calls.push(['createWorld', choice]);
				return world;
			},
			onWorld: (made) => {
				calls.push(['onWorld', made === world]);
			},
			afterPaint: async () => {
				calls.push(['afterPaint']);
			},
			setBusy: (busy, label) => {
				calls.push(['setBusy', busy, label]);
			},
			fail: (message) => {
				calls.push(['fail', message]);
			},
			close: () => {
				calls.push(['close']);
			},
			logError: (error) => {
				calls.push(['logError', error]);
			},
			...overrides,
		};
		return { calls, steps };
	};

	it('says it is generating, builds the world, hands it over and closes', async () => {
		const { calls, steps } = recordingSteps();
		await runCreate(generatedChoice, steps);
		expect(calls).toEqual([
			['setBusy', true, GENERATING_LABEL],
			['afterPaint'],
			['createWorld', generatedChoice],
			['onWorld', true],
			['afterPaint'],
			['close'],
		]);
	});

	it('keeps the confirm label while a blank world is built', async () => {
		const { calls, steps } = recordingSteps();
		await runCreate(blankChoice, steps);
		expect(calls).toEqual([
			['setBusy', true, CONFIRM_LABEL],
			['afterPaint'],
			['createWorld', blankChoice],
			['onWorld', true],
			['afterPaint'],
			['close'],
		]);
	});

	it('says it is loading the Earth, makes the world, hands it over and closes', async () => {
		const { calls, steps } = recordingSteps();
		await runCreate(earthChoice, steps);
		expect(calls).toEqual([
			['setBusy', true, LOADING_EARTH_LABEL],
			['afterPaint'],
			['createWorld', earthChoice],
			['onWorld', true],
			['afterPaint'],
			['close'],
		]);
	});

	it('stays busy for as long as the world takes to arrive', async () => {
		const world = createBlankWorld(64);
		let arrive: (made: typeof world) => void = () => {};
		const { calls, steps } = recordingSteps({
			createWorld: (choice) => {
				calls.push(['createWorld', choice]);
				return new Promise((resolve) => {
					arrive = resolve;
				});
			},
			onWorld: (made) => {
				calls.push(['onWorld', made === world]);
			},
		});
		const done = runCreate(earthChoice, steps);
		// Long enough for everything that does not wait on the world.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(calls).toEqual([
			['setBusy', true, LOADING_EARTH_LABEL],
			['afterPaint'],
			['createWorld', earthChoice],
		]);
		arrive(world);
		await done;
		expect(calls.slice(3)).toEqual([
			['onWorld', true],
			['afterPaint'],
			['close'],
		]);
	});

	it('stays open and says so when the Earth data does not arrive', async () => {
		const error = new Error('offline');
		const { calls, steps } = recordingSteps({
			createWorld: () => Promise.reject(error),
		});
		await runCreate(earthChoice, steps);
		expect(calls).toEqual([
			['setBusy', true, LOADING_EARTH_LABEL],
			['afterPaint'],
			['logError', error],
			['setBusy', false, CONFIRM_LABEL],
			['fail', EARTH_FAILED_MESSAGE],
		]);
	});

	it('says the world could not be created when another kind is rejected', async () => {
		const error = new Error('no world');
		for (const choice of [generatedChoice, blankChoice]) {
			const { calls, steps } = recordingSteps({
				createWorld: () => Promise.reject(error),
			});
			await runCreate(choice, steps);
			expect(calls.slice(-3)).toEqual([
				['logError', error],
				['setBusy', false, CONFIRM_LABEL],
				['fail', CREATE_FAILED_MESSAGE],
			]);
		}
	});

	it('builds the world only once the busy dialog has been drawn', async () => {
		let painted = false;
		const { calls, steps } = recordingSteps({
			afterPaint: () =>
				new Promise((resolve) => {
					setTimeout(() => {
						painted = true;
						resolve();
					}, 0);
				}),
			createWorld: () => {
				expect(painted).toBe(true);
				return createBlankWorld(64);
			},
		});
		const done = runCreate(generatedChoice, steps);
		expect(calls).toEqual([['setBusy', true, GENERATING_LABEL]]);
		await done;
		expect(calls.at(-1)).toEqual(['close']);
	});

	it('stays open and says so when the world cannot be built', async () => {
		const error = new Error('no world');
		const { calls, steps } = recordingSteps({
			createWorld: () => {
				throw error;
			},
		});
		await runCreate(generatedChoice, steps);
		expect(calls).toEqual([
			['setBusy', true, GENERATING_LABEL],
			['afterPaint'],
			['logError', error],
			['setBusy', false, CONFIRM_LABEL],
			['fail', CREATE_FAILED_MESSAGE],
		]);
	});

	it('drops a world that arrives after the dialog has closed', async () => {
		const world = createBlankWorld(64);
		let arrive: (made: typeof world) => void = () => {};
		let closed = false;
		const { calls, steps } = recordingSteps({
			createWorld: () =>
				new Promise((resolve) => {
					arrive = resolve;
				}),
		});
		const done = runCreate(
			earthChoice,
			stepsUntilClosed(steps, () => closed),
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		closed = true;
		arrive(world);
		await done;
		expect(calls).toEqual([
			['setBusy', true, LOADING_EARTH_LABEL],
			['afterPaint'],
			['afterPaint'],
			['close'],
		]);
	});

	it('says nothing of a failure after the dialog has closed', async () => {
		const error = new Error('offline');
		let fail: (reason: Error) => void = () => {};
		let closed = false;
		const { calls, steps } = recordingSteps({
			createWorld: () =>
				new Promise((_resolve, reject) => {
					fail = reject;
				}),
		});
		const done = runCreate(
			earthChoice,
			stepsUntilClosed(steps, () => closed),
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		closed = true;
		fail(error);
		await done;
		expect(calls).toEqual([
			['setBusy', true, LOADING_EARTH_LABEL],
			['afterPaint'],
			['logError', error],
			['setBusy', false, CONFIRM_LABEL],
		]);
	});

	it('hands the world over and says a failure while the dialog is open', async () => {
		const { calls, steps } = recordingSteps();
		await runCreate(
			earthChoice,
			stepsUntilClosed(steps, () => false),
		);
		expect(calls).toEqual([
			['setBusy', true, LOADING_EARTH_LABEL],
			['afterPaint'],
			['createWorld', earthChoice],
			['onWorld', true],
			['afterPaint'],
			['close'],
		]);
		const error = new Error('offline');
		const failing = recordingSteps({
			createWorld: () => Promise.reject(error),
		});
		await runCreate(
			earthChoice,
			stepsUntilClosed(failing.steps, () => false),
		);
		expect(failing.calls.slice(-3)).toEqual([
			['logError', error],
			['setBusy', false, CONFIRM_LABEL],
			['fail', EARTH_FAILED_MESSAGE],
		]);
	});

	it('still closes when handing the world over throws', async () => {
		const error = new Error('no listener');
		const { calls, steps } = recordingSteps({
			onWorld: () => {
				throw error;
			},
		});
		await runCreate(blankChoice, steps);
		expect(calls).toEqual([
			['setBusy', true, CONFIRM_LABEL],
			['afterPaint'],
			['createWorld', blankChoice],
			['logError', error],
			['afterPaint'],
			['close'],
		]);
	});
});

describe('the wording of the dialog', () => {
	it('has a hint for every resolution', () => {
		expect(Object.keys(RESOLUTION_HINTS).map(Number)).toEqual([
			...SUPPORTED_RESOLUTIONS,
		]);
		expect(RESOLUTION_HINTS[64]).toBe('about 150 km cells');
	});

	it('names every way of starting a world', () => {
		expect(START_LABELS).toEqual({
			blank: 'Blank ocean',
			generated: 'Generated continents',
			earth: 'Earth',
		});
		expect(EARTH_HINT).toBe('real elevation');
	});

	it('changes the confirm button while generating or loading', () => {
		expect(CONFIRM_LABEL).toBe('Create world');
		expect(GENERATING_LABEL).toBe('Generating…');
		expect(LOADING_EARTH_LABEL).toBe('Loading Earth…');
	});

	it('says in fixed words that the Earth data could not be loaded', () => {
		expect(EARTH_FAILED_MESSAGE).toBe(
			"Earth's elevation data could not be loaded. Check your connection and try again. The current world has not been changed.",
		);
		expect(CREATE_FAILED_MESSAGE).toBe(
			'The new world could not be created. The current world has not been changed.',
		);
	});

	it('writes land percentages as whole numbers', () => {
		expect(formatPercent(30)).toBe('30%');
		expect(formatPercent(0)).toBe('0%');
		expect(formatPercent(99.6)).toBe('100%');
	});
});
