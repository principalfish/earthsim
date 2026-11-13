import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from 'node:http';
import { dirname, join } from 'node:path';
import { stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import { ensurePinnedFile, fileSize, sha256Of } from './download';
import type { PinnedFile } from './earth/pinnedFile';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** The file the tests download: 100 bytes that are not all alike. */
const CONTENT = Uint8Array.from(
	{ length: 100 },
	(_, index) => (index * 37 + 11) % 256,
);
const CONTENT_SHA256 =
	'5fb5d4b7ace49f5eac37422b8e1db12bab83cdbc2b7123abb61457e19c050d4c';

/** Bytes the length of the file that are not the file. */
const WRONG = new Uint8Array(CONTENT.length).fill(7);

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

/** Sends the whole file in two parts, whatever was asked for. */
const sendWhole: Handler = (_request, response) => {
	response.writeHead(200);
	response.write(CONTENT.subarray(0, 40));
	response.end(CONTENT.subarray(40));
};

let server: Server;
let source: PinnedFile;
let handler: Handler = sendWhole;
/** The `Range` header of each request the server has had. */
let ranges: (string | undefined)[] = [];
let directory: string;

const filePath = (): string => join(directory, source.name);

const download = (): Promise<string> =>
	ensurePinnedFile(source, { directory, reportEveryBytes: 16 });

const contentOf = (path: string): number[] => [...readFileSync(path)];

beforeAll(async () => {
	server = createServer((request, response) => {
		const range = request.headers.range;
		ranges.push(typeof range === 'string' ? range : undefined);
		handler(request, response);
	});
	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', resolve);
	});
	const address = server.address();
	if (address === null || typeof address === 'string') {
		throw new Error('The test server is not listening on a port');
	}
	source = {
		url: `http://127.0.0.1:${address.port}/test.bin`,
		name: 'test.bin',
		bytes: CONTENT.length,
		sha256: CONTENT_SHA256,
	};
});

afterAll(async () => {
	server.closeAllConnections();
	await new Promise<void>((resolve) => {
		server.close(resolve);
	});
});

beforeEach(() => {
	vi.spyOn(stdout, 'write').mockReturnValue(true);
	const cache = join(ROOT, '.cache');
	mkdirSync(cache, { recursive: true });
	directory = join(mkdtempSync(join(cache, 'download-test-')), 'nested');
	handler = sendWhole;
	ranges = [];
});

afterEach(() => {
	vi.restoreAllMocks();
	rmSync(dirname(directory), { recursive: true, force: true });
});

describe('fileSize', () => {
	it('is 0 for a file that is not there', () => {
		expect(fileSize(join(ROOT, '.cache', 'no-such-file'))).toBe(0);
	});
});

describe('sha256Of', () => {
	it('gives the SHA-256 of a file in hexadecimal', async () => {
		const path = await download();
		expect(sha256Of(path)).toBe(CONTENT_SHA256);
	});
});

describe('ensurePinnedFile', () => {
	it('downloads a file that is not there, making its directory', async () => {
		const path = await download();
		expect(path).toBe(filePath());
		expect(contentOf(path)).toEqual([...CONTENT]);
		expect(ranges).toEqual([undefined]);
	});

	it('uses a cached file whose SHA-256 is right without fetching', async () => {
		mkdirSync(directory, { recursive: true });
		writeFileSync(filePath(), CONTENT);
		expect(await download()).toBe(filePath());
		expect(ranges).toEqual([]);
	});

	it('deletes a cached file whose SHA-256 is wrong, and throws', async () => {
		mkdirSync(directory, { recursive: true });
		writeFileSync(filePath(), WRONG);
		await expect(download()).rejects.toThrow(
			'the cached file was deleted, so run the script again',
		);
		expect(fileSize(filePath())).toBe(0);
		expect(ranges).toEqual([]);
	});

	it('asks for the rest of a file cut short and adds it on', async () => {
		mkdirSync(directory, { recursive: true });
		writeFileSync(filePath(), CONTENT.subarray(0, 30));
		handler = (_request, response) => {
			response.writeHead(206, { 'Content-Range': 'bytes 30-99/100' });
			response.end(CONTENT.subarray(30));
		};
		const path = await download();
		expect(ranges).toEqual(['bytes=30-']);
		expect(contentOf(path)).toEqual([...CONTENT]);
	});

	it('starts again when the whole file comes back for a part', async () => {
		mkdirSync(directory, { recursive: true });
		writeFileSync(filePath(), WRONG.subarray(0, 30));
		const path = await download();
		expect(ranges).toEqual(['bytes=30-']);
		expect(contentOf(path)).toEqual([...CONTENT]);
	});

	it('replaces a cached file longer than the file', async () => {
		mkdirSync(directory, { recursive: true });
		writeFileSync(filePath(), new Uint8Array(CONTENT.length + 5));
		const path = await download();
		expect(ranges).toEqual([undefined]);
		expect(contentOf(path)).toEqual([...CONTENT]);
	});

	it('stops a server that sends too much and deletes what it wrote', async () => {
		handler = (_request, response) => {
			response.writeHead(200);
			response.write(CONTENT);
			response.end(Uint8Array.of(1, 2, 3));
		};
		await expect(download()).rejects.toThrow(
			'The server sent more than the 100 bytes of test.bin',
		);
		expect(fileSize(filePath())).toBe(0);
	});

	it('throws when the server refuses', async () => {
		handler = (_request, response) => {
			response.writeHead(404);
			response.end();
		};
		await expect(download()).rejects.toThrow(
			'The download was refused with status 404',
		);
	});

	it('throws when the download ends before the whole file', async () => {
		handler = (_request, response) => {
			response.writeHead(200);
			response.end(CONTENT.subarray(0, 60));
		};
		await expect(download()).rejects.toThrow(
			'The download ended with 60 of 100 bytes',
		);
		expect(fileSize(filePath())).toBe(60);
	});
});
