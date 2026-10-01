import {
	chooseWritePath,
	exactInstanceLists,
	isDueDay,
	isScheduleModeled,
	latestDueOnOrBefore,
	nextUnhandledDueOnOrAfter,
	scheduledAfterClick,
	ScheduleState,
	undoScheduledTarget,
	withScheduledSuffix,
} from '../utils/scheduledAnchor';

// "Upper expander adjustment" from #58: Mon/Wed/Fri, repeats from its
// scheduled date. 2026-10-01 is a Thursday
const MWF = 'DTSTART:20260703;FREQ=WEEKLY;BYDAY=MO,FR,WE';

function mwf(overrides: Partial<ScheduleState> = {}): ScheduleState {
	return {
		recurrence: MWF,
		recurrence_anchor: 'scheduled',
		scheduled: '2026-09-30',
		complete_instances: [],
		skipped_instances: [],
		...overrides,
	};
}

describe('isDueDay — an occurrence of the rule counted from DTSTART', () => {
	it('fixed weekdays', () => {
		expect(isDueDay(mwf(), '2026-09-28')).toBe(true); // Mon
		expect(isDueDay(mwf(), '2026-09-30')).toBe(true); // Wed
		expect(isDueDay(mwf(), '2026-10-01')).toBe(false); // Thu
	});

	it('nothing is due before DTSTART', () => {
		expect(isDueDay(mwf(), '2026-06-29')).toBe(false); // a Monday before 07-03
	});

	it('interval cadences count from DTSTART, not from scheduled', () => {
		const every3 = mwf({ recurrence: 'DTSTART:20260901;FREQ=DAILY;INTERVAL=3', scheduled: '2026-10-02' });
		expect(isDueDay(every3, '2026-09-04')).toBe(true); // before scheduled, still an occurrence
		expect(isDueDay(every3, '2026-09-03')).toBe(false);
		expect(isDueDay(every3, '2026-08-29')).toBe(false); // before DTSTART
	});

	it('weekly without BYDAY repeats on DTSTART\'s weekday', () => {
		const biweekly = mwf({ recurrence: 'DTSTART:20260904;FREQ=WEEKLY;INTERVAL=2' });
		expect(isDueDay(biweekly, '2026-09-18')).toBe(true);
		expect(isDueDay(biweekly, '2026-09-11')).toBe(false);
	});

	it('fixed days of the month', () => {
		const monthly = mwf({ recurrence: 'DTSTART:20260101;FREQ=MONTHLY;BYMONTHDAY=1,15' });
		expect(isDueDay(monthly, '2026-10-15')).toBe(true);
		expect(isDueDay(monthly, '2026-10-14')).toBe(false);
	});

	it('without DTSTART, scheduled is the start (TaskNotes\' implicit DTSTART)', () => {
		const every2 = mwf({ recurrence: 'FREQ=DAILY;INTERVAL=2', scheduled: '2026-09-30' });
		expect(isDueDay(every2, '2026-10-02')).toBe(true);
		expect(isDueDay(every2, '2026-10-01')).toBe(false);
		expect(isDueDay(every2, '2026-09-28')).toBe(false);
	});

	it('without DTSTART or scheduled, interval rules roll from the last completion', () => {
		const every3 = mwf({ recurrence: 'FREQ=DAILY;INTERVAL=3', scheduled: undefined, complete_instances: ['2026-09-28'] });
		expect(isDueDay(every3, '2026-10-01')).toBe(true);
		expect(isDueDay(every3, '2026-09-30')).toBe(false);
		expect(isDueDay({ ...every3, complete_instances: [] }, '2026-09-30')).toBe(true);
	});

	it('is false without a recurrence string', () => {
		expect(isDueDay(mwf({ recurrence: undefined }), '2026-09-30')).toBe(false);
	});
});

describe('chooseWritePath', () => {
	it('uses the toggles on due days', () => {
		expect(chooseWritePath(mwf(), '2026-09-30')).toBe('toggle');
	});

	it('writes off days exactly on scheduled-anchor habits (anchor absent means scheduled)', () => {
		expect(chooseWritePath(mwf(), '2026-10-01')).toBe('exact');
		expect(chooseWritePath(mwf({ recurrence_anchor: undefined }), '2026-10-01')).toBe('exact');
	});

	it('always uses the toggles for completion-anchored habits', () => {
		expect(chooseWritePath(mwf({ recurrence_anchor: 'completion' }), '2026-10-01')).toBe('toggle');
	});

	it('leaves a missing recurrence to TaskNotes to report', () => {
		expect(chooseWritePath(mwf({ recurrence: undefined }), '2026-10-01')).toBe('toggle');
	});
});

