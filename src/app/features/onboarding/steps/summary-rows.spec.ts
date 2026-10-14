import { completeDraft } from '../testing/draft-fixtures';
import { buildSummaryRows, groupSummaryRows } from './summary-rows';

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

  it('lists answers in the order they are asked, and marks unanswered ones', () => {
    expect(buildSummaryRows(completeDraft(), NOW).map((r) => r.id)).toEqual([
      'name', 'age', 'sex', 'height', 'weight', 'units', 'activity', 'goal', 'target-weight', 'experience', 'training', 'location', 'equipment',
    ]);
    const partial = asMap(buildSummaryRows(completeDraft({ basics: { ...completeDraft().basics, weight: null } }), NOW));
    expect(partial['weight']).toBe('Not answered');
    expect(partial['height']).toBe('168 cm');
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
    expect(Object.fromEntries(rows.map((r) => [r.id, r.editStep]))).toMatchObject({
      name: 'basics',
      age: 'basics',
      sex: 'basics',
      height: 'height',
      weight: 'weight',
      units: 'height',
      activity: 'activity',
      goal: 'goal',
    });
    expect(rows.find((r) => r.id === 'equipment')?.editStep).toBe('equipment');
  });
});

describe('groupSummaryRows', () => {
  it('puts every row in exactly one group, keeping order', () => {
    const rows = [
      { id: 'name', label: 'Name', value: 'Alex', editStep: 'basics' },
      { id: 'goal', label: 'Goal', value: 'Lose Fat', editStep: 'goal' },
      { id: 'age', label: 'Age', value: '31 years', editStep: 'basics' },
      { id: 'experience', label: 'Experience', value: 'Beginner', editStep: 'experience' },
      { id: 'target-weight', label: 'Target weight', value: 'Not set', editStep: 'goal-target' },
      { id: 'activity', label: 'Activity', value: 'Sedentary', editStep: 'activity' },
    ] as const;
    const groups = groupSummaryRows(rows);
    expect(groups.map((g) => [g.title, g.rows.map((r) => r.id)])).toEqual([
      ['Personal details', ['name', 'age', 'activity']],
      ['Goal', ['goal', 'target-weight']],
      ['Training', ['experience']],
    ]);
    expect(groups.flatMap((g) => g.rows)).toHaveLength(rows.length);
  });
});
