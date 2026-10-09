import { EMPTY_DRAFT } from '../state/onboarding-draft';
import { completeDraft } from '../testing/draft-fixtures';
import {
  BasicsFormInput,
  basicsFormFromDraft,
  convertBasicsForm,
  firstIncompleteStep,
  validateBasicsForm,
  validateDateOfBirthInput,
  validateStep,
  validateTargetWeightInput,
} from './onboarding-validation';

/** Fixed "today" for deterministic age checks: 7 October 2026, local time. */
const NOW = new Date(2026, 9, 7);

const metricForm = (overrides: Partial<BasicsFormInput> = {}): BasicsFormInput => ({
  unitSystem: 'metric',
  birthDay: '15',
  birthMonth: '6',
  birthYear: '1991',
  sex: 'female',
  heightCm: '168',
  heightFeet: '',
  heightInches: '',
  weight: '80',
  ...overrides,
});

const imperialForm = (overrides: Partial<BasicsFormInput> = {}): BasicsFormInput =>
  metricForm({ unitSystem: 'imperial', heightCm: '', heightFeet: '5', heightInches: '6', weight: '176', ...overrides });

const errorsOf = (input: BasicsFormInput) => {
  const result = validateBasicsForm(input, NOW);
  return result.ok ? {} : result.errors;
};

const dobError = (day: string, month: string, year: string) => {
  const result = validateDateOfBirthInput(day, month, year, NOW);
  return result.ok ? null : result.errors;
};

