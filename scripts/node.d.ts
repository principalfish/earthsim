/**
 * The few parts of Node.js the scripts use, declared by hand.
 *
 * The project does not depend on Node's own type package, so that nothing
 * in `src/` can come to lean on Node without failing the type check. Only
 * what the scripts call is declared, with only the options they pass.
 */

declare module 'node:fs' {
	export const statSync: (
		path: string,
		options: { readonly throwIfNoEntry: false },
	) => { readonly size: number } | undefined;
	export const mkdirSync: (
		path: string,
		options: { readonly recursive: true },
	) => string | undefined;
	export const openSync: (path: string, flags: 'r' | 'w' | 'a') => number;
	export const closeSync: (fd: number) => void;
	export const unlinkSync: (path: string) => void;
	/** Reads into `buffer` from `position` of the file; gives the bytes read. */
	export const readSync: (
		fd: number,
		buffer: Uint8Array,
		offset: number,
		length: number,
		position: number,
	) => number;
	/** Writes the whole of `buffer` at the file's current position. */
	export const writeSync: (fd: number, buffer: Uint8Array) => number;
	export const writeFileSync: (path: string, data: Uint8Array) => void;
	export const readFileSync: (path: string) => Uint8Array;
	/** Makes a new directory whose name is `prefix` and six random characters. */
	export const mkdtempSync: (prefix: string) => string;
	export const rmSync: (
		path: string,
		options: { readonly recursive: true; readonly force: true },
	) => void;
}

declare module 'node:http' {
	/** A request as the tests' servers read it. */
	export type IncomingMessage = {
		readonly headers: Readonly<Record<string, string | string[] | undefined>>;
	};
	/** A response as the tests' servers write it. */
	export type ServerResponse = {
		writeHead(
			status: number,
			headers?: Readonly<Record<string, string>>,
		): ServerResponse;
		write(chunk: Uint8Array): boolean;
		end(chunk?: Uint8Array): ServerResponse;
	};
	export type Server = {
		listen(port: number, host: string, callback: () => void): Server;
		/** Where the server listens; an object once it is listening on TCP. */
		address(): { readonly port: number } | string | null;
		close(callback: () => void): Server;
		closeAllConnections(): void;
	};
	export const createServer: (
		handler: (request: IncomingMessage, response: ServerResponse) => void,
	) => Server;
}

declare module 'node:zlib' {
	/** Throws if the data inflates to more than `maxOutputLength` bytes. */
	export const inflateSync: (
		data: Uint8Array,
		options?: { readonly maxOutputLength: number },
	) => Uint8Array;
	export const deflateSync: (data: Uint8Array) => Uint8Array;
}

declare module 'node:crypto' {
	/** A hash of all the bytes it has been given, in the order given. */
	type Hash = {
		update(data: Uint8Array): Hash;
		digest(encoding: 'hex'): string;
	};
	export const createHash: (algorithm: 'sha256') => Hash;
}

declare module 'node:child_process' {
	/** Runs a program and gives what it printed; throws if it fails. */
	export const execFileSync: (
		file: string,
		args: readonly string[],
		options: {
			readonly input: string;
			readonly encoding: 'utf8';
			readonly maxBuffer: number;
		},
	) => string;
}

declare module 'node:path' {
	export const join: (...parts: readonly string[]) => string;
	export const dirname: (path: string) => string;
}

declare module 'node:url' {
	export const fileURLToPath: (url: string) => string;
}

declare module 'node:process' {
	export const stdout: { write(text: string): boolean };
}

interface ImportMeta {
	/** The `file:` URL of the module. */
	readonly url: string;
}

/** Decodes UTF-8, putting U+FFFD in place of any byte that is not valid. */
declare const TextDecoder: new () => {
	decode(input: Uint8Array): string;
};

/** A response to {@link fetch}, as far as the scripts read one. */
type ScriptResponse = {
	readonly ok: boolean;
	readonly status: number;
	readonly headers: { get(name: string): string | null };
	readonly body: {
		/** Tells the server that no more of the response is wanted. */
		cancel(): Promise<void>;
		getReader(): {
			read(): Promise<{
				readonly done: boolean;
				readonly value?: Uint8Array;
			}>;
			/** As the body's own `cancel`, for a body that is being read. */
			cancel(): Promise<void>;
		};
	} | null;
};

declare const fetch: (
	url: string,
	init?: { readonly headers?: Readonly<Record<string, string>> },
) => Promise<ScriptResponse>;
