import {
  CalendarDate,
  ageOn,
  calendarDateOf,
  currentAge,
  isValidCalendarDate,
  parseIsoCalendarDate,
  toIsoCalendarDate,
} from './date-of-birth';

const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });

describe('date of birth', () => {
  describe('ageOn', () => {
    const dob = d(1990, 6, 15);

    it('does not count the year until the birthday has occurred', () => {
      expect(ageOn(dob, d(2026, 1, 1))).toBe(35); // earlier month
      expect(ageOn(dob, d(2026, 6, 14))).toBe(35); // day before
    });

    it('counts the year on and after the birthday', () => {
      expect(ageOn(dob, d(2026, 6, 15))).toBe(36); // on the day
      expect(ageOn(dob, d(2026, 6, 16))).toBe(36); // day after
      expect(ageOn(dob, d(2026, 12, 31))).toBe(36); // later month
    });

    it('treats a 29 February birthday as reached on 1 March in non-leap years', () => {
      const leapling = d(2000, 2, 29);
      expect(ageOn(leapling, d(2026, 2, 28))).toBe(25);
      expect(ageOn(leapling, d(2026, 3, 1))).toBe(26);
      expect(ageOn(leapling, d(2028, 2, 29))).toBe(28);
    });

    it('is negative before birth', () => {
      expect(ageOn(dob, d(1990, 6, 14))).toBe(-1);
    });
  });

  describe('currentAge', () => {
    it('derives age from a stored ISO date using the local calendar date of `now`', () => {
      expect(currentAge('1990-06-15', new Date(2026, 5, 14, 23, 59))).toBe(35);
      expect(currentAge('1990-06-15', new Date(2026, 5, 15, 0, 1))).toBe(36);
    });

    it('returns null for invalid stored values', () => {
      expect(currentAge('15/06/1990')).toBeNull();
    });
  });

  describe('ISO calendar dates', () => {
    it('formats with zero padding and round-trips', () => {
      expect(toIsoCalendarDate(d(1990, 4, 3))).toBe('1990-04-03');
      expect(parseIsoCalendarDate('1990-04-03')).toEqual(d(1990, 4, 3));
    });

    it('rejects dates that do not exist', () => {
      expect(isValidCalendarDate(d(2023, 2, 29))).toBe(false);
      expect(isValidCalendarDate(d(2024, 2, 29))).toBe(true);
      expect(isValidCalendarDate(d(1900, 2, 29))).toBe(false); // century rule
      expect(isValidCalendarDate(d(2000, 2, 29))).toBe(true); // 400-year rule
      expect(isValidCalendarDate(d(1990, 4, 31))).toBe(false);
      expect(toIsoCalendarDate(d(1990, 13, 1))).toBeNull();
    });

    it.each(['1990-4-3', '1990/04/03', '03-04-1990', '1990-02-30', '1990-00-10', '', 19900403, null])(
      'rejects malformed value %s',
      (value) => {
        expect(parseIsoCalendarDate(value)).toBeNull();
      },
    );

    it('reads the local calendar date of an instant', () => {
      expect(calendarDateOf(new Date(2026, 9, 7, 23, 30))).toEqual(d(2026, 10, 7));
    });
  });
});
