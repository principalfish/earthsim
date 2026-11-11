import { describe, expect, it } from 'vitest';
import {
	DEFAULT_BRUSH_RADIUS_KM,
	DEFAULT_BRUSH_STRENGTH,
	DEFAULT_SMOOTH_SETTING,
	MAX_BRUSH_RADIUS_KM,
	MAX_BRUSH_STRENGTH,
	MAX_SMOOTH_SETTING,
	MIN_BRUSH_RADIUS_KM,
	MIN_BRUSH_STRENGTH,
	MIN_SMOOTH_SETTING,
	TOOLS,
} from '../sculpt';
import {
	BRUSH_RADIUS_SLIDER_STEP_KM,
	BRUSH_STRENGTH_SLIDER_STEP,
	formatKm,
	formatSmoothSetting,
	formatStrength,
	HISTORY_LABELS,
	HISTORY_TITLES,
	historyFocusAfter,
	SMOOTH_SETTING_SLIDER_STEP,
	strengthScale,
	TOOL_LABELS,
} from './toolPanel';

describe('formatKm', () => {
	it('writes kilometres with their unit', () => {
		expect(formatKm(500)).toBe('500 km');
	});

	it('groups thousands', () => {
		expect(formatKm(3000)).toBe('3,000 km');
	});

	it('rounds to a whole kilometre', () => {
		expect(formatKm(149.6)).toBe('150 km');
	});
});

describe('formatSmoothSetting', () => {
	it('writes the setting as a plain whole number with no unit', () => {
		expect(formatSmoothSetting(1)).toBe('1');
		expect(formatSmoothSetting(50)).toBe('50');
		expect(formatSmoothSetting(100)).toBe('100');
		for (
			let setting = MIN_SMOOTH_SETTING;
			setting <= MAX_SMOOTH_SETTING;
			setting++
		) {
			expect(formatSmoothSetting(setting)).toBe(String(setting));
		}
	});

	it('rounds to a whole number', () => {
		expect(formatSmoothSetting(49.6)).toBe('50');
	});
});

describe('formatStrength', () => {
	it('writes raising and lowering in metres per second', () => {
		expect(formatStrength('raise', 1000)).toBe('1,000 m/s');
		expect(formatStrength('lower', 100)).toBe('100 m/s');
	});

	it('writes smoothing as its setting alone', () => {
		expect(formatStrength('smooth', 50)).toBe('50');
		expect(formatStrength('smooth', 100)).toBe('100');
	});

	it('writes the move tool, which has no strength, like raising', () => {
		expect(formatStrength('move', 5000)).toBe('5,000 m/s');
	});
});

describe('strengthScale', () => {
	const strengths = { strength: 2300, smoothSetting: 72 };

	it('offers metres per second for raising, lowering and the move tool', () => {
		for (const tool of ['raise', 'lower', 'move'] as const) {
			const scale = strengthScale(tool, strengths);
			expect(scale.min).toBe(MIN_BRUSH_STRENGTH);
			expect(scale.max).toBe(MAX_BRUSH_STRENGTH);
			expect(scale.step).toBe(BRUSH_STRENGTH_SLIDER_STEP);
			expect(scale.value).toBe(2300);
			expect(scale.format(scale.value)).toBe('2,300 m/s');
		}
	});

	it('offers the setting from 1 to 100 for smoothing', () => {
		const scale = strengthScale('smooth', strengths);
		expect(scale.min).toBe(1);
		expect(scale.max).toBe(100);
		expect(scale.step).toBe(1);
		expect(scale.value).toBe(72);
		expect(scale.format(scale.value)).toBe('72');
	});

	it('keeps each value while the other is changed', () => {
		const changed = { strength: 400, smoothSetting: 72 };
		expect(strengthScale('smooth', changed).value).toBe(72);
		expect(strengthScale('raise', changed).value).toBe(400);
		expect(strengthScale('raise', { ...changed, smoothSetting: 5 }).value).toBe(
			400,
		);
	});
});

describe('the tool labels', () => {
	it('name every tool', () => {
		for (const tool of TOOLS) {
			expect(TOOL_LABELS[tool]).toMatch(/^[A-Z][a-z]+$/);
		}
		expect(Object.keys(TOOL_LABELS).length).toBe(TOOLS.length);
	});
});

describe('the history buttons', () => {
	it('are named for what they do', () => {
		expect(HISTORY_LABELS).toEqual({ undo: 'Undo', redo: 'Redo' });
	});

	it('say which keys do the same', () => {
		expect(HISTORY_TITLES.undo).toContain('Ctrl+Z');
		expect(HISTORY_TITLES.undo).not.toContain('Shift');
		expect(HISTORY_TITLES.redo).toContain('Ctrl+Shift+Z');
		expect(HISTORY_TITLES.redo).toContain('Ctrl+Y');
	});
});

describe('the brush sliders', () => {
	it('can be set to both ends of the radius range and to the default', () => {
		const steps = (km: number): number =>
			(km - MIN_BRUSH_RADIUS_KM) / BRUSH_RADIUS_SLIDER_STEP_KM;
		expect(Number.isInteger(steps(MAX_BRUSH_RADIUS_KM))).toBe(true);
		expect(Number.isInteger(steps(DEFAULT_BRUSH_RADIUS_KM))).toBe(true);
	});

	it('can be set to both ends of the strength range and to the default', () => {
		const steps = (strength: number): number =>
			(strength - MIN_BRUSH_STRENGTH) / BRUSH_STRENGTH_SLIDER_STEP;
		expect(Number.isInteger(steps(MAX_BRUSH_STRENGTH))).toBe(true);
		expect(Number.isInteger(steps(DEFAULT_BRUSH_STRENGTH))).toBe(true);
	});

	it('can be set to every smoothing setting', () => {
		expect(SMOOTH_SETTING_SLIDER_STEP).toBe(1);
		expect(Number.isInteger(MIN_SMOOTH_SETTING)).toBe(true);
		expect(Number.isInteger(MAX_SMOOTH_SETTING)).toBe(true);
		expect(Number.isInteger(DEFAULT_SMOOTH_SETTING)).toBe(true);
	});
});

describe('historyFocusAfter', () => {
	const BOTH = { canUndo: true, canRedo: true };
	const ONLY_UNDO = { canUndo: true, canRedo: false };
	const ONLY_REDO = { canUndo: false, canRedo: true };
	const NEITHER = { canUndo: false, canRedo: false };

	it('moves the focus to redo when the focused undo button is disabled', () => {
		expect(historyFocusAfter('undo', ONLY_REDO)).toBe('redo');
	});

	it('moves the focus to undo when the focused redo button is disabled', () => {
		expect(historyFocusAfter('redo', ONLY_UNDO)).toBe('undo');
	});

	it('moves the focus nowhere when both buttons are disabled', () => {
		expect(historyFocusAfter('undo', NEITHER)).toBeNull();
		expect(historyFocusAfter('redo', NEITHER)).toBeNull();
	});

	it('leaves the focus on a button that stays enabled', () => {
		expect(historyFocusAfter('undo', BOTH)).toBeNull();
		expect(historyFocusAfter('undo', ONLY_UNDO)).toBeNull();
		expect(historyFocusAfter('redo', BOTH)).toBeNull();
		expect(historyFocusAfter('redo', ONLY_REDO)).toBeNull();
	});

	it('leaves a focus that is elsewhere where it is, whatever is disabled', () => {
		for (const state of [BOTH, ONLY_UNDO, ONLY_REDO, NEITHER]) {
			expect(historyFocusAfter(null, state)).toBeNull();
		}
	});
});
