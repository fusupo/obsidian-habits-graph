const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Strip DTSTART prefix (e.g. "DTSTART:20250118;FREQ=WEEKLY;BYDAY=FR")
 * and split semicolon-delimited RRULE params into an uppercased map.
 * Returns null if the string is not an RRULE (no FREQ= present).
 */
function parseRRuleParams(pattern: string): Record<string, string> | null {
	const rruleStr = pattern.trim().replace(/^DTSTART:[^;]*;?/i, '');
	if (!rruleStr.toUpperCase().includes('FREQ=')) return null;

	const params: Record<string, string> = {};
	for (const part of rruleStr.split(';')) {
		const eq = part.indexOf('=');
		if (eq > 0) {
			params[part.substring(0, eq).toUpperCase()] = part.substring(eq + 1).toUpperCase();
		}
	}
	return params;
}

/**
 * Parse recurrence pattern to get interval in days.
 *
 * Supports RRULE format (FREQ=DAILY, FREQ=WEEKLY, etc.) and
 * legacy human-readable patterns ("every day", "weekly", etc.).
 * BYDAY uses average interval: FREQ=WEEKLY;BYDAY=MO,WE,FR → 7/3 ≈ 2 days.
 *
 * NOTE: This scalar is a display/legacy heuristic. Scheduling decisions
 * (is a given date a due day?) should use parseRecurrence() + isDueOn(),
 * which handle day-of-week (BYDAY) and day-of-month (BYMONTHDAY) properly.
 */
export function parseRecurrenceIntervalDays(pattern: string): number {
	const trimmed = pattern.trim();
	const params = parseRRuleParams(trimmed);

	if (params) {
		const freq = params['FREQ'] ?? '';
		const interval = parseInt(params['INTERVAL'] ?? '1', 10) || 1;

		if (freq === 'DAILY') return interval;

		if (freq === 'WEEKLY') {
			if (params['BYDAY']) {
				const count = params['BYDAY'].split(',').filter(Boolean).length;
				return Math.max(1, Math.round(7 / count));
			}
			return 7 * interval;
		}

		if (freq === 'MONTHLY') return 30 * interval;

		console.warn(`Unrecognized RRULE FREQ: "${freq}". Defaulting to daily (1 day).`);
		return 1;
	}

	// Legacy human-readable fallback (kept per PROJECT_LORE.md constraint)
	const lower = trimmed.toLowerCase();

	if (lower.includes('every day') || lower.includes('daily')) return 1;
	if (lower.includes('every week') || lower.includes('weekly')) return 7;
	if (lower.includes('every month') || lower.includes('monthly')) return 30;

	const daysMatch = lower.match(/every (\d+) days?/);
	if (daysMatch) return parseInt(daysMatch[1], 10);

	const weeksMatch = lower.match(/every (\d+) weeks?/);
	if (weeksMatch) return parseInt(weeksMatch[1], 10) * 7;

	console.warn(`Unrecognized recurrence pattern: "${trimmed}". Defaulting to daily (1 day).`);
	return 1;
}

/** Frontmatter `recurrence_anchor` value; 'scheduled' is the TaskNote default. */
export type RecurrenceAnchor = 'scheduled' | 'completion';

/**
 * Structured recurrence representation.
 *
 * - 'interval': every N days. With anchor 'completion' the window rolls from
 *   the last completion; with anchor 'scheduled' due days are a fixed cadence
 *   from the habit's scheduled date (isDueOn falls back to the rolling window
 *   when no scheduled date is supplied)
 *   (FREQ=DAILY, FREQ=WEEKLY without BYDAY, legacy text patterns)
 * - 'weekly-bydays': due on fixed weekdays (FREQ=WEEKLY;BYDAY=MO,WE,FR);
 *   byDays uses JS weekday numbering, 0=Sunday..6=Saturday
 * - 'monthly-bymonthday': due on fixed days of the month
 *   (FREQ=MONTHLY;BYMONTHDAY=1,15)
 */
export type ParsedRecurrence =
	| { kind: 'interval'; days: number; anchor: RecurrenceAnchor }
	| { kind: 'weekly-bydays'; byDays: Set<number> }
	| { kind: 'monthly-bymonthday'; byMonthDays: Set<number> };

