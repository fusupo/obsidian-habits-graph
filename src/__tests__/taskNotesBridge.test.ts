import {
	cycleDay,
	nextCycleAction,
	recordDayClick,
	resolveTaskNotesBridge,
	TaskNotesBridge,
	TaskNotesTaskState,
} from '../tasknotes/taskNotesBridge';
import { formatISODate, parseISODate, addDays } from '../utils/dateUtils';
import { Notice } from 'obsidian';
import type { App } from 'obsidian';

jest.mock('obsidian', () => {
	const actual = jest.requireActual('../../__mocks__/obsidian');
	return { ...actual, Notice: jest.fn() };
});

const PATH = 'TaskNotes/habit.md';
const INTERVAL_DAYS = 14;
const TODAY = '2026-10-01'; // a Thursday

interface FakeTask {
	recurrence: string;
	recurrence_anchor: 'scheduled' | 'completion';
	complete_instances: string[];
	skipped_instances: string[];
	scheduled: string;
}

/** Mon/Wed/Fri from its scheduled date (TaskNotes' default anchor). */
const MWF_HABIT: Partial<FakeTask> = {
	recurrence: 'DTSTART:20260703;FREQ=WEEKLY;BYDAY=MO,FR,WE',
	recurrence_anchor: 'scheduled',
	scheduled: '2026-09-30',
};

/** "Upper expander adjustment" as it was when #58 was found: Wed 9/30 missed. */
const UPPER_EXPANDER: Partial<FakeTask> = {
	...MWF_HABIT,
	complete_instances: [
		'2026-07-04', '2026-07-08', '2026-07-13', '2026-07-17', '2026-07-22', '2026-07-25', '2026-07-30',
		'2026-08-01', '2026-08-25', '2026-08-29', '2026-09-02', '2026-09-08', '2026-09-12', '2026-09-17',
	],
	skipped_instances: [
		'2026-07-06', '2026-07-10', '2026-07-15', '2026-07-20', '2026-07-27', '2026-08-03', '2026-08-05',
		'2026-08-07', '2026-08-10', '2026-08-12', '2026-08-14', '2026-08-17', '2026-08-19', '2026-08-21',
		'2026-08-26', '2026-08-31', '2026-09-04', '2026-09-09', '2026-09-14',
	],
};

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const shift = (iso: string, days: number) => formatISODate(addDays(parseISODate(iso), days));

/**
 * Stand-in for TaskNotes' rrule expansion, deliberately independent of the
 * plugin's isDueOn so tests can catch the two disagreeing. Handles
 * FREQ=DAILY and FREQ=WEEKLY (with or without BYDAY), each with INTERVAL,
 * counted from DTSTART; weeks start on Monday.
 */
function isOccurrence(recurrence: string, iso: string): boolean {
	const start = recurrence.match(/DTSTART:(\d{4})(\d{2})(\d{2})/)!.slice(1).join('-');
	if (iso < start) return false;
	const param = (key: string) => recurrence.match(new RegExp(`${key}=([^;]+)`))?.[1];
	const interval = Number(param('INTERVAL') ?? 1);
	const startDate = parseISODate(start);
	const date = parseISODate(iso);
	const days = Math.round((date.getTime() - startDate.getTime()) / 86400000);

	if (param('FREQ') === 'DAILY') return days % interval === 0;
	if (param('FREQ') === 'WEEKLY') {
		const byDay = param('BYDAY')?.split(',') ?? [WEEKDAYS[startDate.getUTCDay()]];
		const weeks = Math.floor((days + ((startDate.getUTCDay() + 6) % 7)) / 7);
		return byDay.includes(WEEKDAYS[date.getUTCDay()]) && weeks % interval === 0;
	}
	throw new Error(`fake TaskNotes can't expand ${recurrence}`);
}

/** TaskNotes' `$Ue`: how far back a toggle looks for a missed due day. */
function lookBackDays(recurrence: string): number {
	const interval = Number(recurrence.match(/INTERVAL=(\d+)/)?.[1] ?? 1);
	if (recurrence.includes('FREQ=DAILY')) return Math.max(30, interval * 2);
	if (recurrence.includes('FREQ=WEEKLY')) return Math.max(90, interval * 14);
	return 365;
}

