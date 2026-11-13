import { describe, expect, it } from 'vitest';
import * as core from './index';

describe('core', () => {
	it('exports a semantic version string', () => {
		expect(core.CORE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it('exports the planet settings and what follows from them', () => {
		for (const name of [
			'DEFAULT_PLANET',
			'PLANET_LIMITS',
			'normalisePlanet',
			'sunlightRelativeToEarth',
			'yearLengthDays',
			'normaliseAgeYears',
		]) {
			expect(core, name).toHaveProperty(name);
		}
	});

	it('exports sunlight by latitude and season', () => {
		for (const name of [
			'SOLAR_CONSTANT_W_M2',
			'NORTHERN_SOLSTICE_FRACTION',
			'MONTHS_PER_YEAR',
			'dailyInsolation',
			'monthlyInsolation',
			'subsolarLatitude',
			'cellLatitudes',
		]) {
			expect(core, name).toHaveProperty(name);
		}
	});

	it('exports the observed temperature and its regridding', () => {
		for (const name of [
			'OBSERVED_BYTES',
			'OBSERVED_ROWS',
			'OBSERVED_COLUMNS',
			'decodeObservedTemperature',
			'encodeObservedTemperature',
			'observedTemperature',
			'observedTemperatureAt',
		]) {
			expect(core, name).toHaveProperty(name);
		}
	});

	it('exports the observed winds and pressure and their regridding', () => {
		for (const name of [
			'OBSERVED_WIND_BYTES',
			'OBSERVED_PRESSURE_BYTES',
			'decodeObservedWind',
			'encodeObservedWind',
			'decodeObservedPressure',
			'encodeObservedPressure',
			'observedWind',
			'observedPressure',
		]) {
			expect(core, name).toHaveProperty(name);
		}
	});

	it('exports the temperature solver and its comparison with observed', () => {
		for (const name of [
			'edgeGeometry',
			'createExchangeSolver',
			'exchangeHeat',
			'uniformCoupling',
			'EXCHANGE_MAX_ITERATIONS',
			'TEMPERATURE_MODEL',
			'DEFAULT_MAX_YEARS',
			'DEFAULT_TOLERANCE_K',
			'MAX_YEARS_LIMIT',
			'MAX_STEPS_PER_MONTH',
			'MAX_SOLVER_ITERATIONS',
			'MIN_STEP_SECONDS',
			'MAX_STEP_SECONDS',
			'stepBefore',
			'STEFAN_BOLTZMANN',
			'ZERO_CELSIUS_K',
			'solveTemperature',
			'annualBalance',
			'solveResolution',
			'refineMonths',
			'coarsenWorld',
			'refinementStencil',
			'refineField',
			'coarsenField',
			'refineVectors',
			'temperatureConditions',
			'lapseCooling',
			'assertSolvableWorld',
			'coolingDrift',
			'estimateYearsLeft',
			'summariseTemperature',
			'compareFields',
		]) {
			expect(core, name).toHaveProperty(name);
		}
	});

	it("exports the wind models' error figures and zonal means", () => {
		for (const name of [
			'DIRECTION_MIN_SPEED_M_PER_S',
			'DIRECTION_TOLERANCE_DEG',
			'ZONAL_BANDS',
			'windMonth',
			'windMonthErrorFigures',
			'windErrorFigures',
			'zonalMean',
		]) {
			expect(core, name).toHaveProperty(name);
		}
	});

	it('exports the wind model and its annual mean', () => {
		for (const name of [
			'WIND_SOLVE_RESOLUTION',
			'solveWinds',
			'summariseWinds',
		]) {
			expect(core, name).toHaveProperty(name);
		}
	});

	it('exports weighted quantiles', () => {
		expect(core).toHaveProperty('weightedQuantiles');
	});
});
