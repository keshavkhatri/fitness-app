import { REPORT_TODAY, notOnReport, reportReading, uncertain, unreadable } from '../testing/report-fixtures';
import { basicsFormFromDraft, validateBasicsForm } from '../validation/onboarding-validation';
import { EMPTY_DRAFT } from './onboarding-draft';
import { applyReportPrefill, reportFieldNotes, reportReviewSummary } from './report-review';

const emptyForm = basicsFormFromDraft(EMPTY_DRAFT);

describe('applyReportPrefill', () => {
  it('fills in sex, height and weight from the report, never the date of birth', () => {
    const form = applyReportPrefill(emptyForm, reportReading().prefill);

    expect(form).toMatchObject({ sex: 'female', heightCm: '172', weight: '68.4' });
    expect([form.birthDay, form.birthMonth, form.birthYear]).toEqual(['', '', '']);
  });

  it('keeps the decimal of a printed height', () => {
    const form = applyReportPrefill(emptyForm, reportReading({ profile: { height: { status: 'read', text: '172.4', unit: 'cm', sourceLabel: 'Height' } } }).prefill);
    expect(form.heightCm).toBe('172.4');
  });

  it('keeps what the user already entered for fields the report could not fill', () => {
    const manual = { ...emptyForm, birthDay: '15', birthMonth: '6', birthYear: '1991', sex: 'female' as const, heightCm: '168' };
    const reading = reportReading({ profile: { gender: notOnReport, height: unreadable('Height') } });

    const form = applyReportPrefill(manual, reading.prefill);

    expect(form).toMatchObject({ birthDay: '15', birthMonth: '6', birthYear: '1991', sex: 'female', heightCm: '168', weight: '68.4' });
  });

  it('converts into the user’s unit system', () => {
    const form = applyReportPrefill({ ...emptyForm, unitSystem: 'imperial' }, reportReading().prefill);
    expect(form).toMatchObject({ heightFeet: '5', heightInches: '8', weight: '150.8' });
  });

  it('gives a form that still has to pass the usual validation (date of birth is required)', () => {
    const form = applyReportPrefill(emptyForm, reportReading().prefill);
    const result = validateBasicsForm(form, new Date(`${REPORT_TODAY}T12:00:00`));
    expect(result.ok).toBe(false);
    expect(result.ok ? null : Object.keys(result.errors)).toEqual(['dateOfBirth']);
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
