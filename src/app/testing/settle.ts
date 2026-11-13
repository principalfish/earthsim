/**
 * A way for tests to let promises that have already settled run, without
 * waiting on any clock.
 */

/** Lets every promise that is already settled run its reactions. */
export const settle = async (): Promise<void> => {
	for (let turn = 0; turn < 10; turn++) {
		await Promise.resolve();
	}
};
