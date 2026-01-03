/**
 * Represents a task from the vault with all its metadata.
 */
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
