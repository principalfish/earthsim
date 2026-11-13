import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_PLANET,
	PLANET_LIMITS,
	PLANET_SETTINGS,
	type PlanetSettings,
} from '../../core/index';
import {
	byClass,
	createFakeDocument,
	type FakeElement,
	findAll,
	oneByClass,
} from '../testing/fakeDocument';
import {
	createPlanetPanel,
	formatAu,
	formatGreenhouse,
	formatSolar,
	formatSunlight,
	formatTilt,
	formatYear,
	linearSliderScale,
	logSliderScale,
	PLANET_SLIDERS,
	type PlanetSlider,
	RESET_PLANET_LABEL,
	ROUGH_NOTE_TEXT,
	roughNoteFor,
	settingText,
} from './planetPanel';

/** The slider of a setting. */
const sliderFor = (setting: keyof PlanetSettings): PlanetSlider => {
	const slider = PLANET_SLIDERS.find((each) => each.setting === setting);
	if (slider === undefined) {
		throw new Error(`No slider sets ${setting}`);
	}
	return slider;
};

/** Every position of a slider, from 0 to its highest. */
const positionsOf = (slider: PlanetSlider): number[] =>
	Array.from({ length: slider.scale.steps + 1 }, (_, position) => position);

/** Earth's settings with some of them changed. */
const planetWith = (changes: Partial<PlanetSettings>): PlanetSettings => ({
	...DEFAULT_PLANET,
	...changes,
});

