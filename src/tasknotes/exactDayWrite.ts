import { describeOutcome, diffInstances } from '../utils/instanceDiff';
import {
	exactInstanceLists,
	instanceLists,
	isScheduleModeled,
	scheduledAfterClick,
	withScheduledSuffix,
} from '../utils/scheduledAnchor';
import type { CycleAction } from '../utils/scheduledAnchor';
import type { CycleResult, TaskNotesBridge, TaskNotesTaskState, UpdatePropertyOptions } from './taskNotesBridge';

/**
 * Exact-date writes for off days of habits that repeat from their scheduled
 * date (#58). TaskNotes' recurring toggles would move such a click onto a
 * missed due day, so these use TaskNotes' `updateProperty`, which writes a
 * property as given. Part of the TaskNotes bridge: cycleDay decides when
 * to come here.
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
	const oldScheduled = typeof before.scheduled === 'string' ? before.scheduled : null;
	const target = scheduledAfterClick(plannedState, dateStr, todayStr);
	let note = '';
	let movedScheduled = false;
	if (!isScheduleModeled(before.recurrence)) {
		note = '; scheduled left as is for this repeat rule';
	} else if (target && target !== oldScheduled?.slice(0, 10)) {
		try {
			await updateProperty(task, 'scheduled', withScheduledSuffix(before.scheduled, target), KEEP_INSTANCES);
			movedScheduled = true;
		} catch (error) {
			note = `; couldn't move scheduled: ${errorMessage(error)}`;
		}
	}

	const after = (await bridge.getTaskInfo(path)) ?? {};
	const drift = diffInstances(plannedState, after);
	if (movedScheduled && [drift.complete, drift.skipped].some(c => c.added.length > 0 || c.removed.length > 0)) {
		// A TaskNotes that ignores KEEP_INSTANCES deletes later days when
		// `scheduled` moves: put the planned lists back
		await updateProperty(task, 'complete_instances', planned.complete);
		await updateProperty(task, 'skipped_instances', planned.skipped);
		return {
			status: 'error',
			message: `TaskNotes removed other days while moving scheduled to ${target}; they were put back. Check this habit in TaskNotes`,
		};
	}
	const scheduledNow = typeof after.scheduled === 'string' ? after.scheduled.slice(0, 10) : null;
	if (movedScheduled && scheduledNow !== target) {
		note = `; scheduled stays ${scheduledNow ?? 'empty'} because later days are already marked`;
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
