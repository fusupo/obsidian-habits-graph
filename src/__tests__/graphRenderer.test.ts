import { GraphRenderer, DayCell } from '../graphRenderer';
import { parseISODate } from '../utils/dateUtils';

// Freeze "today" at 2025-01-15 (a Wednesday) in LOCAL time — getTodayUTC()
// reads local date components, so construct the fake system time with the
// local-time Date constructor to be timezone-independent.
beforeAll(() => {
	jest.useFakeTimers();
	jest.setSystemTime(new Date(2025, 0, 15, 12, 0, 0));
});

afterAll(() => {
	jest.useRealTimers();
});

/** Index cells by ISO date string for readable assertions. */
function cellsByDate(cells: DayCell[]): Map<string, DayCell> {
	return new Map(cells.map(c => [GraphRenderer.dateToString(c.date), c]));
}

function statusOf(cells: DayCell[], isoDate: string): DayCell['status'] | undefined {
	return cellsByDate(cells).get(isoDate)?.status;
}

describe('generateDayCells — interval kind (regression: legacy rolling-window behavior)', () => {
	it('daily habit: completed days are done, uncompleted past days are missed', () => {
		const completions = [parseISODate('2025-01-12'), parseISODate('2025-01-14')];
		const cells = GraphRenderer.generateDayCells(completions, 4, 0, 'FREQ=DAILY');

		expect(statusOf(cells, '2025-01-11')).toBe('missed');
		expect(statusOf(cells, '2025-01-12')).toBe('done');
		expect(statusOf(cells, '2025-01-13')).toBe('missed');
		expect(statusOf(cells, '2025-01-14')).toBe('done');
	});

	it('daily habit with no completions: all past days missed', () => {
		const cells = GraphRenderer.generateDayCells([], 3, 0, 'FREQ=DAILY');

		expect(statusOf(cells, '2025-01-12')).toBe('missed');
		expect(statusOf(cells, '2025-01-13')).toBe('missed');
		expect(statusOf(cells, '2025-01-14')).toBe('missed');
	});

	it('every-3-days habit: days within interval of prior completion are rest', () => {
		const completions = [parseISODate('2025-01-11')];
		const cells = GraphRenderer.generateDayCells(completions, 6, 0, 'FREQ=DAILY;INTERVAL=3');

		expect(statusOf(cells, '2025-01-09')).toBe('missed'); // no prior completion
		expect(statusOf(cells, '2025-01-10')).toBe('missed');
		expect(statusOf(cells, '2025-01-11')).toBe('done');
		expect(statusOf(cells, '2025-01-12')).toBe('rest');   // gap 1 < 3
		expect(statusOf(cells, '2025-01-13')).toBe('rest');   // gap 2 < 3
		expect(statusOf(cells, '2025-01-14')).toBe('missed'); // gap 3 >= 3
	});

	it('skipped past days render as skipped', () => {
		const completions = [parseISODate('2025-01-13')];
		const skipped = [parseISODate('2025-01-14')];
		const cells = GraphRenderer.generateDayCells(completions, 3, 0, 'FREQ=DAILY', skipped);

		expect(statusOf(cells, '2025-01-13')).toBe('done');
		expect(statusOf(cells, '2025-01-14')).toBe('skipped');
	});

	it('today is today-done when completed, today-missed otherwise', () => {
		const done = GraphRenderer.generateDayCells([parseISODate('2025-01-15')], 1, 1, 'FREQ=DAILY');
		expect(statusOf(done, '2025-01-15')).toBe('today-done');

		const missed = GraphRenderer.generateDayCells([], 1, 1, 'FREQ=DAILY');
		expect(statusOf(missed, '2025-01-15')).toBe('today-missed');
	});

	it('future scheduling window escalates with days since last completion', () => {
		// every-4-days habit, last completed today (2025-01-15)
		const completions = [parseISODate('2025-01-15')];
		const cells = GraphRenderer.generateDayCells(completions, 0, 7, 'FREQ=DAILY;INTERVAL=4');

		// thresholds: <3 (0.75x) too-early, <5 (1.25x) ok, <6 (1.5x) warning, else overdue
		expect(statusOf(cells, '2025-01-16')).toBe('future-too-early'); // gap 1
		expect(statusOf(cells, '2025-01-17')).toBe('future-too-early'); // gap 2
		expect(statusOf(cells, '2025-01-18')).toBe('future-ok');        // gap 3
		expect(statusOf(cells, '2025-01-19')).toBe('future-ok');        // gap 4
		expect(statusOf(cells, '2025-01-20')).toBe('future-warning');   // gap 5
		expect(statusOf(cells, '2025-01-21')).toBe('future-overdue');   // gap 6
	});

	it('cell count and ordering: daysBefore + today + daysAfter', () => {
		const cells = GraphRenderer.generateDayCells([], 5, 3, 'FREQ=DAILY');
		expect(cells).toHaveLength(9);
		expect(cells[5].isToday).toBe(true);
		expect(GraphRenderer.dateToString(cells[0].date)).toBe('2025-01-10');
		expect(GraphRenderer.dateToString(cells[8].date)).toBe('2025-01-18');
	});
});

