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

export interface TaskNote {
	id?: string;
	title: string;
	status: string;
	recurrence: string;
	recurrenceAnchor: 'scheduled' | 'completion';
	tags: string[];
	path: string;
	scheduled?: string;
	due?: string;
	completeInstances: string[];
	skippedInstances: string[];
	dateCreated?: string;
	dateModified?: string;
}
