import { parseRecurrenceIntervalDays } from '../utils/recurrenceUtils';

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
