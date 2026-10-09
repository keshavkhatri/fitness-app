import { MeasurementEntry, MeasurementValues } from './measurement-entry';
import { latestMeasurements, measurementHistory, siteChange } from './measurement-history';

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

describe('site change (domain)', () => {
  it('no previous reading of the site: no change', () => {
    const only = entry('only', '2026-10-08', { waist: { centimeters: 80 } });
    expect(siteChange([only], 'waist', 'metric')).toBeNull();
    expect(siteChange([only], 'hips', 'metric')).toBeNull();
    expect(siteChange([], 'waist', 'metric')).toBeNull();
  });

  it('two readings: latest − previous, signed', () => {
    const previous = entry('p', '2026-09-12', { waist: { centimeters: 82 } });
    const latest = entry('l', '2026-10-08', { waist: { centimeters: 80.8 } });
    expect(siteChange([latest, previous], 'waist', 'metric')).toEqual({ site: 'waist', latest, previous, change: -1.2 });
    const up = entry('u', '2026-10-09', { waist: { centimeters: 81.5 } });
    expect(siteChange([previous, latest, up], 'waist', 'metric')?.change).toBe(0.7);
  });

  it('three or more readings: compares only the two most recent', () => {
    const entries = [
      entry('a', '2026-09-01', { hips: { centimeters: 105 } }),
      entry('c', '2026-10-01', { hips: { centimeters: 100 } }),
      entry('b', '2026-09-15', { hips: { centimeters: 102 } }),
    ];
    const result = siteChange(entries, 'hips', 'metric');
    expect([result?.latest.id, result?.previous.id, result?.change]).toEqual(['c', 'b', -2]);
  });

  it('compares a site only with itself, across entries that recorded different sites on different dates', () => {
    const entries = [
      entry('1', '2026-09-01', { waist: { centimeters: 84 }, arm: { centimeters: 32 } }),
      entry('2', '2026-09-10', { hips: { centimeters: 100 } }),
      entry('3', '2026-09-20', { arm: { centimeters: 33 } }),
      entry('4', '2026-10-01', { waist: { centimeters: 82 }, hips: { centimeters: 99.5 } }),
    ];
    const ids = (site: 'waist' | 'hips' | 'arm') => {
      const c = siteChange(entries, site, 'metric');
      return [c?.latest.id, c?.previous.id, c?.change];
    };
    expect(ids('waist')).toEqual(['4', '1', -2]);
    expect(ids('hips')).toEqual(['4', '2', -0.5]);
    expect(ids('arm')).toEqual(['3', '1', 1]);
    expect(siteChange(entries, 'chest', 'metric')).toBeNull();
  });

  it('same-day readings follow the history order (creation time, then id), whatever the input order', () => {
    const am = entry('am', '2026-10-08', { waist: { centimeters: 81 } }, '2026-10-08T06:00:00.000Z');
    const pm = entry('pm', '2026-10-08', { waist: { centimeters: 80 } }, '2026-10-08T18:00:00.000Z');
    const pmB = entry('b', '2026-10-08', { waist: { centimeters: 79 } }, '2026-10-08T18:00:00.000Z');
    for (const input of [[am, pm, pmB], [pmB, pm, am], [pm, am, pmB]]) {
      const c = siteChange(input, 'waist', 'metric');
      expect([c?.latest.id, c?.previous.id, c?.change]).toEqual(['pm', 'b', 1]);
    }
  });

  it('is computed from the displayed values in the unit system; zero is 0, not -0', () => {
    const previous = entry('p', '2026-09-12', { waist: { centimeters: 81.28 } }); // 32.0 in
    const latest = entry('l', '2026-10-08', { waist: { centimeters: 80.01 } }); // 31.5 in
    expect(siteChange([previous, latest], 'waist', 'imperial')?.change).toBe(-0.5);
    expect(siteChange([previous, latest], 'waist', 'metric')?.change).toBe(-1.3);
    // 80.26 and 80.30 both show as 80.3 cm: no visible difference.
    const same = [entry('x', '2026-10-01', { waist: { centimeters: 80.3 } }), entry('y', '2026-10-02', { waist: { centimeters: 80.26 } })];
    expect(Object.is(siteChange(same, 'waist', 'metric')?.change, 0)).toBe(true);
  });
});