describe('isScheduleModeled — rules the plugin may set scheduled for', () => {
	it.each([
		MWF,
		'DTSTART:20260901;FREQ=DAILY;INTERVAL=3',
		'DTSTART:20260904;FREQ=WEEKLY;INTERVAL=2',
		'DTSTART:20260101;FREQ=MONTHLY;BYMONTHDAY=1,15',
		'DTSTART:20260101T090000Z;FREQ=WEEKLY;BYDAY=MO;WKST=MO',
	])('models %s', rule => {
		expect(isScheduleModeled(rule)).toBe(true);
	});

	it.each([
		'FREQ=WEEKLY;BYDAY=MO', // no DTSTART
		'DTSTART:20260703;FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
		'DTSTART:20260703;FREQ=DAILY;COUNT=10',
		'DTSTART:20260703;FREQ=DAILY;UNTIL=20261231',
		'DTSTART:20260703;FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1',
		'DTSTART:20260703;FREQ=YEARLY',
		'DTSTART:20260703;FREQ=MONTHLY',
		'DTSTART:20260703;FREQ=WEEKLY;BYDAY=1MO',
		'DTSTART:20260703;FREQ=MONTHLY;BYMONTHDAY=-1',
		'DTSTART:20260703;FREQ=MONTHLY;BYMONTHDAY=32',
		'DTSTART:20260703;FREQ=DAILY;BYDAY=MO',
	])('does not model %s', rule => {
		expect(isScheduleModeled(rule)).toBe(false);
	});

	it('does not model a missing recurrence', () => {
		expect(isScheduleModeled(undefined)).toBe(false);
	});
});

describe('nextUnhandledDueOnOrAfter / latestDueOnOrBefore', () => {
	it('finds the next due day that is not done or skipped', () => {
		expect(nextUnhandledDueOnOrAfter(mwf(), '2026-10-01')).toBe('2026-10-02');
		expect(nextUnhandledDueOnOrAfter(mwf(), '2026-09-30')).toBe('2026-09-30');
		expect(nextUnhandledDueOnOrAfter(mwf({ complete_instances: ['2026-10-02'] }), '2026-10-01')).toBe('2026-10-05');
		expect(nextUnhandledDueOnOrAfter(mwf({ skipped_instances: ['2026-10-02'] }), '2026-10-01')).toBe('2026-10-05');
	});

	it('gives up past the search window', () => {
		expect(nextUnhandledDueOnOrAfter(mwf({ recurrence: 'DTSTART:20280103;FREQ=WEEKLY;BYDAY=MO' }), '2026-10-01')).toBeNull();
	});

	it('finds the latest due day, marked or not', () => {
		expect(latestDueOnOrBefore(mwf(), '2026-10-01')).toBe('2026-09-30');
		expect(latestDueOnOrBefore(mwf({ complete_instances: ['2026-09-30'] }), '2026-09-30')).toBe('2026-09-30');
		expect(latestDueOnOrBefore(mwf(), '2026-07-02')).toBeNull(); // before DTSTART
	});
});

describe('exactInstanceLists — the toggles\' list changes', () => {
	const state = mwf({ complete_instances: ['2026-09-17', '2026-09-28'], skipped_instances: ['2026-09-14', '2026-10-01'] });

	it('done adds the date and drops it from skipped', () => {
		expect(exactInstanceLists(state, '2026-10-01', 'complete')).toEqual({
			complete: ['2026-09-17', '2026-09-28', '2026-10-01'],
			skipped: ['2026-09-14'],
		});
	});

	it('skip moves the date out of done', () => {
		expect(exactInstanceLists(state, '2026-09-28', 'skip')).toEqual({
			complete: ['2026-09-17'],
			skipped: ['2026-09-14', '2026-10-01', '2026-09-28'],
		});
	});

	it('clearing removes the date from skipped', () => {
		expect(exactInstanceLists(state, '2026-10-01', 'unskip')).toEqual({
			complete: ['2026-09-17', '2026-09-28'],
			skipped: ['2026-09-14'],
		});
	});

	it('does not duplicate a date and tolerates missing lists', () => {
		expect(exactInstanceLists(state, '2026-09-28', 'complete').complete).toEqual(['2026-09-17', '2026-09-28']);
		expect(exactInstanceLists(mwf({ complete_instances: 'nope', skipped_instances: undefined }), '2026-10-01', 'complete'))
			.toEqual({ complete: ['2026-10-01'], skipped: [] });
	});
});

