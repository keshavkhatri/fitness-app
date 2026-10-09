import { InjectionToken } from '@angular/core';

import { DEFAULT_CALCULATION_CONFIG, FitnessCalculationConfig } from '../../domain/fitness-calculations';

/**
 * Configuration handed to the (framework-free) calculation engine. Injectable
 * so it can be swapped in tests or, later, by a remotely managed config.
 */
export const FITNESS_CALCULATION_CONFIG = new InjectionToken<FitnessCalculationConfig>('FITNESS_CALCULATION_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_CALCULATION_CONFIG,
});