describe('generateDayCells — weekly-bydays past days (#11)', () => {
	// Today is Wed 2025-01-15. Past week: 08=Wed 09=Thu 10=Fri 11=Sat 12=Sun 13=Mon 14=Tue
	const MWF = 'FREQ=WEEKLY;BYDAY=MO,WE,FR';

	it('non-due weekdays are rest, not missed, regardless of completions', () => {
		const completions = ['2025-01-08', '2025-01-10', '2025-01-13'].map(parseISODate);
		const cells = GraphRenderer.generateDayCells(completions, 7, 0, MWF);

		expect(statusOf(cells, '2025-01-08')).toBe('done'); // Wed
		expect(statusOf(cells, '2025-01-09')).toBe('rest'); // Thu — not scheduled
		expect(statusOf(cells, '2025-01-10')).toBe('done'); // Fri
		expect(statusOf(cells, '2025-01-11')).toBe('rest'); // Sat — not scheduled
		expect(statusOf(cells, '2025-01-12')).toBe('rest'); // Sun — not scheduled
		expect(statusOf(cells, '2025-01-13')).toBe('done'); // Mon
		expect(statusOf(cells, '2025-01-14')).toBe('rest'); // Tue — not scheduled
	});

	it('a missed due weekday is missed; surrounding non-due days stay rest', () => {
		// Monday 13th NOT completed
		const completions = ['2025-01-08', '2025-01-10'].map(parseISODate);
		const cells = GraphRenderer.generateDayCells(completions, 7, 0, MWF);

		expect(statusOf(cells, '2025-01-11')).toBe('rest');   // Sat
		expect(statusOf(cells, '2025-01-12')).toBe('rest');   // Sun
		expect(statusOf(cells, '2025-01-13')).toBe('missed'); // Mon — was due
		expect(statusOf(cells, '2025-01-14')).toBe('rest');   // Tue
	});

	it('due weekdays are missed even with no completion history', () => {
		const cells = GraphRenderer.generateDayCells([], 7, 0, MWF);

		expect(statusOf(cells, '2025-01-08')).toBe('missed'); // Wed
		expect(statusOf(cells, '2025-01-09')).toBe('rest');   // Thu
		expect(statusOf(cells, '2025-01-10')).toBe('missed'); // Fri
		expect(statusOf(cells, '2025-01-13')).toBe('missed'); // Mon
	});

	it('skipped takes precedence over rest/missed on any day', () => {
		const skipped = [parseISODate('2025-01-13')]; // Mon, due
		const cells = GraphRenderer.generateDayCells([], 7, 0, MWF, skipped);
		expect(statusOf(cells, '2025-01-13')).toBe('skipped');
	});
});

