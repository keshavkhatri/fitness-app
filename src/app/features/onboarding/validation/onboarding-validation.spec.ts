import { EMPTY_BASICS, EMPTY_DRAFT } from '../state/onboarding-draft';
import { completeDraft } from '../testing/draft-fixtures';
import {
  AboutFormInput,
  HeightTextInput,
  aboutFormFromDraft,
  firstIncompleteStep,
  heightText,
  validateAboutForm,
  validateBirthDateInput,
  validateDateOfBirthInput,
  validateHeightInput,
  validateStep,
  validateTargetWeightInput,
  validateWeightInput,
  weightText,
} from './onboarding-validation';

/** Fixed "today" for deterministic age checks: 7 October 2026, local time. */
const NOW = new Date(2026, 9, 7);

const about = (overrides: Partial<AboutFormInput> = {}): AboutFormInput => ({
  birthDate: '1991-06-15',
  sex: 'female',
  ...overrides,
});
const aboutErrors = (input: AboutFormInput) => {
  const result = validateAboutForm(input, NOW);
  return result.ok ? {} : result.errors;
};

const metricHeight = (cm: string): HeightTextInput => ({ unitSystem: 'metric', cm, feet: '', inches: '' });
const imperialHeight = (feet: string, inches: string): HeightTextInput => ({ unitSystem: 'imperial', cm: '', feet, inches });
const heightError = (input: HeightTextInput) => {
  const result = validateHeightInput(input);
  return result.ok ? null : result.errors;
};
const weightError = (text: string, unitSystem: 'metric' | 'imperial' = 'metric') => {
  const result = validateWeightInput(text, unitSystem);
  return result.ok ? null : result.errors;
};

const dobError = (day: string, month: string, year: string) => {
  const result = validateDateOfBirthInput(day, month, year, NOW);
  return result.ok ? null : result.errors;
};

