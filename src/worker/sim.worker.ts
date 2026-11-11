/**
 * The simulation worker: answers every message it is sent with one
 * response, and keeps nothing between messages.
 */

import { handleRequest } from './handle';

addEventListener('message', (event) => {
	postMessage(handleRequest(event.data));
});
