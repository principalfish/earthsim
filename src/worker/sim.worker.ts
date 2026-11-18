/**
 * The simulation worker: answers every message it is sent with one
 * response, perhaps after some messages about its progress, and keeps no
 * results between messages, only tables it can build again.
 *
 * The response's arrays are transferred, not copied: the worker has no use
 * for them once they are sent. So are those of the last pass of a climate;
 * an earlier pass's are copies, which the loop's next pass does not need
 * emptied.
 */

import { handleRequest } from './handle';

addEventListener('message', (event) => {
	const { response, transfer } = handleRequest(
		event.data,
		(progress) => postMessage(progress),
		(pass, buffers) => postMessage(pass, buffers),
	);
	postMessage(response, transfer);
});
