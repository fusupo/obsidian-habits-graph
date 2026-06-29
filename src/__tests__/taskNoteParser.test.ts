import { parseTaskNoteFromFrontmatter } from '../utils/taskParser';

describe('parseTaskNoteFromFrontmatter', () => {
	const filePath = 'tasks/morning-workout.md';

	it('parses full valid frontmatter with all fields', () => {
		const fm = {
			id: 'task-morning-workout',
			title: 'Morning workout',
			status: 'open',
			recurrence: 'FREQ=DAILY',
			recurrence_anchor: 'scheduled',
			scheduled: '2025-01-18',
			due: '2025-01-20',
			tags: ['habit', 'health'],
			complete_instances: ['2025-01-15', '2025-01-16', '2025-01-17'],
			skipped_instances: ['2025-01-14'],
			dateCreated: '2025-01-10T09:30:00Z',
			dateModified: '2025-01-18T08:02:11Z',
		};

		const result = parseTaskNoteFromFrontmatter(fm, filePath);

		expect(result).toEqual({
			id: 'task-morning-workout',
			title: 'Morning workout',
			status: 'open',
			recurrence: 'FREQ=DAILY',
			recurrenceAnchor: 'scheduled',
			scheduled: '2025-01-18',
			due: '2025-01-20',
			tags: ['habit', 'health'],
			path: filePath,
			completeInstances: ['2025-01-15', '2025-01-16', '2025-01-17'],
			skippedInstances: ['2025-01-14'],
			dateCreated: '2025-01-10T09:30:00Z',
			dateModified: '2025-01-18T08:02:11Z',
		});
	});

	it('returns defaults for minimal frontmatter (title only)', () => {
		const result = parseTaskNoteFromFrontmatter({ title: 'Simple task' }, filePath);

		expect(result).not.toBeNull();
		expect(result!.title).toBe('Simple task');
		expect(result!.status).toBe('open');
		expect(result!.recurrence).toBe('');
		expect(result!.recurrenceAnchor).toBe('scheduled');
		expect(result!.tags).toEqual([]);
		expect(result!.completeInstances).toEqual([]);
		expect(result!.skippedInstances).toEqual([]);
		expect(result!.id).toBeUndefined();
		expect(result!.scheduled).toBeUndefined();
		expect(result!.due).toBeUndefined();
		expect(result!.dateCreated).toBeUndefined();
		expect(result!.dateModified).toBeUndefined();
	});

	it('returns null when frontmatter is null', () => {
		expect(parseTaskNoteFromFrontmatter(null, filePath)).toBeNull();
	});

	it('returns null when frontmatter is undefined', () => {
		expect(parseTaskNoteFromFrontmatter(undefined, filePath)).toBeNull();
	});

	it('returns null when both title and recurrence are missing', () => {
		expect(parseTaskNoteFromFrontmatter({ status: 'open' }, filePath)).toBeNull();
	});

	it('derives title from file path when title is missing but recurrence exists', () => {
		const result = parseTaskNoteFromFrontmatter({ recurrence: 'FREQ=DAILY' }, 'tasks/morning-workout.md');
		expect(result).not.toBeNull();
		expect(result!.title).toBe('morning-workout');
		expect(result!.recurrence).toBe('FREQ=DAILY');
	});

	it('coerces YAML Date objects in complete_instances to strings', () => {
		const fm = {
			title: 'Workout',
			complete_instances: [
				new Date('2025-01-15T00:00:00Z'),
				new Date('2025-01-16T00:00:00Z'),
			],
		};

		const result = parseTaskNoteFromFrontmatter(fm, filePath);

		expect(result!.completeInstances).toEqual(['2025-01-15', '2025-01-16']);
	});

	it('coerces a YAML Date object in scheduled field', () => {
		const fm = {
			title: 'Workout',
			scheduled: new Date('2025-01-18T00:00:00Z'),
		};

		const result = parseTaskNoteFromFrontmatter(fm, filePath);

		expect(result!.scheduled).toBe('2025-01-18');
	});

	it('handles empty complete_instances array', () => {
		const fm = { title: 'Workout', complete_instances: [] };
		const result = parseTaskNoteFromFrontmatter(fm, filePath);
		expect(result!.completeInstances).toEqual([]);
	});

	it('normalizes tags from single string to array', () => {
		const fm = { title: 'Workout', tags: 'habit' };
		const result = parseTaskNoteFromFrontmatter(fm, filePath);
		expect(result!.tags).toEqual(['habit']);
	});

	it('passes through tags array as-is', () => {
		const fm = { title: 'Workout', tags: ['habit', 'health'] };
		const result = parseTaskNoteFromFrontmatter(fm, filePath);
		expect(result!.tags).toEqual(['habit', 'health']);
	});

	it('maps recurrence_anchor: completion correctly', () => {
		const fm = { title: 'Workout', recurrence_anchor: 'completion' };
		const result = parseTaskNoteFromFrontmatter(fm, filePath);
		expect(result!.recurrenceAnchor).toBe('completion');
	});

	it('accepts camelCase recurrenceAnchor', () => {
		const fm = { title: 'Workout', recurrenceAnchor: 'completion' };
		const result = parseTaskNoteFromFrontmatter(fm, filePath);
		expect(result!.recurrenceAnchor).toBe('completion');
	});

	it('accepts camelCase completeInstances', () => {
		const fm = { title: 'Workout', completeInstances: ['2025-01-15'] };
		const result = parseTaskNoteFromFrontmatter(fm, filePath);
		expect(result!.completeInstances).toEqual(['2025-01-15']);
	});

	it('accepts camelCase skippedInstances', () => {
		const fm = { title: 'Workout', skippedInstances: ['2025-01-14'] };
		const result = parseTaskNoteFromFrontmatter(fm, filePath);
		expect(result!.skippedInstances).toEqual(['2025-01-14']);
	});

	it('prefers snake_case over camelCase when both present', () => {
		const fm = {
			title: 'Workout',
			complete_instances: ['2025-01-15'],
			completeInstances: ['2025-01-20'],
		};
		const result = parseTaskNoteFromFrontmatter(fm, filePath);
		expect(result!.completeInstances).toEqual(['2025-01-15']);
	});

	it('sets path from filePath argument', () => {
		const result = parseTaskNoteFromFrontmatter({ title: 'Test' }, 'custom/path.md');
		expect(result!.path).toBe('custom/path.md');
	});

	it('coerces numeric id to string', () => {
		const fm = { title: 'Workout', id: 42 };
		const result = parseTaskNoteFromFrontmatter(fm, filePath);
		expect(result!.id).toBe('42');
	});
});
