import { App } from 'obsidian';
import { parseISODate } from './utils/dateUtils';
import { parseTaskNotesFromAllFiles } from './utils/taskParser';
import { TaskNote } from './types';

export class TasksApiWrapper {
	private plugin?: any;

	constructor(private app: App) {}

	setPlugin(plugin: any): void {
		this.plugin = plugin;
	}

	async getAllTaskNotes(): Promise<TaskNote[]> {
		if (this.plugin && typeof this.plugin.getCachedTaskNotes === 'function') {
			return await this.plugin.getCachedTaskNotes();
		}

		// Fallback: parse all files (no caching)
		const folderPath = this.plugin?.settings?.taskFolderPath ?? '';
		const tasksByFile = parseTaskNotesFromAllFiles(this.app.vault, this.app.metadataCache, folderPath);
		return Array.from(tasksByFile.values());
	}

	async getHabitTaskNotes(habitTag: string = 'habit'): Promise<TaskNote[]> {
		const allTasks = await this.getAllTaskNotes();
		return allTasks.filter(task =>
			task.recurrence && task.tags.includes(habitTag)
		);
	}

	getCompletionHistory(task: TaskNote): Date[] {
		return task.completeInstances
			.map(dateStr => parseISODate(dateStr))
			.sort((a, b) => a.getTime() - b.getTime());
	}

	getSkippedDates(task: TaskNote): Date[] {
		return task.skippedInstances
			.map(dateStr => parseISODate(dateStr))
			.sort((a, b) => a.getTime() - b.getTime());
	}
}
