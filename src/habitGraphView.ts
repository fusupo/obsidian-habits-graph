import { ItemView, WorkspaceLeaf } from 'obsidian';
import type OrgHabitsGraphPlugin from './main';
import { GraphRenderer } from './graphRenderer';

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

		const habitTasks = await this.plugin.tasksApi.getHabitTaskNotes(
			this.plugin.settings.habitTag
		);

		if (habitTasks.length === 0) {
			this.renderEmpty(container);
			return;
		}

		for (const task of habitTasks) {
			const completionDates = this.plugin.tasksApi.getCompletionHistory(task);
			const skippedDates = this.plugin.tasksApi.getSkippedDates(task);

			const cells = GraphRenderer.generateDayCells(
				completionDates,
				this.plugin.settings.daysBeforeToday,
				this.plugin.settings.daysAfterToday,
				task.recurrence,
				skippedDates
			);

			const streak = GraphRenderer.calculateStreak(completionDates, skippedDates, task.recurrence);

			const graphEl = GraphRenderer.renderGraph(
				cells,
				task.title,
				streak,
				this.plugin.settings.showStreakCount
			);

			container.appendChild(graphEl);
		}
	}

	private renderEmpty(container: Element): void {
		container.empty();
		const emptyEl = container.createDiv({ cls: 'habit-graph-empty' });
		emptyEl.createEl('h3', { text: 'No habits found' });
		emptyEl.createEl('p', {
			text: `Create markdown files with frontmatter containing tags: [${this.plugin.settings.habitTag}] and a recurrence field.`
		});

		const tag = this.plugin.settings.habitTag;
		const example = emptyEl.createEl('pre');
		example.textContent = `Example frontmatter:
---
title: Morning workout
recurrence: FREQ=DAILY
tags: [${tag}]
complete_instances:
  - 2025-01-15
  - 2025-01-16
---`;
	}
}
