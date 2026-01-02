import { ItemView, WorkspaceLeaf } from 'obsidian';
import type OrgHabitsGraphPlugin from './main';
import { GraphRenderer } from './graphRenderer';
import { formatISODate } from './utils/dateUtils';

export const VIEW_TYPE_HABIT_GRAPH = 'habit-graph-view';

export class HabitGraphView extends ItemView {
	plugin: OrgHabitsGraphPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: OrgHabitsGraphPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_HABIT_GRAPH;
	}

	getDisplayText(): string {
		return 'Org Habits Graph';
	}

	getIcon(): string {
		return 'calendar-check';
	}

	async onOpen(): Promise<void> {
		await this.refresh();
	}

	async onClose(): Promise<void> {
		// Cleanup if needed
	}

	async refresh(): Promise<void> {
		const container = this.containerEl.children[1];
		container.empty();

		// Check if Tasks plugin is available
		if (!this.plugin.tasksApi.isTasksPluginAvailable()) {
			this.renderError(container, 'Tasks plugin is required but not found. Please install and enable the Tasks plugin.');
			return;
		}

		// Get habit tasks
		const habitTasks = await this.plugin.tasksApi.getHabitTasks(
			this.plugin.settings.habitTag
		);

		if (habitTasks.length === 0) {
			this.renderEmpty(container);
			return;
		}

		// Group by unique habit
		const habits = this.plugin.tasksApi.getUniqueHabits(habitTasks);

		// Render each habit graph
		for (const [description, tasks] of habits) {
			console.log('Habit:', description);
			console.log('  Total tasks:', tasks.length);
			console.log('  Completed tasks:', tasks.filter(t => t.completed).length);

			// Get the most recent task info for this habit
			const currentTask = tasks.find(t => !t.completed) || tasks[tasks.length - 1];

			// Get completion history
			const completionDates = this.plugin.tasksApi.getCompletionHistory(
				tasks,
				description
			);

			console.log('  Completion dates:', completionDates.length, completionDates.map(d => formatISODate(d)));

			// Generate day cells with recurrence pattern for scheduling window
			const cells = GraphRenderer.generateDayCells(
				completionDates,
				this.plugin.settings.daysBeforeToday,
				this.plugin.settings.daysAfterToday,
				currentTask.recurrence
			);

			// Calculate streak
			const streak = GraphRenderer.calculateStreak(completionDates);

			// Render graph
			const graphEl = GraphRenderer.renderGraph(
				cells,
				description,
				currentTask.recurrence,
				streak,
				this.plugin.settings.showStreakCount
			);

			container.appendChild(graphEl);
		}
	}

	private renderError(container: Element, message: string): void {
		container.empty();
		const errorEl = container.createDiv({ cls: 'habit-graph-error' });
		errorEl.createEl('h3', { text: '⚠️ Error' });
		errorEl.createEl('p', { text: message });

		const link = errorEl.createEl('a', {
			text: 'Install Tasks plugin',
			href: 'obsidian://show-plugin?id=obsidian-tasks-plugin'
		});
		link.onclick = (e) => {
			e.preventDefault();
			// @ts-ignore
			this.app.commands.executeCommandById('obsidian://show-plugin?id=obsidian-tasks-plugin');
		};
	}

	private renderEmpty(container: Element): void {
		container.empty();
		const emptyEl = container.createDiv({ cls: 'habit-graph-empty' });
		emptyEl.createEl('h3', { text: 'No habits found' });
		emptyEl.createEl('p', {
			text: `Create recurring tasks with #${this.plugin.settings.habitTag} tag to track habits.`
		});

		const example = emptyEl.createEl('pre');
		example.textContent = `Example:
- [ ] Morning workout 🔁 every day #${this.plugin.settings.habitTag} 📅 2025-01-18
- [ ] Bible reading 🔁 every day #${this.plugin.settings.habitTag} 📅 2025-01-18
- [ ] Guitar practice 🔁 every week #${this.plugin.settings.habitTag} 📅 2025-01-20`;
	}
}
