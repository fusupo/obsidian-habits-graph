import { TaskNote } from '../types';

export interface CacheStats {
	cachedFiles: number;
	totalTasks: number;
	memoryEstimate: number; // in bytes
}

/**
 * Manages in-memory caching of parsed TaskNotes with event-driven invalidation.
 *
 * Cache strategy:
 * - Map<filePath, TaskNote> for O(1) file lookups (one TaskNote per file)
 * - Lazy initialization (populated on first access)
 * - Invalidation on file modify/delete/rename events
 * - Memory-based (cleared on plugin unload)
 */
export class TaskCacheManager {
	private cache: Map<string, TaskNote> = new Map();
	private isDirty: Set<string> = new Set();

	isEmpty(): boolean {
		return this.cache.size === 0;
	}

	getFileTasks(filePath: string): TaskNote | null {
		return this.cache.get(filePath) ?? null;
	}

	setFileTasks(filePath: string, task: TaskNote): void {
		this.cache.set(filePath, task);
		this.isDirty.delete(filePath);
	}

	bulkSet(tasksByFile: Map<string, TaskNote>): void {
		this.cache.clear();
		this.isDirty.clear();
		for (const [filePath, task] of tasksByFile.entries()) {
			this.cache.set(filePath, task);
		}
	}

	invalidateFile(filePath: string): void {
		this.isDirty.add(filePath);
	}

	removeFile(filePath: string): void {
		this.cache.delete(filePath);
		this.isDirty.delete(filePath);
	}

	renameFile(oldPath: string, newPath: string): void {
		const task = this.cache.get(oldPath);
		if (task) {
			this.cache.delete(oldPath);
			this.cache.set(newPath, { ...task, path: newPath });
			this.isDirty.delete(oldPath);
		}
	}

	getAllCachedTasks(): TaskNote[] {
		return Array.from(this.cache.values());
	}

	clearCache(): void {
		this.cache.clear();
		this.isDirty.clear();
	}

	getStats(): CacheStats {
		const cachedFiles = this.cache.size;
		// One TaskNote per file; ~400 bytes each (strings + instance arrays)
		const memoryEstimate = (cachedFiles * 400) + (cachedFiles * 50);

		return {
			cachedFiles,
			totalTasks: cachedFiles,
			memoryEstimate
		};
	}

	isFileDirty(filePath: string): boolean {
		return this.isDirty.has(filePath);
	}
}
