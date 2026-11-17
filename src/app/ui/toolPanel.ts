/**
 * The tool controls: undoing and redoing strokes, what the main mouse
 * button does on the globe, and how wide and strong the brush is.
 *
 * The brush's radius is written in the unit of distances chosen in the
 * settings and its strength in the unit of heights a second, while the
 * sliders step through kilometres and metres a second underneath.
 */

import {
	DEFAULT_BRUSH_RADIUS_KM,
	DEFAULT_BRUSH_STRENGTH,
	DEFAULT_SMOOTH_SETTING,
	DEFAULT_TOOL,
	MAX_BRUSH_RADIUS_KM,
	MAX_BRUSH_STRENGTH,
	MAX_SMOOTH_SETTING,
	MIN_BRUSH_RADIUS_KM,
	MIN_BRUSH_STRENGTH,
	MIN_SMOOTH_SETTING,
	TOOLS,
	type Tool,
} from '../editing/sculpt';
import type { HistoryAction, HistoryState } from '../editing/undo';
import {
	formatQuantity,
	type ResolvedUnits,
	SYSTEM_UNITS,
	type UnitOf,
} from '../settings/units';
import {
	createButton,
	createElement,
	createRangeField,
	createSegmentedPicker,
	type RangeScale,
} from './fields';
import type { Section } from './section';

/** The step between brush radii the slider can be set to, in kilometres. */
export const BRUSH_RADIUS_SLIDER_STEP_KM = 50;

/**
 * The step between the raising and lowering strengths the slider can be set
 * to, in metres per second.
 */
export const BRUSH_STRENGTH_SLIDER_STEP = 100;

/** The step between the smoothing settings the slider can be set to. */
export const SMOOTH_SETTING_SLIDER_STEP = 1;

/** The name each tool goes by on the page. */
export const TOOL_LABELS: Readonly<Record<Tool, string>> = {
	move: 'Move',
	raise: 'Raise',
	lower: 'Lower',
	smooth: 'Smooth',
};

/** The name each step through the history goes by on the page. */
export const HISTORY_LABELS: Readonly<Record<HistoryAction, string>> = {
	undo: 'Undo',
	redo: 'Redo',
};

/**
 * What each history button says when the cursor rests on it: what it does
 * and the keys that do the same.
 */
export const HISTORY_TITLES: Readonly<Record<HistoryAction, string>> = {
	undo: 'Undo the last stroke (Ctrl+Z)',
	redo: 'Redo the last undone stroke (Ctrl+Shift+Z or Ctrl+Y)',
};

/** The units the tool panel writes the brush in. */
export type BrushUnits = Pick<ResolvedUnits, 'height' | 'distance'>;

/** The units the brush is written in until others are given: metric. */
const METRIC_BRUSH_UNITS: BrushUnits = SYSTEM_UNITS.metric;

/** What the tool panel starts with and whom it tells about changes. */
export type ToolPanelOptions = {
	/** The tool chosen at first; the default tool when left out. */
	readonly tool?: Tool;
	/** The brush radius shown at first, in kilometres. */
	readonly radiusKm?: number;
	/** The raising and lowering strength at first, in metres per second. */
	readonly strength?: number;
	/** The smoothing setting at first. */
	readonly smoothSetting?: number;
	/** The units the brush is written in at first; metric when left out. */
	readonly units?: BrushUnits;
	/**
	 * Whether there is anything to undo and to redo at first; nothing of
	 * either when left out.
	 */
	readonly history?: HistoryState;
	/** Called with the step when the undo or the redo button is pressed. */
	readonly onHistory: (action: HistoryAction) => void;
	/** Called with the tool when another is chosen. */
	readonly onTool: (tool: Tool) => void;
	/** Called with the new radius in kilometres when its slider moves. */
	readonly onRadius: (radiusKm: number) => void;
	/**
	 * Called with the new raising and lowering strength, in metres per
	 * second, when the strength slider moves with one of those tools chosen.
	 */
	readonly onStrength: (strength: number) => void;
	/**
	 * Called with the new smoothing setting when the strength slider moves
	 * with the smooth tool chosen.
	 */
	readonly onSmoothSetting: (setting: number) => void;
};

