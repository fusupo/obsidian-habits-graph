import type { DayCell } from '../graphRenderer';

/**
 * Per-habit numbers for the habit label's tooltip (#56), derived from the
 * same DayCell[] the graph renders, so graph, streak and stats can't
 * disagree. Only past days and today count (future cells are ignored).
 *
 * | Status                                        | Streak       | Rate                       |
 * |-----------------------------------------------|--------------|----------------------------|
 * | done, today-done                              | run + 1      | numerator and denominator  |
 * | missed, missed-overdue                        | breaks       | denominator only           |
 * | skipped, rest, overdue, today-missed, today-overdue | neutral | excluded                  |
 *
 * `overdue` is a carry-over day that isn't itself due; `missed-overdue` is
 * the missed due date. An undone today is neutral: it neither ends nor
 * breaks a run that ended yesterday. These follow
 * `GraphRenderer.calculateStreak` (skipped and non-due days don't break a
 * streak).
 */
export interface HabitStats {
	/** Longest run in the window, never less than the current streak (a streak older than the window is cut at its left edge). */
	longestStreak: number;
	completedDays: number;
	dueDays: number;
	/** Rounded percentage of due days completed, or null when no day in the window was due. */
	ratePercent: number | null;
}

const COMPLETED: ReadonlySet<DayCell['status']> = new Set(['done', 'today-done']);
const MISSED: ReadonlySet<DayCell['status']> = new Set(['missed', 'missed-overdue']);

export function computeHabitStats(cells: DayCell[], currentStreak: number): HabitStats {
	const days = cells
		.filter(c => !c.isFuture)
		.sort((a, b) => a.date.getTime() - b.date.getTime());
	let run = 0;
	let best = 0;
	let completedDays = 0;
	let dueDays = 0;
	for (const cell of days) {
		if (COMPLETED.has(cell.status)) {
			run++;
			best = Math.max(best, run);
			completedDays++;
			dueDays++;
		} else if (MISSED.has(cell.status)) {
			run = 0;
			dueDays++;
		}
	}
	return {
		longestStreak: Math.max(best, currentStreak),
		completedDays,
		dueDays,
		ratePercent: dueDays === 0 ? null : Math.round((100 * completedDays) / dueDays),
	};
}

export function formatHabitStatsTooltip(stats: HabitStats): string {
	const completion =
		stats.ratePercent === null
			? 'Completion: n/a (no due days)'
			: `Completion: ${stats.ratePercent}% (${stats.completedDays}/${stats.dueDays} due days)`;
	return `Longest streak: ${stats.longestStreak} · ${completion}`;
}
