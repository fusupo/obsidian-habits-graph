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
