/**
 * Undoing and redoing strokes on the page: which keys ask for it, and the
 * step that puts the terrain back and has the globe show it.
 *
 * Deciding what a key press means is a pure function of the press and of
 * where the keyboard's focus is. The controller joins a history of strokes
 * to the world and the globe, and tells the page what changed.
 */

import { createHistory, type History, type World } from '../core/index';
import type { Globe } from './globe/renderer';
import { faceBits, facesOfBits, type StrokeChanges } from './sculpt';

/** A step through the history of strokes. */
export type HistoryAction = 'undo' | 'redo';

/** Whether each step through the history has anything to do. */
export type HistoryState = {
	/** Whether there is a stroke to undo. */
	readonly canUndo: boolean;
	/** Whether there is an undone stroke to redo. */
	readonly canRedo: boolean;
};

/** The parts of a key press that say whether it asks for undo or redo. */
export type KeyPress = {
	/** The key's value, as a keyboard event's `key`. */
	readonly key: string;
	/** The physical key, as a keyboard event's `code`, such as `KeyZ`. */
	readonly code: string;
	readonly ctrlKey: boolean;
	readonly metaKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
};

/**
 * What matters about the element with the keyboard's focus. Every DOM
 * element fits.
 */
export type FocusedElement = {
	/** The element's tag name, in either case. */
	readonly tagName: string;
	/**
	 * For an `<input>`, its type as the element's `type` property gives it;
	 * one left out is taken as `text`, as a browser does.
	 */
	readonly type?: string;
	/** Whether the element, or one it is inside, is `contenteditable`. */
	readonly isContentEditable?: boolean;
};

/**
 * The `<input>` types that take no typing, and so have no undo of their own
 * for a key press to be left to.
 */
const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
	'button',
	'checkbox',
	'color',
	'file',
	'hidden',
	'image',
	'radio',
	'range',
	'reset',
	'submit',
]);

/**
 * Whether typing goes into an element, so that the browser's own undo of
 * what was typed should be left alone there.
 *
 * @param element - The element with the focus, or null when nothing has it.
 * @returns True for an `<input>` of any type that is typed into, a
 * `<textarea>`, a `<select>` and anything `contenteditable`; false for
 * sliders, radio buttons, checkboxes, buttons and everything else.
 */
export const takesTyping = (element: FocusedElement | null): boolean => {
	if (element === null) {
		return false;
	}
	if (element.isContentEditable === true) {
		return true;
	}
	switch (element.tagName.toLowerCase()) {
		case 'textarea':
		case 'select':
			return true;
		case 'input':
			return !NON_TEXT_INPUT_TYPES.has((element.type ?? 'text').toLowerCase());
		default:
			return false;
	}
};

const LATIN_LETTER = /^[a-z]$/;

/** The letter a press stands for in a shortcut, in lower case, if any. */
const shortcutLetter = (press: KeyPress): string | null => {
	const typed = press.key.toLowerCase();
	if (LATIN_LETTER.test(typed)) {
		return typed;
	}
	switch (press.code) {
		case 'KeyZ':
			return 'z';
		case 'KeyY':
			return 'y';
		default:
			return null;
	}
};

/**
 * The step through the history a key press asks for, if any.
 *
 * @remarks
 * Ctrl+Z undoes; Ctrl+Shift+Z and Ctrl+Y redo. The Command key of a Mac
 * serves as Ctrl does for Z, but not for Y, which with Command belongs to
 * the browser. A press with Alt held is never a shortcut: AltGr, which
 * types letters on many keyboards, is reported as Ctrl and Alt together.
 * So that Caps Lock changes nothing, the letter's case is ignored.
 *
 * The letter is the one the key types, so the shortcuts follow layouts such
 * as AZERTY and Dvorak. A layout whose keys type no Latin letters, such as
 * a Russian or Greek one, has no Z or Y to press: there the keys in the
 * places Z and Y have on a US keyboard are used.
 *
 * A press that repeats because the keys are held counts like any other, so
 * holding Ctrl+Z steps back through the strokes.
 *
 * @param press - The key and the modifiers held with it.
 * @param focus - The element with the keyboard's focus, or null.
 * @returns The step, or null if the press is not one of the shortcuts or
 * the focus is somewhere that {@link takesTyping}.
 */
export const historyActionForKey = (
	press: KeyPress,
	focus: FocusedElement | null,
): HistoryAction | null => {
	if (press.altKey || press.ctrlKey === press.metaKey || takesTyping(focus)) {
		return null;
	}
	switch (shortcutLetter(press)) {
		case 'z':
			return press.shiftKey ? 'redo' : 'undo';
		case 'y':
			return press.ctrlKey && !press.shiftKey ? 'redo' : null;
		default:
			return null;
	}
};

