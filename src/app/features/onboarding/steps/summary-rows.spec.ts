import { completeDraft } from '../testing/draft-fixtures';
import { buildSummaryRows } from './summary-rows';

const asMap = (rows: ReturnType<typeof buildSummaryRows>) => Object.fromEntries(rows.map((r) => [r.id, r.value]));
const NOW = new Date(2026, 9, 7);

describe('buildSummaryRows', () => {
  it('summarises the profile in metric', () => {
    expect(asMap(buildSummaryRows(completeDraft(), NOW))).toEqual({
      name: 'Alex',
      goal: 'Lose Fat',
      age: '35 years',
      sex: 'Female',
      height: '168 cm',
      weight: '80 kg',
      units: 'Metric',
      experience: 'Intermediate',
      training: '4 days/week',
      location: 'Gym',
      equipment: 'Full gym',
      activity: 'Lightly active',
      'target-weight': '72 kg',
    });
  });

  it('displays measurements in imperial when chosen', () => {
    const rows = asMap(buildSummaryRows(completeDraft({ unitSystem: 'imperial' })));
    expect(rows['height']).toBe('5 ft 6 in');
    expect(rows['weight']).toBe('176.4 lb');
    expect(rows['target-weight']).toBe('158.7 lb');
  });

  it('shows "Not set" for an optional empty target, and omits targets for goals without them', () => {
    expect(asMap(buildSummaryRows(completeDraft({ goalTarget: { targetWeight: null } })))['target-weight']).toBe(
      'Not set',
    );
    expect(buildSummaryRows(completeDraft({ primaryGoal: 'recomposition' })).map((r) => r.id)).not.toContain(
      'target-weight',
    );
  });

  it('shows derived age, never the date of birth itself', () => {
    const rows = buildSummaryRows(completeDraft(), new Date(2026, 5, 14)); // day before 35th birthday
    expect(asMap(rows)['age']).toBe('34 years');
    expect(rows.some((r) => r.value.includes('1991'))).toBe(false);
  });

  it('links each row to the step that edits it', () => {
    const rows = buildSummaryRows(completeDraft());
    expect(rows.find((r) => r.id === 'weight')?.editStep).toBe('basics');
    expect(rows.find((r) => r.id === 'equipment')?.editStep).toBe('equipment');
  });
});