const BYDAY_TO_WEEKDAY: Record<string, number> = {
	SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

/**
 * Parse a recurrence pattern into a structured form for scheduling.
 *
 * Recognizes fixed-day RRULE patterns:
 * - FREQ=WEEKLY;BYDAY=MO,WE,FR → { kind: 'weekly-bydays', byDays: {1,3,5} }
 * - FREQ=MONTHLY;BYMONTHDAY=1,15 → { kind: 'monthly-bymonthday', byMonthDays: {1,15} }
 *
 * Everything else (FREQ=DAILY, plain FREQ=WEEKLY/MONTHLY, legacy text)
 * falls through to { kind: 'interval' } using parseRecurrenceIntervalDays.
 *
 * Malformed fixed-day params (unrecognized BYDAY token, empty BYDAY,
 * BYMONTHDAY outside 1-31) log a warning and fall back to daily.
 * INTERVAL>1 combined with BYDAY is not supported: warns and treats as weekly.
 * anchor 'completion' on a fixed-day schedule is a no-op: warns and stays
 * calendar-fixed (rolling-window semantics don't apply to fixed due days).
 */
export function parseRecurrence(pattern: string, anchor: RecurrenceAnchor = 'scheduled'): ParsedRecurrence {
	const params = parseRRuleParams(pattern);

	if (params) {
		const freq = params['FREQ'] ?? '';
		const interval = parseInt(params['INTERVAL'] ?? '1', 10) || 1;

		if (freq === 'WEEKLY' && params['BYDAY'] !== undefined) {
			const tokens = params['BYDAY'].split(',').filter(Boolean);
			const byDays = new Set<number>();
			for (const token of tokens) {
				const weekday = BYDAY_TO_WEEKDAY[token];
				if (weekday === undefined) {
					console.warn(`Unrecognized BYDAY token "${token}" in "${pattern}". Defaulting to daily (1 day).`);
					return { kind: 'interval', days: 1, anchor };
				}
				byDays.add(weekday);
			}
			if (byDays.size === 0) {
				console.warn(`Empty BYDAY in "${pattern}". Defaulting to daily (1 day).`);
				return { kind: 'interval', days: 1, anchor };
			}
			if (interval > 1) {
				console.warn(`INTERVAL=${interval} with BYDAY is not supported in "${pattern}". Treating as weekly.`);
			}
			if (anchor === 'completion') {
				console.warn(`recurrence_anchor: completion has no effect on fixed-day schedule "${pattern}". Due days stay calendar-fixed.`);
			}
			return { kind: 'weekly-bydays', byDays };
		}

		if (freq === 'MONTHLY' && params['BYMONTHDAY'] !== undefined) {
			const tokens = params['BYMONTHDAY'].split(',').filter(Boolean);
			const byMonthDays = new Set<number>();
			for (const token of tokens) {
				const day = parseInt(token, 10);
				if (isNaN(day) || day < 1 || day > 31) {
					console.warn(`Invalid BYMONTHDAY value "${token}" in "${pattern}". Defaulting to daily (1 day).`);
					return { kind: 'interval', days: 1, anchor };
				}
				byMonthDays.add(day);
			}
			if (byMonthDays.size === 0) {
				console.warn(`Empty BYMONTHDAY in "${pattern}". Defaulting to daily (1 day).`);
				return { kind: 'interval', days: 1, anchor };
			}
			if (anchor === 'completion') {
				console.warn(`recurrence_anchor: completion has no effect on fixed-day schedule "${pattern}". Due days stay calendar-fixed.`);
			}
			return { kind: 'monthly-bymonthday', byMonthDays };
		}
	}

	return { kind: 'interval', days: parseRecurrenceIntervalDays(pattern), anchor };
}

/**
 * Whether the habit is due on the given date.
 *
 * - 'interval' with anchor 'scheduled' AND a non-null `scheduledDate`: due on
 *   the fixed cadence scheduledDate, +days, +2*days, ... — completion history
 *   is irrelevant, and days before the scheduled date are never due.
 * - 'interval' otherwise (anchor 'completion', or anchor 'scheduled' without
 *   a scheduled date): due when at least `days` have elapsed since the most
 *   recent completion strictly before `date` (rolling window). Due if there
 *   is no prior completion. The null-scheduledDate fallback is SILENT and
 *   load-bearing: 'scheduled' is the frontmatter default, so most habits have
 *   no scheduled date and must keep the legacy rolling-window behavior.
 * - 'weekly-bydays' / 'monthly-bymonthday': due on the fixed calendar days,
 *   independent of completion history and scheduledDate.
 *
 * All Date params are expected to be UTC-midnight Dates (see dateUtils), so
 * ms-diff day math is exact and weekday/day-of-month are read with
 * getUTCDay()/getUTCDate().
 */
export function isDueOn(
	recurrence: ParsedRecurrence,
	date: Date,
	lastCompletionBefore: Date | null,
	scheduledDate: Date | null = null
): boolean {
	switch (recurrence.kind) {
		case 'interval': {
			if (recurrence.anchor === 'scheduled' && scheduledDate) {
				const daysSinceScheduled = Math.floor((date.getTime() - scheduledDate.getTime()) / MS_PER_DAY);
				return daysSinceScheduled >= 0 && daysSinceScheduled % recurrence.days === 0;
			}
			if (!lastCompletionBefore) return true;
			const gapDays = Math.floor((date.getTime() - lastCompletionBefore.getTime()) / MS_PER_DAY);
			return gapDays >= recurrence.days;
		}
		case 'weekly-bydays':
			return recurrence.byDays.has(date.getUTCDay());
		case 'monthly-bymonthday':
			return recurrence.byMonthDays.has(date.getUTCDate());
	}
}