describe('the planet sliders', () => {
	it('set each of the settings but the day length once, in the order of the settings', () => {
		// The day length has no slider: it stays as the world holds it.
		expect(PLANET_SLIDERS.map((slider) => slider.setting)).toEqual(
			PLANET_SETTINGS.filter((name) => name !== 'dayLengthHours'),
		);
	});

	it.each(PLANET_SLIDERS)('$label: ends exactly at the limits', (slider) => {
		const { scale, setting } = slider;
		expect(scale.toSetting(0)).toBe(PLANET_LIMITS[setting].min);
		expect(scale.toSetting(scale.steps)).toBe(PLANET_LIMITS[setting].max);
		expect(scale.toPosition(PLANET_LIMITS[setting].min)).toBe(0);
		expect(scale.toPosition(PLANET_LIMITS[setting].max)).toBe(scale.steps);
	});

	it.each(PLANET_SLIDERS)(
		'$label: has a stop exactly on Earth’s value',
		(slider) => {
			const { scale, setting } = slider;
			expect(scale.toSetting(scale.earthPosition)).toBe(
				DEFAULT_PLANET[setting],
			);
			expect(scale.toPosition(DEFAULT_PLANET[setting])).toBe(
				scale.earthPosition,
			);
		},
	);

	it.each(PLANET_SLIDERS)(
		'$label: goes from each position to a value and back',
		(slider) => {
			const { scale } = slider;
			const values = positionsOf(slider).map(scale.toSetting);
			values.forEach((value, position) => {
				expect(scale.toPosition(value)).toBe(position);
			});
			for (let position = 1; position < values.length; position += 1) {
				expect(values[position]).toBeGreaterThan(
					values[position - 1] as number,
				);
			}
		},
	);

	it.each(PLANET_SLIDERS)(
		'$label: brings a value beyond the limits to the end it lies beyond',
		(slider) => {
			const { scale, setting } = slider;
			const { min, max } = PLANET_LIMITS[setting];
			expect(scale.toPosition(min - 1)).toBe(0);
			expect(scale.toPosition(max * 2)).toBe(scale.steps);
		},
	);

	it('tilt the axis from 0° to 90° in half degrees, with 23.44° in place of 23.5°', () => {
		const { scale } = sliderFor('axialTiltDeg');
		expect(scale.steps).toBe(180);
		expect(scale.earthPosition).toBe(47);
		expect(scale.toSetting(1)).toBe(0.5);
		expect(scale.toSetting(46)).toBe(23);
		expect(scale.toSetting(47)).toBe(23.44);
		expect(scale.toSetting(48)).toBe(24);
		expect(scale.toSetting(179)).toBe(89.5);
		expect(scale.toPosition(23.5)).toBe(47);
		expect(scale.toPosition(23.7)).toBe(47);
		expect(scale.toPosition(23.8)).toBe(48);
	});

	it('bring a tilt beside Earth’s stop to the stop nearest in value', () => {
		const { scale } = sliderFor('axialTiltDeg');
		// 0.27 from 24°, and 0.29 from 23.44°.
		expect(scale.toPosition(23.73)).toBe(48);
		// 0.21 from 23.44°, and 0.23 from 23°.
		expect(scale.toPosition(23.23)).toBe(47);
	});

	it('set the greenhouse from 0 to 3 times Earth’s in steps of 0.05', () => {
		const { scale } = sliderFor('greenhouseStrength');
		expect(scale.steps).toBe(60);
		expect(scale.earthPosition).toBe(20);
		expect(scale.toSetting(1)).toBe(0.05);
		expect(scale.toSetting(3)).toBe(0.15);
		expect(scale.toSetting(21)).toBe(1.05);
		expect(scale.toSetting(59)).toBe(2.95);
		expect(scale.toPosition(1.02)).toBe(20);
		expect(scale.toPosition(1.03)).toBe(21);
	});

	it.each(['starBrightness', 'starMass'] as const)(
		'set the %s on a logarithmic scale, 1 in the middle of 201 stops',
		(setting) => {
			const { scale } = sliderFor(setting);
			expect(scale.steps).toBe(200);
			expect(scale.earthPosition).toBe(100);
			expect(scale.toSetting(100)).toBe(1);
			for (const position of [1, 50, 99, 150, 199]) {
				expect(scale.toSetting(position)).toBeCloseTo(
					10 ** ((position - 100) / 100),
					12,
				);
			}
			expect(scale.toPosition(10 ** 0.504)).toBe(150);
			expect(scale.toPosition(10 ** 0.496)).toBe(150);
		},
	);

	it('set the orbit on a logarithmic scale, with each step about the same factor on either side of 1 AU', () => {
		const { scale } = sliderFor('orbitDistanceAu');
		expect(scale.steps).toBe(200);
		expect(scale.earthPosition).toBe(105);
		expect(scale.toSetting(105)).toBe(1);
		const factorBelow = scale.toSetting(105) / scale.toSetting(104);
		const factorAbove = scale.toSetting(106) / scale.toSetting(105);
		expect(factorBelow).toBeCloseTo((1 / 0.3) ** (1 / 105), 12);
		expect(factorAbove).toBeCloseTo(3 ** (1 / 95), 12);
		expect(Math.abs(factorAbove / factorBelow - 1)).toBeLessThan(0.0001);
		expect(scale.toSetting(1) / scale.toSetting(0)).toBeCloseTo(
			factorBelow,
			12,
		);
		expect(scale.toSetting(200) / scale.toSetting(199)).toBeCloseTo(
			factorAbove,
			12,
		);
	});
});

describe('linearSliderScale and logSliderScale', () => {
	it('give the nearest position to a value between two', () => {
		const linear = linearSliderScale({ min: 0, max: 10 }, 1, 3.3);
		expect(linear.earthPosition).toBe(3);
		expect(linear.toPosition(4.4)).toBe(4);
		expect(linear.toPosition(4.5)).toBe(5);
		const log = logSliderScale({ min: 1, max: 100 }, 2, 10);
		expect(log.toPosition(3)).toBe(0);
		expect(log.toPosition(3.3)).toBe(1);
		expect(log.toPosition(31)).toBe(1);
		expect(log.toPosition(32)).toBe(2);
	});
});