/** The tool controls on the page. */
export type ToolPanel = {
	/**
	 * Greys out the undo and redo buttons that have nothing to do, and
	 * brings back those that have.
	 */
	setHistoryState(state: HistoryState): void;
	/**
	 * Writes the brush's radius in the unit of distances and its strength
	 * in the unit of heights a second from now on, and the values shown in
	 * them at once. No slider moves and no callback is called.
	 */
	setUnits(units: BrushUnits): void;
};

/** The two things the strength slider sets, each kept while the other shows. */
export type BrushStrengths = {
	/** The strength of raising and lowering, in metres per second. */
	readonly strength: number;
	/** The smoothing setting. */
	readonly smoothSetting: number;
};

const groupDigits = (value: number): string =>
	Math.round(value).toLocaleString('en-GB');

/**
 * A distance in kilometres as the panel shows it in a unit, such as
 * `1,250 km` or `311 mi`.
 *
 * @param km - The distance, in kilometres; rounded to a whole one of the
 * unit once converted.
 * @param unit - The unit to write it in; kilometres when left out.
 */
export const formatKm = (
	km: number,
	unit: UnitOf<'distance'> = METRIC_BRUSH_UNITS.distance,
): string => formatQuantity('distance', unit, km, 0);

/**
 * A smoothing setting as the panel shows it: a plain whole number, such as
 * `50`.
 *
 * @remarks
 * The setting has no unit. Inside, it stands for a decay rate that follows
 * the world's resolution, which the panel neither knows nor shows.
 *
 * @param setting - The setting; rounded to a whole number.
 */
export const formatSmoothSetting = (setting: number): string =>
	groupDigits(setting);

/**
 * What the strength slider sets as the panel shows it for a tool.
 *
 * @remarks
 * Raising and lowering move the centre of the brush by so many metres a
 * second, such as `1,000 m/s`, written in the unit of heights a second,
 * such as `3,281 ft/s`. Smoothing has a setting without a unit: see
 * {@link formatSmoothSetting}.
 *
 * @param tool - The tool the value is for. The move tool, which has no
 * strength, is shown the way the raise tool is.
 * @param value - The strength in metres per second, or the smoothing
 * setting for the smooth tool.
 * @param heightUnit - The unit of heights the strength is written in a
 * second of; metres when left out.
 */
export const formatStrength = (
	tool: Tool,
	value: number,
	heightUnit: UnitOf<'height'> = METRIC_BRUSH_UNITS.height,
): string =>
	tool === 'smooth'
		? formatSmoothSetting(value)
		: `${formatQuantity('height', heightUnit, value, 0)}/s`;

/**
 * What the strength slider offers and shows for a tool.
 *
 * @remarks
 * One slider sets two things: the strength of raising and lowering, and the
 * smoothing setting, which has a range of its own. It shows whichever
 * belongs to the tool, at the value that one was left at.
 *
 * @param tool - The chosen tool. The move tool, which has no strength, is
 * given what the raise tool is.
 * @param strengths - What each of the two is set to.
 * @param heightUnit - The unit of heights the strength is written in a
 * second of; metres when left out.
 */
export const strengthScale = (
	tool: Tool,
	strengths: BrushStrengths,
	heightUnit: UnitOf<'height'> = METRIC_BRUSH_UNITS.height,
): RangeScale =>
	tool === 'smooth'
		? {
				min: MIN_SMOOTH_SETTING,
				max: MAX_SMOOTH_SETTING,
				step: SMOOTH_SETTING_SLIDER_STEP,
				value: strengths.smoothSetting,
				format: formatSmoothSetting,
			}
		: {
				min: MIN_BRUSH_STRENGTH,
				max: MAX_BRUSH_STRENGTH,
				step: BRUSH_STRENGTH_SLIDER_STEP,
				value: strengths.strength,
				format: (value) => formatStrength(tool, value, heightUnit),
			};

/**
 * Which of the undo and redo buttons should take the keyboard's focus when
 * what can be undone and redone changes.
 *
 * @remarks
 * A button with nothing to do is disabled, and a button disabled while it
 * has the focus drops the focus to the page. The other button takes it
 * instead, if it is still enabled, so that the keyboard keeps its place.
 *
 * @param focused - The button that has the focus as the change is made, or
 * null if neither has.
 * @param state - What can be undone and redone from now on.
 * @returns The button to give the focus to, or null to leave the focus
 * where it is.
 */
