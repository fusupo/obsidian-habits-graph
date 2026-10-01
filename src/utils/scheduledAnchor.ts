import { addDays, formatISODate, parseISODate, parseISODateOrNull } from './dateUtils';
import { isDueOn, parseRecurrence, parseRRuleParams } from './recurrenceUtils';

/**
 * Due-day logic for clicks on habits that repeat from their scheduled date
 * (`recurrence_anchor: scheduled`, TaskNotes' default) (#58).
 *
 * For these habits TaskNotes' recurring toggles move a non-due date onto a
 * missed due day (`fce`/`UUe` in TaskNotes 4.13.6), so the bridge has to know
 * whether a clicked day is due. When it writes an off day itself, it also
 * has to decide where `scheduled` goes, and undoing a click puts `scheduled`
 * back on the day that is owed again.
 *
 * "Due" here means an occurrence of the RRULE counted from DTSTART (or from
 * `scheduled` when the rule has no DTSTART), the way TaskNotes expands it.
 * This deliberately differs from the graph, which anchors interval cadences
 * on `scheduled` and never treats days before it as due.
 *
 * All dates are 'YYYY-MM-DD' strings in and out.
 */

/** What a click on a day does, given that day's current state. */
export type CycleAction = 'complete' | 'skip' | 'unskip';

/** The TaskNotes TaskInfo fields this logic reads (TaskNotes' snake_case names). */
export interface ScheduleState {
	recurrence?: unknown;
	recurrence_anchor?: unknown;
	scheduled?: unknown;
	complete_instances?: unknown;
	skipped_instances?: unknown;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// How far to look for a due day. Every modeled rule repeats well within a
// year; interval rules add their own length so one full cycle always fits
const SEARCH_DAYS = 400;

function stringList(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((d): d is string => typeof d === 'string') : [];
}

/** The instance lists as plain string arrays (missing or odd values read as empty). */
export function instanceLists(state: ScheduleState): { complete: string[]; skipped: string[] } {
	return { complete: stringList(state.complete_instances), skipped: stringList(state.skipped_instances) };
}

/** Days that are already marked done or skipped. */
function handledDays(state: ScheduleState): Set<string> {
	return new Set([...stringList(state.complete_instances), ...stringList(state.skipped_instances)]);
}

/** DTSTART's date, else `scheduled` (TaskNotes' implicit DTSTART), else null. */
function startDate(state: ScheduleState): Date | null {
	const dtstart = typeof state.recurrence === 'string' ? state.recurrence.match(/DTSTART:(\d{4})(\d{2})(\d{2})/) : null;
	if (dtstart) return parseISODateOrNull(`${dtstart[1]}-${dtstart[2]}-${dtstart[3]}`);
	return typeof state.scheduled === 'string' ? parseISODateOrNull(state.scheduled) : null;
}

interface DueModel {
	isDue(date: Date): boolean;
	searchDays: number;
}

function dueModel(state: ScheduleState): DueModel | null {
	if (typeof state.recurrence !== 'string') return null;
	const recurrence = parseRecurrence(state.recurrence, 'scheduled');
	const start = startDate(state);
	const completions = stringList(state.complete_instances).filter(d => ISO_DATE.test(d)).sort();

	return {
		searchDays: SEARCH_DAYS + (recurrence.kind === 'interval' ? recurrence.days : 0),
		isDue(date: Date): boolean {
			if (start && date.getTime() < start.getTime()) return false;
			if (recurrence.kind === 'interval' && !start) {
				// No anchor at all: the rolling window from the last completion
				const dateStr = formatISODate(date);
				const lastBefore = completions.filter(d => d < dateStr).pop();
				return isDueOn(recurrence, date, lastBefore ? parseISODate(lastBefore) : null);
			}
			// Interval cadences count from the start; fixed days ignore it
			return isDueOn(recurrence, date, null, start);
		},
	};
}

/** Whether the habit's rule has an occurrence on `dateStr`. */
export function isDueDay(state: ScheduleState, dateStr: string): boolean {
	return dueModel(state)?.isDue(parseISODate(dateStr)) ?? false;
}

/**
 * How a click should be written. 'toggle' = TaskNotes' recurring toggles,
 * which keep the exact date for completion-anchored habits and for due
 * days. 'exact' = write the date ourselves, because the toggles would move
 * it onto a missed due day. A non-string recurrence goes to the toggles so
 * TaskNotes reports the problem.
 */
export function chooseWritePath(state: ScheduleState, dateStr: string): 'toggle' | 'exact' {
	if (typeof state.recurrence !== 'string' || state.recurrence_anchor === 'completion') return 'toggle';
	return isDueDay(state, dateStr) ? 'toggle' : 'exact';
}

const MODELED_PARAMS = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'WKST']);
const PLAIN_BYDAY = /^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/;
const PLAIN_BYMONTHDAY = /^\d{1,2}(,\d{1,2})*$/;

/**
 * Whether isDueDay matches TaskNotes' expansion of this rule closely enough
 * for the plugin to set `scheduled` itself. Anything else (every-other-week
 * by weekday, plain monthly, yearly, COUNT/UNTIL/BYSETPOS, no DTSTART) still
 * gets its exact date written, but `scheduled` is left alone.
 */