/** A `keydown` event, as far as the shortcuts need it. */
export type ShortcutEvent = KeyPress & {
	/** What the event was sent to: the element with the focus, if any. */
	readonly target: unknown;
	preventDefault(): void;
};

const asFocusedElement = (target: unknown): FocusedElement | null =>
	typeof target === 'object' &&
	target !== null &&
	'tagName' in target &&
	typeof target.tagName === 'string'
		? (target as FocusedElement)
		: null;

/**
 * Acts on a key press if it is one of the undo and redo shortcuts.
 *
 * @remarks
 * The browser's own response is prevented for every press that is one of
 * the shortcuts, even when the step is then refused because there is
 * nothing to undo or redo or a stroke is being made, so that the same keys
 * never do one thing on the page and another in the browser. Any other
 * press is left entirely alone.
 *
 * @param event - The `keydown` event.
 * @param perform - Called with the step the press asks for.
 */
export const handleHistoryKey = (
	event: ShortcutEvent,
	perform: (action: HistoryAction) => void,
): void => {
	const action = historyActionForKey(event, asFocusedElement(event.target));
	if (action !== null) {
		event.preventDefault();
		perform(action);
	}
};

/** What an undo controller works on and whom it tells. */
export type UndoOptions = {
	/** The world being sculpted. */
	readonly world: World;
	/** The globe showing that world. */
	readonly globe: Pick<Globe, 'updateElevation'>;
	/** The history to keep the strokes in; one with the default limits. */
	readonly history?: History;
	/**
	 * Whether a stroke is being made right now. While one is, undo and redo
	 * are refused: the stroke's changes are not yet in the history, so a
	 * step through it would be applied to terrain it was not recorded on.
	 */
	readonly isStrokeActive: () => boolean;
	/**
	 * Called after the terrain has changed: when a stroke that changed
	 * something has ended, and after every undo and redo that did anything.
	 * Not called when the world is replaced.
	 */
	readonly onTerrainChange?: () => void;
	/**
	 * Called with what can now be undone and redone, after every stroke,
	 * undo and redo and whenever the history is emptied.
	 */
	readonly onHistoryChange?: (state: HistoryState) => void;
};

/** The undo and redo of one page. */
export type UndoController = {
	/** What can be undone and redone now. */
	readonly state: HistoryState;
	/**
	 * Records a stroke that has just ended on the world.
	 *
	 * @param changes - Every cell the stroke changed, once, with its value
	 * before the stroke. A stroke that changed nothing is not recorded.
	 */
	commit(changes: StrokeChanges): void;
	/**
	 * Undoes the last stroke or redoes the last one undone, and has the
	 * globe show the cube faces that changed.
	 *
	 * @param action - Which step to take.
	 * @returns Whether the terrain changed: false when there was nothing
	 * to undo or redo, or a stroke is being made.
	 */
	perform(action: HistoryAction): boolean;
	/**
	 * Works on another world from now on and forgets every stroke, which
	 * belonged to the old one.
	 */
	setWorld(world: World): void;
};

/**
 * Keeps the history of the strokes made on a world and steps through it.
 *
 * @remarks
 * One stroke is one step. Only the terrain is put back: the sea level, the
 * view and the tool settings are not part of the history.
 *
 * @param options - The world, its globe and the callbacks.
 * @returns The controller.
 */
export const createUndoController = (options: UndoOptions): UndoController => {
	const { globe, history = createHistory() } = options;
	let { world } = options;

	const state = (): HistoryState => ({
		canUndo: history.canUndo,
		canRedo: history.canRedo,
	});
	const announce = (): void => options.onHistoryChange?.(state());

	return {
		get state(): HistoryState {
			return state();
		},
		commit: (changes) => {
			const recorded = history.commit(world, changes);
			announce();
			if (recorded) {
				options.onTerrainChange?.();
			}
		},
		perform: (action) => {
			if (options.isStrokeActive()) {
				return false;
			}
			const cells =
				action === 'undo' ? history.undo(world) : history.redo(world);
			if (cells === null) {
				return false;
			}
			globe.updateElevation(facesOfBits(faceBits(cells, world.resolution)));
			announce();
			options.onTerrainChange?.();
			return true;
		},
		setWorld: (next) => {
			world = next;
			history.clear();
			announce();
		},
	};
};
