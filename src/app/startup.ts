/**
 * Deciding what the page does once it knows what was saved before: bring
 * the saved world back, or open the dialog that starts a new one.
 */

import type { World } from '../core/index';
import type { AutosaveState } from './autosave';
import type { LoadOutcome } from './storage';

/**
 * Said in the dialog the page opens on when a world was saved and cannot
 * be brought back, or the browser's storage cannot be read at all.
 */
export const RESTORE_FAILED_MESSAGE = 'The saved world could not be restored.';

/** How reading the saved world went. */
export type StartupRead =
	| {
			/** The storage answered. */
			readonly kind: 'loaded';
			/** What it holds. */
			readonly outcome: LoadOutcome;
	  }
	| {
			/** The storage could not be read: it is blocked, or it failed. */
			readonly kind: 'failed';
	  };

/** What the dialog the page opens on is given. */
export type StartupDialog = {
	/** What went wrong, for the dialog to say. Left out, nothing is said. */
	readonly notice?: string;
};

/** What the page does once the saved world has been read, or could not be. */
export type StartupPlan = {
	/** The saved world to bring back, or `null` to stay on the blank one. */
	readonly restore: World | null;
	/** The dialog to open, or `null` to open none. */
	readonly dialog: StartupDialog | null;
	/** What to say of the saved world, or `null` to say nothing yet. */
	readonly autosaveState: AutosaveState | null;
};

/** What a start-up plan is carried out with. */
export type StartupSteps = {
	/** Makes the world the one being edited, keeping its own sea level, planet settings and date. */
	readonly replaceWorld: (world: World) => void;
	/** Shows how saving stands. */
	readonly setAutosaveState: (state: AutosaveState) => void;
	/** Lets the changes made from now on be saved. */
	readonly startAutosave: () => void;
	/** Opens the dialog that starts a new world. */
	readonly openDialog: (dialog: StartupDialog) => void;
	/** Records an error that the page carries on after. */
	readonly logError: (error: unknown) => void;
};

/**
 * Decides what the page does with what reading the saved world gave.
 *
 * @remarks
 * A saved world is brought back with no dialog, and is said to be saved,
 * as it is. Otherwise the page stays on its blank world and opens the
 * dialog: with nothing more to say if nothing was saved, and with
 * {@link RESTORE_FAILED_MESSAGE} if what was saved cannot be read as a
 * world or the storage could not be read. Only in the last case is
 * anything said of saving, since a storage that cannot be read is unlikely
 * to take a save.
 *
 * @param read - How reading the saved world went.
 * @returns The plan, for {@link applyStartup}.
 */
export const decideStartup = (read: StartupRead): StartupPlan => {
	if (read.kind === 'failed') {
		return {
			restore: null,
			dialog: { notice: RESTORE_FAILED_MESSAGE },
			autosaveState: 'unavailable',
		};
	}
	switch (read.outcome.kind) {
		case 'world':
			return {
				restore: read.outcome.world,
				dialog: null,
				autosaveState: 'saved',
			};
		case 'empty':
			return { restore: null, dialog: {}, autosaveState: null };
		case 'corrupt':
			return {
				restore: null,
				dialog: { notice: RESTORE_FAILED_MESSAGE },
				autosaveState: null,
			};
	}
};

/**
 * Carries out a start-up plan: the world to bring back, then what to say
 * of saving, then the start of autosave, then the dialog.
 *
 * @remarks
 * Autosave is started whatever the plan, so that what is done from here
 * on is saved, but only once the world brought back is in place. Putting
 * it in place is therefore not taken for a change, and it is not saved
 * again, which would only risk overwriting what another tab has saved
 * since.
 *
 * If `replaceWorld` throws, the error is logged and the rest goes ahead
 * as if it had not.
 *
 * @param plan - What to do, as {@link decideStartup} gives it.
 * @param steps - What to do it with.
 */
export const applyStartup = (plan: StartupPlan, steps: StartupSteps): void => {
	if (plan.restore !== null) {
		try {
			steps.replaceWorld(plan.restore);
		} catch (error) {
			// Replacing the world makes the new one current and tells every
			// part of the page before it passes on what one of them threw.
			// It refuses a world outright only for a sea level or planet
			// setting that is not a number, or a date that is negative or
			// not finite, which a world read from storage never has. The page
			// and the storage therefore hold the same world, and nothing is
			// lost by going on to save what is changed in it.
			steps.logError(error);
		}
	}
	if (plan.autosaveState !== null) {
		steps.setAutosaveState(plan.autosaveState);
	}
	steps.startAutosave();
	if (plan.dialog !== null) {
		steps.openDialog(plan.dialog);
	}
};
