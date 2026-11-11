/**
 * Runs one of the project's TypeScript scripts: `node scripts/run-with-vite.mjs
 * <script> [arguments]`.
 *
 * The scripts import the core, whose modules import each other without file
 * extensions, which Node cannot resolve by itself. Vite, which the project
 * builds with, loads the script and what it imports instead. The script must
 * export a `main` function, which is called with the arguments that follow
 * the script's path.
 */

import { resolve } from 'node:path';
import process from 'node:process';
import { runnerImport } from 'vite';

const [script, ...args] = process.argv.slice(2);
if (script === undefined) {
	console.error('Usage: node scripts/run-with-vite.mjs <script> [arguments]');
	process.exit(2);
}

try {
	const { module } = await runnerImport(resolve(script), {
		// The page's own configuration is for the browser build and the
		// tests; a script needs none of it.
		configFile: false,
		logLevel: 'error',
	});
	if (typeof module.main !== 'function') {
		throw new Error(`${script} does not export a main function`);
	}
	await module.main(args);
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