describe('generateDayCells — fixed-schedule future days (#11)', () => {
	// Today is Wed 2025-01-15. Future week: 16=Thu 17=Fri 18=Sat 19=Sun 20=Mon 21=Tue 22=Wed
	const MWF = 'FREQ=WEEKLY;BYDAY=MO,WE,FR';

	it('future due weekdays are future-ok; others future-too-early (no escalation ramp)', () => {
		// No completions in ages — the legacy ramp would have shown Sat/Sun as overdue
		const cells = GraphRenderer.generateDayCells([], 0, 7, MWF);

		expect(statusOf(cells, '2025-01-16')).toBe('future-too-early'); // Thu
		expect(statusOf(cells, '2025-01-17')).toBe('future-ok');        // Fri
		expect(statusOf(cells, '2025-01-18')).toBe('future-too-early'); // Sat
		expect(statusOf(cells, '2025-01-19')).toBe('future-too-early'); // Sun
		expect(statusOf(cells, '2025-01-20')).toBe('future-ok');        // Mon
		expect(statusOf(cells, '2025-01-21')).toBe('future-too-early'); // Tue
		expect(statusOf(cells, '2025-01-22')).toBe('future-ok');        // Wed
	});

	it('future classification is independent of completion history', () => {
		const completions = ['2025-01-13', '2025-01-15'].map(parseISODate);
		const cells = GraphRenderer.generateDayCells(completions, 0, 7, MWF);

		expect(statusOf(cells, '2025-01-17')).toBe('future-ok');        // Fri
		expect(statusOf(cells, '2025-01-18')).toBe('future-too-early'); // Sat
	});

	it('monthly-bymonthday: only the scheduled day of month is future-ok', () => {
		// today Jan 15, look 17 days ahead to cover Feb 1
		const cells = GraphRenderer.generateDayCells([], 0, 17, 'FREQ=MONTHLY;BYMONTHDAY=1');

		expect(statusOf(cells, '2025-01-16')).toBe('future-too-early');
		expect(statusOf(cells, '2025-01-31')).toBe('future-too-early');
		expect(statusOf(cells, '2025-02-01')).toBe('future-ok');
	});
});

describe('generateDayCells — scheduled-anchor interval future days (#27)', () => {
	// Today is Wed 2025-01-15; every 3 days anchored to 2025-01-09.
	// Future due days: 18, 21, 24, ...
	const EVERY3 = 'FREQ=DAILY;INTERVAL=3';
	const scheduled = parseISODate('2025-01-09');

	it('future cells are binary due/not-due, no escalation ramp', () => {
		// No completions in ages — the ramp would have painted everything overdue
		const cells = GraphRenderer.generateDayCells([], 0, 7, EVERY3, [], 'scheduled', scheduled);

		expect(statusOf(cells, '2025-01-16')).toBe('future-too-early');
		expect(statusOf(cells, '2025-01-17')).toBe('future-too-early');
		expect(statusOf(cells, '2025-01-18')).toBe('future-ok');
		expect(statusOf(cells, '2025-01-19')).toBe('future-too-early');
		expect(statusOf(cells, '2025-01-20')).toBe('future-too-early');
		expect(statusOf(cells, '2025-01-21')).toBe('future-ok');
		expect(statusOf(cells, '2025-01-22')).toBe('future-too-early');
	});

	it('future classification is independent of completion history', () => {
		const completions = [parseISODate('2025-01-15')];
		const cells = GraphRenderer.generateDayCells(completions, 0, 7, EVERY3, [], 'scheduled', scheduled);

		expect(statusOf(cells, '2025-01-18')).toBe('future-ok');
		expect(statusOf(cells, '2025-01-19')).toBe('future-too-early');
	});

	it('without a scheduled date, the escalation ramp still applies (regression)', () => {
		// Identical to the legacy every-4-days ramp fixture
		const completions = [parseISODate('2025-01-15')];
		const cells = GraphRenderer.generateDayCells(completions, 0, 7, 'FREQ=DAILY;INTERVAL=4', [], 'scheduled', null);

		expect(statusOf(cells, '2025-01-16')).toBe('future-too-early');
		expect(statusOf(cells, '2025-01-18')).toBe('future-ok');
		expect(statusOf(cells, '2025-01-20')).toBe('future-warning');
		expect(statusOf(cells, '2025-01-21')).toBe('future-overdue');
	});

	it('completion anchor keeps the escalation ramp even with a scheduled date', () => {
		const completions = [parseISODate('2025-01-15')];
		const cells = GraphRenderer.generateDayCells(completions, 0, 7, 'FREQ=DAILY;INTERVAL=4', [], 'completion', scheduled);

		expect(statusOf(cells, '2025-01-20')).toBe('future-warning');
		expect(statusOf(cells, '2025-01-21')).toBe('future-overdue');
	});
});

