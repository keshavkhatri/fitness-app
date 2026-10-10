import { ExtractedField, INBODY_EXTRACTION_SCHEMA_VERSION } from '../inbody-extraction-contract';

/**
 * A correct extraction of the InBody380 sample sheet (test of 2026.10.01),
 * transcribed by hand: the values a model should return for that report.
 * As JSON (`unknown`), the way a response reaches the validator.
 */
const read = (text: string, unit: string | null, sourceLabel: string): ExtractedField => ({ status: 'read', text, unit, sourceLabel });

export const SAMPLE_INBODY380_EXTRACTION = {
  schemaVersion: INBODY_EXTRACTION_SCHEMA_VERSION,
  outcome: 'extracted',
  reportIssues: [],
  metadata: {
    'report-model': read('InBody380', null, '[InBody380]'),
    'test-date-time': read('2026.10.01. 08:06', null, 'Test Date / Time'),
  },
  profile: {
    height: read('180', 'cm', 'Height'),
    age: read('31', null, 'Age'),
    gender: read('Male', null, 'Gender'),
  },
  measurements: {
    weight: read('94.5', 'kg', 'Weight'),
    'total-body-water': read('46.1', 'L', 'Total Body Water'),
    protein: read('12.5', 'kg', 'Protein'),
    minerals: read('4.26', 'kg', 'Minerals'),
    'body-fat-mass': read('31.6', 'kg', 'Body Fat Mass'),
    'soft-lean-mass': read('59.4', 'kg', 'Soft Lean Mass'),
    'fat-free-mass': read('62.9', 'kg', 'Fat Free Mass'),
    'skeletal-muscle-mass': read('35.8', 'kg', 'SMM Skeletal Muscle Mass'),
    bmi: read('29.2', 'kg/m²', 'BMI Body Mass Index'),
    'percent-body-fat': read('33.4', '%', 'PBF Percent Body Fat'),
    'ecw-ratio': read('0.372', null, 'ECW Ratio'),
    'phase-angle': read('6.4', '°', 'Whole Body Phase Angle'),
    smi: read('8.5', 'kg/m²', 'SMI'),
    'intracellular-water': read('29.0', 'L', 'Intracellular Water'),
    'extracellular-water': read('17.1', 'L', 'Extracellular Water'),
    'basal-metabolic-rate': read('1729', 'kcal', 'Basal Metabolic Rate'),
    'waist-hip-ratio': read('1.07', null, 'Waist-Hip Ratio'),
    'visceral-fat-level': read('15', null, 'Visceral Fat Level'),
    'obesity-degree': read('133', '%', 'Obesity Degree'),
    'bone-mineral-content': read('3.54', 'kg', 'Bone Mineral Content'),
    'body-cell-mass': read('41.5', 'kg', 'Body Cell Mass'),
  },
} as const;
