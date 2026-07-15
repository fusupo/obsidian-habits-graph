import { formatISODate, getTodayUTC, isSameDay, addDays } from './utils/dateUtils';
import { parseRecurrenceIntervalDays, parseRecurrence, isDueOn, RecurrenceAnchor } from './utils/recurrenceUtils';

export interface DayCell {
	date: Date;
	isToday: boolean;
	isPast: boolean;
	isFuture: boolean;
	completed: boolean;
	daysFromLastCompletion: number;
	status: 'done' | 'missed' | 'skipped' | 'rest' | 'future-too-early' | 'future-ok' | 'future-warning' | 'future-overdue' | 'today-done' | 'today-missed';
}

export class GraphRenderer {
	/**
	 * Generate array of day cells for the consistency graph
	 * With org-mode style scheduling window for future days
	 */
	static generateDayCells(
		completionDates: Date[],
		daysBefore: number,
		daysAfter: number,
		recurrencePattern: string = 'every day',
		skippedDates: Date[] = [],
		recurrenceAnchor: RecurrenceAnchor = 'scheduled',
		scheduledDate: Date | null = null
	): DayCell[] {
		const cells: DayCell[] = [];
		const today = getTodayUTC();

		// Create set of completion dates for fast lookup
		const completionSet = new Set(
			completionDates.map(d => this.dateToString(d))
		);

		const skippedSet = new Set(
			skippedDates.map(d => this.dateToString(d))
		);

		// Find last completion date
		const lastCompletion = completionDates.length > 0
			? new Date(Math.max(...completionDates.map(d => d.getTime())))
			: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago if none
		lastCompletion.setHours(0, 0, 0, 0);

		// Parse recurrence to get ideal interval (in days) for the future window
		const intervalDays = parseRecurrenceIntervalDays(recurrencePattern);
		// Structured recurrence drives due-day decisions (fixed weekdays/monthdays,
		// and scheduled-anchor interval cadence when a scheduled date exists)
		const recurrence = parseRecurrence(recurrencePattern, recurrenceAnchor);

		// Sort completions ascending for per-cell interval checks on past days
		const sortedCompletions = [...completionDates].sort((a, b) => a.getTime() - b.getTime());
		let compIdx = 0;

		// Generate cells from past to future
		for (let i = -daysBefore; i <= daysAfter; i++) {
			const date = addDays(today, i);

			const dateStr = this.dateToString(date);
			const isToday = i === 0;
			const isPast = i < 0;
			const isFuture = i > 0;
			const completed = completionSet.has(dateStr);

			// Advance pointer to find most recent completion on or before this date
			while (compIdx < sortedCompletions.length &&
				sortedCompletions[compIdx].getTime() <= date.getTime()) {
				compIdx++;
			}
			const lastCompBeforeCell = compIdx > 0 ? sortedCompletions[compIdx - 1] : null;
			const daysSincePriorComp = lastCompBeforeCell
				? Math.floor((date.getTime() - lastCompBeforeCell.getTime()) / (1000 * 60 * 60 * 24))
				: Infinity;

			// Days since overall last completion (for future scheduling window)
			const daysSinceCompletion = Math.floor(
				(date.getTime() - lastCompletion.getTime()) / (1000 * 60 * 60 * 24)
			);

			let status: DayCell['status'];

			if (isToday) {
				status = completed ? 'today-done' : skippedSet.has(dateStr) ? 'skipped' : 'today-missed';
			} else if (isFuture) {
				if (recurrence.kind !== 'interval') {
					// Fixed calendar schedules: a future day is either due or not.
					// No escalation ramp — "how overdue" has no meaning when due
					// days don't drift with completion history.
					status = isDueOn(recurrence, date, null) ? 'future-ok' : 'future-too-early';
				} else if (daysSinceCompletion < intervalDays * 0.75) {
					status = 'future-too-early';
				} else if (daysSinceCompletion < intervalDays * 1.25) {
					status = 'future-ok';
				} else if (daysSinceCompletion < intervalDays * 1.5) {
					status = 'future-warning';
				} else {
					status = 'future-overdue';
				}
			} else {
				// Past: only "missed" if the habit was actually due that day
				status = completed ? 'done'
					: skippedSet.has(dateStr) ? 'skipped'
					: !isDueOn(recurrence, date, lastCompBeforeCell, scheduledDate) ? 'rest'
					: 'missed';
			}

			cells.push({
				date,
				isToday,
				isPast,
				isFuture,
				completed,
				daysFromLastCompletion: daysSincePriorComp,
				status
			});
		}

		return cells;
	}

