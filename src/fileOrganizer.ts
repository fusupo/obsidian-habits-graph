import { TFile, Vault } from 'obsidian';

export class FileOrganizer {
	constructor(private vault: Vault) {}

	/**
	 * Auto-indent completed tasks under their active recurring task
	 */
	async organizeHabitFile(file: TFile): Promise<void> {
		const content = await this.vault.read(file);
		const lines = content.split('\n');

		console.log('FileOrganizer: Processing file:', file.path);

		// First pass: identify all active habits and their completed instances
		const activeHabits = new Map<string, { activeLine: number; completedLines: number[] }>();

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			if (this.isActiveHabitTask(line)) {
				const name = this.extractTaskName(line);
				console.log('Found active habit:', name, 'at line', i);
				if (!activeHabits.has(name)) {
					activeHabits.set(name, { activeLine: i, completedLines: [] });
				}
			} else if (this.isCompletedHabitTask(line) && !this.isIndented(line)) {
				// Only process completed tasks that are NOT already indented
				const name = this.extractTaskName(line);
				console.log('Found completed habit:', name, 'at line', i);
				// Find the active habit for this completed task
				if (activeHabits.has(name)) {
					activeHabits.get(name)!.completedLines.push(i);
					console.log('  -> Matched with active habit');
				} else {
					console.log('  -> No active habit found for this');
				}
			}
		}

		// Second pass: build organized output
		const organized: string[] = [];
		const processedLines = new Set<number>();

		for (let i = 0; i < lines.length; i++) {
			if (processedLines.has(i)) {
				continue; // Skip already processed completed tasks
			}

			const line = lines[i];

			// Check if this is an active habit task
			if (this.isActiveHabitTask(line)) {
				const name = this.extractTaskName(line);
				const habitInfo = activeHabits.get(name);

				// Add the active task
				organized.push(line);

				// Add all its completed instances (indented)
				if (habitInfo && habitInfo.completedLines.length > 0) {
					for (const completedIdx of habitInfo.completedLines) {
						const completedLine = lines[completedIdx];
						const indented = this.indentLine(completedLine);
						organized.push(indented);
						processedLines.add(completedIdx);
					}
				}
			} else {
				// Not a habit task or already processed, keep as-is
				organized.push(line);
			}
		}

		const newContent = organized.join('\n');

		// Only write if content changed
		if (newContent !== content) {
			console.log('FileOrganizer: Content changed, writing to file');
			await this.vault.modify(file, newContent);
		} else {
			console.log('FileOrganizer: No changes needed');
		}
	}

	/**
	 * Check if line is an active (uncompleted) habit task with recurrence
	 * Must be at root level (no indentation)
	 */
	private isActiveHabitTask(line: string): boolean {
		// Must NOT be indented (starts with - directly, no leading spaces/tabs)
		const notIndented = /^-\s\[\s\]\s/.test(line);
		const hasHabitTag = line.includes('#habit');
		const hasRecurrence = line.includes('🔁');
		return notIndented && hasHabitTag && hasRecurrence;
	}

	/**
	 * Check if line is a completed habit task
	 * Can be at any indentation level
	 */
	private isCompletedHabitTask(line: string): boolean {
		// Match completed tasks with both #habit tag and 🔁 recurrence (in any order)
		const hasCompletedCheckbox = /^[\s]*-\s\[[xX]\]\s/.test(line);
		const hasHabitTag = line.includes('#habit');
		const hasRecurrence = line.includes('🔁');
		return hasCompletedCheckbox && hasHabitTag && hasRecurrence;
	}

	/**
	 * Check if line is already indented
	 */
	private isIndented(line: string): boolean {
		return /^[\s]+/.test(line);
	}

	/**
	 * Extract task description (everything before emojis)
	 */
	private extractTaskName(line: string): string {
		const match = line.match(/^[\s]*-\s\[[ xX]\]\s([^📅⏳🛫✅🔁]+)/);
		return match ? match[1].trim() : '';
	}

	/**
	 * Add exactly one level of indentation (2 spaces)
	 * Only indent if not already indented
	 */
	private indentLine(line: string): string {
		// Only add indentation if line is not already indented
		if (this.isIndented(line)) {
			return line; // Already indented, return as-is
		}
		return '  ' + line; // Add exactly 2 spaces
	}

	/**
	 * Organize all markdown files in vault that contain habits
	 */
	async organizeAllHabitFiles(): Promise<number> {
		const files = this.vault.getMarkdownFiles();
		let organized = 0;

		for (const file of files) {
			const content = await this.vault.read(file);

			// Only process files that contain habit tasks
			if (content.includes('#habit') && content.includes('🔁')) {
				await this.organizeHabitFile(file);
				organized++;
			}
		}

		return organized;
	}
}
