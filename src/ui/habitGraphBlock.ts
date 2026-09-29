import { MarkdownRenderChild } from 'obsidian';
import type OrgHabitsGraphPlugin from '../main';
import { HabitRowSet } from './habitRow';

/**
 * A rendered ```habit-graph``` code block. As a MarkdownRenderChild its
 * change subscription lives exactly as long as the rendered block, so rows
 * stay live without leaking listeners when the note closes or re-renders.
 */
export class HabitGraphBlock extends MarkdownRenderChild {
	private rows: HabitRowSet;

	constructor(containerEl: HTMLElement, private plugin: OrgHabitsGraphPlugin) {
		super(containerEl);
		this.rows = new HabitRowSet(plugin);
	}

	onload(): void {
		this.register(this.plugin.eventHandler.onTaskChanged(path => this.rows.handleChanged(path)));
		this.register(() => this.rows.clear());
	}

	async render(): Promise<void> {
		const { settings, tasksApi } = this.plugin;
		const habitTasks = await tasksApi.getHabitTaskNotes(settings.habitTag);

		if (habitTasks.length === 0) {
			const emptyEl = this.containerEl.createDiv({ cls: 'habit-graph-empty' });
			emptyEl.createEl('h3', { text: 'No habits found' });
			emptyEl.createEl('p', {
				text: `Create markdown files with frontmatter containing tags: [${settings.habitTag}] and a recurrence field.`
			});
			return;
		}

		this.rows.render(this.containerEl, habitTasks);
	}
}
