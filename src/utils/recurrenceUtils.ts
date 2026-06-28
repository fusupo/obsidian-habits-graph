/**
 * Parse recurrence pattern to get interval in days.
 *
 * Supports RRULE format (FREQ=DAILY, FREQ=WEEKLY, etc.) and
 * legacy human-readable patterns ("every day", "weekly", etc.).
 * BYDAY uses average interval: FREQ=WEEKLY;BYDAY=MO,WE,FR → 7/3 ≈ 2 days.
 * Proper day-of-week scheduling is tracked in #11.
 */
export function parseRecurrenceIntervalDays(pattern: string): number {
	const trimmed = pattern.trim();

	// Strip DTSTART prefix if present (e.g. "DTSTART:20250118;FREQ=WEEKLY;BYDAY=FR")
	const rruleStr = trimmed.replace(/^DTSTART:[^;]*;?/i, '');

	if (rruleStr.toUpperCase().includes('FREQ=')) {
		const params: Record<string, string> = {};
		for (const part of rruleStr.split(';')) {
			const eq = part.indexOf('=');
			if (eq > 0) {
				params[part.substring(0, eq).toUpperCase()] = part.substring(eq + 1).toUpperCase();
			}
		}

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
