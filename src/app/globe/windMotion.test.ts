import { describe, expect, it } from 'vitest';
import { createFakeFrames } from '../testing/fakeFrames';
import { createFrameScheduler } from './frameLoop';
import {
	createWindMotion,
	defaultWindStyle,
	isWindStyle,
	streaksMove,
	WIND_STYLE_LABELS,
	WIND_STYLES,
	type WindStyle,
} from './windMotion';

describe('the ways of drawing the winds', () => {
	it('are arrows and streaks', () => {
		expect(WIND_STYLES).toEqual(['arrows', 'streaks']);
		expect(WIND_STYLE_LABELS).toEqual({ arrows: 'Arrows', streaks: 'Streaks' });
	});

	it('start on streaks, or on arrows where the system asks for reduced motion', () => {
		expect(defaultWindStyle(false)).toBe('streaks');
		expect(defaultWindStyle(true)).toBe('arrows');
	});

	it('are told from anything else', () => {
		expect(WIND_STYLES.every(isWindStyle)).toBe(true);
		for (const value of ['', 'Arrows', 'streak', 'lines', null, 1, undefined]) {
			expect(isWindStyle(value)).toBe(false);
		}
	});
});

describe('streaksMove', () => {
	it('is true only for streaks, with winds, on a visible page', () => {
		for (const style of WIND_STYLES) {
			for (const hasWinds of [false, true]) {
				for (const pageVisible of [false, true]) {
					expect(streaksMove({ style, hasWinds, pageVisible })).toBe(
						style === 'streaks' && hasWinds && pageVisible,
					);
				}
			}
		}
	});
});

/**
 * The motion on a real scheduler and fake frames, counting the frames
 * asked for and drawn.
 *
 * @param style - How the winds are drawn at first.
 */
const createStage = (style: WindStyle = 'arrows') => {
	const frames = createFakeFrames();
	let drawn = 0;
	const scheduler = createFrameScheduler({
		requestFrame: frames.requestFrame,
		cancelFrame: frames.cancelFrame,
		now: frames.now,
		draw: () => {
			drawn++;
		},
	});
	const motion = createWindMotion(scheduler, style);
	/** Runs frames and says how many were asked for and drawn meanwhile. */
	const run = (count = 3) => {
		const asked = frames.requested();
		const before = drawn;
		for (let frame = 0; frame < count; frame++) {
			frames.runFrame();
		}
		return { asked: frames.requested() - asked, drawn: drawn - before };
	};
	/** Streaks chosen, with winds, on a visible page: moving. */
	const moving = () => {
		motion.setStyle('streaks');
		motion.setHasWinds(true);
		return run();
	};
	return { frames, scheduler, motion, run, moving };
};

describe('createWindMotion', () => {
	it.each(WIND_STYLES)(
		'starts on the style it is given, %s, with no winds, on a visible page, asking for no frame',
		(style) => {
			const { frames, motion, run } = createStage(style);
			expect(motion.state).toEqual({
				style,
				hasWinds: false,
				pageVisible: true,
			});
			expect(run()).toEqual({ asked: 0, drawn: 0 });
			expect(frames.pending()).toBe(0);
		},
	);

	it('started on streaks, runs as soon as there are winds', () => {
		const { motion, run } = createStage('streaks');
		motion.setHasWinds(true);
		expect(run()).toEqual({ asked: 3, drawn: 3 });
	});

	it('runs only for streaks: arrows with winds ask for no frame', () => {
		const { motion, run } = createStage();
		motion.setHasWinds(true);
		expect(run()).toEqual({ asked: 0, drawn: 0 });
		motion.setStyle('streaks');
		expect(run()).toEqual({ asked: 3, drawn: 3 });
	});

	it('does not start for streaks while there are no winds yet', () => {
		const { motion, run } = createStage();
		motion.setStyle('streaks');
		expect(run()).toEqual({ asked: 0, drawn: 0 });
		motion.setHasWinds(true);
		expect(run()).toEqual({ asked: 3, drawn: 3 });
	});

	it.each<[string, (motion: ReturnType<typeof createWindMotion>) => void]>([
		['Arrows chosen', (motion) => motion.setStyle('arrows')],
		// Winds off gives the globe no winds, as before any are ready.
		['Winds off, or no winds', (motion) => motion.setHasWinds(false)],
		['the page hidden', (motion) => motion.setPageVisible(false)],
	])(
		'stops for %s, with nothing pending and no frame asked for after',
		(_, stop) => {
			const { frames, motion, moving, run } = createStage();
			expect(moving().asked).toBe(3);
			expect(frames.pending()).toBe(1);
			stop(motion);
			expect(frames.pending()).toBe(0);
			expect(run(10)).toEqual({ asked: 0, drawn: 0 });
		},
	);

	it('starts again when the page is visible again, and not for a hidden page', () => {
		const { motion, moving, run } = createStage();
		moving();
		motion.setPageVisible(false);
		motion.setStyle('arrows');
		motion.setStyle('streaks');
		expect(run()).toEqual({ asked: 0, drawn: 0 });
		motion.setPageVisible(true);
		expect(run()).toEqual({ asked: 3, drawn: 3 });
	});

	it('keeps one frame pending however often it is told the same', () => {
		const { frames, motion, moving } = createStage();
		moving();
		const asked = frames.requested();
		for (const style of ['streaks', 'streaks'] as WindStyle[]) {
			motion.setStyle(style);
			motion.setHasWinds(true);
			motion.setPageVisible(true);
		}
		expect(frames.requested()).toBe(asked);
		expect(frames.pending()).toBe(1);
	});
});
