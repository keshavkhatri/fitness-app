// Public API of the fitness calculation engine. Framework-free and
// deterministic; consumers should call `calculateFitnessAssessment`.
export * from './calculation-config';
export * from './fitness-assessment.model';
export * from './calculate-fitness-assessment';
export { estimateBmr, mifflinStJeor } from './bmr';
export type { BmrEstimate, BmrInput } from './bmr';
export { calculateFatTarget, calculateProteinTarget } from './macros';
export type { ProteinInput, ProteinTarget } from './macros';