describe('the values as written', () => {
	it('write a tilt to a hundredth of a degree, without trailing zeros', () => {
		expect(formatTilt(23.44)).toBe('23.44°');
		expect(formatTilt(23.5)).toBe('23.5°');
		expect(formatTilt(0)).toBe('0°');
		expect(formatTilt(90)).toBe('90°');
		expect(formatTilt(12.3456)).toBe('12.35°');
	});

	it('write a multiple of the Sun’s to three significant figures', () => {
		expect(formatSolar(0.1)).toBe('0.100 × Sun');
		expect(formatSolar(0.8609)).toBe('0.861 × Sun');
		expect(formatSolar(1)).toBe('1.00 × Sun');
		expect(formatSolar(9.772)).toBe('9.77 × Sun');
		expect(formatSolar(10)).toBe('10.0 × Sun');
	});

	it('write an orbit to three significant figures', () => {
		expect(formatAu(0.3)).toBe('0.300 AU');
		expect(formatAu(1.5205)).toBe('1.52 AU');
		expect(formatAu(3)).toBe('3.00 AU');
	});

	it('write a greenhouse strength to a hundredth', () => {
		expect(formatGreenhouse(0)).toBe('0.00 × Earth');
		expect(formatGreenhouse(1)).toBe('1.00 × Earth');
		expect(formatGreenhouse(0.15)).toBe('0.15 × Earth');
		expect(formatGreenhouse(3)).toBe('3.00 × Earth');
	});

	it('say when a value is Earth’s, unless the value as written says so already', () => {
		expect(settingText(sliderFor('axialTiltDeg'), 23.44)).toBe(
			'23.44° (Earth)',
		);
		expect(settingText(sliderFor('axialTiltDeg'), 23.5)).toBe('23.5°');
		expect(settingText(sliderFor('starBrightness'), 1)).toBe(
			'1.00 × Sun (Earth)',
		);
		expect(settingText(sliderFor('starBrightness'), 1.001)).toBe('1.00 × Sun');
		expect(settingText(sliderFor('starMass'), 1)).toBe('1.00 × Sun (Earth)');
		expect(settingText(sliderFor('orbitDistanceAu'), 1)).toBe(
			'1.00 AU (Earth)',
		);
		expect(settingText(sliderFor('greenhouseStrength'), 1)).toBe(
			'1.00 × Earth',
		);
	});
});

describe('formatSunlight', () => {
	it('writes Earth’s as all of it', () => {
		expect(formatSunlight(1)).toBe("100% of Earth's");
	});

	it('writes small amounts as a share to a tenth of a percent below 10%', () => {
		expect(formatSunlight(0.1 / 9)).toBe("1.1% of Earth's");
		expect(formatSunlight(0.05)).toBe("5.0% of Earth's");
		expect(formatSunlight(0.0994)).toBe("9.9% of Earth's");
		expect(formatSunlight(0.0996)).toBe("10% of Earth's");
	});

	it('writes amounts that round to under 200% as a whole percent', () => {
		expect(formatSunlight(0.86)).toBe("86% of Earth's");
		expect(formatSunlight(1.5)).toBe("150% of Earth's");
		expect(formatSunlight(1.994)).toBe("199% of Earth's");
	});

	it('writes amounts that round to 200% or more as a multiple to three significant figures', () => {
		expect(formatSunlight(1.995)).toBe("2.00 × Earth's");
		expect(formatSunlight(1.996)).toBe("2.00 × Earth's");
		// The double just under 1.995: its percent is 199.5 exactly and rounds
		// to 200, though to three figures it is 1.99 itself.
		expect(formatSunlight(1.9949999999999999)).toBe("2.00 × Earth's");
		expect(formatSunlight(2)).toBe("2.00 × Earth's");
		expect(formatSunlight(2.5)).toBe("2.50 × Earth's");
		expect(formatSunlight(10 / 0.09)).toBe("111 × Earth's");
	});
});

describe('formatYear', () => {
	it('writes a year under two Earth years in whole days', () => {
		expect(formatYear(365.25)).toBe('365 days');
		expect(formatYear(19.3)).toBe('19 days');
		expect(formatYear(730.49)).toBe('730 days');
	});

	it('writes a year from two Earth years in Earth years to a tenth', () => {
		expect(formatYear(730.5)).toBe('2.0 years');
		expect(formatYear(3.2 * 365.25)).toBe('3.2 years');
		expect(formatYear(365.25 * Math.sqrt(270))).toBe('16.4 years');
	});
});

