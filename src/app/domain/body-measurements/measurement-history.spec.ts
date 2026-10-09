import { MeasurementEntry, MeasurementValues } from './measurement-entry';
import { latestMeasurements, measurementHistory } from './measurement-history';

const entry = (id: string, date: string, values: MeasurementValues, createdAt = `${date}T07:00:00.000Z`): MeasurementEntry => ({
  id,
  date,
  values,
  createdAt,
  updatedAt: createdAt,
});

describe('measurement history (domain)', () => {
  it('orders newest first by date, then creation time, then id', () => {
    const entries = [
      entry('b', '2026-10-08', { waist: { centimeters: 80 } }, '2026-10-08T06:00:00.000Z'),
      entry('old', '2026-10-01', { waist: { centimeters: 82 } }),
      entry('c', '2026-10-08', { waist: { centimeters: 79 } }, '2026-10-08T18:00:00.000Z'),
      entry('a', '2026-10-08', { waist: { centimeters: 81 } }, '2026-10-08T06:00:00.000Z'),
    ];
    expect(measurementHistory(entries).map((e) => e.id)).toEqual(['c', 'b', 'a', 'old']);
    expect(measurementHistory([...entries].reverse()).map((e) => e.id)).toEqual(['c', 'b', 'a', 'old']);
    expect(entries.map((e) => e.id)).toEqual(['b', 'old', 'c', 'a']);
  });

  it('gives each site its latest recorded value, from whichever entry recorded it last', () => {
    const older = entry('older', '2026-10-01', { waist: { centimeters: 82 }, arm: { centimeters: 33 } });
    const newer = entry('newer', '2026-10-08', { waist: { centimeters: 80.5 }, hips: { centimeters: 99 } });
    expect(latestMeasurements([newer, older])).toEqual([
      { site: 'waist', value: { centimeters: 80.5 }, entry: newer },
      { site: 'chest', value: null, entry: null },
      { site: 'hips', value: { centimeters: 99 }, entry: newer },
      { site: 'arm', value: { centimeters: 33 }, entry: older },
      { site: 'thigh', value: null, entry: null },
    ]);
  });

  it('nothing recorded: every site is empty', () => {
    expect(latestMeasurements([]).every((s) => s.value === null && s.entry === null)).toBe(true);
  });
});
