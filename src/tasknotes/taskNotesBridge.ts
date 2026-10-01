import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import { formatISODate, getTodayUTC, parseISODate } from '../utils/dateUtils';
import { dtstartRepairDate } from '../utils/completionAnchorRepair';
import { describeOutcome, diffInstances } from '../utils/instanceDiff';
import { chooseWritePath, undoScheduledTarget } from '../utils/scheduledAnchor';
import type { CycleAction, ScheduleState } from '../utils/scheduledAnchor';
import { errorMessage, moveScheduled, writeExactDay } from './exactDayWrite';

export type { CycleAction };

/**
 * Bridge to the TaskNotes plugin for recording a day on a habit (#47, #58).
 *
 * Writes go through TaskNotes' task service, never to frontmatter directly,
 * so renamed property names, occurrence notes and TaskNotes' cache stay
 * right. Most clicks use TaskNotes' recurring toggles, which also keep
 * `scheduled` and DTSTART up to date. The exception is an off day of a habit
 * that repeats from its scheduled date: the toggles would move that click
 * onto a missed due day, so the bridge writes the exact date with
 * `updateProperty` and moves `scheduled` itself, the way TaskNotes would.
 *
 * `taskService` and `cacheManager` are undocumented internals (verified
 * against TaskNotes 4.13.6): all access stays in this file, behind shape
 * checks.
 */

type TaskRef = { path: string };

export interface UpdatePropertyOptions {
	/**
	 * Asked when moving `scheduled` would delete instances on or after the
	 * new date; resolving false cancels the whole write.
	 */
	confirmClearInstances?: (instances: { complete: string[]; skipped: string[] }) => Promise<boolean>;
}

/** The TaskNotes `taskService` methods this bridge calls. */
export interface TaskNotesService {
	toggleRecurringTaskCompleteWithOccurrenceNotes(task: TaskRef, date: Date): Promise<unknown>;
	toggleRecurringTaskComplete(task: TaskRef, date: Date): Promise<unknown>;
	toggleRecurringTaskSkipped(task: TaskRef, date: Date): Promise<unknown>;
	/**
	 * Writes one property as given, with no recurrence logic. Only off-day
	 * clicks need it, so a TaskNotes without it still records due days.
	 */
	updateProperty?(task: TaskRef, property: string, value: unknown, options?: UpdatePropertyOptions): Promise<unknown>;
}

/** The TaskNotes TaskInfo fields this bridge reads (TaskNotes' snake_case names). */
export type TaskNotesTaskState = ScheduleState;

export interface TaskNotesBridge {
	service: TaskNotesService;
	/** Fresh task state: TaskNotes' cache serves its own pending writes immediately. */
	getTaskInfo(path: string): Promise<TaskNotesTaskState | null>;
}

interface TaskNotesPluginShape {
	taskService?: Partial<TaskNotesService>;
	cacheManager?: { getTaskInfo?: (path: string) => Promise<TaskNotesTaskState | null> };
}

type AppWithPlugins = App & {
	plugins?: { plugins?: Record<string, TaskNotesPluginShape | undefined> };
};

/**
 * Find TaskNotes' task service, or null if TaskNotes is missing, disabled
 * or its internals changed shape. Resolve fresh on every use: TaskNotes can
 * be disabled or reloaded at any time.
 */
export function resolveTaskNotesBridge(app: App): TaskNotesBridge | null {
	const tasknotes = (app as AppWithPlugins).plugins?.plugins?.tasknotes;
	const service = tasknotes?.taskService;
	const cacheManager = tasknotes?.cacheManager;
	if (
		typeof service?.toggleRecurringTaskCompleteWithOccurrenceNotes !== 'function' ||
		typeof service.toggleRecurringTaskComplete !== 'function' ||
		typeof service.toggleRecurringTaskSkipped !== 'function' ||
		typeof cacheManager?.getTaskInfo !== 'function'
	) {
		return null;
	}
	return {
		service: service as TaskNotesService,
		getTaskInfo: (path) => cacheManager.getTaskInfo!(path),
	};
}

function includesDate(list: unknown, dateStr: string): boolean {
	return Array.isArray(list) && list.includes(dateStr);
}

/**
 * The click cycle is blank → done → skipped → blank. TaskNotes' skip toggle
 * moves a completed date into `skipped_instances`, so done → skipped is a
 * single skip toggle.
 */
export function nextCycleAction(state: TaskNotesTaskState, dateStr: string): CycleAction {
	if (includesDate(state.complete_instances, dateStr)) return 'skip';
	if (includesDate(state.skipped_instances, dateStr)) return 'unskip';
	return 'complete';
}

export type CycleResult =
	| {
			status: 'done';
			action: CycleAction;
			dateStr: string;
			/** 'toggle' = TaskNotes' recurring toggles; 'exact' = updateProperty for an off day (#58). */
			writePath: 'toggle' | 'exact';
			repairedDate: string | null;
			/** True when the clicked day is the only day that changed. */
			matchedClick: boolean;
			/** What was actually written, for the notice. */
			message: string;
	  }
	| { status: 'busy' }
	| { status: 'error'; message: string };

