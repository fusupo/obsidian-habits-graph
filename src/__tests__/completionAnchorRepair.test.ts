import { dtstartRepairDate } from '../utils/completionAnchorRepair';

describe('dtstartRepairDate — DTSTART repair for completion-anchored habits (#47)', () => {
	const WEEKLY = 'FREQ=WEEKLY;INTERVAL=2';

	it('never repairs scheduled-anchor habits', () => {
		expect(dtstartRepairDate('scheduled', `DTSTART:20260901;${WEEKLY}`, ['2026-09-20'])).toBeNull();
	});

	it('treats a missing anchor as scheduled (TaskNotes default)', () => {
		expect(dtstartRepairDate(undefined, `DTSTART:20260901;${WEEKLY}`, ['2026-09-20'])).toBeNull();
	});

	it('returns null with no completions — nothing to re-mark', () => {
		expect(dtstartRepairDate('completion', `DTSTART:20260901;${WEEKLY}`, [])).toBeNull();
		expect(dtstartRepairDate('completion', `DTSTART:20260901;${WEEKLY}`, undefined)).toBeNull();
	});

	it('returns null when DTSTART is already the latest completion', () => {
		expect(dtstartRepairDate('completion', `DTSTART:20260920;${WEEKLY}`, ['2026-09-06', '2026-09-20'])).toBeNull();
	});

	it('repairs a DTSTART left on an older completion (out-of-order backfill)', () => {
		expect(dtstartRepairDate('completion', `DTSTART:20260906;${WEEKLY}`, ['2026-09-06', '2026-09-20'])).toBe('2026-09-20');
	});

	it('repairs a DTSTART left on a date no longer completed (undone mistake)', () => {
		expect(dtstartRepairDate('completion', `DTSTART:20260925;${WEEKLY}`, ['2026-09-06', '2026-09-20'])).toBe('2026-09-20');
	});

	it('repairs when the rule has no DTSTART', () => {
		expect(dtstartRepairDate('completion', WEEKLY, ['2026-09-20'])).toBe('2026-09-20');
	});

	it('reads the date part of a DTSTART with a time', () => {
		expect(dtstartRepairDate('completion', `DTSTART:20260920T090000Z;${WEEKLY}`, ['2026-09-20'])).toBeNull();
		expect(dtstartRepairDate('completion', `DTSTART:20260906T090000Z;${WEEKLY}`, ['2026-09-20'])).toBe('2026-09-20');
	});

	it('finds the latest completion in unsorted input', () => {
		expect(dtstartRepairDate('completion', `DTSTART:20260101;${WEEKLY}`, ['2026-09-20', '2026-07-01', '2026-09-06'])).toBe('2026-09-20');
	});

	it('ignores malformed and non-string entries', () => {
		expect(dtstartRepairDate('completion', `DTSTART:20260101;${WEEKLY}`, ['2026-09-06', 'garbage', 20261231, '2026-9-30'])).toBe('2026-09-06');
	});
});
