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