type ConfirmClearInstances = (instances: { complete: string[]; skipped: string[] }) => Promise<boolean>;

/**
 * In-memory stand-in for TaskNotes 4.13.6's task service, reproducing the
 * semantics the bridge depends on:
 * - the date a toggle acts on (`fce`/`UUe`): the exact date for completion-
 *   anchored habits and for due days; for an off day of any other habit,
 *   the latest due day in the look-back window that isn't done or skipped,
 *   else the next one (#58)
 * - complete toggle: flips membership, always drops the date from skipped,
 *   and on ADD with anchor 'completion' rewrites DTSTART to that date
 *   (even an older one); removal never reverts DTSTART
 * - skip toggle: flips membership; on ADD drops the date from complete;
 *   never touches the recurrence
 * - `scheduled` after a toggle: for anchor 'completion', derived from
 *   DTSTART; otherwise the first due day on or after the later of the
 *   toggled day and today that isn't done or skipped (`Cd`), keeping any
 *   time suffix
 * - updateProperty: writes the value as given, except that moving
 *   `scheduled` deletes every instance on or after the new date, unless
 *   `confirmClearInstances` resolves false, which cancels the write
 */
function makeFakeTaskNotes(initial: Partial<FakeTask> = {}, today = TODAY) {
	const task: FakeTask = {
		recurrence: 'DTSTART:20260101;FREQ=WEEKLY;INTERVAL=2',
		recurrence_anchor: 'completion',
		complete_instances: [],
		skipped_instances: [],
		scheduled: '2026-01-15',
		...initial,
	};
	task.complete_instances = [...task.complete_instances];
	task.skipped_instances = [...task.skipped_instances];

	const dtstart = () => task.recurrence.match(/DTSTART:(\d{4})(\d{2})(\d{2})/)!.slice(1).join('-');
	const handled = () => new Set([...task.complete_instances, ...task.skipped_instances]);

	const actionDate = (iso: string): string => {
		if (task.recurrence_anchor === 'completion' || isOccurrence(task.recurrence, iso)) return iso;
		const done = handled();
		for (let back = 1; back <= lookBackDays(task.recurrence); back++) {
			const earlier = shift(iso, -back);
			if (isOccurrence(task.recurrence, earlier) && !done.has(earlier)) return earlier;
		}
		for (let ahead = 1; ahead <= 400; ahead++) {
			const later = shift(iso, ahead);
			if (isOccurrence(task.recurrence, later) && !done.has(later)) return later;
		}
		return iso;
	};

	const rescheduled = (toggled: string) => {
		if (task.recurrence_anchor === 'completion') {
			task.scheduled = formatISODate(addDays(parseISODate(dtstart()), INTERVAL_DAYS));
			return;
		}
		const from = toggled > today ? toggled : today;
		const done = handled();
		for (let ahead = 0; ahead <= 400; ahead++) {
			const candidate = shift(from, ahead);
			if (isOccurrence(task.recurrence, candidate) && !done.has(candidate)) {
				task.scheduled = `${candidate}${task.scheduled.slice(10)}`;
				return;
			}
		}
	};

	const toggleComplete = jest.fn(async (ref: { path: string }, date: Date) => {
		expect(ref.path).toBe(PATH);
		const d = actionDate(formatISODate(date));
		task.skipped_instances = task.skipped_instances.filter(x => x !== d);
		if (task.complete_instances.includes(d)) {
			task.complete_instances = task.complete_instances.filter(x => x !== d);
		} else {
			task.complete_instances = [...task.complete_instances, d];
			if (task.recurrence_anchor === 'completion') {
				task.recurrence = task.recurrence.replace(/DTSTART:[^;]+/, `DTSTART:${d.replace(/-/g, '')}`);
			}
		}
		rescheduled(d);
	});
	const toggleSkipped = jest.fn(async (ref: { path: string }, date: Date) => {
		expect(ref.path).toBe(PATH);
		const d = actionDate(formatISODate(date));
		if (task.skipped_instances.includes(d)) {
			task.skipped_instances = task.skipped_instances.filter(x => x !== d);
		} else {
			task.skipped_instances = [...task.skipped_instances, d];
			task.complete_instances = task.complete_instances.filter(x => x !== d);
		}
		rescheduled(d);
	});
	const toggleCompleteWithOccurrenceNotes = jest.fn((ref: { path: string }, date: Date) => toggleComplete(ref, date));

	const updateProperty = jest.fn(async (
		ref: { path: string },
		property: string,
		value: unknown,
		options: { confirmClearInstances?: ConfirmClearInstances } = {}
	) => {
		expect(ref.path).toBe(PATH);
		if (property === 'complete_instances' || property === 'skipped_instances') {
			task[property] = [...(value as string[])];
			return;
		}
		if (property !== 'scheduled') throw new Error(`fake updateProperty can't write ${property}`);

		const next = String(value);
		const newDate = next.slice(0, 10);
		if (task.scheduled.slice(0, 10) !== newDate) {
			const complete = task.complete_instances.filter(d => d >= newDate);
			const skipped = task.skipped_instances.filter(d => d >= newDate);
			if (complete.length > 0 || skipped.length > 0) {
				if (options.confirmClearInstances && !(await options.confirmClearInstances({ complete, skipped }))) return;
				task.complete_instances = task.complete_instances.filter(d => d < newDate);
				task.skipped_instances = task.skipped_instances.filter(d => d < newDate);
			}
		}
		task.scheduled = next;
	});

	const service = {
		toggleRecurringTaskCompleteWithOccurrenceNotes: toggleCompleteWithOccurrenceNotes,
		toggleRecurringTaskComplete: toggleComplete,
		toggleRecurringTaskSkipped: toggleSkipped,
		updateProperty,
	};
	const bridge: TaskNotesBridge = {
		service,
		getTaskInfo: async (path) => (path === PATH ? structuredCloneTask(task) : null),
	};

	return { task, bridge, toggleComplete, toggleSkipped, toggleCompleteWithOccurrenceNotes, updateProperty, dtstart };
}

