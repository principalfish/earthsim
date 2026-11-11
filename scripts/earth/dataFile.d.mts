/**
 * The bytes of `public/data/earth-256.bin`, read afresh at each call, in an
 * array of exactly their length that nothing else refers to.
 *
 * @throws Error if the file cannot be read.
 */
export declare const readEarthDataFile: () => Uint8Array<ArrayBuffer>;
