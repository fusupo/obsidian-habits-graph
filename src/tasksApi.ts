import { App, TFile } from 'obsidian';

export interface TaskInfo {
	description: string;
	recurrence: string;
	tags: string[];
	path: string;
	line: number;
	completed: boolean;
	completedDate?: string;
	dueDate?: string;
}

export class TasksApiWrapper {
	constructor(private app: App) {}

	getTasksPlugin(): any {
		return (this.app as any).plugins.getPlugin('obsidian-tasks-plugin');
	}

	isTasksPluginAvailable(): boolean {
		const plugin = this.getTasksPlugin();
		return plugin !== null && plugin !== undefined;
	}

	/**
	 * Parse tasks from markdown content
	 * This is a simple parser that looks for Tasks plugin format
	 */
	parseTasksFromContent(content: string, filePath: string): TaskInfo[] {
		const tasks: TaskInfo[] = [];
		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Match task format: - [ ] or - [x]
			const taskMatch = line.match(/^[\s]*-\s\[([ xX])\]\s(.+)$/);
			if (!taskMatch) continue;

			const completed = taskMatch[1].toLowerCase() === 'x';
			const taskContent = taskMatch[2];

			// Check for recurrence emoji 🔁
			if (!taskContent.includes('🔁')) continue;

			// Extract description (everything before emojis)
			const descMatch = taskContent.match(/^([^📅⏳🛫✅🔁]+)/);
			const description = descMatch ? descMatch[1].trim() : taskContent;

			// Extract recurrence
			const recurrenceMatch = taskContent.match(/🔁\s+([^📅⏳🛫✅#]+)/);
			const recurrence = recurrenceMatch ? recurrenceMatch[1].trim() : '';

			// Extract tags
			const tagMatches = taskContent.matchAll(/#([\w-]+)/g);
			const tags = Array.from(tagMatches, m => m[1]);

			// Extract dates
			const completedDateMatch = taskContent.match(/✅\s+(\d{4}-\d{2}-\d{2})/);
			const completedDate = completedDateMatch ? completedDateMatch[1] : undefined;

			const dueDateMatch = taskContent.match(/📅\s+(\d{4}-\d{2}-\d{2})/);
			const dueDate = dueDateMatch ? dueDateMatch[1] : undefined;

			tasks.push({
				description,
				recurrence,
				tags,
				path: filePath,
				line: i,
				completed,
				completedDate,
				dueDate
			});
		}

		return tasks;
	}

	/**
	 * Get all tasks from all markdown files in the vault
	 */
	async getAllTasks(): Promise<TaskInfo[]> {
		const allTasks: TaskInfo[] = [];
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			const content = await this.app.vault.read(file);
			const tasks = this.parseTasksFromContent(content, file.path);
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
	 * Group completed instances of the same habit
	 */
	getCompletionHistory(tasks: TaskInfo[], habitDescription: string): Date[] {
		return tasks
			.filter(task =>
				task.description === habitDescription &&
				task.completed &&
				task.completedDate
			)
			.map(task => new Date(task.completedDate!))
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