describe('scheduledAfterClick — where TaskNotes would put scheduled', () => {
	it('an off day today moves scheduled to the next due day (Thu → Fri)', () => {
		expect(scheduledAfterClick(mwf({ complete_instances: ['2026-10-01'] }), '2026-10-01', '2026-10-01')).toBe('2026-10-02');
	});

	it('a past off day counts from today, like TaskNotes', () => {
		expect(scheduledAfterClick(mwf({ complete_instances: ['2026-09-24'] }), '2026-09-24', '2026-10-01')).toBe('2026-10-02');
	});

	it('lands on today when today is due and blank', () => {
		expect(scheduledAfterClick(mwf({ complete_instances: ['2026-10-01'] }), '2026-10-01', '2026-10-02')).toBe('2026-10-02');
	});

	it('skips due days that are already marked', () => {
		expect(scheduledAfterClick(mwf({ complete_instances: ['2026-10-01', '2026-10-02'] }), '2026-10-01', '2026-10-01')).toBe('2026-10-05');
	});

	it('is null for rules it does not model', () => {
		expect(scheduledAfterClick(mwf({ recurrence: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }), '2026-10-01', '2026-10-01')).toBeNull();
	});
});

describe('undoScheduledTarget — clearing the owed day puts scheduled back', () => {
	const TODAY = '2026-10-01';

	it('Wed 9/30 cleared, nothing later marked → 9/30', () => {
		expect(undoScheduledTarget(mwf(), '2026-09-30', TODAY, '2026-10-02')).toBe('2026-09-30');
	});

	it('Thu 10/1 (off day) cleared with Wed 9/30 blank → 9/30', () => {
		expect(undoScheduledTarget(mwf(), '2026-10-01', TODAY, '2026-10-02')).toBe('2026-09-30');
	});

	it('Wed 9/30 cleared but Thu 10/1 is done → no change', () => {
		expect(undoScheduledTarget(mwf({ complete_instances: ['2026-10-01'] }), '2026-09-30', TODAY, '2026-10-02')).toBeNull();
	});

	it('Mon 9/28 cleared while Wed 9/30 is also blank → no change', () => {
		expect(undoScheduledTarget(mwf(), '2026-09-28', TODAY, '2026-10-02')).toBeNull();
	});

	it('today\'s due day cleared → TaskNotes already put scheduled there', () => {
		expect(undoScheduledTarget(mwf(), '2026-10-02', '2026-10-02', '2026-10-02')).toBeNull();
	});

	it('a future day cleared → no change', () => {
		expect(undoScheduledTarget(mwf(), '2026-10-02', TODAY, '2026-10-05')).toBeNull();
	});

	it('a marked off day after the owed day blocks the restore', () => {
		// Sun 10/4: the owed day is Fri 10/2, but Sat 10/3 is marked done
		expect(undoScheduledTarget(mwf(), '2026-10-04', '2026-10-04', '2026-10-05')).toBe('2026-10-02');
		expect(undoScheduledTarget(mwf({ complete_instances: ['2026-10-03'] }), '2026-10-04', '2026-10-04', '2026-10-05')).toBeNull();
	});

	it('the owed day itself being marked blocks the restore', () => {
		expect(undoScheduledTarget(mwf({ skipped_instances: ['2026-09-30'] }), '2026-10-01', TODAY, '2026-10-02')).toBeNull();
	});

	it('accepts a scheduled with a time suffix', () => {
		expect(undoScheduledTarget(mwf(), '2026-09-30', TODAY, '2026-10-02T09:00')).toBe('2026-09-30');
	});

	it('is null for completion-anchored habits (the DTSTART repair handles their undo)', () => {
		expect(undoScheduledTarget(mwf({ recurrence_anchor: 'completion' }), '2026-09-30', TODAY, '2026-10-02')).toBeNull();
	});

	it('is null for unmodeled rules or an unreadable scheduled', () => {
		expect(undoScheduledTarget(mwf({ recurrence: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }), '2026-09-30', TODAY, '2026-10-02')).toBeNull();
		expect(undoScheduledTarget(mwf(), '2026-09-30', TODAY, undefined)).toBeNull();
		expect(undoScheduledTarget(mwf(), '2026-09-30', TODAY, 'soon')).toBeNull();
	});
});

describe('withScheduledSuffix', () => {
	it('keeps a time suffix', () => {
		expect(withScheduledSuffix('2026-09-30T09:00', '2026-10-02')).toBe('2026-10-02T09:00');
	});

	it('returns the bare date otherwise', () => {
		expect(withScheduledSuffix('2026-09-30', '2026-10-02')).toBe('2026-10-02');
		expect(withScheduledSuffix(undefined, '2026-10-02')).toBe('2026-10-02');
		expect(withScheduledSuffix('soon', '2026-10-02')).toBe('2026-10-02');
	});
});