	static renderGraph(
		cells: DayCell[],
		habitName: string,
		streak: number,
		showStreak: boolean,
		onLabelClick?: () => void
	): HTMLElement {
		const container = document.createElement('div');
		container.className = 'habit-graph-row';

		const labelContainer = container.createDiv({ cls: 'habit-label' });
		const cleanName = habitName.replace(/#habit/g, '').trim();
		labelContainer.textContent = cleanName;

		if (onLabelClick) {
			// Plain listener is safe: the element is discarded on every
			// re-render, never reused, so no registerDomEvent cleanup needed
			labelContainer.addEventListener('click', onLabelClick);
		}

		if (showStreak && streak > 0) {
			const streakEl = labelContainer.createSpan({ cls: 'habit-streak' });
			streakEl.textContent = ` 🔥${streak}`;
		}

		const svgNS = 'http://www.w3.org/2000/svg';
		const svg = document.createElementNS(svgNS, 'svg');
		svg.setAttribute('class', 'habit-graph-svg');
		svg.setAttribute('width', '100%');
		svg.setAttribute('height', '20');

		const cellCount = cells.length;
		const cellWidthPct = 100 / cellCount;

		for (let i = 0; i < cellCount; i++) {
			const cell = cells[i];

			let colorClass = '';
			switch (cell.status) {
				case 'done': colorClass = 'green'; break;
				case 'missed': colorClass = 'red'; break;
				case 'skipped': colorClass = 'gray'; break;
				case 'rest': colorClass = 'blue'; break;
				case 'future-too-early': colorClass = 'blue'; break;
				case 'future-ok': colorClass = 'green-light'; break;
				case 'future-warning': colorClass = 'yellow'; break;
				case 'future-overdue': colorClass = 'red'; break;
				case 'today-done': colorClass = 'green'; break;
				case 'today-missed': colorClass = 'yellow'; break;
			}

			const g = document.createElementNS(svgNS, 'g');
			if (colorClass) {
				g.setAttribute('class', colorClass);
			}

			const rect = document.createElementNS(svgNS, 'rect');
			rect.setAttribute('x', `${cellWidthPct * i}%`);
			rect.setAttribute('y', '0');
			rect.setAttribute('width', `${cellWidthPct}%`);
			rect.setAttribute('height', '20');
			g.appendChild(rect);

			let marker = '';
			if (cell.isToday) {
				marker = cell.completed ? '*!' : '!';
			} else if (cell.completed) {
				marker = '*';
			} else if (cell.status === 'skipped') {
				marker = '~';
			}

			if (marker) {
				const text = document.createElementNS(svgNS, 'text');
				text.setAttribute('x', `${cellWidthPct * i + cellWidthPct / 2}%`);
				text.setAttribute('y', '10');
				text.setAttribute('text-anchor', 'middle');
				text.setAttribute('dominant-baseline', 'central');
				text.setAttribute('font-size', '10');
				text.setAttribute('font-weight', 'bold');
				text.textContent = marker;
				g.appendChild(text);
			}

			const title = document.createElementNS(svgNS, 'title');
			const dateStr = this.dateToString(cell.date);
			const dayName = cell.date.toLocaleDateString('en-US', { weekday: 'short' });
			const statusText = cell.completed ? 'Done' : cell.status === 'skipped' ? 'Skipped' : (cell.status === 'rest' || cell.isFuture) ? 'Not due' : 'Missed';
			title.textContent = `${dayName} ${dateStr}: ${statusText}`;
			g.appendChild(title);

			svg.appendChild(g);
		}

		container.appendChild(svg);
		return container;
	}

	/**
	 * Calculate current streak
	 */
	static calculateStreak(
		completionDates: Date[],
		skippedDates: Date[] = [],
		recurrencePattern: string = 'every day'
	): number {
		if (completionDates.length === 0) return 0;

		const today = getTodayUTC();
		const recurrence = parseRecurrence(recurrencePattern);

		// Sort dates descending
		const sorted = [...completionDates].sort((a, b) => b.getTime() - a.getTime());

		const skippedSet = new Set(
			skippedDates.map(d => formatISODate(d))
		);

		let streak = 0;
		let currentDate = new Date(today);

		for (const completionDate of sorted) {
			// Skip over days that don't break the streak: skipped days and rest days (within interval)
			while (currentDate.getTime() > completionDate.getTime()) {
				if (skippedSet.has(formatISODate(currentDate))) {
					currentDate.setUTCDate(currentDate.getUTCDate() - 1);
					continue;
				}
				// Gap days where the habit wasn't due don't break the streak
				if (!isDueOn(recurrence, currentDate, completionDate)) {
					currentDate.setUTCDate(currentDate.getUTCDate() - 1);
					continue;
				}
				break;
			}

			if (isSameDay(completionDate, currentDate)) {
				streak++;
				currentDate.setUTCDate(currentDate.getUTCDate() - 1);
			} else if (completionDate.getTime() < currentDate.getTime()) {
				break;
			}
		}

		return streak;
	}

	/**
	 * Convert date to YYYY-MM-DD string using UTC-aware formatting.
	 *
	 * Delegates to formatISODate for consistent UTC-based date serialization.
	 */
	static dateToString(date: Date): string {
		return formatISODate(date);
	}
}
