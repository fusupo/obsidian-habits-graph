import { formatISODate, getTodayUTC, isSameDay, addDays } from './utils/dateUtils';
import { parseRecurrenceIntervalDays } from './utils/recurrenceUtils';

export interface DayCell {
	date: Date;
	isToday: boolean;
	isPast: boolean;
	isFuture: boolean;
	completed: boolean;
	daysFromLastCompletion: number;
	status: 'done' | 'missed' | 'skipped' | 'future-too-early' | 'future-ok' | 'future-warning' | 'future-overdue' | 'today-done' | 'today-missed';
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
		skippedDates: Date[] = []
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

		// Parse recurrence to get ideal interval (in days)
		const intervalDays = parseRecurrenceIntervalDays(recurrencePattern);

		// Generate cells from past to future
		for (let i = -daysBefore; i <= daysAfter; i++) {
			const date = addDays(today, i);

			const dateStr = this.dateToString(date);
			const isToday = i === 0;
			const isPast = i < 0;
			const isFuture = i > 0;
			const completed = completionSet.has(dateStr);

			// Calculate days since last completion
			const daysSinceCompletion = Math.floor(
				(date.getTime() - lastCompletion.getTime()) / (1000 * 60 * 60 * 24)
			);

			let status: DayCell['status'];

			if (isToday) {
				status = completed ? 'today-done' : skippedSet.has(dateStr) ? 'skipped' : 'today-missed';
			} else if (isFuture) {
				// Org-mode style scheduling for future days
				// Based on days since last completion
				if (daysSinceCompletion < intervalDays * 0.75) {
					status = 'future-too-early'; // Blue - not due yet
				} else if (daysSinceCompletion < intervalDays * 1.25) {
					status = 'future-ok'; // Light green - good time to do it
				} else if (daysSinceCompletion < intervalDays * 1.5) {
					status = 'future-warning'; // Yellow - getting overdue
				} else {
					status = 'future-overdue'; // Red - overdue
				}
			} else {
				status = completed ? 'done' : skippedSet.has(dateStr) ? 'skipped' : 'missed';
			}

			cells.push({
				date,
				isToday,
				isPast,
				isFuture,
				completed,
				daysFromLastCompletion: daysSinceCompletion,
				status
			});
		}

		return cells;
	}

	/**
	 * Render the graph as HTML (org-mode style)
	 */
	static renderGraph(
		cells: DayCell[],
		habitName: string,
		recurrence: string,
		streak: number,
		showStreak: boolean
	): HTMLElement {
		const container = document.createElement('div');
		container.className = 'habit-graph-row';

		// Left side: Habit label (strip #habit tag)
		const labelContainer = container.createDiv({ cls: 'habit-label' });
		const cleanName = habitName.replace(/#habit/g, '').trim();
		labelContainer.textContent = cleanName;

		// Display streak count if enabled
		if (showStreak && streak > 0) {
			const streakEl = labelContainer.createSpan({ cls: 'habit-streak' });
			streakEl.textContent = ` 🔥${streak}`;
		}

		// Right side: Wrapper for scrollable graph
		const graphWrapper = container.createDiv({ cls: 'habit-graph-wrapper' });

		// Manual drag scrolling to override Obsidian's gesture system
		let isDragging = false;
		let startX = 0;
		let startY = 0;
		let scrollLeft = 0;
		let isHorizontalScroll = false;

		graphWrapper.addEventListener('touchstart', (e) => {
			isDragging = true;
			startX = e.touches[0].pageX;
			startY = e.touches[0].pageY;
			scrollLeft = graphWrapper.scrollLeft;
			isHorizontalScroll = false;
		}, { passive: true });

		graphWrapper.addEventListener('touchmove', (e) => {
			if (!isDragging) return;

			const touch = e.touches[0];
			const deltaX = touch.pageX - startX;
			const deltaY = touch.pageY - startY;

			// Determine if this is a horizontal scroll on first move
			if (!isHorizontalScroll && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
				isHorizontalScroll = Math.abs(deltaX) > Math.abs(deltaY);
			}

			// If horizontal scrolling, prevent default and manually scroll
			if (isHorizontalScroll) {
				e.preventDefault();
				e.stopPropagation();
				graphWrapper.scrollLeft = scrollLeft - deltaX;
			}
		}, { passive: false });

		graphWrapper.addEventListener('touchend', () => {
			isDragging = false;
			isHorizontalScroll = false;
		}, { passive: true });

		graphWrapper.addEventListener('touchcancel', () => {
			isDragging = false;
			isHorizontalScroll = false;
		}, { passive: true });

		const graphContainer = graphWrapper.createDiv({ cls: 'habit-graph' });

		for (const cell of cells) {
			const dayEl = graphContainer.createDiv({ cls: 'habit-day' });

			// Determine color based on org-mode rules with scheduling window
			let colorClass = '';
			switch (cell.status) {
				case 'done':
					colorClass = 'green';
					break;
				case 'missed':
					colorClass = 'red';
					break;
				case 'skipped':
					colorClass = 'gray';
					break;
				case 'future-too-early':
					colorClass = 'blue';
					break;
				case 'future-ok':
					colorClass = 'green-light';
					break;
				case 'future-warning':
					colorClass = 'yellow';
					break;
				case 'future-overdue':
					colorClass = 'red';
					break;
				case 'today-done':
					colorClass = 'green';
					break;
				case 'today-missed':
					colorClass = 'yellow';
					break;
			}

			dayEl.addClass(colorClass);

			// Add asterisk for completed days
			if (cell.completed) {
				dayEl.textContent = '*';
			} else if (cell.status === 'skipped') {
				dayEl.textContent = '~';
			}

			// Add exclamation mark for today
			if (cell.isToday) {
				const todayMarker = dayEl.createSpan({ cls: 'today-indicator' });
				todayMarker.textContent = cell.completed ? '*!' : '!';
				dayEl.textContent = '';
				dayEl.appendChild(todayMarker);
			}

			// Tooltip
			const dateStr = this.dateToString(cell.date);
			const dayName = cell.date.toLocaleDateString('en-US', { weekday: 'short' });
			const statusText = cell.completed ? 'Done' : cell.status === 'skipped' ? 'Skipped' : (cell.isFuture ? 'Not due' : 'Missed');
			dayEl.setAttribute('title', `${dayName} ${dateStr}: ${statusText}`);
		}

		return container;
	}

	/**
	 * Calculate current streak
	 */
	static calculateStreak(completionDates: Date[], skippedDates: Date[] = []): number {
		if (completionDates.length === 0) return 0;

		const today = getTodayUTC();

		// Sort dates descending
		const sorted = [...completionDates].sort((a, b) => b.getTime() - a.getTime());

		const skippedSet = new Set(
			skippedDates.map(d => formatISODate(d))
		);

		let streak = 0;
		let currentDate = new Date(today);

		for (const completionDate of sorted) {
			// Skip over skipped days (they don't break the streak)
			while (skippedSet.has(formatISODate(currentDate)) && currentDate.getTime() > completionDate.getTime()) {
				currentDate.setUTCDate(currentDate.getUTCDate() - 1);
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