describe('generateDayCells — scheduled-anchor interval past days (#27)', () => {
	// Today is Wed 2025-01-15; every 3 days anchored to scheduled date 2025-01-09.
	// Due days: 09, 12, 15, 18, ...
	const EVERY3 = 'FREQ=DAILY;INTERVAL=3';
	const scheduled = parseISODate('2025-01-09');

	it('due days follow the scheduled cadence, ignoring completion gaps', () => {
		// Completed off-cadence on the 10th — under completion anchor the 12th
		// would be rest (gap 2 < 3); under scheduled anchor it is due → missed.
		const completions = [parseISODate('2025-01-10')];
		const cells = GraphRenderer.generateDayCells(completions, 7, 0, EVERY3, [], 'scheduled', scheduled);

		expect(statusOf(cells, '2025-01-09')).toBe('missed'); // due, not completed
		expect(statusOf(cells, '2025-01-10')).toBe('done');
		expect(statusOf(cells, '2025-01-11')).toBe('rest');   // off-cadence
		expect(statusOf(cells, '2025-01-12')).toBe('missed'); // due despite gap 2 from the 10th
		expect(statusOf(cells, '2025-01-13')).toBe('rest');
		expect(statusOf(cells, '2025-01-14')).toBe('rest');
	});

	it('days before the scheduled date are rest, never missed', () => {
		const cells = GraphRenderer.generateDayCells([], 10, 0, EVERY3, [], 'scheduled', scheduled);

		expect(statusOf(cells, '2025-01-05')).toBe('rest');
		expect(statusOf(cells, '2025-01-06')).toBe('rest'); // on-cadence backwards, still rest
		expect(statusOf(cells, '2025-01-08')).toBe('rest');
		expect(statusOf(cells, '2025-01-09')).toBe('missed'); // first due day
	});

	it('without a scheduled date, scheduled anchor falls back to rolling window (regression)', () => {
		// Identical to the legacy every-3-days fixture — must classify identically
		const completions = [parseISODate('2025-01-11')];
		const cells = GraphRenderer.generateDayCells(completions, 6, 0, EVERY3, [], 'scheduled', null);

		expect(statusOf(cells, '2025-01-09')).toBe('missed');
		expect(statusOf(cells, '2025-01-10')).toBe('missed');
		expect(statusOf(cells, '2025-01-11')).toBe('done');
		expect(statusOf(cells, '2025-01-12')).toBe('rest');
		expect(statusOf(cells, '2025-01-13')).toBe('rest');
		expect(statusOf(cells, '2025-01-14')).toBe('missed');
	});

	it('completion anchor keeps rolling-window classification even with a scheduled date', () => {
		const completions = [parseISODate('2025-01-11')];
		const cells = GraphRenderer.generateDayCells(completions, 6, 0, EVERY3, [], 'completion', scheduled);

		expect(statusOf(cells, '2025-01-12')).toBe('rest');   // gap 1 < 3, cadence irrelevant
		expect(statusOf(cells, '2025-01-14')).toBe('missed'); // gap 3 >= 3
	});
});

