// Public API of the fitness calculation engine. Framework-free and
// deterministic; consumers should call `calculateFitnessAssessment`.
export * from './calculation-config';
export * from './fitness-assessment.model';
export * from './calculate-fitness-assessment';
export { estimateBmr, mifflinStJeor } from './bmr';
export type { BmrEstimate, BmrInput } from './bmr';
export { calculateFatTargets, planMacros } from './macros';
export type { FatTargets } from './macros';
export { calculateProteinTarget, selectProteinMethod } from './protein';
export type { ProteinInput, ProteinTarget } from './protein';