function structuredCloneTask(task: FakeTask): TaskNotesTaskState & FakeTask {
	return { ...task, complete_instances: [...task.complete_instances], skipped_instances: [...task.skipped_instances] };
}

function makeApp(tasknotes: unknown): App {
	return { plugins: { plugins: { tasknotes } } } as unknown as App;
}

const day = (iso: string) => parseISODate(iso);

beforeEach(() => {
	(Notice as unknown as jest.Mock).mockClear();
});

describe('nextCycleAction — blank → done → skipped → blank', () => {
	it('blank day → complete', () => {
		expect(nextCycleAction({ complete_instances: [], skipped_instances: [] }, '2026-09-18')).toBe('complete');
	});
	it('done day → skip', () => {
		expect(nextCycleAction({ complete_instances: ['2026-09-18'] }, '2026-09-18')).toBe('skip');
	});
	it('skipped day → unskip', () => {
		expect(nextCycleAction({ skipped_instances: ['2026-09-18'] }, '2026-09-18')).toBe('unskip');
	});
	it('tolerates missing or non-array fields', () => {
		expect(nextCycleAction({ complete_instances: 'nope' }, '2026-09-18')).toBe('complete');
	});
});

describe('resolveTaskNotesBridge — shape-checked access to TaskNotes internals', () => {
	const fullService = () => ({
		toggleRecurringTaskCompleteWithOccurrenceNotes: jest.fn(),
		toggleRecurringTaskComplete: jest.fn(),
		toggleRecurringTaskSkipped: jest.fn(),
	});

	it('returns null when TaskNotes is not installed', () => {
		expect(resolveTaskNotesBridge({} as App)).toBeNull();
		expect(resolveTaskNotesBridge(makeApp(undefined))).toBeNull();
	});

	it('returns null when any toggle is missing (API changed)', () => {
		const service = fullService();
		delete (service as Partial<typeof service>).toggleRecurringTaskSkipped;
		expect(resolveTaskNotesBridge(makeApp({ taskService: service, cacheManager: { getTaskInfo: jest.fn() } }))).toBeNull();
	});

	it('returns null when cacheManager.getTaskInfo is missing', () => {
		expect(resolveTaskNotesBridge(makeApp({ taskService: fullService(), cacheManager: {} }))).toBeNull();
	});

	it('calls getTaskInfo with cacheManager as `this`', async () => {
		const cacheManager = {
			tasks: { [PATH]: { recurrence: 'FREQ=DAILY' } } as Record<string, TaskNotesTaskState>,
			async getTaskInfo(this: { tasks: Record<string, TaskNotesTaskState> }, path: string) {
				return this.tasks[path] ?? null;
			},
		};
		const bridge = resolveTaskNotesBridge(makeApp({ taskService: fullService(), cacheManager }));
		expect(bridge).not.toBeNull();
		await expect(bridge!.getTaskInfo(PATH)).resolves.toEqual({ recurrence: 'FREQ=DAILY' });
	});
});