describe('generateDayCells — today cell on non-due days (#28)', () => {
	// Today is Wed 2025-01-15 — NOT a due day for a Tue/Thu weekly habit.
	const TUTH = 'FREQ=WEEKLY;BYDAY=TU,TH';

	it('fixed-schedule habit: non-due today is rest, with isToday preserved for the marker', () => {
		const completions = ['2025-01-09', '2025-01-14'].map(parseISODate); // Thu, Tue
		const cells = GraphRenderer.generateDayCells(completions, 7, 1, TUTH);

		expect(statusOf(cells, '2025-01-15')).toBe('rest');
		expect(cellsByDate(cells).get('2025-01-15')?.isToday).toBe(true);
	});

	it('fixed-schedule habit: due today still renders today-missed (regression)', () => {
		const cells = GraphRenderer.generateDayCells([], 7, 1, 'FREQ=WEEKLY;BYDAY=MO,WE,FR');
		expect(statusOf(cells, '2025-01-15')).toBe('today-missed'); // Wed is due
	});

	it('completing on a non-due today still shows today-done', () => {
		const completions = [parseISODate('2025-01-15')];
		const cells = GraphRenderer.generateDayCells(completions, 1, 1, TUTH);
		expect(statusOf(cells, '2025-01-15')).toBe('today-done');
	});

	it('skipping a non-due today shows skipped (precedence over rest)', () => {
		const skipped = [parseISODate('2025-01-15')];
		const cells = GraphRenderer.generateDayCells([], 1, 1, TUTH, skipped);
		expect(statusOf(cells, '2025-01-15')).toBe('skipped');
	});

	it('rolling-window interval habit: today inside the gap is rest, not today-missed', () => {
		// every 3 days, completed yesterday — gap 1 < 3
		const completions = [parseISODate('2025-01-14')];
		const cells = GraphRenderer.generateDayCells(completions, 1, 1, 'FREQ=DAILY;INTERVAL=3');
		expect(statusOf(cells, '2025-01-15')).toBe('rest');
	});

	it('rolling-window interval habit: today at the interval gap is today-missed', () => {
		const completions = [parseISODate('2025-01-12')]; // gap 3 >= 3
		const cells = GraphRenderer.generateDayCells(completions, 3, 1, 'FREQ=DAILY;INTERVAL=3');
		expect(statusOf(cells, '2025-01-15')).toBe('today-missed');
	});

	it('scheduled-anchor interval habit: off-cadence today is rest, ignoring completions', () => {
		// Anchored to 2025-01-10 — due 10, 13, 16; today (15) is off-cadence.
		// The old completion would make the rolling window call today due; anchor wins.
		const scheduled = parseISODate('2025-01-10');
		const completions = [parseISODate('2025-01-10')];
		const cells = GraphRenderer.generateDayCells(completions, 5, 1, 'FREQ=DAILY;INTERVAL=3', [], 'scheduled', scheduled);
		expect(statusOf(cells, '2025-01-15')).toBe('rest');
	});

	it('scheduled-anchor interval habit: on-cadence today is today-missed when uncompleted', () => {
		const scheduled = parseISODate('2025-01-09'); // due 09, 12, 15
		const cells = GraphRenderer.generateDayCells([], 5, 1, 'FREQ=DAILY;INTERVAL=3', [], 'scheduled', scheduled);
		expect(statusOf(cells, '2025-01-15')).toBe('today-missed');
	});
});

describe('generateDayCells — monthly-bymonthday past days (#11)', () => {
	const FIRST = 'FREQ=MONTHLY;BYMONTHDAY=1';

	it('only the scheduled day of month is due; others are rest', () => {
		const completions = [parseISODate('2025-01-01')];
		const cells = GraphRenderer.generateDayCells(completions, 14, 0, FIRST);

		expect(statusOf(cells, '2025-01-01')).toBe('done');
		expect(statusOf(cells, '2025-01-02')).toBe('rest');
		expect(statusOf(cells, '2025-01-10')).toBe('rest');
		expect(statusOf(cells, '2025-01-14')).toBe('rest');
	});

	it('a missed scheduled day of month is missed', () => {
		const cells = GraphRenderer.generateDayCells([], 14, 0, FIRST);

		expect(statusOf(cells, '2025-01-01')).toBe('missed');
		expect(statusOf(cells, '2025-01-02')).toBe('rest');
	});
});

describe('calculateStreak — interval kind (regression: legacy behavior)', () => {
	it('daily habit: consecutive completions through today count', () => {
		const completions = ['2025-01-13', '2025-01-14', '2025-01-15'].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], 'FREQ=DAILY')).toBe(3);
	});

	it('daily habit: gap breaks the streak', () => {
		const completions = ['2025-01-11', '2025-01-12', '2025-01-14', '2025-01-15'].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], 'FREQ=DAILY')).toBe(2);
	});

	it('no completions returns 0', () => {
		expect(GraphRenderer.calculateStreak([], [], 'FREQ=DAILY')).toBe(0);
	});

	it('skipped days do not break the streak', () => {
		const completions = ['2025-01-13', '2025-01-15'].map(parseISODate);
		const skipped = [parseISODate('2025-01-14')];
		expect(GraphRenderer.calculateStreak(completions, skipped, 'FREQ=DAILY')).toBe(2);
	});

	it('every-3-days habit: rest days within interval do not break the streak', () => {
		const completions = ['2025-01-09', '2025-01-12', '2025-01-15'].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], 'FREQ=DAILY;INTERVAL=3')).toBe(3);
	});
});