describe('onboarding validation', () => {
  describe('validateStep (draft level)', () => {
    it('blocks question steps until answered', () => {
      for (const step of ['goal', 'basics', 'experience', 'frequency', 'location', 'equipment', 'activity'] as const) {
        expect(validateStep(step, EMPTY_DRAFT)).toEqual(expect.any(String));
        expect(validateStep(step, completeDraft())).toBeNull();
      }
    });

    it('never blocks the optional goal-target step when empty', () => {
      expect(validateStep('goal-target', completeDraft({ goalTarget: { targetWeight: null } }))).toBeNull();
    });

    it('flags a target that became inconsistent after editing current weight', () => {
      const draft = completeDraft({ basics: { ...completeDraft().basics!, weight: { kilograms: 70 } } });
      expect(validateStep('goal-target', draft)).toContain('below your current weight (70 kg)');
    });

    it('finds the first unanswered step', () => {
      expect(firstIncompleteStep(EMPTY_DRAFT)).toBe('goal');
      expect(firstIncompleteStep(completeDraft({ equipment: [] }))).toBe('equipment');
      expect(firstIncompleteStep(completeDraft())).toBeNull();
    });
  });

  describe('date of birth', () => {
    it('returns a normalized ISO calendar date', () => {
      expect(validateDateOfBirthInput('3', '4', '1990', NOW)).toEqual({ ok: true, value: '1990-04-03' });
      expect(validateDateOfBirthInput(' 03 ', '04', '1990', NOW)).toEqual({ ok: true, value: '1990-04-03' });
    });

    it('accepts someone who turns 18 today', () => {
      expect(validateDateOfBirthInput('7', '10', '2008', NOW)).toEqual({ ok: true, value: '2008-10-07' });
    });

    it('rejects someone who is still 17 (turns 18 tomorrow)', () => {
      expect(dobError('8', '10', '2008')).toBe('You need to be 18 or older to use this app.');
    });

    it('rejects missing or partial dates', () => {
      expect(dobError('', '', '')).toBe('Enter your date of birth.');
      expect(dobError('15', '', '1990')).toBe('Enter your full date of birth as numbers.');
      expect(dobError('15', 'June', '1990')).toBe('Enter your full date of birth as numbers.');
    });

    it('rejects dates that do not exist', () => {
      expect(dobError('31', '4', '1990')).toBe("That date doesn't exist. Check the day and month.");
      expect(dobError('29', '2', '1999')).toBe("That date doesn't exist. Check the day and month.");
      expect(dobError('1', '13', '1990')).toBe("That date doesn't exist. Check the day and month.");
      expect(dobError('29', '2', '2000')).toBeNull(); // leap year
    });

    it('requires a 4-digit year', () => {
      expect(dobError('15', '6', '90')).toBe('Enter the year with 4 digits.');
    });

    it('rejects future and implausibly old dates', () => {
      expect(dobError('1', '1', '2027')).toBe("Date of birth can't be in the future.");
      expect(dobError('1', '1', '1890')).toBe('Check the year of your date of birth.');
    });
  });

  describe('basic information', () => {
    it('accepts valid metric input and stores canonical values', () => {
      expect(validateBasicsForm(metricForm({ weight: '80,5' }), NOW)).toEqual({
        ok: true,
        value: { dateOfBirth: '1991-06-15', sex: 'female', height: { centimeters: 168 }, weight: { kilograms: 80.5 } },
      });
    });

    it('accepts valid imperial input, converting to metric', () => {
      const result = validateBasicsForm(imperialForm(), NOW);
      expect(result.ok && result.value.height.centimeters).toBe(167.6);
      expect(result.ok && result.value.weight.kilograms).toBe(79.83);
    });

    it('requires every field', () => {
      expect(
        errorsOf(metricForm({ birthDay: '', birthMonth: '', birthYear: '', sex: null, heightCm: '', weight: '' })),
      ).toEqual({
        dateOfBirth: 'Enter your date of birth.',
        sex: 'Choose an option.',
        height: 'Enter your height.',
        weight: 'Enter your weight.',
      });
    });

    it('rejects under-18 users', () => {
      expect(errorsOf(metricForm({ birthYear: '2010' })).dateOfBirth).toBe('You need to be 18 or older to use this app.');
    });

    it('rejects non-numeric and malformed measurements', () => {
      const errors = errorsOf(metricForm({ heightCm: 'tall', weight: '-80' }));
      expect(errors.height).toBe('Enter your height in centimeters.');
      expect(errors.weight).toBe('Enter your weight as a number.');
      expect(errorsOf(imperialForm({ heightInches: '12' })).height).toBe('Enter feet, and inches from 0 to 11.');
    });

    describe('feet-and-inches height', () => {
      const FORMAT = "Check number format. Use one decimal separator. Thousands separators aren't supported.";
      const heightOf = (heightFeet: string, heightInches: string) => {
        const result = validateBasicsForm(imperialForm({ heightFeet, heightInches }), NOW);
        return result.ok ? result.value.height : null;
      };

      it('accepts ordinary and decimal inches (dot or comma); blank inches mean 0', () => {
        expect(heightOf('5', '6')).toEqual({ centimeters: 167.6 });
        expect(heightOf('5', '6.5')).toEqual(heightOf('5', '6,5'));
        expect(heightOf('5', '6.5')).toEqual({ centimeters: 168.9 });
        expect(heightOf('5', '0,25')).not.toBeNull();
        expect(heightOf('6', '')).toEqual({ centimeters: 182.9 });
        expect(heightOf('5', '0')).toEqual(heightOf('5', ''));
      });

      it('rejects ambiguous separators instead of reading them as small decimals', () => {
        for (const inches of ['1,234', '1.234', '11.999', '1,234.5', '1.234,5']) {
          expect(errorsOf(imperialForm({ heightInches: inches })).height).toBe(FORMAT);
        }
      });

      it('rejects malformed and out-of-range inches with the existing message', () => {
        for (const inches of ['abc', '-1', '-0', '.5', '5.', '1e1', '12', '12.5', '6 in']) {
          expect(errorsOf(imperialForm({ heightInches: inches })).height).toBe('Enter feet, and inches from 0 to 11.');
        }
        expect(errorsOf(imperialForm({ heightFeet: '', heightInches: '6' })).height).toBe('Enter your height.');
        expect(errorsOf(imperialForm({ heightFeet: '5.5' })).height).toBe('Enter feet, and inches from 0 to 11.');
      });

      it('keeps the existing height range boundaries', () => {
        expect(heightOf('1', '7.7')).toEqual({ centimeters: 50 }); // 50 cm minimum
        expect(errorsOf(imperialForm({ heightFeet: '1', heightInches: '7' })).height).toBe('Enter a height between 1 ft 8 in and 9 ft 0 in.');
        expect(heightOf('9', '0')).not.toBeNull();
        expect(errorsOf(imperialForm({ heightFeet: '9', heightInches: '1' })).height).toBe('Enter a height between 1 ft 8 in and 9 ft 0 in.');
      });

      it('an ambiguous value never reaches unit conversion', () => {
        const form = imperialForm({ heightInches: '1,234' });
        expect(convertBasicsForm(form, 'metric').heightCm).toBe('');
      });
    });

    it('other numeric fields keep their lenient parsing', () => {
      // Metric height and weight still read a comma as a decimal point; their ranges reject the small results.
      expect(validateBasicsForm(metricForm({ heightCm: '168,5', weight: '82,5' }), NOW)).toMatchObject({
        ok: true,
        value: { height: { centimeters: 168.5 }, weight: { kilograms: 82.5 } },
      });
      expect(errorsOf(metricForm({ heightCm: '1,234' })).height).toBe('Enter a height between 50 and 275 cm.');
      expect(errorsOf(metricForm({ weight: '1,234' })).weight).toBe('Enter a weight between 20 and 500 kg.');
      expect(errorsOf(imperialForm({ weight: '176,5' })).weight).toBeUndefined();
    });

    it('rejects implausible measurements with the range in the user’s units', () => {
      expect(errorsOf(metricForm({ heightCm: '20' })).height).toBe('Enter a height between 50 and 275 cm.');
      expect(errorsOf(imperialForm({ weight: '30' })).weight).toBe('Enter a weight between 45 and 1,102 lb.');
    });

    it('accepts unusual but legitimate people', () => {
      for (const form of [
        metricForm({ birthYear: '1931', heightCm: '122', weight: '38' }),
        metricForm({ heightCm: '221', weight: '210' }),
        imperialForm({ heightFeet: '4', heightInches: '', weight: '450' }),
      ]) {
        expect(validateBasicsForm(form, NOW).ok).toBe(true);
      }
    });

    it('converts typed measurements when the unit system changes', () => {
      const imperial = convertBasicsForm(metricForm({ heightCm: '178', weight: '94.2' }), 'imperial');
      expect([imperial.heightFeet, imperial.heightInches, imperial.weight]).toEqual(['5', '10', '207.7']);

      const metric = convertBasicsForm(imperial, 'metric');
      expect([metric.heightCm, metric.weight]).toEqual(['178', '94.2']);
    });

    it('keeps unparseable text as-is when converting', () => {
      expect(convertBasicsForm(metricForm({ weight: 'abc' }), 'imperial').weight).toBe('abc');
    });

    it('prefills the form from saved answers in the saved unit system', () => {
      const form = basicsFormFromDraft(completeDraft({ unitSystem: 'imperial' }));
      expect(form).toMatchObject({
        birthDay: '15',
        birthMonth: '6',
        birthYear: '1991',
        heightFeet: '5',
        heightInches: '6',
        weight: '176.4',
      });
    });
  });

  describe('target weight', () => {
    const current = { kilograms: 80 };

    it('is optional', () => {
      expect(validateTargetWeightInput('  ', 'lose-fat', 'metric', current)).toEqual({ ok: true, value: null });
    });

    it('converts imperial input', () => {
      const result = validateTargetWeightInput('165', 'lose-fat', 'imperial', current);
      expect(result).toEqual({ ok: true, value: { kilograms: 74.84 } });
    });

    it('must point in the goal’s direction', () => {
      expect(validateTargetWeightInput('85', 'lose-fat', 'metric', current).ok).toBe(false);
      expect(validateTargetWeightInput('75', 'build-muscle', 'metric', current)).toEqual({
        ok: false,
        errors: 'For this goal, your target should be above your current weight (80 kg).',
      });
    });

    it('rejects invalid numbers and out-of-range values', () => {
      expect(validateTargetWeightInput('seventy', 'lose-fat', 'metric', current).ok).toBe(false);
      expect(validateTargetWeightInput('5', 'lose-fat', 'metric', current).ok).toBe(false);
    });
  });
});