describe('fake TaskNotes — matches 4.13.6 where #58 depends on it', () => {
	it('a toggle on an off day of a scheduled-anchor habit lands on the latest missed due day', async () => {
		const fake = makeFakeTaskNotes(UPPER_EXPANDER);
		await fake.bridge.service.toggleRecurringTaskCompleteWithOccurrenceNotes({ path: PATH }, day('2026-10-01'));
		expect(fake.task.complete_instances).toContain('2026-09-30');
		expect(fake.task.complete_instances).not.toContain('2026-10-01');
		expect(fake.task.scheduled).toBe('2026-10-02');
	});

	it('toggling the same off day again walks back to the next missed due day', async () => {
		const fake = makeFakeTaskNotes(UPPER_EXPANDER);
		await fake.bridge.service.toggleRecurringTaskComplete({ path: PATH }, day('2026-10-01'));
		await fake.bridge.service.toggleRecurringTaskComplete({ path: PATH }, day('2026-10-01'));
		expect(fake.task.complete_instances.slice(-2)).toEqual(['2026-09-30', '2026-09-28']);
	});

	it('skips move the same way', async () => {
		const fake = makeFakeTaskNotes(UPPER_EXPANDER);
		await fake.bridge.service.toggleRecurringTaskSkipped({ path: PATH }, day('2026-10-01'));
		expect(fake.task.skipped_instances).toContain('2026-09-30');
	});

	it('due days and completion-anchored habits keep the exact date', async () => {
		const scheduled = makeFakeTaskNotes(UPPER_EXPANDER);
		await scheduled.bridge.service.toggleRecurringTaskComplete({ path: PATH }, day('2026-09-28'));
		expect(scheduled.task.complete_instances).toContain('2026-09-28');

		const completion = makeFakeTaskNotes({ ...UPPER_EXPANDER, recurrence_anchor: 'completion' });
		await completion.bridge.service.toggleRecurringTaskComplete({ path: PATH }, day('2026-10-01'));
		expect(completion.task.complete_instances).toContain('2026-10-01');
	});

	it('moving scheduled with updateProperty deletes later instances unless refused', async () => {
		const fake = makeFakeTaskNotes({ ...MWF_HABIT, scheduled: '2026-10-05', complete_instances: ['2026-09-28', '2026-10-02'] });
		const service = fake.bridge.service as unknown as { updateProperty: typeof fake.updateProperty };

		await service.updateProperty({ path: PATH }, 'scheduled', '2026-09-30', { confirmClearInstances: async () => false });
		expect(fake.task.scheduled).toBe('2026-10-05');
		expect(fake.task.complete_instances).toEqual(['2026-09-28', '2026-10-02']);

		await service.updateProperty({ path: PATH }, 'scheduled', '2026-09-30');
		expect(fake.task.scheduled).toBe('2026-09-30');
		expect(fake.task.complete_instances).toEqual(['2026-09-28']);
	});
});

