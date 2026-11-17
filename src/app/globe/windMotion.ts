/**
 * How the winds are drawn, as arrows that stand still or as streaks that
 * move, and the rule for when the streaks move: only then does the globe
 * draw at every frame rather than when something changes.
 */

import type { FrameScheduler } from './frameLoop';

/** How the winds can be drawn, in the order they are offered. */
export const WIND_STYLES = ['arrows', 'streaks'] as const;

/**
 * How the winds are drawn: arrows laid evenly over the globe, or streaks
 * carried along by the wind.
 */
export type WindStyle = (typeof WIND_STYLES)[number];

/**
 * How the winds are drawn until another way is chosen: as streaks, or as
 * arrows, which stand still, where the system asks for reduced motion.
 *
 * @param reducedMotion - Whether the system asks for reduced motion, as
 * `prefers-reduced-motion: reduce` says.
 */
export const defaultWindStyle = (reducedMotion: boolean): WindStyle =>
	reducedMotion ? 'arrows' : 'streaks';

/** The name each way of drawing the winds goes by on the page. */
export const WIND_STYLE_LABELS: Readonly<Record<WindStyle, string>> = {
	arrows: 'Arrows',
	streaks: 'Streaks',
};

/**
 * Whether a value is one of {@link WIND_STYLES}.
 *
 * @param value - Anything, such as an entry read from the browser's storage.
 */
export const isWindStyle = (value: unknown): value is WindStyle =>
	(WIND_STYLES as readonly unknown[]).includes(value);

/** What decides whether the streaks move. */
export type WindMotionState = {
	/** How the winds are drawn. */
	readonly style: WindStyle;
	/**
	 * Whether the globe has winds to draw: false while Winds is off, which
	 * gives the globe no winds, and while there are none yet.
	 */
	readonly hasWinds: boolean;
	/** Whether the page is visible, rather than in a hidden tab. */
	readonly pageVisible: boolean;
};

/**
 * Whether the streaks move, and so the globe is drawn at every frame: only
 * while streaks are chosen, there are winds to draw and the page is
 * visible.
 *
 * @param state - How the winds are drawn, whether there are any, and
 * whether the page is visible.
 */
export const streaksMove = (state: WindMotionState): boolean =>
	state.style === 'streaks' && state.hasWinds && state.pageVisible;

/** Whatever changes {@link streaksMove}'s answer, told as it changes. */
export type WindMotion = {
	/** Takes how the winds are drawn. */
	setStyle(style: WindStyle): void;
	/** Takes whether the globe has winds to draw. */
	setHasWinds(hasWinds: boolean): void;
	/** Takes whether the page is visible. */
	setPageVisible(visible: boolean): void;
	/** What it was last told. */
	readonly state: WindMotionState;
};

/**
 * Starts or stops a drawing's animation as {@link streaksMove} says, after
 * each change of what it decides by.
 *
 * @param frames - What draws the frames.
 * @param style - How the winds are drawn at first.
 * @returns The motion, starting on that style, with no winds and the page
 * visible, so not moving.
 */
export const createWindMotion = (
	frames: Pick<FrameScheduler, 'setAnimating'>,
	style: WindStyle,
): WindMotion => {
	let state: WindMotionState = {
		style,
		hasWinds: false,
		pageVisible: true,
	};
	const update = (next: Partial<WindMotionState>): void => {
		state = { ...state, ...next };
		frames.setAnimating(streaksMove(state));
	};
	return {
		setStyle: (style) => update({ style }),
		setHasWinds: (hasWinds) => update({ hasWinds }),
		setPageVisible: (pageVisible) => update({ pageVisible }),
		get state() {
			return state;
		},
	};
};
