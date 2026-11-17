import { GraphRenderer } from '../graphRenderer';
import { parseISODate } from '../utils/dateUtils';
import { computeHabitStats, formatHabitStatsTooltip } from '../utils/habitStats';

// Same fixed "today" as graphRenderer.test.ts: Wed 2025-01-15, local time.
beforeAll(() => {
	jest.useFakeTimers();
	jest.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
});

afterAll(() => {
	jest.useRealTimers();
});

const dates = (isos: string[]) => isos.map(parseISODate);
const DAILY = 'FREQ=DAILY';
const EVERY3 = 'FREQ=DAILY;INTERVAL=3';
const MWF = 'FREQ=WEEKLY;BYDAY=MO,WE,FR';

describe('computeHabitStats', () => {
	describe('longestStreak', () => {
		it('skipped days do not break the run', () => {
			// 01-09 missed, 10 11 done, 12 skipped, 13 14 done, today undone
			const cells = GraphRenderer.generateDayCells(dates(['2025-01-10', '2025-01-11', '2025-01-13', '2025-01-14']), 6, 0, DAILY, dates(['2025-01-12']));
			expect(computeHabitStats(cells, 0).longestStreak).toBe(4);
		});

		it('a missed due day breaks the run and the longer earlier run wins', () => {
			// 05–08 done (4), 09 missed, 10–12 done (3), 13 14 missed
			const cells = GraphRenderer.generateDayCells(
				dates(['2025-01-05', '2025-01-06', '2025-01-07', '2025-01-08', '2025-01-10', '2025-01-11', '2025-01-12']),
				10, 0, DAILY,
			);
			expect(computeHabitStats(cells, 0).longestStreak).toBe(4);
		});

		it('an undone due today does not end or break the run that ended yesterday', () => {
			const completions = dates(['2025-01-12', '2025-01-13', '2025-01-14']);
			const cells = GraphRenderer.generateDayCells(completions, 3, 0, DAILY);
			const current = GraphRenderer.calculateStreak(completions, [], DAILY);
			expect(current).toBe(0);
			expect(computeHabitStats(cells, current).longestStreak).toBe(3);
		});

		it('matches calculateStreak when today is done (parity)', () => {
			const scenarios: { completions: string[]; skipped: string[]; pattern: string; daysBefore: number }[] = [
				{ completions: ['2025-01-10', '2025-01-11', '2025-01-13', '2025-01-14', '2025-01-15'], skipped: ['2025-01-12'], pattern: DAILY, daysBefore: 6 },
				{ completions: ['2025-01-09', '2025-01-12', '2025-01-15'], skipped: [], pattern: EVERY3, daysBefore: 6 },
				{ completions: ['2025-01-10', '2025-01-13', '2025-01-15'], skipped: [], pattern: MWF, daysBefore: 9 },
			];
			for (const s of scenarios) {
				const completions = dates(s.completions);
				const skipped = dates(s.skipped);
				const cells = GraphRenderer.generateDayCells(completions, s.daysBefore, 0, s.pattern, skipped);
				const streak = GraphRenderer.calculateStreak(completions, skipped, s.pattern);
				expect(streak).toBeGreaterThan(0);
				// No clamp: the windowed longest alone must equal calculateStreak.
				expect(computeHabitStats(cells, 0).longestStreak).toBe(streak);
			}
		});

		it('is never smaller than the current streak', () => {
			// Done every day since 01-01, but the window only shows the last 4 days.
			const completions = dates(Array.from({ length: 15 }, (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`));
			const cells = GraphRenderer.generateDayCells(completions, 3, 0, DAILY);
			const current = GraphRenderer.calculateStreak(completions, [], DAILY);
			expect(current).toBe(15);
			expect(computeHabitStats(cells, 0).longestStreak).toBe(4);
			expect(computeHabitStats(cells, current).longestStreak).toBe(15);
		});
	});

	describe('completion rate', () => {
		it('excludes rest days from the denominator', () => {
			// Every 3 days: 09 12 15 done, the days between are rest days.
			const cells = GraphRenderer.generateDayCells(dates(['2025-01-09', '2025-01-12', '2025-01-15']), 6, 0, EVERY3);
			const stats = computeHabitStats(cells, 0);
			expect(stats.dueDays).toBe(3);
			expect(stats.completedDays).toBe(3);
			expect(stats.ratePercent).toBe(100);
		});

		it('excludes skipped days from the denominator', () => {
			// 12 skipped, 13 14 15 done.
			const cells = GraphRenderer.generateDayCells(dates(['2025-01-13', '2025-01-14', '2025-01-15']), 3, 0, DAILY, dates(['2025-01-12']));
			const stats = computeHabitStats(cells, 0);
			expect(stats.completedDays).toBe(3);
			expect(stats.dueDays).toBe(3);
			expect(stats.ratePercent).toBe(100);

			// 12 skipped, 13 done, 14 missed, 15 done: 2/3 = 67%. Counting the
			// skip as due would give 2/4 = 50%, as done 3/4 = 75%.
			const mixed = computeHabitStats(
				GraphRenderer.generateDayCells(dates(['2025-01-13', '2025-01-15']), 3, 0, DAILY, dates(['2025-01-12'])),
				0
			);
			expect(mixed.completedDays).toBe(2);
			expect(mixed.dueDays).toBe(3);
			expect(mixed.ratePercent).toBe(67);
		});

		it('counts today only when done', () => {
			const undone = computeHabitStats(GraphRenderer.generateDayCells(dates(['2025-01-13', '2025-01-14']), 2, 0, DAILY), 0);
			expect(undone).toMatchObject({ completedDays: 2, dueDays: 2, ratePercent: 100 });
			const done = computeHabitStats(GraphRenderer.generateDayCells(dates(['2025-01-13', '2025-01-14', '2025-01-15']), 2, 0, DAILY), 0);
			expect(done).toMatchObject({ completedDays: 3, dueDays: 3, ratePercent: 100 });
		});

		it('counts a completion on a non-due day in both numerator and denominator', () => {
			// MWF: Mon 13 and Wed 15 are due; Tue 14 isn't, but was done anyway.
			const cells = GraphRenderer.generateDayCells(dates(['2025-01-13', '2025-01-14', '2025-01-15']), 2, 0, MWF);
			expect(computeHabitStats(cells, 0)).toMatchObject({ completedDays: 3, dueDays: 3, ratePercent: 100 });
		});

		it('is null with zero due days', () => {
			// Tue/Thu habit, window = today (a Wednesday) only.
			const cells = GraphRenderer.generateDayCells([], 0, 0, 'FREQ=WEEKLY;BYDAY=TU,TH');
			expect(computeHabitStats(cells, 0)).toMatchObject({ completedDays: 0, dueDays: 0, ratePercent: null });
		});
	});

	it('interval habit (every 3 days, rolling window) stats', () => {
		// 06 09 12 done, rest days between; today (gap 3) is due but undone, so neutral.
		const completions = dates(['2025-01-06', '2025-01-09', '2025-01-12']);
		const cells = GraphRenderer.generateDayCells(completions, 9, 0, EVERY3);
		const stats = computeHabitStats(cells, GraphRenderer.calculateStreak(completions, [], EVERY3));
		expect(stats).toEqual({ longestStreak: 3, completedDays: 3, dueDays: 3, ratePercent: 100 });
	});

	it('scheduled-anchor interval habit stats', () => {
		// Every 3 days anchored to 01-09: 09 and 12 done, the rest are rest days, today undone.
		const completions = dates(['2025-01-09', '2025-01-12']);
		const scheduled = parseISODate('2025-01-09');
		const cells = GraphRenderer.generateDayCells(completions, 9, 0, EVERY3, [], 'scheduled', scheduled);
		const stats = computeHabitStats(cells, GraphRenderer.calculateStreak(completions, [], EVERY3, 'scheduled', scheduled));
		expect(stats).toEqual({ longestStreak: 2, completedDays: 2, dueDays: 2, ratePercent: 100 });
	});

	it('fixed-schedule weekly habit stats (carry-over days are neutral)', () => {
		// MWF: 06 08 10 done; Mon 13 missed (missed-overdue), done on Tue 14; today undone.
		const completions = dates(['2025-01-06', '2025-01-08', '2025-01-10', '2025-01-14']);
		const cells = GraphRenderer.generateDayCells(completions, 9, 0, MWF);
		const stats = computeHabitStats(cells, 0);
		expect(stats).toEqual({ longestStreak: 3, completedDays: 4, dueDays: 5, ratePercent: 80 });
		// Overdue carry-over days in another window are neither due nor breaks.
		const carry = GraphRenderer.generateDayCells(dates(['2025-01-10', '2025-01-13', '2025-01-15']), 9, 0, MWF);
		expect(computeHabitStats(carry, 0)).toEqual({ longestStreak: 3, completedDays: 3, dueDays: 5, ratePercent: 60 });
	});

	it('fixed-schedule monthly habit stats', () => {
		// Monthly on the 1st: only 01-01 is due in the window, and it was done.
		const cells = GraphRenderer.generateDayCells(dates(['2025-01-01']), 20, 0, 'FREQ=MONTHLY;BYMONTHDAY=1');
		expect(computeHabitStats(cells, 0)).toEqual({ longestStreak: 1, completedDays: 1, dueDays: 1, ratePercent: 100 });
		const late = GraphRenderer.generateDayCells(dates(['2025-01-01']), 3, 0, 'FREQ=MONTHLY;BYMONTHDAY=1');
		expect(computeHabitStats(late, 0)).toEqual({ longestStreak: 0, completedDays: 0, dueDays: 0, ratePercent: null });
	});
});

describe('formatHabitStatsTooltip', () => {
	it('formats streak, rounded percentage and counts', () => {
		expect(formatHabitStatsTooltip({ longestStreak: 12, completedDays: 2, dueDays: 3, ratePercent: 67 })).toBe(
			'Longest streak: 12 · Completion: 67% (2/3 due days)',
		);
		// 12 missed, 13 done, 14 missed, today undone: 1 of 3 due days, 33.3% rounds to 33.
		const stats = computeHabitStats(GraphRenderer.generateDayCells(dates(['2025-01-13']), 3, 0, DAILY), 0);
		expect(formatHabitStatsTooltip(stats)).toBe('Longest streak: 1 · Completion: 33% (1/3 due days)');
	});

	it('shows n/a when there are no due days', () => {
		expect(formatHabitStatsTooltip({ longestStreak: 0, completedDays: 0, dueDays: 0, ratePercent: null })).toBe(
			'Longest streak: 0 · Completion: n/a (no due days)',
		);
	});
});