// Each click's action depends on the state the previous click wrote, so a
// habit takes one click at a time; clicks on a busy habit are dropped
const inFlight = new Set<string>();

export function isDayClickInFlight(path: string): boolean {
	return inFlight.has(path);
}

/**
 * Advance one day of a habit through the click cycle via TaskNotes.
 *
 * @param date - UTC-midnight cell date; TaskNotes formats it with UTC
 *               components, so it passes through unchanged
 * @param today - UTC-midnight today, for where `scheduled` goes after an
 *                off-day click
 */
export async function cycleDay(
	bridge: TaskNotesBridge,
	path: string,
	date: Date,
	today: Date = getTodayUTC()
): Promise<CycleResult> {
	if (inFlight.has(path)) return { status: 'busy' };
	inFlight.add(path);

	const dateStr = formatISODate(date);
	try {
		// Read state from TaskNotes, not the rendered cell or our cache: both
		// can lag TaskNotes' last write
		const before = await bridge.getTaskInfo(path);
		if (!before) return { status: 'error', message: `TaskNotes has no task at ${path}` };

		const action = nextCycleAction(before, dateStr);
		const todayStr = formatISODate(today);
		if (chooseWritePath(before, dateStr) === 'exact') {
			return await writeExactDay(bridge, path, before, dateStr, action, todayStr);
		}
		return await toggleDay(bridge, path, date, before, dateStr, action, todayStr);
	} catch (error) {
		return { status: 'error', message: errorMessage(error) };
	} finally {
		inFlight.delete(path);
	}
}

/**
 * The click through TaskNotes' toggles, then:
 * - for habits that repeat from completion, the DTSTART repair (see
 *   dtstartRepairDate), which makes the result depend only on which days
 *   end up marked, not on click order
 * - for other habits, when the click clears the day that is owed again,
 *   `scheduled` goes back to it (see undoScheduledTarget); TaskNotes never
 *   moves it back itself
 */
async function toggleDay(
	bridge: TaskNotesBridge,
	path: string,
	date: Date,
	before: TaskNotesTaskState,
	dateStr: string,
	action: CycleAction,
	todayStr: string
): Promise<CycleResult> {
	const task = { path };
	if (action === 'complete') {
		await bridge.service.toggleRecurringTaskCompleteWithOccurrenceNotes(task, date);
	} else {
		await bridge.service.toggleRecurringTaskSkipped(task, date);
	}

	const after = await bridge.getTaskInfo(path);
	// Report what TaskNotes wrote, not what the click asked for. The repair
	// below is net-zero on the lists
	const outcome = describeOutcome(dateStr, diffInstances(before, after ?? {}));
	const repairedDate = after
		? dtstartRepairDate(after.recurrence_anchor, after.recurrence, after.complete_instances)
		: null;
	if (repairedDate) {
		// Off then on: marking complete is what makes TaskNotes set DTSTART
		// and recompute `scheduled`. The plain toggle, not the occurrence-
		// notes variant, so an occurrence note isn't touched twice
		const repairDate = parseISODate(repairedDate);
		try {
			await bridge.service.toggleRecurringTaskComplete(task, repairDate);
			await bridge.service.toggleRecurringTaskComplete(task, repairDate);
		} catch (error) {
			return {
				status: 'error',
				message: `${errorMessage(error)} (while re-marking ${repairedDate}; check it is still marked done)`,
			};
		}
	}

	let note = '';
	const owed = action === 'unskip' && after ? undoScheduledTarget(after, dateStr, todayStr, after.scheduled) : null;
	// Without updateProperty the day is still cleared; only the undo of `scheduled` is skipped
	if (owed && after && typeof bridge.service.updateProperty === 'function') {
		const moved = await moveScheduled(bridge, path, after, owed);
		if ('error' in moved) return { status: 'error', message: moved.error };
		note = moved.note || `; scheduled back to ${owed}`;
	}

	return {
		status: 'done',
		action,
		dateStr,
		writePath: 'toggle',
		repairedDate,
		matchedClick: outcome.matchedClick,
		message: outcome.message + note,
	};
}

/**
 * Click handler body for a graph cell: resolve TaskNotes, cycle the day and
 * report the outcome in a Notice. Writes nothing if TaskNotes is missing.
 */
export async function recordDayClick(
	app: App,
	path: string,
	date: Date,
	today: Date = getTodayUTC()
): Promise<CycleResult | null> {
	const bridge = resolveTaskNotesBridge(app);
	if (!bridge) {
		new Notice('TaskNotes is not available (or its API changed); nothing was recorded.');
		return null;
	}

	const result = await cycleDay(bridge, path, date, today);
	if (result.status === 'done') {
		new Notice(result.message);
	} else if (result.status === 'error') {
		new Notice(`Couldn't record ${formatISODate(date)}: ${result.message}`);
	}
	return result;
}
