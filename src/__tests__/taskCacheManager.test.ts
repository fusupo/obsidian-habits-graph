import { TaskCacheManager } from '../cache/TaskCacheManager';
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

describe('TaskCacheManager', () => {
	let cache: TaskCacheManager;

	beforeEach(() => {
		cache = new TaskCacheManager();
	});

	it('starts empty', () => {
		expect(cache.isEmpty()).toBe(true);
		expect(cache.getAllCachedTasks()).toEqual([]);
	});

	describe('setFileTasks / getFileTasks', () => {
		it('stores and retrieves a TaskNote', () => {
			const task = makeTaskNote({ title: 'Workout' });
			cache.setFileTasks('tasks/workout.md', task);

			expect(cache.getFileTasks('tasks/workout.md')).toEqual(task);
			expect(cache.isEmpty()).toBe(false);
		});

		it('returns null for unknown file', () => {
			expect(cache.getFileTasks('nonexistent.md')).toBeNull();
		});

		it('overwrites existing entry', () => {
			cache.setFileTasks('a.md', makeTaskNote({ title: 'V1' }));
			cache.setFileTasks('a.md', makeTaskNote({ title: 'V2' }));

			expect(cache.getFileTasks('a.md')!.title).toBe('V2');
		});

		it('clears dirty flag on set', () => {
			cache.setFileTasks('a.md', makeTaskNote());
			cache.invalidateFile('a.md');
			expect(cache.isFileDirty('a.md')).toBe(true);

			cache.setFileTasks('a.md', makeTaskNote());
			expect(cache.isFileDirty('a.md')).toBe(false);
		});
	});

	describe('bulkSet', () => {
		it('populates cache from map', () => {
			const map = new Map<string, TaskNote>();
			map.set('a.md', makeTaskNote({ title: 'A' }));
			map.set('b.md', makeTaskNote({ title: 'B' }));
			cache.bulkSet(map);

			expect(cache.getAllCachedTasks()).toHaveLength(2);
			expect(cache.getFileTasks('a.md')!.title).toBe('A');
			expect(cache.getFileTasks('b.md')!.title).toBe('B');
		});

		it('clears previous entries', () => {
			cache.setFileTasks('old.md', makeTaskNote({ title: 'Old' }));
			cache.bulkSet(new Map([['new.md', makeTaskNote({ title: 'New' })]]));

			expect(cache.getFileTasks('old.md')).toBeNull();
			expect(cache.getFileTasks('new.md')!.title).toBe('New');
		});
	});

	describe('removeFile', () => {
		it('removes entry from cache', () => {
			cache.setFileTasks('a.md', makeTaskNote());
			cache.removeFile('a.md');

			expect(cache.getFileTasks('a.md')).toBeNull();
			expect(cache.isEmpty()).toBe(true);
		});

		it('clears dirty flag', () => {
			cache.setFileTasks('a.md', makeTaskNote());
			cache.invalidateFile('a.md');
			cache.removeFile('a.md');

			expect(cache.isFileDirty('a.md')).toBe(false);
		});
	});

	describe('renameFile', () => {
		it('moves entry to new path and updates path field', () => {
			cache.setFileTasks('old.md', makeTaskNote({ path: 'old.md' }));
			cache.renameFile('old.md', 'new.md');

			expect(cache.getFileTasks('old.md')).toBeNull();
			const renamed = cache.getFileTasks('new.md');
			expect(renamed).not.toBeNull();
			expect(renamed!.path).toBe('new.md');
		});

		it('no-op if old path not in cache', () => {
			cache.renameFile('nonexistent.md', 'new.md');
			expect(cache.getFileTasks('new.md')).toBeNull();
		});
	});

	describe('getAllCachedTasks', () => {
		it('returns all TaskNotes as array', () => {
			cache.setFileTasks('a.md', makeTaskNote({ title: 'A' }));
			cache.setFileTasks('b.md', makeTaskNote({ title: 'B' }));
			cache.setFileTasks('c.md', makeTaskNote({ title: 'C' }));

			const all = cache.getAllCachedTasks();
			expect(all).toHaveLength(3);
			expect(all.map(t => t.title).sort()).toEqual(['A', 'B', 'C']);
		});
	});

	describe('invalidateFile / isFileDirty', () => {
		it('marks file as dirty', () => {
			cache.setFileTasks('a.md', makeTaskNote());
			expect(cache.isFileDirty('a.md')).toBe(false);

			cache.invalidateFile('a.md');
			expect(cache.isFileDirty('a.md')).toBe(true);
		});
	});

	describe('clearCache', () => {
		it('removes all entries and dirty flags', () => {
			cache.setFileTasks('a.md', makeTaskNote());
			cache.invalidateFile('a.md');
			cache.clearCache();

			expect(cache.isEmpty()).toBe(true);
			expect(cache.isFileDirty('a.md')).toBe(false);
		});
	});

	describe('getStats', () => {
		it('returns correct counts', () => {
			cache.setFileTasks('a.md', makeTaskNote());
			cache.setFileTasks('b.md', makeTaskNote());

			const stats = cache.getStats();
			expect(stats.cachedFiles).toBe(2);
			expect(stats.totalTasks).toBe(2);
			expect(stats.memoryEstimate).toBeGreaterThan(0);
		});

		it('returns zeros when empty', () => {
			const stats = cache.getStats();
			expect(stats.cachedFiles).toBe(0);
			expect(stats.totalTasks).toBe(0);
			expect(stats.memoryEstimate).toBe(0);
		});
	});
});