describe('onboarding validation', () => {
  describe('validateStep (draft level)', () => {
    it('blocks question steps until answered', () => {
      for (const step of ['basics', 'height', 'weight', 'activity', 'goal', 'experience', 'frequency', 'location', 'equipment'] as const) {
        expect(validateStep(step, EMPTY_DRAFT)).toEqual(expect.any(String));
        expect(validateStep(step, completeDraft())).toBeNull();
      }
    });

    it('never blocks the optional goal-target step when empty', () => {
      expect(validateStep('goal-target', completeDraft({ goalTarget: { targetWeight: null } }))).toBeNull();
    });

    it('flags a target that became inconsistent after editing current weight', () => {
      const draft = completeDraft({ basics: { ...completeDraft().basics, weight: { kilograms: 70 } } });
      expect(validateStep('goal-target', draft)).toContain('below your current weight (70 kg)');
    });

    it('finds the first unanswered step', () => {
      expect(firstIncompleteStep(EMPTY_DRAFT)).toBe('basics');
      expect(firstIncompleteStep({ ...EMPTY_DRAFT, name: 'Alex' })).toBe('basics');
      const aboutDone = { ...EMPTY_DRAFT, name: 'Alex', basics: { ...EMPTY_BASICS, dateOfBirth: '1991-06-15', sex: 'female' } } as const;
      expect(firstIncompleteStep(aboutDone)).toBe('height');
      expect(firstIncompleteStep({ ...aboutDone, basics: { ...aboutDone.basics, height: { centimeters: 170 } } })).toBe('weight');
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

  describe('date of birth from the date picker', () => {
    it('reads YYYY-MM-DD and checks it like a typed date', () => {
      expect(validateBirthDateInput('1990-04-03', NOW)).toEqual({ ok: true, value: '1990-04-03' });
      expect(validateBirthDateInput('2008-10-08', NOW)).toEqual({ ok: false, errors: 'You need to be 18 or older to use this app.' });
      expect(validateBirthDateInput('2027-01-01', NOW)).toEqual({ ok: false, errors: "Date of birth can't be in the future." });
    });

    it('asks for a date when it is blank or incomplete', () => {
      expect(validateBirthDateInput('', NOW)).toEqual({ ok: false, errors: 'Enter your date of birth.' });
      expect(validateBirthDateInput('1990-04', NOW)).toEqual({ ok: false, errors: 'Enter your full date of birth.' });
    });
  });

  describe('about you (sex, date of birth; the name comes from the account)', () => {
    it('accepts valid answers', () => {
      expect(validateAboutForm(about(), NOW)).toEqual({ ok: true, value: { dateOfBirth: '1991-06-15', sex: 'female' } });
    });

    it('requires every answer, and does not ask for a name', () => {
      expect(aboutErrors(about({ birthDate: '', sex: null }))).toEqual({
        dateOfBirth: 'Enter your date of birth.',
        sex: 'Choose an option.',
      });
    });

    it('rejects under-18 users', () => {
      expect(aboutErrors(about({ birthDate: '2010-01-01' })).dateOfBirth).toBe('You need to be 18 or older to use this app.');
    });

    it('prefills from saved answers, including partial ones', () => {
      expect(aboutFormFromDraft(completeDraft())).toEqual({ birthDate: '1991-06-15', sex: 'female' });
      expect(aboutFormFromDraft(EMPTY_DRAFT)).toEqual({ birthDate: '', sex: null });
    });
  });

  describe('height typed in', () => {
    const FORMAT = "Check number format. Use one decimal separator. Thousands separators aren't supported.";
    const heightOf = (input: HeightTextInput) => {
      const result = validateHeightInput(input);
      return result.ok ? result.value : null;
    };

    it('stores canonical centimeters (0.1 cm)', () => {
      expect(heightOf(metricHeight('168'))).toEqual({ centimeters: 168 });
      expect(heightOf(metricHeight('168,5'))).toEqual({ centimeters: 168.5 });
      expect(heightOf(imperialHeight('5', '6'))).toEqual({ centimeters: 167.6 });
    });

    it('accepts ordinary and decimal inches (dot or comma); blank inches mean 0', () => {
      expect(heightOf(imperialHeight('5', '6.5'))).toEqual(heightOf(imperialHeight('5', '6,5')));
      expect(heightOf(imperialHeight('5', '6.5'))).toEqual({ centimeters: 168.9 });
      expect(heightOf(imperialHeight('6', ''))).toEqual({ centimeters: 182.9 });
    });

    it('rejects ambiguous separators instead of reading them as small decimals', () => {
      for (const inches of ['1,234', '1.234', '11.999', '1,234.5', '1.234,5']) {
        expect(heightError(imperialHeight('5', inches))).toBe(FORMAT);
      }
    });

    it('rejects blank, malformed and out-of-range input', () => {
      expect(heightError(metricHeight(''))).toBe('Enter your height.');
      expect(heightError(metricHeight('tall'))).toBe('Enter your height in centimeters.');
      expect(heightError(imperialHeight('', '6'))).toBe('Enter your height.');
      for (const inches of ['abc', '-1', '12', '6 in']) {
        expect(heightError(imperialHeight('5', inches))).toBe('Enter feet, and inches from 0 to 11.');
      }
    });

    it('keeps the profile’s height range (50–275 cm) in either unit', () => {
      expect(heightError(metricHeight('20'))).toBe('Enter a height between 50 and 275 cm.');
      expect(heightError(metricHeight('1,234'))).toBe('Enter a height between 50 and 275 cm.');
      expect(heightOf(imperialHeight('1', '7.7'))).toEqual({ centimeters: 50 });
      expect(heightError(imperialHeight('1', '7'))).toBe('Enter a height between 1 ft 8 in and 9 ft 0 in.');
      expect(heightOf(imperialHeight('9', '0'))).not.toBeNull();
      expect(heightError(imperialHeight('9', '1'))).toBe('Enter a height between 1 ft 8 in and 9 ft 0 in.');
    });

    it('fills the typing fields from a height, without rounding a printed decimal away', () => {
      expect(heightText({ centimeters: 172.5 }, 'metric')).toEqual({ unitSystem: 'metric', cm: '172.5', feet: '5', inches: '8' });
      expect(heightText(null, 'imperial')).toEqual({ unitSystem: 'imperial', cm: '', feet: '', inches: '' });
    });
  });

  describe('weight typed in', () => {
    it('stores canonical kilograms, from kg or lb', () => {
      expect(validateWeightInput('80,5', 'metric')).toEqual({ ok: true, value: { kilograms: 80.5 } });
      expect(validateWeightInput('176', 'imperial')).toEqual({ ok: true, value: { kilograms: 79.83 } });
    });

    it('rejects blank, malformed and out-of-range input with the range in the user’s unit', () => {
      expect(weightError('')).toBe('Enter your weight.');
      expect(weightError('-80')).toBe('Enter your weight as a number.');
      expect(weightError('1,234')).toBe('Enter a weight between 20 and 500 kg.');
      expect(weightError('30', 'imperial')).toBe('Enter a weight between 45 and 1,102 lb.');
    });

    it('accepts unusual but legitimate people', () => {
      expect(weightError('38')).toBeNull();
      expect(weightError('450', 'imperial')).toBeNull();
    });

    it('fills the typing field in the user’s unit (to 0.1)', () => {
      expect(weightText({ kilograms: 80 }, 'imperial')).toBe('176.4');
      expect(weightText(null, 'metric')).toBe('');
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
