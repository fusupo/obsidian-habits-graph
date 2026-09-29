const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Decide whether a completion-anchored habit's DTSTART needs repairing
 * after a day was marked through TaskNotes, and to which date.
 *
 * TaskNotes rewrites DTSTART to whichever date was just marked complete
 * (even one older than the current DTSTART) and never reverts it on
 * un-complete or skip. Out-of-order backfill or a corrected mistake
 * therefore leaves DTSTART off the latest completion, which shifts the
 * next `scheduled` date for weekly/monthly habits. Re-marking the latest
 * completion through TaskNotes puts DTSTART back and makes TaskNotes
 * recompute `scheduled`.
 *
 * Scheduled-anchor habits never get an existing DTSTART rewritten by
 * TaskNotes, so they never need a repair.
 *
 * @param anchor - TaskNotes `recurrence_anchor` (absent means 'scheduled')
 * @param recurrence - TaskNotes `recurrence` RRULE string
 * @param completeInstances - TaskNotes `complete_instances`
 * @returns the latest completion (YYYY-MM-DD) to re-mark, or null when no
 *          repair is needed or possible (no completions left)
 */
export function dtstartRepairDate(
	anchor: unknown,
	recurrence: unknown,
	completeInstances: unknown
): string | null {
	if (anchor !== 'completion' || !Array.isArray(completeInstances)) return null;

	let latest: string | null = null;
	for (const date of completeInstances) {
		// YYYY-MM-DD strings order correctly under plain string comparison
		if (typeof date === 'string' && ISO_DATE.test(date) && (latest === null || date > latest)) {
			latest = date;
		}
	}
	if (latest === null) return null;

	// Matches both DTSTART:20250118 and DTSTART:20250118T090000Z
	const dtstart = typeof recurrence === 'string' ? recurrence.match(/DTSTART:(\d{8})/)?.[1] : undefined;
	return dtstart === latest.replace(/-/g, '') ? null : latest;
}