describe('cycleDay — one click through TaskNotes', () => {
	it('cycles a day blank → done → skipped → blank', async () => {
		const fake = makeFakeTaskNotes(MWF_HABIT);

		await cycleDay(fake.bridge, PATH, day('2026-09-18'));
		expect(fake.task.complete_instances).toEqual(['2026-09-18']);

		await cycleDay(fake.bridge, PATH, day('2026-09-18'));
		expect(fake.task.complete_instances).toEqual([]);
		expect(fake.task.skipped_instances).toEqual(['2026-09-18']);

		const last = await cycleDay(fake.bridge, PATH, day('2026-09-18'));
		expect(fake.task.skipped_instances).toEqual([]);
		expect(last).toEqual({ status: 'done', action: 'unskip', dateStr: '2026-09-18', repairedDate: null });
	});

	it('completes with the occurrence-notes toggle and skips with the skip toggle', async () => {
		const fake = makeFakeTaskNotes(MWF_HABIT);
		await cycleDay(fake.bridge, PATH, day('2026-09-18'));
		await cycleDay(fake.bridge, PATH, day('2026-09-18'));
		expect(fake.toggleCompleteWithOccurrenceNotes).toHaveBeenCalledTimes(1);
		expect(fake.toggleSkipped).toHaveBeenCalledTimes(1);
	});

	it('passes the cell date through unchanged (UTC midnight, TZ pinned negative)', async () => {
		const fake = makeFakeTaskNotes(MWF_HABIT);
		const cellDate = day('2026-09-18');
		await cycleDay(fake.bridge, PATH, cellDate);
		expect(fake.toggleCompleteWithOccurrenceNotes.mock.calls[0][1].getTime()).toBe(cellDate.getTime());
	});

	it('repairs DTSTART with the plain complete toggle after an out-of-order completion', async () => {
		const fake = makeFakeTaskNotes({ complete_instances: ['2026-09-20'], recurrence: 'DTSTART:20260920;FREQ=WEEKLY;INTERVAL=2' });

		const result = await cycleDay(fake.bridge, PATH, day('2026-09-06'));

		expect(result).toEqual({ status: 'done', action: 'complete', dateStr: '2026-09-06', repairedDate: '2026-09-20' });
		expect(fake.dtstart()).toBe('2026-09-20');
		expect(fake.task.complete_instances.sort()).toEqual(['2026-09-06', '2026-09-20']);
		expect(fake.toggleCompleteWithOccurrenceNotes).toHaveBeenCalledTimes(1);
		expect(fake.toggleComplete).toHaveBeenCalledTimes(3); // 1 via the wrapper + 2 repair
	});

	it('repairs DTSTART after an undone mistake', async () => {
		const fake = makeFakeTaskNotes({ complete_instances: ['2026-09-06'], recurrence: 'DTSTART:20260906;FREQ=WEEKLY;INTERVAL=2' });

		await cycleDay(fake.bridge, PATH, day('2026-09-25')); // oops: done
		await cycleDay(fake.bridge, PATH, day('2026-09-25')); // → skipped
		await cycleDay(fake.bridge, PATH, day('2026-09-25')); // → blank

		expect(fake.task.complete_instances).toEqual(['2026-09-06']);
		expect(fake.dtstart()).toBe('2026-09-06');
	});

	it('never repairs scheduled-anchor habits', async () => {
		const fake = makeFakeTaskNotes({ ...MWF_HABIT, complete_instances: ['2026-09-21'] });
		await cycleDay(fake.bridge, PATH, day('2026-09-07')); // an older due day
		expect(fake.dtstart()).toBe('2026-07-03');
		expect(fake.toggleComplete).toHaveBeenCalledTimes(1);
	});

	it('reports an error and releases the habit when a toggle throws', async () => {
		const fake = makeFakeTaskNotes();
		fake.toggleCompleteWithOccurrenceNotes.mockRejectedValueOnce(new Error('Task is not recurring'));

		await expect(cycleDay(fake.bridge, PATH, day('2026-09-18'))).resolves.toEqual({ status: 'error', message: 'Task is not recurring' });
		await expect(cycleDay(fake.bridge, PATH, day('2026-09-18'))).resolves.toMatchObject({ status: 'done' });
	});

	it('names the date when the repair itself fails', async () => {
		const fake = makeFakeTaskNotes({ complete_instances: ['2026-09-20'], recurrence: 'DTSTART:20260920;FREQ=WEEKLY;INTERVAL=2' });
		fake.toggleComplete
			.mockImplementationOnce(fake.toggleComplete.getMockImplementation()!) // the click, via the wrapper
			.mockImplementationOnce(fake.toggleComplete.getMockImplementation()!) // repair: off
			.mockRejectedValueOnce(new Error('disk full')); // repair: on

		const result = await cycleDay(fake.bridge, PATH, day('2026-09-06'));
		expect(result).toEqual({ status: 'error', message: 'disk full (while re-marking 2026-09-20; check it is still marked done)' });
	});

	it('reports an error when TaskNotes has no task at the path', async () => {
		const fake = makeFakeTaskNotes();
		await expect(cycleDay(fake.bridge, 'elsewhere.md', day('2026-09-18'))).resolves.toEqual({
			status: 'error',
			message: 'TaskNotes has no task at elsewhere.md',
		});
	});

	it('drops a second click on a habit that is still being written', async () => {
		const fake = makeFakeTaskNotes(MWF_HABIT);
		let release!: () => void;
		fake.toggleCompleteWithOccurrenceNotes.mockImplementationOnce(
			() => new Promise<void>(resolve => { release = resolve; })
		);

		const first = cycleDay(fake.bridge, PATH, day('2026-09-18'));
		await expect(cycleDay(fake.bridge, PATH, day('2026-09-19'))).resolves.toEqual({ status: 'busy' });
		release();
		await expect(first).resolves.toMatchObject({ status: 'done' });
	});
});

