import { describe, expect, it } from 'vitest';
import {
	createBlankWorld,
	generateWorld,
	MAX_SEED,
	SUPPORTED_RESOLUTIONS,
	serializeWorld,
	type World,
	type WorldFileError,
	type WorldFileResult,
} from '../../core/index';
import { importWorldFile } from '../storage';
import {
	AUTOSAVE_UNAVAILABLE_LABEL,
	autosaveLabel,
	DAMAGED_FILE_MESSAGE,
	describeWorld,
	EXPORT_FAILED_MESSAGE,
	formatLandPercent,
	type ImportSteps,
	importErrorMessage,
	NEWER_FILE_MESSAGE,
	NOT_A_WORLD_MESSAGE,
	runImport,
	SAVED_LABEL,
	UNREADABLE_FILE_MESSAGE,
} from './worldPanel';

/** A world that says it was generated, without the cost of generating it. */
const generatedWorld = (
	resolution: number,
	seed: number,
	landFraction: number,
): World => ({
	...createBlankWorld(resolution),
	origin: { kind: 'generated', seed, landFraction },
});

describe('formatLandPercent', () => {
	it('writes every whole percentage the slider gives as that percentage', () => {
		for (let percent = 0; percent <= 100; percent++) {
			expect(formatLandPercent(percent / 100)).toBe(`${percent}%`);
		}
	});

	it('writes a fraction that is not a whole percentage in full', () => {
		expect(formatLandPercent(0.125)).toBe('12.5%');
		expect(formatLandPercent(0.305)).toBe('30.5%');
		expect(formatLandPercent(0.3001)).toBe('30.01%');
		expect(formatLandPercent(1 / 3)).toBe('33.3333333333%');
		expect(formatLandPercent(0.004)).toBe('0.4%');
	});

	it('does not show the noise of binary fractions', () => {
		// 0.123 * 100 is 12.299999999999999 in double precision.
		expect(formatLandPercent(0.123)).toBe('12.3%');
	});
});

describe('describeWorld', () => {
	it('describes a blank world by its resolution', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			expect(describeWorld(createBlankWorld(resolution))).toBe(
				`Blank ocean · ${resolution}`,
			);
		}
	});

	it('describes an Earth world by its resolution', () => {
		for (const resolution of SUPPORTED_RESOLUTIONS) {
			const world: World = {
				...createBlankWorld(resolution),
				origin: { kind: 'earth' },
			};
			expect(describeWorld(world)).toBe(`Earth · ${resolution}`);
		}
	});

	it('describes a generated world by its resolution, seed and land', () => {
		expect(
			describeWorld(generateWorld({ seed: 1977, landFraction: 0.3 })),
		).toBe('Generated · 64 · seed 1977 · 30% land');
		expect(describeWorld(generatedWorld(128, 0, 0))).toBe(
			'Generated · 128 · seed 0 · 0% land',
		);
		expect(describeWorld(generatedWorld(256, 42, 1))).toBe(
			'Generated · 256 · seed 42 · 100% land',
		);
	});

	it('writes the seed without grouping its digits', () => {
		expect(describeWorld(generatedWorld(64, MAX_SEED, 0.3))).toBe(
			'Generated · 64 · seed 4294967295 · 30% land',
		);
	});

	it('writes land that is not a whole percentage in full', () => {
		expect(describeWorld(generatedWorld(64, 7, 0.455))).toBe(
			'Generated · 64 · seed 7 · 45.5% land',
		);
	});

	it('describes how the world started, whatever has been done to it since', () => {
		const world = generatedWorld(64, 7, 0.3);
		world.seaLevel = 500;
		world.elevation.fill(1000);
		expect(describeWorld(world)).toBe('Generated · 64 · seed 7 · 30% land');
	});
});

describe('the wording', () => {
	it('is fixed', () => {
		expect(SAVED_LABEL).toBe('Saved');
		expect(AUTOSAVE_UNAVAILABLE_LABEL).toBe('Autosave unavailable');
		expect(NOT_A_WORLD_MESSAGE).toBe('That file is not an earth_sim world.');
		expect(DAMAGED_FILE_MESSAGE).toBe(
			'That world file is damaged or incomplete.',
		);
		expect(NEWER_FILE_MESSAGE).toBe(
			'That world file was made by a newer version of earth_sim.',
		);
		expect(UNREADABLE_FILE_MESSAGE).toBe('That file could not be read.');
		expect(EXPORT_FAILED_MESSAGE).toBe('The world could not be exported.');
	});
});

