import { parseRecurrenceIntervalDays, parseRecurrence, isDueOn, ParsedRecurrence } from '../utils/recurrenceUtils';
import { parseISODate } from '../utils/dateUtils';

describe('parseRecurrenceIntervalDays', () => {
	describe('RRULE format', () => {
		it('FREQ=DAILY returns 1', () => {
			expect(parseRecurrenceIntervalDays('FREQ=DAILY')).toBe(1);
		});

		it('FREQ=DAILY;INTERVAL=2 returns 2', () => {
			expect(parseRecurrenceIntervalDays('FREQ=DAILY;INTERVAL=2')).toBe(2);
		});

		it('FREQ=DAILY;INTERVAL=5 returns 5', () => {
			expect(parseRecurrenceIntervalDays('FREQ=DAILY;INTERVAL=5')).toBe(5);
		});

		it('FREQ=WEEKLY returns 7', () => {
			expect(parseRecurrenceIntervalDays('FREQ=WEEKLY')).toBe(7);
		});

		it('FREQ=WEEKLY;INTERVAL=2 returns 14', () => {
			expect(parseRecurrenceIntervalDays('FREQ=WEEKLY;INTERVAL=2')).toBe(14);
		});

		it('FREQ=MONTHLY returns 30', () => {
			expect(parseRecurrenceIntervalDays('FREQ=MONTHLY')).toBe(30);
		});

		it('FREQ=MONTHLY;INTERVAL=3 returns 90', () => {
			expect(parseRecurrenceIntervalDays('FREQ=MONTHLY;INTERVAL=3')).toBe(90);
		});

		it('is case-insensitive', () => {
			expect(parseRecurrenceIntervalDays('freq=daily')).toBe(1);
			expect(parseRecurrenceIntervalDays('Freq=Weekly')).toBe(7);
			expect(parseRecurrenceIntervalDays('freq=monthly;interval=2')).toBe(60);
		});
	});

	describe('BYDAY average-interval heuristic', () => {
		it('BYDAY=MO,WE,FR (3 days) returns 2', () => {
			expect(parseRecurrenceIntervalDays('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBe(2);
		});

		it('BYDAY=MO,FR (2 days) returns 4', () => {
			expect(parseRecurrenceIntervalDays('FREQ=WEEKLY;BYDAY=MO,FR')).toBe(4);
		});

		it('BYDAY=TU (1 day) returns 7', () => {
			expect(parseRecurrenceIntervalDays('FREQ=WEEKLY;BYDAY=TU')).toBe(7);
		});

		it('BYDAY=MO,TU,WE,TH,FR (5 days) returns 1', () => {
			expect(parseRecurrenceIntervalDays('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe(1);
		});

		it('BYDAY=MO,TU,WE,TH,FR,SA,SU (7 days) returns 1', () => {
			expect(parseRecurrenceIntervalDays('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU')).toBe(1);
		});
	});

	describe('DTSTART prefix stripping', () => {
		it('strips DTSTART before parsing FREQ', () => {
			expect(parseRecurrenceIntervalDays('DTSTART:20250118;FREQ=WEEKLY;BYDAY=FR')).toBe(7);
		});

		it('strips DTSTART with FREQ=DAILY', () => {
			expect(parseRecurrenceIntervalDays('DTSTART:20250101;FREQ=DAILY')).toBe(1);
		});

		it('strips DTSTART case-insensitively', () => {
			expect(parseRecurrenceIntervalDays('dtstart:20250118;FREQ=MONTHLY')).toBe(30);
		});
	});

	describe('legacy human-readable patterns (backward compat)', () => {
		it('"every day" returns 1', () => {
			expect(parseRecurrenceIntervalDays('every day')).toBe(1);
		});

		it('"daily" returns 1', () => {
			expect(parseRecurrenceIntervalDays('daily')).toBe(1);
		});

		it('"every 2 days" returns 2', () => {
			expect(parseRecurrenceIntervalDays('every 2 days')).toBe(2);
		});

		it('"every 10 days" returns 10', () => {
			expect(parseRecurrenceIntervalDays('every 10 days')).toBe(10);
		});

		it('"every week" returns 7', () => {
			expect(parseRecurrenceIntervalDays('every week')).toBe(7);
		});

		it('"weekly" returns 7', () => {
			expect(parseRecurrenceIntervalDays('weekly')).toBe(7);
		});

		it('"every 2 weeks" returns 14', () => {
			expect(parseRecurrenceIntervalDays('every 2 weeks')).toBe(14);
		});

		it('"every month" returns 30', () => {
			expect(parseRecurrenceIntervalDays('every month')).toBe(30);
		});

		it('"monthly" returns 30', () => {
			expect(parseRecurrenceIntervalDays('monthly')).toBe(30);
		});
	});

	describe('edge cases', () => {
		it('unrecognized string returns 1', () => {
			expect(parseRecurrenceIntervalDays('something unknown')).toBe(1);
		});

		it('empty string returns 1', () => {
			expect(parseRecurrenceIntervalDays('')).toBe(1);
		});

		it('whitespace-only returns 1', () => {
			expect(parseRecurrenceIntervalDays('   ')).toBe(1);
		});

		it('trims whitespace around valid RRULE', () => {
			expect(parseRecurrenceIntervalDays('  FREQ=WEEKLY  ')).toBe(7);
		});

		it('unrecognized FREQ returns 1', () => {
			expect(parseRecurrenceIntervalDays('FREQ=YEARLY')).toBe(1);
		});
	});
});

describe('parseRecurrence', () => {
	describe('weekly-bydays', () => {
		it('parses BYDAY=MO,WE,FR into weekday set', () => {
			expect(parseRecurrence('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toEqual({
				kind: 'weekly-bydays',
				byDays: new Set([1, 3, 5]),
			});
		});

		it('parses single-day BYDAY=TU', () => {
			expect(parseRecurrence('FREQ=WEEKLY;BYDAY=TU')).toEqual({
				kind: 'weekly-bydays',
				byDays: new Set([2]),
			});
		});

		it('parses all seven days', () => {
			expect(parseRecurrence('FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA')).toEqual({
				kind: 'weekly-bydays',
				byDays: new Set([0, 1, 2, 3, 4, 5, 6]),
			});
		});

		it('is case-insensitive', () => {
			expect(parseRecurrence('freq=weekly;byday=mo,fr')).toEqual({
				kind: 'weekly-bydays',
				byDays: new Set([1, 5]),
			});
		});

		it('strips DTSTART prefix', () => {
			expect(parseRecurrence('DTSTART:20250118;FREQ=WEEKLY;BYDAY=FR')).toEqual({
				kind: 'weekly-bydays',
				byDays: new Set([5]),
			});
		});

		it('warns and falls back to daily on unrecognized BYDAY token', () => {
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
			expect(parseRecurrence('FREQ=WEEKLY;BYDAY=MO,XX')).toEqual({ kind: 'interval', days: 1 });
			expect(warnSpy).toHaveBeenCalled();
			warnSpy.mockRestore();
		});

		it('warns and falls back to daily on empty BYDAY', () => {
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
			expect(parseRecurrence('FREQ=WEEKLY;BYDAY=')).toEqual({ kind: 'interval', days: 1 });
			expect(warnSpy).toHaveBeenCalled();
			warnSpy.mockRestore();
		});

		it('warns and ignores INTERVAL>1 combined with BYDAY (treats as weekly)', () => {
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
			expect(parseRecurrence('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO')).toEqual({
				kind: 'weekly-bydays',
				byDays: new Set([1]),
			});
			expect(warnSpy).toHaveBeenCalled();
			warnSpy.mockRestore();
		});
	});

	describe('monthly-bymonthday', () => {
		it('parses BYMONTHDAY=1,15 into day-of-month set', () => {
			expect(parseRecurrence('FREQ=MONTHLY;BYMONTHDAY=1,15')).toEqual({
				kind: 'monthly-bymonthday',
				byMonthDays: new Set([1, 15]),
			});
		});

		it('parses single BYMONTHDAY=1', () => {
			expect(parseRecurrence('FREQ=MONTHLY;BYMONTHDAY=1')).toEqual({
				kind: 'monthly-bymonthday',
				byMonthDays: new Set([1]),
			});
		});

		it('warns and falls back to daily on out-of-range BYMONTHDAY', () => {
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
			expect(parseRecurrence('FREQ=MONTHLY;BYMONTHDAY=32')).toEqual({ kind: 'interval', days: 1 });
			expect(parseRecurrence('FREQ=MONTHLY;BYMONTHDAY=0')).toEqual({ kind: 'interval', days: 1 });
			expect(warnSpy).toHaveBeenCalled();
			warnSpy.mockRestore();
		});

		it('warns and falls back to daily on non-numeric BYMONTHDAY', () => {
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
			expect(parseRecurrence('FREQ=MONTHLY;BYMONTHDAY=FIRST')).toEqual({ kind: 'interval', days: 1 });
			expect(warnSpy).toHaveBeenCalled();
			warnSpy.mockRestore();
		});
	});

	describe('interval fallthrough', () => {
		it('FREQ=DAILY delegates to scalar interval', () => {
			expect(parseRecurrence('FREQ=DAILY')).toEqual({ kind: 'interval', days: 1 });
		});

		it('FREQ=DAILY;INTERVAL=3 delegates to scalar interval', () => {
			expect(parseRecurrence('FREQ=DAILY;INTERVAL=3')).toEqual({ kind: 'interval', days: 3 });
		});

		it('FREQ=WEEKLY without BYDAY delegates to scalar interval', () => {
			expect(parseRecurrence('FREQ=WEEKLY')).toEqual({ kind: 'interval', days: 7 });
		});

		it('FREQ=MONTHLY without BYMONTHDAY delegates to scalar interval', () => {
			expect(parseRecurrence('FREQ=MONTHLY')).toEqual({ kind: 'interval', days: 30 });
		});

		it('legacy "every day" delegates to scalar interval', () => {
			expect(parseRecurrence('every day')).toEqual({ kind: 'interval', days: 1 });
		});

		it('legacy "every 2 weeks" delegates to scalar interval', () => {
			expect(parseRecurrence('every 2 weeks')).toEqual({ kind: 'interval', days: 14 });
		});

		it('unrecognized string falls back to daily (with warning)', () => {
			const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
			expect(parseRecurrence('something unknown')).toEqual({ kind: 'interval', days: 1 });
			warnSpy.mockRestore();
		});
	});
});

describe('isDueOn', () => {
	describe('interval kind (rolling window — must match legacy math)', () => {
		const every2: ParsedRecurrence = { kind: 'interval', days: 2 };

		it('due when no prior completion exists', () => {
			expect(isDueOn(every2, parseISODate('2025-01-15'), null)).toBe(true);
		});

		it('not due when gap < interval (rest day)', () => {
			// completed yesterday, interval 2 → gap 1 < 2 → not due
			expect(isDueOn(every2, parseISODate('2025-01-15'), parseISODate('2025-01-14'))).toBe(false);
		});

		it('due when gap == interval', () => {
			expect(isDueOn(every2, parseISODate('2025-01-15'), parseISODate('2025-01-13'))).toBe(true);
		});

		it('due when gap > interval', () => {
			expect(isDueOn(every2, parseISODate('2025-01-15'), parseISODate('2025-01-10'))).toBe(true);
		});

		it('daily habit is due every day after a completion', () => {
			const daily: ParsedRecurrence = { kind: 'interval', days: 1 };
			expect(isDueOn(daily, parseISODate('2025-01-15'), parseISODate('2025-01-14'))).toBe(true);
		});
	});

	describe('weekly-bydays kind (fixed weekdays, ignores completions)', () => {
		// 2025-01-13 is a Monday
		const monWedFri: ParsedRecurrence = { kind: 'weekly-bydays', byDays: new Set([1, 3, 5]) };

		it('due on a listed weekday', () => {
			expect(isDueOn(monWedFri, parseISODate('2025-01-13'), null)).toBe(true);  // Mon
			expect(isDueOn(monWedFri, parseISODate('2025-01-15'), null)).toBe(true);  // Wed
			expect(isDueOn(monWedFri, parseISODate('2025-01-17'), null)).toBe(true);  // Fri
		});

		it('not due on an unlisted weekday', () => {
			expect(isDueOn(monWedFri, parseISODate('2025-01-14'), null)).toBe(false); // Tue
			expect(isDueOn(monWedFri, parseISODate('2025-01-16'), null)).toBe(false); // Thu
			expect(isDueOn(monWedFri, parseISODate('2025-01-18'), null)).toBe(false); // Sat
			expect(isDueOn(monWedFri, parseISODate('2025-01-19'), null)).toBe(false); // Sun
		});

		it('ignores completion history', () => {
			// completed the day before — Wednesday is still due
			expect(isDueOn(monWedFri, parseISODate('2025-01-15'), parseISODate('2025-01-14'))).toBe(true);
			// no completion ever — Saturday still not due
			expect(isDueOn(monWedFri, parseISODate('2025-01-18'), null)).toBe(false);
		});
	});

	describe('monthly-bymonthday kind (fixed days of month)', () => {
		const firstAndFifteenth: ParsedRecurrence = { kind: 'monthly-bymonthday', byMonthDays: new Set([1, 15]) };

		it('due on a listed day of month', () => {
			expect(isDueOn(firstAndFifteenth, parseISODate('2025-02-01'), null)).toBe(true);
			expect(isDueOn(firstAndFifteenth, parseISODate('2025-02-15'), null)).toBe(true);
		});

		it('not due on other days', () => {
			expect(isDueOn(firstAndFifteenth, parseISODate('2025-02-02'), null)).toBe(false);
			expect(isDueOn(firstAndFifteenth, parseISODate('2025-02-28'), null)).toBe(false);
		});
	});
});