describe('cycleDay — final state does not depend on click order', () => {
	/** Every distinct ordering of a multiset of click targets. */
	function distinctPermutations(items: string[]): string[][] {
		if (items.length <= 1) return [items];
		const out: string[][] = [];
		for (const first of new Set(items)) {
			const rest = [...items];
			rest.splice(rest.indexOf(first), 1);
			for (const tail of distinctPermutations(rest)) out.push([first, ...tail]);
		}
		return out;
	}

	it('ends with the same instances, DTSTART and scheduled for every click order', async () => {
		// Targets: A done (1 click), B skipped (2 clicks), C done after a full
		// mistaken cycle (4 clicks), D done (1 click)
		const clicks = ['2026-09-01', '2026-09-08', '2026-09-08', '2026-09-15', '2026-09-15', '2026-09-15', '2026-09-15', '2026-09-22'];
		const orders = distinctPermutations(clicks);
		expect(orders.length).toBe(840);

		for (const order of orders) {
			const fake = makeFakeTaskNotes();
			for (const iso of order) {
				await cycleDay(fake.bridge, PATH, day(iso));
			}
			expect([...fake.task.complete_instances].sort()).toEqual(['2026-09-01', '2026-09-15', '2026-09-22']);
			expect(fake.task.skipped_instances).toEqual(['2026-09-08']);
			expect(fake.dtstart()).toBe('2026-09-22');
			expect(fake.task.scheduled).toBe('2026-10-06');
		}
	});
});

describe('recordDayClick — click handler with notices', () => {
	function makeTaskNotesApp() {
		const fake = makeFakeTaskNotes(MWF_HABIT);
		const app = makeApp({
			taskService: fake.bridge.service,
			cacheManager: { getTaskInfo: fake.bridge.getTaskInfo },
		});
		return { fake, app };
	}

	it('shows a notice and writes nothing without TaskNotes', async () => {
		await expect(recordDayClick(makeApp(undefined), PATH, day('2026-09-18'))).resolves.toBeNull();
		expect(Notice).toHaveBeenCalledWith('TaskNotes is not available (or its API changed); nothing was recorded.');
	});

	it('confirms each step of the cycle', async () => {
		const { app } = makeTaskNotesApp();
		await recordDayClick(app, PATH, day('2026-09-18'));
		await recordDayClick(app, PATH, day('2026-09-18'));
		await recordDayClick(app, PATH, day('2026-09-18'));
		expect((Notice as unknown as jest.Mock).mock.calls.map(c => c[0])).toEqual([
			'Marked 2026-09-18 done',
			'Marked 2026-09-18 skipped',
			'Marked 2026-09-18 cleared',
		]);
	});

	it('shows the error in a notice', async () => {
		const { fake, app } = makeTaskNotesApp();
		fake.toggleCompleteWithOccurrenceNotes.mockRejectedValueOnce(new Error('Task is not recurring'));
		await recordDayClick(app, PATH, day('2026-09-18'));
		expect(Notice).toHaveBeenCalledWith("Couldn't record 2026-09-18: Task is not recurring");
	});
});
