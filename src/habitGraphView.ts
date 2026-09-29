import { ItemView, WorkspaceLeaf } from 'obsidian';
import type OrgHabitsGraphPlugin from './main';
import { HabitRowSet } from './ui/habitRow';

export const VIEW_TYPE_HABIT_GRAPH = 'habit-graph-view';

export class HabitGraphView extends ItemView {
	plugin: OrgHabitsGraphPlugin;
	private rows: HabitRowSet;

	constructor(leaf: WorkspaceLeaf, plugin: OrgHabitsGraphPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.rows = new HabitRowSet(plugin);
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
		// Re-render just the changed habit's row; the full refresh on vault
		// modify (main.ts) still handles habits being added or removed
		this.register(this.plugin.eventHandler.onTaskChanged(path => this.rows.handleChanged(path)));
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.rows.clear();
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

		this.rows.render(container, habitTasks);
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
