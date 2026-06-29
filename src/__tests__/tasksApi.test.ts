import { TasksApiWrapper } from '../tasksApi';
import { TaskNote } from '../types';

function makeTaskNote(overrides: Partial<TaskNote> = {}): TaskNote {
	return {
		title: 'Test task',
		status: 'open',
		recurrence: 'FREQ=DAILY',
		recurrenceAnchor: 'scheduled',
		tags: ['habit'],
		path: 'tasks/test.md',
		completeInstances: [],
		skippedInstances: [],
		...overrides
	};
}

describe('TasksApiWrapper', () => {
	let api: TasksApiWrapper;

	beforeEach(() => {
		// Construct with a minimal mock App (only metadataCache and vault needed for fallback)
		api = new TasksApiWrapper({} as any);
	});

	describe('getCompletionHistory', () => {
		it('parses completeInstances as sorted Date array', () => {
			const task = makeTaskNote({
				completeInstances: ['2025-01-17', '2025-01-15', '2025-01-16']
			});

			const dates = api.getCompletionHistory(task);

			expect(dates).toHaveLength(3);
			expect(dates[0].getUTCFullYear()).toBe(2025);
			expect(dates[0].getUTCMonth()).toBe(0); // January
			expect(dates[0].getUTCDate()).toBe(15);
			expect(dates[1].getUTCDate()).toBe(16);
			expect(dates[2].getUTCDate()).toBe(17);
		});

		it('returns empty array for no completeInstances', () => {
			const task = makeTaskNote({ completeInstances: [] });
			expect(api.getCompletionHistory(task)).toEqual([]);
		});

		it('handles single completion date', () => {
			const task = makeTaskNote({ completeInstances: ['2025-03-01'] });
			const dates = api.getCompletionHistory(task);

			expect(dates).toHaveLength(1);
			expect(dates[0].getUTCDate()).toBe(1);
			expect(dates[0].getUTCMonth()).toBe(2); // March
		});
	});

	describe('getHabitTaskNotes (via getAllTaskNotes)', () => {
		it('filters by tag and recurrence', async () => {
			const tasks: TaskNote[] = [
				makeTaskNote({ title: 'Workout', tags: ['habit'], recurrence: 'FREQ=DAILY' }),
				makeTaskNote({ title: 'No tag', tags: [], recurrence: 'FREQ=DAILY' }),
				makeTaskNote({ title: 'No recurrence', tags: ['habit'], recurrence: '' }),
				makeTaskNote({ title: 'Reading', tags: ['habit', 'learning'], recurrence: 'FREQ=WEEKLY' }),
			];

			// Mock plugin with getCachedTaskNotes
			api.setPlugin({
				getCachedTaskNotes: async () => tasks
			});

			const habits = await api.getHabitTaskNotes('habit');

			expect(habits).toHaveLength(2);
			expect(habits.map(t => t.title).sort()).toEqual(['Reading', 'Workout']);
		});

		it('filters by custom tag', async () => {
			const tasks: TaskNote[] = [
				makeTaskNote({ title: 'A', tags: ['custom'], recurrence: 'FREQ=DAILY' }),
				makeTaskNote({ title: 'B', tags: ['habit'], recurrence: 'FREQ=DAILY' }),
			];

			api.setPlugin({ getCachedTaskNotes: async () => tasks });

			const habits = await api.getHabitTaskNotes('custom');
			expect(habits).toHaveLength(1);
			expect(habits[0].title).toBe('A');
		});

		it('returns empty array when no habits match', async () => {
			api.setPlugin({ getCachedTaskNotes: async () => [] });

			const habits = await api.getHabitTaskNotes('habit');
			expect(habits).toEqual([]);
		});
	});
});
