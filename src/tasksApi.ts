import { App, TFile } from 'obsidian';
import { parseISODate } from './utils/dateUtils';

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

	/** Task emoji markers used by the Tasks plugin */
	private static readonly TASK_EMOJIS = ['📅', '⏳', '🛫', '✅', '🔁', '⏫', '🔼', '🔽', '🆔', '⛔', '🔺', '➕'] as const;

	/**
	 * Find the position of the first task-related emoji in a string.
	 * Returns -1 if no emoji found.
	 */
	private findFirstEmojiPosition(text: string): number {
		let firstPos = -1;
		for (const emoji of TasksApiWrapper.TASK_EMOJIS) {
			const pos = text.indexOf(emoji);
			if (pos !== -1 && (firstPos === -1 || pos < firstPos)) {
				firstPos = pos;
			}
		}
		return firstPos;
	}

	/**
	 * Extract description from task content.
	 * Description is everything before the first task emoji.
	 */
	private extractDescription(taskContent: string): string {
		const firstEmojiPos = this.findFirstEmojiPosition(taskContent);
		if (firstEmojiPos === -1) {
			// No emojis found, entire content is description
			return taskContent.trim();
		}
		return taskContent.substring(0, firstEmojiPos).trim();
	}

	/**
	 * Extract recurrence pattern from task content.
	 * Handles various formats: "every day", "every 2 days", "every week on Sunday", etc.
	 */
	private extractRecurrence(taskContent: string): string {
		// Match 🔁 followed by recurrence text (stop at next emoji, tag, or end)
		const recurrenceMatch = taskContent.match(/🔁\s*(.+?)(?=\s*[📅⏳🛫✅⏫🔼🔽🆔⛔🔺➕#]|$)/);
		return recurrenceMatch ? recurrenceMatch[1].trim() : '';
	}

	/**
	 * Extract and validate a date from task content using the given emoji marker.
	 * Returns undefined if date not found or invalid.
	 *
	 * Uses UTC-aware parseISODate for validation to ensure timezone-independent behavior.
	 */
	private extractDate(taskContent: string, emoji: string): string | undefined {
		const datePattern = new RegExp(`${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})`);
		const match = taskContent.match(datePattern);
		if (!match) return undefined;

		const dateStr = match[1];
		// Validate the date is actually valid using UTC-aware parsing
		try {
			parseISODate(dateStr);
			return dateStr;
		} catch (error) {
			console.debug(`[habits-graph] Invalid date format: ${dateStr}`);
			return undefined;
		}
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

			// Extract task components using robust helpers
			const description = this.extractDescription(taskContent);
			const recurrence = this.extractRecurrence(taskContent);

			// Extract tags (can appear anywhere in the task)
			const tagMatches = taskContent.matchAll(/#([\w-]+)/g);
			const tags = Array.from(tagMatches, m => m[1]);

			// Extract dates with validation
			const completedDate = this.extractDate(taskContent, '✅');
			const dueDate = this.extractDate(taskContent, '📅');

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
