/**
 * The bytes of `public/data/earth-256.bin`, read afresh at each call, in an
 * array of exactly their length that nothing else refers to.
 *
 * @throws Error if the file cannot be read.
 */
export declare const readEarthDataFile: () => Uint8Array<ArrayBuffer>;

/**
 * The bytes of `public/data/earth-temperature-1deg.bin`, read afresh at each
 * call, in an array of exactly their length that nothing else refers to.
 *
 * @throws Error if the file cannot be read.
 */
export declare const readObservedTemperatureFile: () => Uint8Array<ArrayBuffer>;

/**
 * The bytes of `public/data/earth-wind-1deg.bin`, read afresh at each call,
 * in an array of exactly their length that nothing else refers to.
 *
 * @throws Error if the file cannot be read.
 */
export declare const readObservedWindFile: () => Uint8Array<ArrayBuffer>;

/**
 * The bytes of `public/data/earth-pressure-1deg.bin`, read afresh at each
 * call, in an array of exactly their length that nothing else refers to.
 *
 * @throws Error if the file cannot be read.
 */
export declare const readObservedPressureFile: () => Uint8Array<ArrayBuffer>;
