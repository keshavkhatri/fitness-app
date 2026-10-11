import { ExtractedField, INBODY_EXTRACTION_SCHEMA_VERSION } from '../inbody-extraction-contract';

/**
 * A correct extraction of a fictional InBody380 result sheet: SYNTHETIC test
 * data, not a real person's report. The values are internally consistent
 * (water compartments, fat-free mass, BMI, ECW ratio and body cell mass all
 * agree), formatted the way an InBody380 prints them. Never replace them with
 * values from a real report. As JSON (`unknown`), the way a response reaches
 * the validator.
 */
const read = (text: string, unit: string | null, sourceLabel: string): ExtractedField => ({ status: 'read', text, unit, sourceLabel });

export const SAMPLE_INBODY380_EXTRACTION = {
  schemaVersion: INBODY_EXTRACTION_SCHEMA_VERSION,
  outcome: 'extracted',
  reportIssues: [],
  metadata: {
    'report-model': read('InBody380', null, '[InBody380]'),
    'test-date-time': read('2026.09.14. 07:42', null, 'Test Date / Time'),
  },
  profile: {
    height: read('172', 'cm', 'Height'),
    age: read('38', null, 'Age'),
    gender: read('Female', null, 'Gender'),
  },
  measurements: {
    weight: read('68.4', 'kg', 'Weight'),
    'total-body-water': read('34.7', 'L', 'Total Body Water'),
    protein: read('9.4', 'kg', 'Protein'),
    minerals: read('3.21', 'kg', 'Minerals'),
    'body-fat-mass': read('21.1', 'kg', 'Body Fat Mass'),
    'soft-lean-mass': read('44.1', 'kg', 'Soft Lean Mass'),
    'fat-free-mass': read('47.3', 'kg', 'Fat Free Mass'),
    'skeletal-muscle-mass': read('26.2', 'kg', 'SMM Skeletal Muscle Mass'),
    bmi: read('23.1', 'kg/m²', 'BMI Body Mass Index'),
    'percent-body-fat': read('30.8', '%', 'PBF Percent Body Fat'),
    'ecw-ratio': read('0.378', null, 'ECW Ratio'),
    'phase-angle': read('5.6', '°', 'Whole Body Phase Angle'),
    smi: read('7.1', 'kg/m²', 'SMI'),
    'intracellular-water': read('21.6', 'L', 'Intracellular Water'),
    'extracellular-water': read('13.1', 'L', 'Extracellular Water'),
    'basal-metabolic-rate': read('1392', 'kcal', 'Basal Metabolic Rate'),
    'waist-hip-ratio': read('0.86', null, 'Waist-Hip Ratio'),
    'visceral-fat-level': read('7', null, 'Visceral Fat Level'),
    'obesity-degree': read('107', '%', 'Obesity Degree'),
    'bone-mineral-content': read('2.62', 'kg', 'Bone Mineral Content'),
    'body-cell-mass': read('31.0', 'kg', 'Body Cell Mass'),
  },
} as const;
