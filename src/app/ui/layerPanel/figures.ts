/**
 * The difference of a result from an observed year, and its error
 * figures, each worked out once and kept with the result.
 */

import {
	compareField,
	differenceField,
	type FieldDifference,
	getGrid,
} from '../../../core/index';
import {
	type ScalarLayerSpec,
	type YearFieldKey,
	yearField,
} from '../../layers/scalar';
import { type Derived, kept, type ObservedYear } from './internal';

export const differenceOf = (
	spec: ScalarLayerSpec,
	from: Derived,
	year: ObservedYear,
	key: YearFieldKey,
): Float32Array =>
	kept(from.differences, key, () =>
		differenceField(yearField(spec, from, key), yearField(spec, year, key)),
	);
export const figuresOf = (
	spec: ScalarLayerSpec,
	from: Derived,
	year: ObservedYear,
	key: YearFieldKey,
): FieldDifference =>
	kept(from.figures, key, () =>
		compareField(
			yearField(spec, from, key),
			yearField(spec, year, key),
			getGrid(year.resolution),
		),
	);
