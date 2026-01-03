import { App } from 'obsidian';
import { parseISODate } from './utils/dateUtils';
import { parseTasksFromContent, parseTasksFromAllFiles } from './utils/taskParser';
import { TaskInfo } from './types';

export class TasksApiWrapper {
	private plugin?: any; // Reference to plugin for cache access

	constructor(private app: App) {}

	/**
	 * Set plugin reference for cache access.
	 * This enables cached task retrieval.
	 */
	setPlugin(plugin: any): void {
		this.plugin = plugin;
	}

	getTasksPlugin(): any {
		return (this.app as any).plugins.getPlugin('obsidian-tasks-plugin');
	}

	isTasksPluginAvailable(): boolean {
		const plugin = this.getTasksPlugin();
		return plugin !== null && plugin !== undefined;
	}

	/**
	 * Get all tasks from all markdown files in the vault.
	 * Uses cache if plugin reference is set, otherwise parses all files.
	 */
	async getAllTasks(): Promise<TaskInfo[]> {
		// Use cached version if plugin is available
		if (this.plugin && typeof this.plugin.getCachedTasks === 'function') {
			return await this.plugin.getCachedTasks();
		}

		// Fallback: parse all files (no caching)
		const tasksByFile = await parseTasksFromAllFiles(this.app.vault);
		const allTasks: TaskInfo[] = [];

		for (const tasks of tasksByFile.values()) {
			allTasks.push(...tasks);
		}

		return allTasks;
	}

	/**
	 * Get all habit tasks (recurring tasks with habit tag)
	 */
	async getHabitTasks(habitTag: string = 'habit'): Promise<TaskInfo[]> {
		const allTasks = await this.getAllTasks();
		return allTasks.filter(task =>
			task.recurrence && task.tags.includes(habitTag)
		);
	}

	/**
	 * Group completed instances of the same habit.
	 *
	 * Parses completion dates using UTC-aware parseISODate to ensure
	 * consistent date handling across timezones.
	 */
	getCompletionHistory(tasks: TaskInfo[], habitDescription: string): Date[] {
		return tasks
			.filter(task =>
				task.description === habitDescription &&
				task.completed &&
				task.completedDate
			)
			.map(task => parseISODate(task.completedDate!))
			.sort((a, b) => a.getTime() - b.getTime());
	}

	/**
	 * Get unique habit descriptions (deduplicated)
	 */
	getUniqueHabits(tasks: TaskInfo[]): Map<string, TaskInfo[]> {
		const habitMap = new Map<string, TaskInfo[]>();

		for (const task of tasks) {
			const existing = habitMap.get(task.description) || [];
			existing.push(task);
			habitMap.set(task.description, existing);
		}

		return habitMap;
	}
}
