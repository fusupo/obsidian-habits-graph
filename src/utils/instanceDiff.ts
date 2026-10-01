import type { ScheduleState } from './scheduledAnchor';

/**
 * What a click actually changed in a habit's instance lists, and the notice
 * that reports it (#58). The notice names the dates TaskNotes really wrote,
 * so a moved date can't hide behind a "Marked <clicked day> done".
 */

export interface InstanceDiff {
	complete: { added: string[]; removed: string[] };
	skipped: { added: string[]; removed: string[] };
}

function dateSet(value: unknown): Set<string> {
	return new Set(Array.isArray(value) ? value.filter((d): d is string => typeof d === 'string') : []);
}

function changes(before: Set<string>, after: Set<string>): { added: string[]; removed: string[] } {
	return {
		added: [...after].filter(d => !before.has(d)).sort(),
		removed: [...before].filter(d => !after.has(d)).sort(),
	};
}

/** Set differences of `complete_instances` and `skipped_instances`. */
export function diffInstances(before: ScheduleState, after: ScheduleState): InstanceDiff {
	return {
		complete: changes(dateSet(before.complete_instances), dateSet(after.complete_instances)),
		skipped: changes(dateSet(before.skipped_instances), dateSet(after.skipped_instances)),
	};
}

export type DayStatus = 'done' | 'skipped' | 'cleared';

export interface ClickOutcome {
	/** True when the clicked day is the only day that changed. */
	matchedClick: boolean;
	/** Every changed day with its new status, by date. */
	changes: { date: string; status: DayStatus }[];
	message: string;
}

/** Each changed day's new status: added to done, added to skipped, or removed. */
function changedDays(diff: InstanceDiff): { date: string; status: DayStatus }[] {
	const touched = new Set([
		...diff.complete.added,
		...diff.complete.removed,
		...diff.skipped.added,
		...diff.skipped.removed,
	]);
	return [...touched].sort().map(date => ({
		date,
		status: diff.complete.added.includes(date) ? 'done' : diff.skipped.added.includes(date) ? 'skipped' : 'cleared',
	}));
}

/** The notice for a click on `clickedStr`, from what actually changed. */
export function describeOutcome(clickedStr: string, diff: InstanceDiff): ClickOutcome {
	const days = changedDays(diff);
	if (days.length === 0) {
		return { matchedClick: false, changes: days, message: `Nothing changed for ${clickedStr}.` };
	}
	if (days.length === 1) {
		const [{ date, status }] = days;
		if (date === clickedStr) {
			return { matchedClick: true, changes: days, message: `Marked ${date} ${status}` };
		}
		const what = status === 'cleared' ? `cleared ${date}` : `marked ${date} ${status}`;
		return {
			matchedClick: false,
			changes: days,
			message: `Clicked ${clickedStr}, but TaskNotes ${what} instead. Click ${date} to change it.`,
		};
	}
	const list = days.map(({ date, status }) => `${date} (${status})`).join(', ');
	return { matchedClick: false, changes: days, message: `Clicked ${clickedStr}; TaskNotes changed ${list}.` };
}
