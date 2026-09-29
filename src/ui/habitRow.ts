import type OrgHabitsGraphPlugin from '../main';
import type { TaskNote } from '../types';
import { GraphRenderer } from '../graphRenderer';
import { openTaskNote } from '../utils/noteOpener';
import { parseISODateOrNull } from '../utils/dateUtils';
import { isDayClickInFlight } from '../tasknotes/taskNotesBridge';

/**
 * Build one habit's row (label + graph). The single place a TaskNote is
 * wired into generateDayCells / calculateStreak / renderGraph, shared by
 * the sidebar view and code blocks so the two can't drift apart.
 */
export function buildHabitRow(plugin: OrgHabitsGraphPlugin, task: TaskNote): HTMLElement {
	const { settings, tasksApi } = plugin;
	const completionDates = tasksApi.getCompletionHistory(task);
	const skippedDates = tasksApi.getSkippedDates(task);
	const scheduledDate = parseISODateOrNull(task.scheduled);

	const cells = GraphRenderer.generateDayCells(
		completionDates,
		settings.daysBeforeToday,
		settings.daysAfterToday,
		task.recurrence,
		skippedDates,
		task.recurrenceAnchor,
		scheduledDate
	);

	const streak = GraphRenderer.calculateStreak(completionDates, skippedDates, task.recurrence, task.recurrenceAnchor, scheduledDate);

	return GraphRenderer.renderGraph(
		cells,
		task.title,
		streak,
		settings.showStreakCount,
		() => openTaskNote(plugin.app, task.path)
	);
}

// A click can make up to three TaskNotes writes (the day, plus a DTSTART
// repair's off-then-on); delaying the re-render collapses them into one
const RERENDER_DELAY_MS = 100;

/**
 * The habit rows of one container (the sidebar view or a code block). A
 * row re-renders in place when its TaskNote changes, so a click shows up
 * without rebuilding the whole container. The owner feeds handleChanged
 * from VaultEventHandler.onTaskChanged and calls clear() on unload.
 */
export class HabitRowSet {
	private rows = new Map<string, HTMLElement>();
	private timers = new Map<string, number>();

	constructor(private plugin: OrgHabitsGraphPlugin) {}

	render(container: Element, tasks: TaskNote[]): void {
		this.clear();
		for (const task of tasks) {
			const row = buildHabitRow(this.plugin, task);
			this.rows.set(task.path, row);
			container.appendChild(row);
		}
	}

	handleChanged(path: string): void {
		if (!this.rows.has(path)) return;
		window.clearTimeout(this.timers.get(path));
		this.timers.set(path, window.setTimeout(() => this.rerender(path), RERENDER_DELAY_MS));
	}

	clear(): void {
		for (const timer of this.timers.values()) {
			window.clearTimeout(timer);
		}
		this.timers.clear();
		this.rows.clear();
	}

	private rerender(path: string): void {
		this.timers.delete(path);
		// Mid-click, TaskNotes may be between writes: wait for the final state
		if (isDayClickInFlight(path)) {
			this.handleChanged(path);
			return;
		}

		const oldRow = this.rows.get(path);
		const task = this.plugin.cacheManager.getFileTasks(path);
		if (!oldRow || !task) return;

		// replaceWith also works while a code block's section is scrolled out
		// of the document: the row keeps its parent, so the new row shows up
		// when Obsidian reattaches the section
		const row = buildHabitRow(this.plugin, task);
		oldRow.replaceWith(row);
		this.rows.set(path, row);
	}
}