describe('calculateStreak — weekly-bydays (#11)', () => {
	// Today is Wed 2025-01-15
	const MWF = 'FREQ=WEEKLY;BYDAY=MO,WE,FR';

	it('non-due days (Tue/Thu/weekends) do not break the streak', () => {
		const completions = ['2025-01-08', '2025-01-10', '2025-01-13', '2025-01-15'].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], MWF)).toBe(4);
	});

	it('three unbroken Mon/Wed/Fri weeks count 9', () => {
		const completions = [
			'2024-12-27', '2024-12-30',
			'2025-01-01', '2025-01-03', '2025-01-06', '2025-01-08',
			'2025-01-10', '2025-01-13', '2025-01-15',
		].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], MWF)).toBe(9);
	});

	it('a missed due day breaks the streak', () => {
		// Monday 13th missed; Wed 15 completed
		const completions = ['2025-01-08', '2025-01-10', '2025-01-15'].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], MWF)).toBe(1);
	});

	it('a skipped due day preserves the streak', () => {
		const completions = ['2025-01-08', '2025-01-10', '2025-01-15'].map(parseISODate);
		const skipped = [parseISODate('2025-01-13')]; // Mon marked skipped
		expect(GraphRenderer.calculateStreak(completions, skipped, MWF)).toBe(3);
	});
});

describe('calculateStreak — scheduled-anchor interval (#27)', () => {
	// Today is Wed 2025-01-15; every 3 days anchored to 2025-01-09.
	// Due days: 09, 12, 15.
	const EVERY3 = 'FREQ=DAILY;INTERVAL=3';
	const scheduled = parseISODate('2025-01-09');

	it('off-cadence gap days do not break the streak', () => {
		const completions = ['2025-01-09', '2025-01-12', '2025-01-15'].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], EVERY3, 'scheduled', scheduled)).toBe(3);
	});

	it('a missed on-cadence day breaks the streak', () => {
		// 2025-01-12 was due but not completed
		const completions = ['2025-01-09', '2025-01-15'].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], EVERY3, 'scheduled', scheduled)).toBe(1);
	});

	it('off-cadence completions still count while no due day is missed', () => {
		// Completed on due days 12 and 15, plus an off-cadence 13th — all three
		// count, matching legacy interval semantics (completions accumulate as
		// long as no intervening due day was missed)
		const completions = ['2025-01-12', '2025-01-13', '2025-01-15'].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], EVERY3, 'scheduled', scheduled)).toBe(3);
	});

	it('without a scheduled date, falls back to legacy rolling-window streak (regression)', () => {
		const completions = ['2025-01-09', '2025-01-12', '2025-01-15'].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], EVERY3, 'scheduled', null)).toBe(3);
	});
});

describe('calculateStreak — monthly-bymonthday (#11)', () => {
	it('intervening non-due days do not break a monthly streak', () => {
		// due on the 1st and 15th; today Wed 2025-01-15
		const completions = ['2024-12-15', '2025-01-01', '2025-01-15'].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], 'FREQ=MONTHLY;BYMONTHDAY=1,15')).toBe(3);
	});

	it('a missed due monthday breaks the streak', () => {
		// Jan 1 missed
		const completions = ['2024-12-15', '2025-01-15'].map(parseISODate);
		expect(GraphRenderer.calculateStreak(completions, [], 'FREQ=MONTHLY;BYMONTHDAY=1,15')).toBe(1);
	});
});