describe('autosaveLabel', () => {
	it('says whether the world was saved', () => {
		expect(autosaveLabel('saved')).toBe('Saved');
		expect(autosaveLabel('unavailable')).toBe('Autosave unavailable');
	});
});

describe('importErrorMessage', () => {
	it('says a file with the wrong marker is not a world', () => {
		expect(importErrorMessage('bad-marker')).toBe(NOT_A_WORLD_MESSAGE);
	});

	it('says a file of another version is from a newer earth_sim', () => {
		expect(importErrorMessage('unknown-version')).toBe(NEWER_FILE_MESSAGE);
	});

	it('says every other refused file is damaged', () => {
		const damaged: readonly WorldFileError[] = [
			'truncated',
			'header-too-long',
			'bad-header',
			'bad-resolution',
			'bad-planet',
			'bad-age',
			'bad-length',
			'not-finite',
		];
		for (const error of damaged) {
			expect(importErrorMessage(error)).toBe(DAMAGED_FILE_MESSAGE);
		}
	});
});

describe('runImport', () => {
	/** The steps of an import, recording what each was asked to do. */
	type Stage = {
		readonly steps: ImportSteps;
		readonly worlds: World[];
		readonly messages: string[];
		readonly errors: unknown[];
	};

	const createStage = (overrides: Partial<ImportSteps> = {}): Stage => {
		const stage: Stage = {
			worlds: [],
			messages: [],
			errors: [],
			steps: {
				read: importWorldFile,
				onWorld: (world) => stage.worlds.push(world),
				showMessage: (message) => stage.messages.push(message),
				logError: (error) => stage.errors.push(error),
				...overrides,
			},
		};
		return stage;
	};

	it('hands over the world a world file holds, and says nothing', async () => {
		const world = generateWorld({ seed: 7, landFraction: 0.3 });
		world.seaLevel = 250;
		const stage = createStage();
		await runImport(new Blob([serializeWorld(world)]), stage.steps);

		expect(stage.worlds).toEqual([world]);
		expect(stage.worlds[0]).not.toBe(world);
		expect(stage.messages).toEqual([]);
		expect(stage.errors).toEqual([]);
	});

	it('hands nothing over for a file that is not a world, and says so', async () => {
		const stage = createStage();
		await runImport(new Blob(['<svg>a picture</svg>']), stage.steps);
		expect(stage.worlds).toEqual([]);
		expect(stage.messages).toEqual([NOT_A_WORLD_MESSAGE]);
		expect(stage.errors).toEqual([]);
	});

	it('hands nothing over for a world file cut short, and says so', async () => {
		const bytes = serializeWorld(createBlankWorld(64));
		const stage = createStage();
		await runImport(new Blob([bytes.slice(0, bytes.length - 7)]), stage.steps);
		expect(stage.worlds).toEqual([]);
		expect(stage.messages).toEqual([DAMAGED_FILE_MESSAGE]);
	});

	it('says only fixed words, whatever the file holds', async () => {
		const header =
			'{"resolution":"<img src=x onerror=alert(1)>","seaLevel":0,"origin":{"kind":"blank"}}';
		const bytes = serializeWorld(createBlankWorld(64));
		const hostile = new Uint8Array(16 + header.length);
		hostile.set(bytes.subarray(0, 16));
		new DataView(hostile.buffer).setUint32(12, header.length, true);
		hostile.set(
			Uint8Array.from(header, (character) => character.charCodeAt(0)),
			16,
		);
		const stage = createStage();
		await runImport(new Blob([hostile]), stage.steps);
		expect(stage.worlds).toEqual([]);
		expect(stage.messages).toEqual([DAMAGED_FILE_MESSAGE]);
	});

	it('says the file could not be read when reading it fails, and logs why', async () => {
		const failure = new Error('the file has gone');
		const stage = createStage({ read: () => Promise.reject(failure) });
		await runImport(new Blob([]), stage.steps);
		expect(stage.worlds).toEqual([]);
		expect(stage.messages).toEqual([UNREADABLE_FILE_MESSAGE]);
		expect(stage.errors).toEqual([failure]);
	});

	it('logs an error thrown while the world is handed over, and says nothing', async () => {
		const failure = new Error('the globe is gone');
		const result: WorldFileResult = { ok: true, world: createBlankWorld(64) };
		const stage = createStage({
			read: () => Promise.resolve(result),
			onWorld: () => {
				throw failure;
			},
		});
		await expect(runImport(new Blob([]), stage.steps)).resolves.toBeUndefined();
		expect(stage.messages).toEqual([]);
		expect(stage.errors).toEqual([failure]);
	});
});