export function isScheduleModeled(recurrence: unknown): boolean {
	if (typeof recurrence !== 'string' || !/DTSTART:\d{8}/.test(recurrence)) return false;
	const params = parseRRuleParams(recurrence);
	if (!params || Object.keys(params).some(key => !MODELED_PARAMS.has(key))) return false;

	const interval = Number(params['INTERVAL'] ?? '1');
	if (!Number.isInteger(interval) || interval < 1) return false;
	const byDay = params['BYDAY'];
	const byMonthDay = params['BYMONTHDAY'];

	switch (params['FREQ']) {
		case 'DAILY':
			return byDay === undefined && byMonthDay === undefined;
		case 'WEEKLY':
			if (byMonthDay !== undefined) return false;
			return byDay === undefined || (interval === 1 && PLAIN_BYDAY.test(byDay));
		case 'MONTHLY':
			return (
				interval === 1 &&
				byDay === undefined &&
				byMonthDay !== undefined &&
				PLAIN_BYMONTHDAY.test(byMonthDay) &&
				byMonthDay.split(',').every(d => Number(d) >= 1 && Number(d) <= 31)
			);
		default:
			return false;
	}
}

/** The first due day on or after `fromStr` that isn't done or skipped, or null. */
export function nextUnhandledDueOnOrAfter(state: ScheduleState, fromStr: string): string | null {
	const model = dueModel(state);
	if (!model) return null;
	const handled = handledDays(state);
	let day = parseISODate(fromStr);
	for (let i = 0; i <= model.searchDays; i++, day = addDays(day, 1)) {
		const dateStr = formatISODate(day);
		if (!handled.has(dateStr) && model.isDue(day)) return dateStr;
	}
	return null;
}

/** The latest due day on or before `dateStr` (done, skipped or not), or null. */
export function latestDueOnOrBefore(state: ScheduleState, dateStr: string): string | null {
	const model = dueModel(state);
	if (!model) return null;
	let day = parseISODate(dateStr);
	for (let i = 0; i <= model.searchDays; i++, day = addDays(day, -1)) {
		if (model.isDue(day)) return formatISODate(day);
	}
	return null;
}

/**
 * The instance lists after a click, written the way TaskNotes' toggles
 * would: done drops the date from skipped, skip moves it out of done, and
 * clearing removes it. Other entries keep their order.
 */
export function exactInstanceLists(
	state: ScheduleState,
	dateStr: string,
	action: CycleAction
): { complete: string[]; skipped: string[] } {
	const { complete, skipped } = instanceLists(state);
	switch (action) {
		case 'complete':
			return {
				complete: complete.includes(dateStr) ? complete : [...complete, dateStr],
				skipped: skipped.filter(d => d !== dateStr),
			};
		case 'skip':
			return {
				complete: complete.filter(d => d !== dateStr),
				skipped: skipped.includes(dateStr) ? skipped : [...skipped, dateStr],
			};
		case 'unskip':
			return { complete, skipped: skipped.filter(d => d !== dateStr) };
	}
}

/**
 * Where TaskNotes would put `scheduled` after any click on `dateStr`: the
 * first due day on or after the later of that day and today that isn't
 * done or skipped (TaskNotes' `Cd` with `minOccurrenceDate`). Null when the
 * rule isn't modeled or nothing is found, meaning leave `scheduled` alone.
 *
 * @param state - the task with its lists as they are after the click
 */
export function scheduledAfterClick(state: ScheduleState, dateStr: string, todayStr: string): string | null {
	if (!isScheduleModeled(state.recurrence)) return null;
	return nextUnhandledDueOnOrAfter(state, dateStr > todayStr ? dateStr : todayStr);
}

/**
 * Undo: after a click clears `clearedStr`, the day that is owed again, if
 * any. That is S, the latest due day on or before the cleared day, when:
 * - the cleared day isn't in the future
 * - S is blank and nothing after S is marked
 * - no other due day lies between S and `scheduledNow`, the `scheduled`
 *   TaskNotes chose (or would choose) for this click
 *
 * Then `scheduled` should go back to S. Otherwise null: TaskNotes' choice
 * stands. Never returns a day before a marked day, which TaskNotes'
 * `updateProperty('scheduled')` would delete.
 *
 * @param state - the task with its lists as they are after the click
 */
export function undoScheduledTarget(
	state: ScheduleState,
	clearedStr: string,
	todayStr: string,
	scheduledNow: unknown
): string | null {
	// Completion-anchored habits already get their undo from the DTSTART repair
	if (state.recurrence_anchor === 'completion') return null;
	if (!isScheduleModeled(state.recurrence) || clearedStr > todayStr) return null;
	const target = typeof scheduledNow === 'string' ? scheduledNow.slice(0, 10) : '';
	if (!ISO_DATE.test(target)) return null;

	const owed = latestDueOnOrBefore(state, clearedStr);
	if (!owed || owed >= target) return null;
	const handled = handledDays(state);
	if (handled.has(owed) || [...handled].some(d => d > owed)) return null;

	const model = dueModel(state)!;
	for (let day = addDays(parseISODate(owed), 1); formatISODate(day) < target; day = addDays(day, 1)) {
		if (model.isDue(day)) return null;
	}
	return owed;
}

/** `newDate` with any time suffix of the old `scheduled` kept (e.g. 'T09:00'), as TaskNotes does. */
export function withScheduledSuffix(oldScheduled: unknown, newDate: string): string {
	if (typeof oldScheduled === 'string' && ISO_DATE.test(oldScheduled.slice(0, 10))) {
		return `${newDate}${oldScheduled.slice(10)}`;
	}
	return newDate;
}
