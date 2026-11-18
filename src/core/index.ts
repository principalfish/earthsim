/** Version of the simulation core, independent of the page that hosts it. */
export const CORE_VERSION = '0.0.0';

export * from './compare';
export * from './earth/earth';
export * from './grid/coarsen';
export * from './grid/grid';
export * from './grid/quantile';
export * from './grid/vector';
export * from './planet/insolation';
export * from './planet/planet';
export * from './planet/star';
export * from './protocol';
export * from './temperature/exchange';
export * from './temperature/observed';
export * from './temperature/temperature';
export * from './wind/model';
export * from './wind/observedWind';
export * from './wind/solve';
export * from './world/brush';
export * from './world/generate';
export * from './world/history';
export * from './world/noise';
export * from './world/serialize';
export * from './world/stats';
export * from './world/world';
