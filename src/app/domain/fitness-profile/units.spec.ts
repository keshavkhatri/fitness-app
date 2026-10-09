import {
  formatHeight,
  formatWeight,
  heightFromFeetInches,
  parseDecimal,
  parseDecimalInput,
  parseWholeNumber,
  toFeetInches,
  weightFromPounds,
  weightInUnit,
} from './units';

describe('units', () => {
  describe('height', () => {
    it('converts feet + inches to canonical centimeters', () => {
      expect(heightFromFeetInches(5, 10).centimeters).toBe(177.8);
      expect(heightFromFeetInches(6, 0).centimeters).toBe(182.9);
    });

    it('round-trips imperial input exactly at display precision', () => {
      for (let feet = 4; feet <= 7; feet++) {
        for (let inches = 0; inches < 12; inches++) {
          expect(toFeetInches(heightFromFeetInches(feet, inches))).toEqual({ feet, inches });
        }
      }
    });

    it('never displays 12 inches', () => {
      // 182.8 cm = 71.97 in → 6 ft 0 in, not 5 ft 12 in.
      expect(toFeetInches({ centimeters: 182.8 })).toEqual({ feet: 6, inches: 0 });
    });

    it('formats in the chosen unit system', () => {
      expect(formatHeight({ centimeters: 177.8 }, 'metric')).toBe('178 cm');
      expect(formatHeight({ centimeters: 177.8 }, 'imperial')).toBe('5 ft 10 in');
    });
  });

  describe('weight', () => {
    it('round-trips pounds through canonical kilograms', () => {
      for (const pounds of [100, 165.5, 180, 207.7, 315]) {
        expect(weightInUnit(weightFromPounds(pounds), 'imperial')).toBe(pounds);
      }
    });

    it('formats in the chosen unit system', () => {
      expect(formatWeight({ kilograms: 94.2 }, 'metric')).toBe('94.2 kg');
      expect(formatWeight({ kilograms: 94.2 }, 'imperial')).toBe('207.7 lb');
    });
  });

  describe('parsing user input', () => {
    it('accepts dot or comma decimals and surrounding spaces', () => {
      expect(parseDecimal('82.5')).toBe(82.5);
      expect(parseDecimal(' 82,5 ')).toBe(82.5);
      expect(parseDecimal('82')).toBe(82);
    });

    it('rejects anything that is not a plain non-negative number', () => {
      for (const text of ['', ' ', 'abc', '-5', '8.2.1', '1e3', '82kg', '.5']) {
        expect(parseDecimal(text)).toBeNull();
      }
    });

    it('parses whole numbers only', () => {
      expect(parseWholeNumber('34')).toBe(34);
      expect(parseWholeNumber('34.5')).toBeNull();
      expect(parseWholeNumber('')).toBeNull();
    });


    describe('strict decimal input (food values)', () => {
      const read = (text: string) => parseDecimalInput(text);

      it('reads one decimal separator, dot or comma', () => {
        expect(read('32.5')).toEqual({ kind: 'number', value: 32.5 });
        expect(read(' 32,5 ')).toEqual({ kind: 'number', value: 32.5 });
        expect(read('0,125')).toEqual({ kind: 'number', value: 0.125 });
        expect(read('1234,5')).toEqual({ kind: 'number', value: 1234.5 });
        expect(read('10000')).toEqual({ kind: 'number', value: 10000 });
        expect(read('0')).toEqual({ kind: 'number', value: 0 });
        expect(read('-0')).toEqual({ kind: 'number', value: 0 });
        expect(read('-5')).toEqual({ kind: 'number', value: -5 });
      });

      it('never guesses at possible thousands separators', () => {
        for (const text of ['1,234', '1.234', '10,000', '999.500', '-1,234', '1,234.5', '1.234,5', '1,234,567', '1.234.567']) {
          expect(read(text)).toEqual({ kind: 'ambiguous' });
        }
      });

      it('treats blank and malformed text as empty or invalid', () => {
        expect(read('')).toEqual({ kind: 'empty' });
        expect(read('   ')).toEqual({ kind: 'empty' });
        for (const text of ['abc', 'NaN', 'Infinity', '-Infinity', '1e3', '+5', '.5', '5.', '1 234', '12kg', '--5', '1'.padEnd(400, '0')]) {
          expect(read(text)).toEqual({ kind: 'invalid' });
        }
      });

      it('leaves the lenient onboarding parser unchanged', () => {
        expect(parseDecimal('82,5')).toBe(82.5);
        expect(parseDecimal('1,234')).toBe(1.234);
      });
    });
  });
});
