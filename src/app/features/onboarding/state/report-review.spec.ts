import { notOnReport, reportReading, uncertain, unreadable } from '../testing/report-fixtures';
import { reportFieldNotes, reportPrefillValues, reportReviewSummary } from './report-review';

describe('reportPrefillValues', () => {
  it('gives sex, height and weight from the report in canonical units, never a date of birth', () => {
    expect(reportPrefillValues(reportReading().prefill)).toEqual({ sex: 'female', height: { centimeters: 172 }, weight: { kilograms: 68.4 } });
  });

  it('keeps the decimal of a printed height (not rounded to a ruler mark)', () => {
    const reading = reportReading({ profile: { height: { status: 'read', text: '172.4', unit: 'cm', sourceLabel: 'Height' } } });
    expect(reportPrefillValues(reading.prefill).height).toEqual({ centimeters: 172.4 });
  });

  it('leaves out what the report could not fill, so those screens keep the user’s answer', () => {
    const reading = reportReading({ profile: { gender: notOnReport, height: unreadable('Height') } });
    expect(reportPrefillValues(reading.prefill)).toEqual({ weight: { kilograms: 68.4 } });
  });
});

describe('reportFieldNotes', () => {
  it('shows the printed value and unit for values read', () => {
    const notes = reportFieldNotes(reportReading());
    expect(notes.height).toEqual({ tone: 'read', text: 'From your report: 172 cm' });
    expect(notes.weight).toEqual({ tone: 'read', text: 'From your report: 68.4 kg' });
    expect(notes.sex).toEqual({ tone: 'read', text: 'From your report: Female' });
  });

  it('flags uncertain readings for checking', () => {
    const notes = reportFieldNotes(reportReading({ measurements: { weight: uncertain('68.4', 'kg', 'Weight') } }));
    expect(notes.weight.tone).toBe('check');
    expect(notes.weight.text).toContain('68.4 kg');
  });

  it('tells unreadable, absent, unusable and implausible values apart', () => {
    const notes = reportFieldNotes(
      reportReading({
        profile: { height: unreadable('Height'), gender: { status: 'read', text: 'Other', unit: null, sourceLabel: 'Gender' } },
        measurements: { weight: { status: 'read', text: '900', unit: 'kg', sourceLabel: 'Weight' } },
      }),
    );
    expect(notes.height).toEqual({ tone: 'missing', text: "Couldn't be read from your report. Enter it yourself." });
    expect(notes.sex.text).toContain('“Other”');
    expect(notes.weight.text).toContain('900 kg');
    expect(notes.weight.text).toContain('outside the range');

    const absent = reportFieldNotes(reportReading({ profile: { height: notOnReport } }));
    expect(absent.height).toEqual({ tone: 'missing', text: 'Not found on your report. Enter it yourself.' });
  });

  it('mentions the report’s age without turning it into a date of birth', () => {
    expect(reportFieldNotes(reportReading()).dateOfBirth.text).toContain('age 38');
    expect(reportFieldNotes(reportReading({ profile: { age: notOnReport } })).dateOfBirth.text).not.toContain('age');
  });
});

describe('reportReviewSummary', () => {
  it('summarises the test date and what was filled in', () => {
    expect(reportReviewSummary(reportReading())).toEqual({ testDate: 'Sep 14, 2026', filled: 3, needsCheck: 0, warnings: [] });
  });

  it('counts uncertain values and lists whole-report problems', () => {
    const summary = reportReviewSummary(
      reportReading({
        reportIssues: ['low-image-quality'],
        metadata: { 'report-model': { status: 'read', text: 'InBody570', unit: null, sourceLabel: '[InBody570]' } },
        profile: { height: uncertain('172', 'cm', 'Height'), gender: unreadable() },
      }),
    );
    expect(summary).toMatchObject({ filled: 2, needsCheck: 1 });
    expect(summary.warnings).toHaveLength(2);
    expect(summary.warnings[1]).toContain("hasn't been checked");
  });
});
