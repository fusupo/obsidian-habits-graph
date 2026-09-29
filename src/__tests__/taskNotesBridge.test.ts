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

interface FakeTask {
	recurrence: string;
	recurrence_anchor: 'scheduled' | 'completion';
	complete_instances: string[];
	skipped_instances: string[];
	scheduled: string;
}

/**
 * In-memory stand-in for TaskNotes 4.13.6's recurring toggles, reproducing
 * the semantics the bridge depends on:
 * - complete toggle: flips membership, always drops the date from skipped,
 *   and on ADD with anchor 'completion' rewrites DTSTART to that date
 *   (even an older one); removal never reverts DTSTART
 * - skip toggle: flips membership; on ADD drops the date from complete;
 *   never touches the recurrence
 * - `scheduled` is derived from DTSTART, like TaskNotes' completion-anchor
 *   next-occurrence math
 */
function makeFakeTaskNotes(initial: Partial<FakeTask> = {}) {
	const task: FakeTask = {
		recurrence: 'DTSTART:20260101;FREQ=WEEKLY;INTERVAL=2',
		recurrence_anchor: 'completion',
		complete_instances: [],
		skipped_instances: [],
		scheduled: '2026-01-15',
		...initial,
	};

	const dtstart = () => task.recurrence.match(/DTSTART:(\d{4})(\d{2})(\d{2})/)!.slice(1).join('-');
	const rescheduled = () => {
		task.scheduled = formatISODate(addDays(parseISODate(dtstart()), INTERVAL_DAYS));
	};

	const toggleComplete = jest.fn(async (ref: { path: string }, date: Date) => {
		expect(ref.path).toBe(PATH);
		const d = formatISODate(date);
		task.skipped_instances = task.skipped_instances.filter(x => x !== d);
		if (task.complete_instances.includes(d)) {
			task.complete_instances = task.complete_instances.filter(x => x !== d);
		} else {
			task.complete_instances = [...task.complete_instances, d];
			if (task.recurrence_anchor === 'completion') {
				task.recurrence = task.recurrence.replace(/DTSTART:[^;]+/, `DTSTART:${d.replace(/-/g, '')}`);
			}
		}
		rescheduled();
	});
	const toggleSkipped = jest.fn(async (ref: { path: string }, date: Date) => {
		expect(ref.path).toBe(PATH);
		const d = formatISODate(date);
		if (task.skipped_instances.includes(d)) {
			task.skipped_instances = task.skipped_instances.filter(x => x !== d);
		} else {
			task.skipped_instances = [...task.skipped_instances, d];
			task.complete_instances = task.complete_instances.filter(x => x !== d);
		}
		rescheduled();
	});
	const toggleCompleteWithOccurrenceNotes = jest.fn((ref: { path: string }, date: Date) => toggleComplete(ref, date));

	const bridge: TaskNotesBridge = {
		service: {
			toggleRecurringTaskCompleteWithOccurrenceNotes: toggleCompleteWithOccurrenceNotes,
			toggleRecurringTaskComplete: toggleComplete,
			toggleRecurringTaskSkipped: toggleSkipped,
		},
		getTaskInfo: async (path) => (path === PATH ? structuredCloneTask(task) : null),
	};

	return { task, bridge, toggleComplete, toggleSkipped, toggleCompleteWithOccurrenceNotes, dtstart };
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

describe('cycleDay — one click through TaskNotes', () => {
	it('cycles a day blank → done → skipped → blank', async () => {
		const fake = makeFakeTaskNotes({ recurrence_anchor: 'scheduled' });

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
		const fake = makeFakeTaskNotes({ recurrence_anchor: 'scheduled' });
		await cycleDay(fake.bridge, PATH, day('2026-09-18'));
		await cycleDay(fake.bridge, PATH, day('2026-09-18'));
		expect(fake.toggleCompleteWithOccurrenceNotes).toHaveBeenCalledTimes(1);
		expect(fake.toggleSkipped).toHaveBeenCalledTimes(1);
	});

	it('passes the cell date through unchanged (UTC midnight, TZ pinned negative)', async () => {
		const fake = makeFakeTaskNotes({ recurrence_anchor: 'scheduled' });
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
		const fake = makeFakeTaskNotes({ recurrence_anchor: 'scheduled', complete_instances: ['2026-09-20'] });
		await cycleDay(fake.bridge, PATH, day('2026-09-06'));
		expect(fake.dtstart()).toBe('2026-01-01');
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
		const fake = makeFakeTaskNotes({ recurrence_anchor: 'scheduled' });
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
		const fake = makeFakeTaskNotes({ recurrence_anchor: 'scheduled' });
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
