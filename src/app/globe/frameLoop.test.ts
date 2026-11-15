import { describe, expect, it } from 'vitest';
import { createFakeFrames } from '../testing/fakeFrames';
import { createFrameScheduler } from './frameLoop';

/** A scheduler on fake frames, recording every frame it draws. */
const createStage = () => {
	const frames = createFakeFrames();
	/** What each frame drawn was given: null for one drawn for a change. */
	const drawn: (number | null)[] = [];
	const scheduler = createFrameScheduler({
		requestFrame: frames.requestFrame,
		cancelFrame: frames.cancelFrame,
		now: frames.now,
		draw: (seconds) => drawn.push(seconds),
	});
	return { frames, drawn, scheduler };
};

describe('createFrameScheduler, on demand', () => {
	it('asks for nothing and draws nothing until told of a change', () => {
		const { frames, drawn, scheduler } = createStage();
		frames.runFrame();
		expect(frames.requested()).toBe(0);
		expect(drawn).toEqual([]);
		expect(scheduler.pending).toBe(false);
		expect(scheduler.animating).toBe(false);
	});

	it('draws once at the next frame however many changes come before it', () => {
		const { frames, drawn, scheduler } = createStage();
		scheduler.invalidate();
		scheduler.invalidate();
		scheduler.invalidate();
		expect(frames.requested()).toBe(1);
		expect(scheduler.pending).toBe(true);
		frames.runFrame();
		expect(drawn).toEqual([null]);
		expect(scheduler.pending).toBe(false);
		frames.runFrame();
		expect(drawn).toEqual([null]);
		expect(frames.requested()).toBe(1);
	});

	it('draws a pending frame at once when flushed, in its place, and nothing with none pending', () => {
		const { frames, drawn, scheduler } = createStage();
		scheduler.flush();
		expect(drawn).toEqual([]);
		scheduler.invalidate();
		scheduler.flush();
		expect(drawn).toEqual([null]);
		expect(frames.pending()).toBe(0);
		frames.runFrame();
		expect(drawn).toEqual([null]);
	});

	it('draws at once when asked to, in place of a frame pending', () => {
		const { frames, drawn, scheduler } = createStage();
		scheduler.invalidate();
		scheduler.drawNow();
		expect(drawn).toEqual([null]);
		expect(frames.pending()).toBe(0);
		scheduler.drawNow();
		expect(drawn).toEqual([null, null]);
	});

	it('asks for nothing more once disposed, and cancels what was pending', () => {
		const { frames, drawn, scheduler } = createStage();
		scheduler.invalidate();
		scheduler.dispose();
		expect(frames.pending()).toBe(0);
		scheduler.invalidate();
		scheduler.setAnimating(true);
		scheduler.drawNow();
		frames.runFrame();
		expect(frames.requested()).toBe(1);
		expect(drawn).toEqual([]);
	});
});

describe('createFrameScheduler, animating', () => {
	it('draws at every frame with the seconds since the one before, asking for each next', () => {
		const { frames, drawn, scheduler } = createStage();
		scheduler.setAnimating(true);
		expect(frames.requested()).toBe(1);
		frames.runFrame(20);
		frames.runFrame(16);
		frames.runFrame(50);
		expect(drawn).toEqual([0.02, 0.016, 0.05]);
		expect(frames.requested()).toBe(4);
		expect(frames.pending()).toBe(1);
	});

	it('times its first frame from when it starts, not from frames before', () => {
		const { frames, drawn, scheduler } = createStage();
		frames.runFrame(5000);
		scheduler.setAnimating(true);
		frames.runFrame(16);
		expect(drawn).toEqual([0.016]);
	});

	it('takes the place of a frame pending for a change', () => {
		const { frames, drawn, scheduler } = createStage();
		scheduler.invalidate();
		scheduler.setAnimating(true);
		expect(frames.pending()).toBe(1);
		frames.runFrame(16);
		expect(drawn).toEqual([0.016]);
	});

	it('neither asks for more nor draws twice for a change made while animating', () => {
		const { frames, drawn, scheduler } = createStage();
		scheduler.setAnimating(true);
		scheduler.invalidate();
		scheduler.flush();
		expect(frames.requested()).toBe(1);
		frames.runFrame(16);
		scheduler.invalidate();
		scheduler.flush();
		frames.runFrame(16);
		expect(drawn).toEqual([0.016, 0.016]);
		expect(frames.requested()).toBe(3);
	});

	it('keeps animating when drawn at once, as after a resize', () => {
		const { frames, drawn, scheduler } = createStage();
		scheduler.setAnimating(true);
		scheduler.drawNow();
		expect(drawn).toEqual([null]);
		frames.runFrame(16);
		expect(drawn).toEqual([null, 0.016]);
		expect(frames.pending()).toBe(1);
	});

	it('cancels the next frame when stopped, and asks for none while stopped', () => {
		const { frames, drawn, scheduler } = createStage();
		scheduler.setAnimating(true);
		frames.runFrame(16);
		const asked = frames.requested();
		scheduler.setAnimating(false);
		expect(frames.pending()).toBe(0);
		expect(scheduler.pending).toBe(false);
		for (let frame = 0; frame < 5; frame++) {
			frames.runFrame(16);
		}
		expect(frames.requested()).toBe(asked);
		expect(drawn).toEqual([0.016]);
	});

	it('can be stopped from within a frame it draws', () => {
		const frames = createFakeFrames();
		let drawn = 0;
		const scheduler = createFrameScheduler({
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
			now: frames.now,
			draw: () => {
				drawn++;
				scheduler.setAnimating(false);
			},
		});
		scheduler.setAnimating(true);
		frames.runFrame();
		frames.runFrame();
		expect(drawn).toBe(1);
		expect(frames.pending()).toBe(0);
	});

	it('carries on after a frame that throws', () => {
		const frames = createFakeFrames();
		let calls = 0;
		const scheduler = createFrameScheduler({
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
			now: frames.now,
			draw: () => {
				calls++;
				if (calls === 1) {
					throw new Error('A frame failed');
				}
			},
		});
		scheduler.setAnimating(true);
		expect(() => frames.runFrame()).toThrow('A frame failed');
		frames.runFrame();
		expect(calls).toBe(2);
		expect(scheduler.animating).toBe(true);
	});

	it('asks for nothing when told to start or stop as it already is', () => {
		const { frames, scheduler } = createStage();
		scheduler.setAnimating(false);
		expect(frames.requested()).toBe(0);
		scheduler.setAnimating(true);
		scheduler.setAnimating(true);
		expect(frames.requested()).toBe(1);
	});
});
