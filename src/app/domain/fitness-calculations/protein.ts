import { PrimaryGoal, roundTo } from '../fitness-profile';
import { FitnessCalculationConfig } from './calculation-config';
import { ProteinMethodDetail, ProteinMethodType } from './fitness-assessment.model';

/**
 * Inputs available to protein strategies. A future lean-mass strategy adds an
 * optional `leanBodyMassKg` here and is preferred by `selectProteinMethod`
 * when present; the pipeline and callers don't change.
 */
export interface ProteinInput {
  readonly goal: PrimaryGoal;
  readonly bodyWeightKg: number;
  readonly heightCm: number;
}

export interface ProteinTarget {
  /** Unrounded grams/day. */
  readonly grams: number;
  readonly method: ProteinMethodDetail;
}

type ProteinStrategy = (input: ProteinInput, gramsPerKg: number, config: FitnessCalculationConfig) => ProteinTarget;

/** Body weight at the configured threshold BMI for this height. */
export function proteinThresholdWeightKg(heightCm: number, config: FitnessCalculationConfig): number {
  const heightM = heightCm / 100;
  return config.protein.adjustedWeight.thresholdBmi * heightM * heightM;
}

const STRATEGIES: Readonly<Record<ProteinMethodType, ProteinStrategy>> = {
  'body-weight': (input, gramsPerKg) => ({
    grams: gramsPerKg * input.bodyWeightKg,
    method: { type: 'body-weight', gramsPerKg, basisWeightKg: input.bodyWeightKg },
  }),

  'adjusted-weight': (input, gramsPerKg, config) => {
    const { thresholdBmi, excessWeightFraction } = config.protein.adjustedWeight;
    const thresholdWeightKg = proteinThresholdWeightKg(input.heightCm, config);
    const referenceWeightKg =
      thresholdWeightKg + excessWeightFraction * Math.max(input.bodyWeightKg - thresholdWeightKg, 0);
    return {
      grams: gramsPerKg * referenceWeightKg,
      method: {
        type: 'adjusted-weight',
        gramsPerKg,
        actualWeightKg: input.bodyWeightKg,
        referenceWeightKg: roundTo(referenceWeightKg, 1),
        thresholdWeightKg: roundTo(thresholdWeightKg, 1),
        thresholdBmi,
        excessWeightFraction,
      },
    };
  },
};

/** Body weight up to the threshold; adjusted weight above it. */
export function selectProteinMethod(input: ProteinInput, config: FitnessCalculationConfig): ProteinMethodType {
  return input.bodyWeightKg > proteinThresholdWeightKg(input.heightCm, config) ? 'adjusted-weight' : 'body-weight';
}

/** The single protein-target calculation; features must call this, not re-derive it. */
export function calculateProteinTarget(input: ProteinInput, config: FitnessCalculationConfig): ProteinTarget {
  const gramsPerKg = config.protein.gramsPerKg[input.goal].default;
  return STRATEGIES[selectProteinMethod(input, config)](input, gramsPerKg, config);
}