export const historyFocusAfter = (
	focused: HistoryAction | null,
	state: HistoryState,
): HistoryAction | null => {
	if (focused === 'undo' && !state.canUndo && state.canRedo) {
		return 'redo';
	}
	if (focused === 'redo' && !state.canRedo && state.canUndo) {
		return 'undo';
	}
	return null;
};

/**
 * Adds the tool controls to the Tools section of the side panel.
 *
 * @remarks
 * The undo and redo buttons come first, side by side. A button with nothing
 * to do is disabled, which takes it out of the tab order. The tools follow
 * as one row of segments.
 *
 * The two sliders belong to the brushes: with the move tool chosen they are
 * greyed out. The strength slider sets the strength of raising and lowering
 * or, with the smooth tool chosen, the smoothing setting; each keeps its
 * value while the slider shows the other.
 *
 * The section's summary is the chosen tool's name, from {@link TOOL_LABELS},
 * kept in step with each choice, so that the heading names the tool while
 * the section is closed.
 *
 * @param section - The Tools section: its body, to add the controls to after
 * what it holds, and its summary.
 * @param options - The starting values and the callbacks for changes.
 * @returns The controls that were added.
 */
export const createToolPanel = (
	section: Pick<Section, 'body' | 'setSummary'>,
	options: ToolPanelOptions,
): ToolPanel => {
	const historyButton = (action: HistoryAction): HTMLButtonElement =>
		createButton({
			label: HISTORY_LABELS[action],
			title: HISTORY_TITLES[action],
			onClick: () => options.onHistory(action),
		});
	const undo = historyButton('undo');
	const redo = historyButton('redo');
	const historyRow = createElement('div', 'button-row');
	historyRow.append(undo, redo);
	const buttons = { undo, redo };
	const setHistoryState = (state: HistoryState): void => {
		// Read before either button is disabled, which is what moves the
		// focus away.
		const active = document.activeElement;
		const focused = active === undo ? 'undo' : active === redo ? 'redo' : null;
		undo.disabled = !state.canUndo;
		redo.disabled = !state.canRedo;
		const next = historyFocusAfter(focused, state);
		if (next !== null) {
			buttons[next].focus();
		}
	};
	setHistoryState(options.history ?? { canUndo: false, canRedo: false });

	let units = options.units ?? METRIC_BRUSH_UNITS;
	const formatRadius = (km: number): string => formatKm(km, units.distance);
	const radius = createRangeField({
		id: 'tool-radius',
		label: 'Brush radius',
		min: MIN_BRUSH_RADIUS_KM,
		max: MAX_BRUSH_RADIUS_KM,
		step: BRUSH_RADIUS_SLIDER_STEP_KM,
		value: options.radiusKm ?? DEFAULT_BRUSH_RADIUS_KM,
		format: formatRadius,
		onInput: options.onRadius,
	});
	let tool = options.tool ?? DEFAULT_TOOL;
	let strength = options.strength ?? DEFAULT_BRUSH_STRENGTH;
	let smoothSetting = options.smoothSetting ?? DEFAULT_SMOOTH_SETTING;
	const strengthField = createRangeField({
		id: 'tool-strength',
		label: 'Brush strength',
		...strengthScale(tool, { strength, smoothSetting }, units.height),
		onInput: (value) => {
			if (tool === 'smooth') {
				smoothSetting = value;
				options.onSmoothSetting(value);
			} else {
				strength = value;
				options.onStrength(value);
			}
		},
	});

	const showTool = (next: Tool): void => {
		tool = next;
		radius.setDisabled(next === 'move');
		strengthField.setDisabled(next === 'move');
		strengthField.setScale(
			strengthScale(next, { strength, smoothSetting }, units.height),
		);
		section.setSummary(TOOL_LABELS[next]);
	};
	showTool(tool);

	section.body.append(
		historyRow,
		createSegmentedPicker({
			name: 'tool',
			legend: 'Tool',
			choices: TOOLS.map((value) => ({ value, label: TOOL_LABELS[value] })),
			value: tool,
			onChange: (next) => {
				showTool(next);
				options.onTool(next);
			},
		}),
		radius.element,
		strengthField.element,
	);
	return {
		setHistoryState,
		setUnits: (next) => {
			units = next;
			radius.setFormat(formatRadius);
			strengthField.setFormat(
				strengthScale(tool, { strength, smoothSetting }, units.height).format,
			);
		},
	};
};
