import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_MONTH,
	DEFAULT_PAGE_VIEW,
	type PageView,
} from '../layers/view';
import {
	byClass,
	createFakeDocument,
	type FakeDocument,
	type FakeElement,
	oneByClass,
} from '../testing/fakeDocument';
import { thumbCentre } from './fields';
import {
	createTimeline,
	MONTH_LABEL,
	PAUSE_LABEL,
	PLAY_LABEL,
} from './timeline';

describe('createTimeline', () => {
	let fake: FakeDocument;
	beforeEach(() => {
		fake = createFakeDocument();
		vi.stubGlobal('document', fake.document);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	/** A timeline on the view given. */
	const make = (view: Partial<PageView> = {}) => {
		const chosen: string[] = [];
		const timeline = createTimeline({
			view: { ...DEFAULT_PAGE_VIEW, ...view },
			onMonth: (month) => chosen.push(`month ${month}`),
			onPlay: () => chosen.push('play'),
		});
		const element = timeline.element as unknown as FakeElement;
		const letters = byClass(element, 'timeline__month');
		/** The letter marked as the month on screen, by its month. */
		const marked = () =>
			letters.flatMap((letter, month) =>
				letter.classList.contains('is-chosen') ? [month] : [],
			);
		return {
			timeline,
			chosen,
			element,
			slider: oneByClass(element, 'timeline__slider'),
			play: oneByClass(element, 'timeline__play'),
			months: oneByClass(element, 'timeline__months'),
			letters,
			marked,
		};
	};

	/** The class of the icon a button holds. */
	const iconOf = (button: FakeElement): string | null | undefined =>
		button.children.map((child) => child.getAttribute('class')).at(0);

	it('holds the play button, then the month letters over the slider', () => {
		const { element, play, months, slider } = make();
		expect(element.className).toBe('timeline');
		const [first, track] = element.children;
		expect(first).toBe(play);
		expect(track?.className).toBe('timeline__track');
		expect(track?.children).toEqual([months, slider]);
	});

	it.each<[string, Partial<PageView>]>([
		['a layer on its Month view', { layer: 'temperature' }],
		['the Pressure on its Month view', { layer: 'pressure' }],
		['Terrain with sunlight', { sunlight: true }],
		['Terrain with the winds', { winds: true }],
		[
			'a layer on its Month view with sunlight',
			{
				layer: 'temperature',
				sunlight: true,
			},
		],
	])('shows for %s', (_name, view) => {
		const { element, timeline } = make();
		expect(element.hidden).toBe(true);
		timeline.showView({ ...DEFAULT_PAGE_VIEW, ...view }, false);
		expect(element.hidden).toBe(false);
		expect(make(view).element.hidden).toBe(false);
	});

	it.each<[string, Partial<PageView>]>([
		['Terrain alone', {}],
		[
			'the Temperature on its Annual average with both off',
			{
				layer: 'temperature',
				summaries: { temperature: 'annualMean', pressure: 'month' },
			},
		],
		[
			'the Temperature on its warmest month with sunlight on',
			{
				layer: 'temperature',
				summaries: { temperature: 'warmest', pressure: 'month' },
				sunlight: true,
			},
		],
		[
			'the Pressure on its Annual average with the winds on',
			{
				layer: 'pressure',
				summaries: { temperature: 'month', pressure: 'annualMean' },
				winds: true,
			},
		],
	])('is hidden for %s', (_name, view) => {
		const { element, timeline } = make({ layer: 'temperature' });
		expect(element.hidden).toBe(false);
		timeline.showView({ ...DEFAULT_PAGE_VIEW, ...view }, false);
		expect(element.hidden).toBe(true);
		expect(make(view).element.hidden).toBe(true);
	});

	it('offers a twelve-step month slider, named Month and heard by the month', () => {
		const { slider } = make({ layer: 'temperature' });
		expect(slider.tagName).toBe('INPUT');
		expect([slider.type, slider.min, slider.max, slider.step]).toEqual([
			'range',
			'0',
			'11',
			'1',
		]);
		expect(slider.value).toBe(String(DEFAULT_MONTH));
		expect(slider.getAttribute('aria-label')).toBe(MONTH_LABEL);
		expect(slider.getAttribute('aria-valuetext')).toBe('July');
	});

	it('tells of the month the slider is moved to, and is heard by its name', () => {
		const { slider, chosen, marked } = make({ layer: 'temperature' });
		slider.value = '0';
		slider.fire('input');
		expect(chosen).toEqual(['month 0']);
		expect(slider.getAttribute('aria-valuetext')).toBe('January');
		expect(marked()).toEqual([0]);
	});

	it('is stepped a month at a time by the arrow keys, which only the slider takes', () => {
		const { slider, letters, months } = make({ layer: 'temperature' });
		// A range input steps by its step for each arrow key.
		expect(slider.type).toBe('range');
		expect(slider.step).toBe('1');
		// The letters are never reached with the keyboard.
		for (const letter of letters) {
			expect(letter.tagName).toBe('SPAN');
			expect(letter.getAttribute('tabindex')).toBeNull();
			expect(letter.getAttribute('role')).toBeNull();
		}
		expect(months.getAttribute('tabindex')).toBeNull();
	});

	it('moves the slider and the mark to the month it is told of, telling nothing', () => {
		const { timeline, slider, chosen, marked } = make({ layer: 'temperature' });
		timeline.showView(
			{ ...DEFAULT_PAGE_VIEW, layer: 'temperature', month: 11 },
			true,
		);
		expect(slider.value).toBe('11');
		expect(slider.getAttribute('aria-valuetext')).toBe('December');
		expect(marked()).toEqual([11]);
		expect(chosen).toEqual([]);
	});

	it('writes the twelve months’ first letters over the track, each where the thumb stands at it', () => {
		const { letters } = make();
		expect(letters.map((letter) => letter.textContent).join('')).toBe(
			'JFMAMJJASOND',
		);
		expect(letters.map((letter) => letter.title)).toEqual([
			'January',
			'February',
			'March',
			'April',
			'May',
			'June',
			'July',
			'August',
			'September',
			'October',
			'November',
			'December',
		]);
		expect(letters[0]?.style.left).toBe(thumbCentre(0));
		expect(letters[11]?.style.left).toBe(thumbCentre(1));
		expect(letters[6]?.style.left).toBe(thumbCentre(6 / 11));
	});

	it('keeps the letters from screen readers, which hear the slider', () => {
		const { months } = make();
		expect(months.getAttribute('aria-hidden')).toBe('true');
	});

	it('marks the month on screen, and it alone', () => {
		const { marked } = make({ layer: 'temperature' });
		expect(marked()).toEqual([DEFAULT_MONTH]);
	});

	it('tells of the month whose letter is clicked, and puts the slider on it', () => {
		const { letters, slider, chosen, marked } = make({ layer: 'temperature' });
		letters[2]?.fire('click');
		expect(chosen).toEqual(['month 2']);
		expect(slider.value).toBe('2');
		expect(slider.getAttribute('aria-valuetext')).toBe('March');
		expect(marked()).toEqual([2]);
		letters[11]?.fire('click');
		expect(chosen).toEqual(['month 2', 'month 11']);
	});

	it('has a play button named Play, with the play icon, that tells of each press', () => {
		const { play, chosen } = make({ layer: 'temperature' });
		expect(play.tagName).toBe('BUTTON');
		expect(play.type).toBe('button');
		expect(play.getAttribute('aria-label')).toBe(PLAY_LABEL);
		expect(play.title).toBe('Play through the year, a month a second');
		expect(iconOf(play)).toBe('icon icon--play');
		play.fire('click');
		expect(chosen).toEqual(['play']);
	});

	it('shows the pause icon, named Pause, while the year is playing', () => {
		const { timeline, play, chosen } = make({ layer: 'temperature' });
		const view: PageView = { ...DEFAULT_PAGE_VIEW, layer: 'temperature' };
		timeline.showView(view, true);
		expect(play.getAttribute('aria-label')).toBe(PAUSE_LABEL);
		expect(play.title).toBe('Pause on the month shown');
		expect(iconOf(play)).toBe('icon icon--pause');
		expect(play.children).toHaveLength(1);
		timeline.showView({ ...view, month: 7 }, true);
		expect(iconOf(play)).toBe('icon icon--pause');
		timeline.showView(view, false);
		expect(play.getAttribute('aria-label')).toBe(PLAY_LABEL);
		expect(iconOf(play)).toBe('icon icon--play');
		expect(play.children).toHaveLength(1);
		expect(chosen).toEqual([]);
	});
});
