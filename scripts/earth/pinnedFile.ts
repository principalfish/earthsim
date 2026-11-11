/**
 * A source file that is downloaded once and must then be exactly the file
 * expected: its address, its length and its SHA-256, and the checks made on
 * a download of it before and after anything is written.
 */

/** A file known in advance by its length and its SHA-256. */
export type PinnedFile = {
	/** Where the file is downloaded from. */
	readonly url: string;
	/** The name the downloaded file is kept under. */
	readonly name: string;
	/** The exact length of the file, in bytes. */
	readonly bytes: number;
	/** The SHA-256 of the file, in lower-case hexadecimal. */
	readonly sha256: string;
};

/**
 * Says what is wrong with a file's SHA-256, if it is not that of the file
 * expected.
 *
 * @param file - The file expected.
 * @param digest - The SHA-256 of a file, in hexadecimal of either case.
 * @returns `null` if it is the file's; otherwise a sentence that says the
 * file is not the one expected, with both digests.
 */
export const digestMismatch = (
	file: PinnedFile,
	digest: string,
): string | null =>
	digest.toLowerCase() === file.sha256
		? null
		: `The file does not match the expected file ${file.name}: its SHA-256 is ${digest}, expected ${file.sha256}`;

/**
 * Says what is wrong with a download that would come to a given length, if
 * that is more than the file has.
 *
 * @remarks
 * Asked before each part of a response is written, this keeps a server that
 * sends more than the file, or never stops sending, from filling the disk:
 * the length and the SHA-256 of what was written can only be checked once
 * the response has ended.
 *
 * @param file - The file being downloaded.
 * @param bytes - The length the file on disk would have, in bytes.
 * @returns `null` if that is within the file's length; otherwise a sentence
 * that says the server sent too much.
 */
export const downloadOverrun = (
	file: PinnedFile,
	bytes: number,
): string | null =>
	bytes <= file.bytes
		? null
		: `The server sent more than the ${file.bytes} bytes of ${file.name}`;

/** A `Content-Range` in bytes: the first and last byte sent, then the total. */
const CONTENT_RANGE_PATTERN = /^bytes (\d+)-(\d+)\/(\d+|\*)$/;

/**
 * Says what is wrong with the `Content-Range` of a partial response, if it
 * is not the rest of the file from a given byte.
 *
 * @remarks
 * A download that was cut off is carried on by asking for the bytes from
 * where it stopped and adding them to what is there. A server may answer
 * with another part than the one asked for, which added to the file would
 * make it wrong. The part must start at the byte asked for and end within
 * the file, and the length it gives for the whole file must be the file's;
 * a server may leave that length unsaid, as `*`.
 *
 * @param file - The file being downloaded.
 * @param header - The response's `Content-Range`, or `null` if it has none.
 * @param firstByte - The byte the request asked the part to start at.
 * @returns `null` if the part is the one asked for; otherwise a sentence
 * that says what the server sent instead.
 */
export const contentRangeProblem = (
	file: PinnedFile,
	header: string | null,
	firstByte: number,
): string | null => {
	const wanted = `bytes ${firstByte}-${file.bytes - 1}/${file.bytes}`;
	if (header === null) {
		return `The server sent part of a file without a Content-Range, expected "${wanted}"`;
	}
	const match = CONTENT_RANGE_PATTERN.exec(header.trim());
	const first = Number(match?.[1]);
	const last = Number(match?.[2]);
	const total = match?.[3];
	const right =
		match !== null &&
		first === firstByte &&
		last >= first &&
		last < file.bytes &&
		(total === '*' || Number(total) === file.bytes);
	return right
		? null
		: `The server sent the part "${header}" of a file, expected "${wanted}"`;
};