describe('markerForCell — uniform glyphs, no today special-case (#33)', () => {
	function makeCell(overrides: Partial<DayCell>): DayCell {
		return {
			date: parseISODate('2025-01-15'),
			isToday: false,
			isPast: false,
			isFuture: false,
			completed: false,
			daysFromLastCompletion: 0,
			status: 'missed',
			...overrides,
		};
	}

	it('completed today gets a plain *, not *!', () => {
		const cell = makeCell({ isToday: true, completed: true, status: 'today-done' });
		expect(GraphRenderer.markerForCell(cell)).toBe('*');
	});

	it('uncompleted due today gets no glyph (the vertical line indicates today)', () => {
		const cell = makeCell({ isToday: true, status: 'today-missed' });
		expect(GraphRenderer.markerForCell(cell)).toBe('');
	});

	it('skipped today gets ~ (fixes the pre-existing !-instead-of-~ quirk)', () => {
		const cell = makeCell({ isToday: true, status: 'skipped' });
		expect(GraphRenderer.markerForCell(cell)).toBe('~');
	});

	it('non-due today (rest since #28) gets no glyph', () => {
		const cell = makeCell({ isToday: true, status: 'rest' });
		expect(GraphRenderer.markerForCell(cell)).toBe('');
	});

	it('completed past day gets *', () => {
		const cell = makeCell({ isPast: true, completed: true, status: 'done' });
		expect(GraphRenderer.markerForCell(cell)).toBe('*');
	});

	it('skipped past day gets ~', () => {
		const cell = makeCell({ isPast: true, status: 'skipped' });
		expect(GraphRenderer.markerForCell(cell)).toBe('~');
	});

	it('missed past days and future days get no glyph', () => {
		expect(GraphRenderer.markerForCell(makeCell({ isPast: true, status: 'missed' }))).toBe('');
		expect(GraphRenderer.markerForCell(makeCell({ isFuture: true, status: 'future-ok' }))).toBe('');
	});
});

describe('colorClassForCell — today tint modifier, yellow always wins (#33)', () => {
	function makeCell(overrides: Partial<DayCell>): DayCell {
		return {
			date: parseISODate('2025-01-15'),
			isToday: false,
			isPast: false,
			isFuture: false,
			completed: false,
			daysFromLastCompletion: 0,
			status: 'missed',
			...overrides,
		};
	}

	it('due-but-undone today stays yellow (call to action wins over today color)', () => {
		const cell = makeCell({ isToday: true, status: 'today-missed' });
		expect(GraphRenderer.colorClassForCell(cell)).toBe('yellow');
	});

	it('non-due today (rest) keeps blue with the today tint modifier', () => {
		const cell = makeCell({ isToday: true, status: 'rest' });
		expect(GraphRenderer.colorClassForCell(cell)).toBe('blue today');
	});

	it('completed today keeps green with the today tint modifier', () => {
		const cell = makeCell({ isToday: true, completed: true, status: 'today-done' });
		expect(GraphRenderer.colorClassForCell(cell)).toBe('green today');
	});

	it('skipped today keeps gray with the today tint modifier', () => {
		const cell = makeCell({ isToday: true, status: 'skipped' });
		expect(GraphRenderer.colorClassForCell(cell)).toBe('gray today');
	});

	it('non-today cells keep their status-driven colors', () => {
		expect(GraphRenderer.colorClassForCell(makeCell({ isPast: true, status: 'done' }))).toBe('green');
		expect(GraphRenderer.colorClassForCell(makeCell({ isPast: true, status: 'missed' }))).toBe('red');
		expect(GraphRenderer.colorClassForCell(makeCell({ isPast: true, status: 'rest' }))).toBe('blue');
		expect(GraphRenderer.colorClassForCell(makeCell({ isPast: true, status: 'skipped' }))).toBe('gray');
		expect(GraphRenderer.colorClassForCell(makeCell({ isFuture: true, status: 'future-ok' }))).toBe('green-light');
		expect(GraphRenderer.colorClassForCell(makeCell({ isFuture: true, status: 'future-too-early' }))).toBe('blue');
		expect(GraphRenderer.colorClassForCell(makeCell({ isFuture: true, status: 'future-warning' }))).toBe('yellow');
		expect(GraphRenderer.colorClassForCell(makeCell({ isFuture: true, status: 'future-overdue' }))).toBe('red');
	});
});
