import { describe, expect, it } from 'vitest';
import { createPlayback, PLAYBACK_STEP_MS } from './playback';
import { createFakeTimers } from './testing/fakeTimers';

/** Playback on fake timers, recording what it tells. */
const createStage = (month = 6) => {
	const timers = createFakeTimers();
	const months: number[] = [];
	const playing: boolean[] = [];
	const playback = createPlayback({
		month,
		onMonth: (next) => months.push(next),
		onPlayingChange: (next) => playing.push(next),
		setTimer: timers.setTimer,
		clearTimer: timers.clearTimer,
	});
	return { timers, months, playing, playback };
};

describe('createPlayback', () => {
	it('starts stopped on the month it is given, waiting for nothing', () => {
		const { playback, timers, months, playing } = createStage(3);
		expect(playback.month).toBe(3);
		expect(playback.playing).toBe(false);
		expect(timers.pending()).toBe(0);
		timers.advance(10 * PLAYBACK_STEP_MS);
		expect(months).toEqual([]);
		expect(playing).toEqual([]);
	});

	it('advances one month per step while playing', () => {
		const { playback, timers, months, playing } = createStage(6);
		playback.play();
		expect(playing).toEqual([true]);
		expect(playback.playing).toBe(true);
		timers.advance(PLAYBACK_STEP_MS - 1);
		expect(months).toEqual([]);
		timers.advance(1);
		expect(months).toEqual([7]);
		timers.advance(2 * PLAYBACK_STEP_MS);
		expect(months).toEqual([7, 8, 9]);
		expect(playback.month).toBe(9);
		expect(timers.pending()).toBe(1);
	});

	it('wraps from December to January', () => {
		const { playback, timers, months } = createStage(10);
		playback.play();
		timers.advance(3 * PLAYBACK_STEP_MS);
		expect(months).toEqual([11, 0, 1]);
	});

	it('stops on pause, on the month it reached', () => {
		const { playback, timers, months, playing } = createStage(6);
		playback.play();
		timers.advance(PLAYBACK_STEP_MS);
		playback.pause();
		expect(playing).toEqual([true, false]);
		expect(playback.playing).toBe(false);
		expect(timers.pending()).toBe(0);
		timers.advance(5 * PLAYBACK_STEP_MS);
		expect(months).toEqual([7]);
		expect(playback.month).toBe(7);
	});

	it('carries on from where it was paused when played again', () => {
		const { playback, timers, months } = createStage(6);
		playback.play();
		timers.advance(PLAYBACK_STEP_MS);
		playback.pause();
		playback.play();
		timers.advance(PLAYBACK_STEP_MS);
		expect(months).toEqual([7, 8]);
	});

	it('tells of no change for a play while playing or a pause while stopped', () => {
		const { playback, timers, playing } = createStage();
		playback.pause();
		playback.play();
		playback.play();
		expect(playing).toEqual([true]);
		expect(timers.started()).toBe(1);
	});

	it('carries on from a month put on screen while playing, a whole step later', () => {
		const { playback, timers, months } = createStage(6);
		playback.play();
		timers.advance(PLAYBACK_STEP_MS - 100);
		playback.setMonth(2);
		expect(playback.month).toBe(2);
		expect(playback.playing).toBe(true);
		// The step that was due is put off, so the slider is not moved
		// under the pointer.
		timers.advance(PLAYBACK_STEP_MS - 1);
		expect(months).toEqual([]);
		timers.advance(1);
		expect(months).toEqual([3]);
		expect(timers.pending()).toBe(1);
	});

	it('takes a month put on screen while stopped without starting', () => {
		const { playback, timers, months } = createStage(6);
		playback.setMonth(11);
		expect(playback.month).toBe(11);
		expect(playback.playing).toBe(false);
		expect(timers.pending()).toBe(0);
		playback.play();
		timers.advance(PLAYBACK_STEP_MS);
		expect(months).toEqual([0]);
	});

	it('keeps playing when what hears of a month throws', () => {
		const timers = createFakeTimers();
		const playback = createPlayback({
			month: 0,
			onMonth: () => {
				throw new Error('Refused');
			},
			onPlayingChange: () => {},
			setTimer: timers.setTimer,
			clearTimer: timers.clearTimer,
		});
		playback.play();
		expect(() => timers.advance(PLAYBACK_STEP_MS)).toThrow('Refused');
		expect(playback.month).toBe(1);
		expect(playback.playing).toBe(true);
		expect(timers.pending()).toBe(1);
	});

	it.each([-1, 12, 1.5, Number.NaN])('refuses %s as a month', (month) => {
		expect(() => createStage(month)).toThrow(RangeError);
		const { playback } = createStage();
		expect(() => playback.setMonth(month)).toThrow(RangeError);
		expect(playback.month).toBe(6);
	});
});
