import { describeOutcome, diffInstances } from '../utils/instanceDiff';
import {
	exactInstanceLists,
	instanceLists,
	isScheduleModeled,
	scheduledAfterClick,
	undoScheduledTarget,
	withScheduledSuffix,
} from '../utils/scheduledAnchor';
import type { CycleAction } from '../utils/scheduledAnchor';
import type { CycleResult, TaskNotesBridge, TaskNotesTaskState, UpdatePropertyOptions } from './taskNotesBridge';

/**
 * Exact-date writes for off days of habits that repeat from their scheduled
 * date, and `scheduled` moves for them (#58). TaskNotes' recurring toggles
 * would move an off-day click onto a missed due day, and never move
 * `scheduled` back on undo, so these use TaskNotes' `updateProperty`, which
 * writes a property as given. Part of the TaskNotes bridge: cycleDay
 * decides when to come here.
 */

export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// Moving `scheduled` with updateProperty deletes every instance on or after
// the new date unless this says no; the plugin never wants that
const KEEP_INSTANCES: UpdatePropertyOptions = { confirmClearInstances: async () => false };

type ListProperty = 'complete_instances' | 'skipped_instances';

function sameList(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((d, i) => d === b[i]);
}

type ScheduledMove = { after: TaskNotesTaskState; note: string } | { error: string };

/**
 * Set `scheduled` to `target` with updateProperty, never letting TaskNotes
 * delete instances, then check the result against `expected` (the task as
 * it should be apart from `scheduled`). The caller has checked that
 * updateProperty exists.
 *
 * @returns the task as written plus a note for the notice when `scheduled`
 *          didn't end up on `target`, or an error after putting back days
 *          that TaskNotes deleted anyway
 */
export async function moveScheduled(
	bridge: TaskNotesBridge,
	path: string,
	expected: TaskNotesTaskState,
	target: string
): Promise<ScheduledMove> {
	const updateProperty = bridge.service.updateProperty!.bind(bridge.service);
	const task = { path };
	try {
		await updateProperty(task, 'scheduled', withScheduledSuffix(expected.scheduled, target), KEEP_INSTANCES);
	} catch (error) {
		return { after: (await bridge.getTaskInfo(path)) ?? {}, note: `; couldn't move scheduled: ${errorMessage(error)}` };
	}

	const after = (await bridge.getTaskInfo(path)) ?? {};
	const drift = diffInstances(expected, after);
	if ([drift.complete, drift.skipped].some(c => c.added.length > 0 || c.removed.length > 0)) {
		// A TaskNotes that ignores KEEP_INSTANCES deletes later days when
		// `scheduled` moves: put the lists back
		const { complete, skipped } = instanceLists(expected);
		await updateProperty(task, 'complete_instances', complete);
		await updateProperty(task, 'skipped_instances', skipped);
		return {
			error: `TaskNotes removed other days while moving scheduled to ${target}; they were put back. Check this habit in TaskNotes`,
		};
	}
	const scheduledNow = typeof after.scheduled === 'string' ? after.scheduled.slice(0, 10) : null;
	if (scheduledNow !== target) {
		return { after, note: `; scheduled stays ${scheduledNow ?? 'empty'} because later days are already marked` };
	}
	return { after, note: '' };
}

/**
 * An off day of a scheduled-anchor habit: write the exact date with
 * updateProperty (lists first), then move `scheduled` to where TaskNotes'
 * toggles would have put it (last, refusing to delete anything), then check
 * what was actually written.
 */
export async function writeExactDay(
	bridge: TaskNotesBridge,
	path: string,
	before: TaskNotesTaskState,
	dateStr: string,
	action: CycleAction,
	todayStr: string
): Promise<CycleResult> {
	const { service } = bridge;
	if (typeof service.updateProperty !== 'function') {
		return {
			status: 'error',
			message: "it isn't a due day for this habit, and this TaskNotes version can't write an exact date. Nothing was written",
		};
	}
	const updateProperty = service.updateProperty.bind(service);
	const task = { path };

	const original = instanceLists(before);
	const planned = exactInstanceLists(before, dateStr, action);
	const lists: [ListProperty, string[], string[]][] = [
		['complete_instances', planned.complete, original.complete],
		['skipped_instances', planned.skipped, original.skipped],
	];
	const attempted: [ListProperty, string[]][] = [];
	try {
		for (const [property, next, was] of lists) {
			if (sameList(next, was)) continue;
			attempted.push([property, was]);
			await updateProperty(task, property, next);
		}
	} catch (error) {
		// Put every list we touched back, so a half-written click leaves nothing behind
		try {
			for (const [property, was] of attempted) await updateProperty(task, property, was);
		} catch (restoreError) {
			return {
				status: 'error',
				message: `${errorMessage(error)}; putting the lists back also failed (${errorMessage(restoreError)}). Check ${dateStr} in TaskNotes`,
			};
		}
		return { status: 'error', message: `${errorMessage(error)}; nothing was changed` };
	}

	const plannedState = { ...before, complete_instances: planned.complete, skipped_instances: planned.skipped };
	// Where TaskNotes' toggles would have put `scheduled`, unless this click
	// clears the day that is owed again
	let target = scheduledAfterClick(plannedState, dateStr, todayStr);
	let undoNote = '';
	if (action === 'unskip') {
		const owed = undoScheduledTarget(plannedState, dateStr, todayStr, target ?? before.scheduled);
		if (owed) {
			target = owed;
			undoNote = `; scheduled back to ${owed}`;
		}
	}

	let after: TaskNotesTaskState;
	let note = '';
	const oldScheduled = typeof before.scheduled === 'string' ? before.scheduled.slice(0, 10) : null;
	if (!isScheduleModeled(before.recurrence)) {
		after = (await bridge.getTaskInfo(path)) ?? {};
		note = '; scheduled left as is for this repeat rule';
	} else if (target && target !== oldScheduled) {
		const moved = await moveScheduled(bridge, path, plannedState, target);
		if ('error' in moved) return { status: 'error', message: moved.error };
		after = moved.after;
		note = moved.note || undoNote;
	} else {
		after = (await bridge.getTaskInfo(path)) ?? {};
	}

	const outcome = describeOutcome(dateStr, diffInstances(before, after));
	return {
		status: 'done',
		action,
		dateStr,
		writePath: 'exact',
		repairedDate: null,
		matchedClick: outcome.matchedClick,
		message: outcome.message + note,
	};
}