describe('roughNoteFor', () => {
	it('says nothing for a planet the model is trusted for', () => {
		expect(roughNoteFor(DEFAULT_PLANET)).toBeNull();
		expect(roughNoteFor(planetWith({ starBrightness: 0.9 }))).toBeNull();
		expect(roughNoteFor(planetWith({ starBrightness: 1.25 }))).toBeNull();
	});

	it('says the results are rough on the cold side, and that it may be frozen over', () => {
		expect(roughNoteFor(planetWith({ starBrightness: 0.89 }))).toBe(
			ROUGH_NOTE_TEXT.cold,
		);
		expect(ROUGH_NOTE_TEXT.cold).toBe(
			'The model is calibrated on the Earth, so its results for a planet far colder than the Earth are rough. This one may be frozen over.',
		);
	});

	it('says the results are rough on the hot side', () => {
		expect(roughNoteFor(planetWith({ starBrightness: 1.26 }))).toBe(
			ROUGH_NOTE_TEXT.hot,
		);
		expect(ROUGH_NOTE_TEXT.hot).toBe(
			'The model is calibrated on the Earth, so its results for a planet far hotter than the Earth are rough.',
		);
	});
});

describe('createPlanetPanel', () => {
	beforeEach(() => {
		vi.stubGlobal('document', createFakeDocument().document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const make = (planet: PlanetSettings = DEFAULT_PLANET) => {
		const fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
		const section = fake.createElement('div');
		const changes: PlanetSettings[] = [];
		const controls = createPlanetPanel(section as unknown as HTMLElement, {
			planet,
			onChange: (next) => changes.push(next),
		});
		const inputs = byClass(section, 'field__range');
		/** The slider of a setting, its value as written and its mark. */
		const field = (setting: keyof PlanetSettings) => {
			const index = PLANET_SETTINGS.indexOf(setting);
			const element = byClass(section, 'field')[index] as FakeElement;
			return {
				input: inputs[index] as FakeElement,
				output: oneByClass(element, 'field__value'),
				mark: oneByClass(element, 'field__mark'),
			};
		};
		/** Moves a slider to a position as a drag does. */
		const move = (setting: keyof PlanetSettings, position: number): void => {
			const { input } = field(setting);
			input.value = String(position);
			input.fire('input');
		};
		const values = byClass(section, 'planet-readout__value');
		return {
			section,
			controls,
			changes,
			inputs,
			field,
			move,
			sunlight: () => values[0]?.textContent,
			year: () => values[1]?.textContent,
			region: oneByClass(section, 'planet-readout__note-region'),
			reset: oneByClass(section, 'planet-reset'),
		};
	};

	it('adds the planet controls to the section’s body: the sliders, the two lines, the note and the button', () => {
		const { section } = make();
		expect(section.children.map((child) => child.className)).toEqual([
			'field',
			'field',
			'field',
			'field',
			'field',
			'planet-readout',
			'button button--compact planet-reset',
		]);
	});

	it('labels each slider and writes its value for screen readers, Earth’s said to be Earth’s', () => {
		const { section, inputs } = make();
		expect(
			byClass(section, 'field__label').map((label) => [
				label.textContent,
				label.htmlFor,
			]),
		).toEqual([
			['Axial tilt', 'planet-axial-tilt'],
			['Star brightness', 'planet-star-brightness'],
			['Star mass', 'planet-star-mass'],
			['Orbit distance', 'planet-orbit-distance'],
			['Greenhouse strength', 'planet-greenhouse'],
		]);
		expect(
			inputs.map((input) => [
				input.id,
				input.type,
				input.min,
				input.max,
				input.step,
				input.value,
				input.getAttribute('aria-valuetext'),
			]),
		).toEqual([
			['planet-axial-tilt', 'range', '0', '180', '1', '47', '23.44° (Earth)'],
			[
				'planet-star-brightness',
				'range',
				'0',
				'200',
				'1',
				'100',
				'1.00 × Sun (Earth)',
			],
			[
				'planet-star-mass',
				'range',
				'0',
				'200',
				'1',
				'100',
				'1.00 × Sun (Earth)',
			],
			[
				'planet-orbit-distance',
				'range',
				'0',
				'200',
				'1',
				'105',
				'1.00 AU (Earth)',
			],
			['planet-greenhouse', 'range', '0', '60', '1', '20', '1.00 × Earth'],
		]);
		expect(
			byClass(section, 'field__value').map((output) => output.textContent),
		).toEqual([
			'23.44° (Earth)',
			'1.00 × Sun (Earth)',
			'1.00 × Sun (Earth)',
			'1.00 AU (Earth)',
			'1.00 × Earth',
		]);
	});

	it('marks Earth’s value on each track, with what it stands for', () => {
		const { section } = make();
		const marks = byClass(section, 'field__mark');
		expect(marks.map((mark) => mark.title)).toEqual([
			'Earth: 23.44°',
			'Earth: 1.00 × Sun',
			'Earth: 1.00 × Sun',
			'Earth: 1.00 AU',
			'Earth: 1.00 × Earth',
		]);
		expect(marks.map((mark) => mark.style.left)).toEqual(
			[47 / 180, 0.5, 0.5, 105 / 200, 1 / 3].map(
				(fraction) =>
					`calc(var(--range-thumb-size) / 2 + (100% - var(--range-thumb-size)) * ${fraction})`,
			),
		);
	});

	it('shows Earth’s sunlight and year, with no note', () => {
		const { sunlight, year, region, section } = make();
		expect(
			byClass(section, 'planet-readout__label').map((term) => term.textContent),
		).toEqual(['Sunlight', 'Year']);
		expect(sunlight()).toBe("100% of Earth's");
		expect(year()).toBe('365 days');
		expect(region.getAttribute('aria-live')).toBe('polite');
		expect(region.children).toEqual([]);
	});

	it('passes on the settings with the one a slider sets, at each movement', () => {
		const { move, changes, field } = make();
		move('axialTiltDeg', 0);
		move('axialTiltDeg', 120);
		move('greenhouseStrength', 3);
		expect(changes).toEqual([
			planetWith({ axialTiltDeg: 0 }),
			planetWith({ axialTiltDeg: 60 }),
			planetWith({ axialTiltDeg: 60, greenhouseStrength: 0.15 }),
		]);
		expect(field('axialTiltDeg').output.textContent).toBe('60°');
		expect(field('axialTiltDeg').input.getAttribute('aria-valuetext')).toBe(
			'60°',
		);
		move('axialTiltDeg', 47);
		expect(field('axialTiltDeg').output.textContent).toBe('23.44° (Earth)');
		expect(changes.at(-1)).toEqual(planetWith({ greenhouseStrength: 0.15 }));
	});

	it('passes on a copy each time, which the panel does not change', () => {
		const { move, changes } = make();
		move('starMass', 200);
		const first = changes[0] as PlanetSettings;
		move('starMass', 0);
		expect(first.starMass).toBe(10);
		expect(changes[1]).not.toBe(first);
	});

	it('follows the settings with the sunlight and the year as the sliders move', () => {
		const { move, sunlight, year } = make();
		move('orbitDistanceAu', 200);
		expect(sunlight()).toBe("11% of Earth's");
		expect(year()).toBe('5.2 years');
		move('starMass', 200);
		expect(year()).toBe('600 days');
		move('orbitDistanceAu', 0);
		move('starBrightness', 200);
		expect(sunlight()).toBe("111 × Earth's");
		expect(year()).toBe('19 days');
	});

	it('writes sunlight just under twice Earth’s, which rounds to 200%, as a multiple', () => {
		const { move, sunlight } = make();
		// 10^0.3 times the Sun's, about 1.995, at 1 AU.
		move('starBrightness', 130);
		expect(sunlight()).toBe("2.00 × Earth's");
	});

	it('shows the note on the cold side and the hot, and takes it away inside the band', () => {
		const { move, region } = make();
		const noteText = () => region.children.map((child) => child.textContent);
		// 10^-0.04, about 0.912 times the Sun's: inside.
		move('starBrightness', 96);
		expect(noteText()).toEqual([]);
		// 10^-0.05, about 0.891: outside.
		move('starBrightness', 95);
		expect(noteText()).toEqual([ROUGH_NOTE_TEXT.cold]);
		move('starBrightness', 96);
		expect(noteText()).toEqual([]);
		// 10^0.09, about 1.23: inside; 10^0.1, about 1.26: outside.
		move('starBrightness', 109);
		expect(noteText()).toEqual([]);
		move('starBrightness', 110);
		expect(noteText()).toEqual([ROUGH_NOTE_TEXT.hot]);
		move('starBrightness', 100);
		expect(noteText()).toEqual([]);
		// Earth's sunlight with no greenhouse effect is far colder.
		move('greenhouseStrength', 0);
		expect(noteText()).toEqual([ROUGH_NOTE_TEXT.cold]);
	});

	it('writes the note only when it changes, so that it is announced once', () => {
		const { move, region } = make();
		move('starBrightness', 90);
		const [note] = region.children;
		if (note === undefined) {
			throw new Error('No note was shown');
		}
		let writes = 0;
		const text = Object.getOwnPropertyDescriptor(note, 'textContent');
		Object.defineProperty(note, 'textContent', {
			get: () => text?.get?.call(note),
			set: (value) => {
				writes += 1;
				text?.set?.call(note, value);
			},
		});
		move('starBrightness', 80);
		move('orbitDistanceAu', 150);
		expect(writes).toBe(0);
		expect(region.children).toEqual([note]);
		move('orbitDistanceAu', 105);
		move('starBrightness', 100);
		expect(writes).toBe(0);
		expect(region.children).toEqual([]);
	});

	it('writes the note again each time it goes straight from one side to the other', () => {
		const { controls, move, region } = make();
		move('starBrightness', 90);
		const [note] = region.children;
		if (note === undefined) {
			throw new Error('No note was shown');
		}
		let writes = 0;
		const text = Object.getOwnPropertyDescriptor(note, 'textContent');
		Object.defineProperty(note, 'textContent', {
			get: () => text?.get?.call(note),
			set: (value) => {
				writes += 1;
				text?.set?.call(note, value);
			},
		});
		const noteText = () => region.children.map((child) => child.textContent);
		expect(noteText()).toEqual([ROUGH_NOTE_TEXT.cold]);

		// A jump of the slider from the cold side to the hot.
		move('starBrightness', 110);
		expect(noteText()).toEqual([ROUGH_NOTE_TEXT.hot]);
		expect(writes).toBe(1);
		move('starBrightness', 90);
		expect(noteText()).toEqual([ROUGH_NOTE_TEXT.cold]);
		expect(writes).toBe(2);

		// Settings from outside the panel.
		controls.setPlanet(planetWith({ starBrightness: 1.5 }));
		expect(noteText()).toEqual([ROUGH_NOTE_TEXT.hot]);
		expect(writes).toBe(3);
		controls.setPlanet(planetWith({ starBrightness: 0.5 }));
		expect(noteText()).toEqual([ROUGH_NOTE_TEXT.cold]);
		expect(writes).toBe(4);
	});

	it('puts every one of Earth’s settings back with one change', () => {
		const { move, changes, reset, inputs, sunlight, year, region, section } =
			make();
		expect(reset.tagName).toBe('BUTTON');
		expect(reset.type).toBe('button');
		expect(reset.textContent).toBe(RESET_PLANET_LABEL);
		expect(reset.textContent).toBe('Reset to Earth');
		move('axialTiltDeg', 0);
		move('starBrightness', 0);
		move('starMass', 0);
		move('orbitDistanceAu', 200);
		move('greenhouseStrength', 60);
		changes.length = 0;

		reset.fire('click');
		expect(changes).toEqual([DEFAULT_PLANET]);
		expect(changes[0]).not.toBe(DEFAULT_PLANET);
		expect(inputs.map((input) => input.value)).toEqual([
			'47',
			'100',
			'100',
			'105',
			'20',
		]);
		expect(
			byClass(section, 'field__value').map((output) => output.textContent),
		).toEqual([
			'23.44° (Earth)',
			'1.00 × Sun (Earth)',
			'1.00 × Sun (Earth)',
			'1.00 AU (Earth)',
			'1.00 × Earth',
		]);
		expect(sunlight()).toBe("100% of Earth's");
		expect(year()).toBe('365 days');
		expect(region.children).toEqual([]);

		move('greenhouseStrength', 21);
		expect(changes.at(-1)).toEqual(planetWith({ greenhouseStrength: 1.05 }));
	});

	it('can be pressed on Earth’s settings, passing them on again', () => {
		const { changes, reset } = make();
		expect(reset.disabled).toBe(false);
		reset.fire('click');
		expect(changes).toEqual([DEFAULT_PLANET]);
	});

	it('starts on the settings it is given', () => {
		const planet: PlanetSettings = {
			axialTiltDeg: 60,
			starBrightness: 0.1,
			starMass: 10,
			orbitDistanceAu: 0.3,
			greenhouseStrength: 0,
			dayLengthHours: 24,
		};
		const { inputs, changes, sunlight, year, region } = make(planet);
		expect(inputs.map((input) => input.value)).toEqual([
			'120',
			'0',
			'200',
			'0',
			'0',
		]);
		expect(inputs.map((input) => input.getAttribute('aria-valuetext'))).toEqual(
			['60°', '0.100 × Sun', '10.0 × Sun', '0.300 AU', '0.00 × Earth'],
		);
		expect(sunlight()).toBe("111% of Earth's");
		expect(year()).toBe('19 days');
		expect(region.children.map((child) => child.textContent)).toEqual([
			ROUGH_NOTE_TEXT.cold,
		]);
		expect(changes).toEqual([]);
	});

	it('shows other settings it is given without passing them on', () => {
		const { controls, changes, inputs, field, move, sunlight, region } = make();
		controls.setPlanet(planetWith({ orbitDistanceAu: 3, axialTiltDeg: 0 }));
		expect(changes).toEqual([]);
		expect(field('orbitDistanceAu').input.value).toBe('200');
		expect(field('orbitDistanceAu').output.textContent).toBe('3.00 AU');
		expect(field('axialTiltDeg').output.textContent).toBe('0°');
		expect(sunlight()).toBe("11% of Earth's");
		expect(region.children.map((child) => child.textContent)).toEqual([
			ROUGH_NOTE_TEXT.cold,
		]);

		// The next movement starts from the settings shown.
		move('greenhouseStrength', 0);
		expect(changes).toEqual([
			planetWith({
				orbitDistanceAu: 3,
				axialTiltDeg: 0,
				greenhouseStrength: 0,
			}),
		]);

		controls.setPlanet(DEFAULT_PLANET);
		expect(inputs.map((input) => input.value)).toEqual([
			'47',
			'100',
			'100',
			'105',
			'20',
		]);
		expect(region.children).toEqual([]);
		expect(changes).toHaveLength(1);
	});

	it('writes a setting between two stops as it is, on the nearer stop', () => {
		const { controls, field } = make();
		controls.setPlanet(planetWith({ axialTiltDeg: 23.7, starMass: 1.234 }));
		expect(field('axialTiltDeg').input.value).toBe('47');
		expect(field('axialTiltDeg').output.textContent).toBe('23.7°');
		expect(field('axialTiltDeg').input.getAttribute('aria-valuetext')).toBe(
			'23.7°',
		);
		expect(field('starMass').output.textContent).toBe('1.23 × Sun');
	});

	it('reads the two lines as text', () => {
		const { section } = make();
		const list = findAll(section, (element) => element.tagName === 'DL');
		expect(list).toHaveLength(1);
		expect(
			findAll(list[0] as FakeElement, (element) =>
				['DT', 'DD'].includes(element.tagName),
			).map((element) => element.textContent),
		).toEqual(['Sunlight', "100% of Earth's", 'Year', '365 days']);
	});
});
