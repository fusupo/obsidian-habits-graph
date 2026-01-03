import { TaskInfo } from '../types';

/**
 * Cache statistics for monitoring performance and memory usage.
 */
export interface CacheStats {
	cachedFiles: number;
	totalTasks: number;
	memoryEstimate: number; // in bytes
}

/**
 * Manages in-memory caching of parsed tasks with event-driven invalidation.
 *
 * Cache strategy:
 * - Map<filePath, TaskInfo[]> for O(1) file lookups
 * - Lazy initialization (populated on first getAllTasks call)
 * - Invalidation on file modify/delete/rename events
 * - Memory-based (cleared on plugin unload)
 */
export class TaskCacheManager {
	private cache: Map<string, TaskInfo[]> = new Map();
	private isDirty: Set<string> = new Set(); // Files needing re-parse

	/**
	 * Check if cache is empty (not yet initialized).
	 */
	isEmpty(): boolean {
		return this.cache.size === 0;
	}

	/**
	 * Get cached tasks for a specific file.
	 * Returns null if file not in cache.
	 */
	getFileTasks(filePath: string): TaskInfo[] | null {
		return this.cache.get(filePath) ?? null;
	}

	/**
	 * Set/update tasks for a specific file.
	 */
	setFileTasks(filePath: string, tasks: TaskInfo[]): void {
		this.cache.set(filePath, tasks);
		this.isDirty.delete(filePath); // Mark as clean
	}

	/**
	 * Bulk set tasks from multiple files (used for initial population).
	 */
	bulkSet(tasksByFile: Map<string, TaskInfo[]>): void {
		this.cache.clear();
		this.isDirty.clear();
		for (const [filePath, tasks] of tasksByFile.entries()) {
			this.cache.set(filePath, tasks);
		}
	}

	/**
	 * Mark a file as needing re-parsing (dirty).
	 * The file stays in cache but will be re-parsed on next access if needed.
	 */
	invalidateFile(filePath: string): void {
		this.isDirty.add(filePath);
	}

	/**
	 * Remove a file from the cache entirely (used for delete events).
	 */
	removeFile(filePath: string): void {
		this.cache.delete(filePath);
		this.isDirty.delete(filePath);
	}

	/**
	 * Rename a file in the cache (used for rename events).
	 */
	renameFile(oldPath: string, newPath: string): void {
		const tasks = this.cache.get(oldPath);
		if (tasks) {
			// Update file paths in task objects
			const updatedTasks = tasks.map(task => ({
				...task,
				path: newPath
			}));
			this.cache.delete(oldPath);
			this.cache.set(newPath, updatedTasks);
			this.isDirty.delete(oldPath);
		}
	}

	/**
	 * Get all cached tasks from all files.
	 */
	getAllCachedTasks(): TaskInfo[] {
		const allTasks: TaskInfo[] = [];
		for (const tasks of this.cache.values()) {
			allTasks.push(...tasks);
		}
		return allTasks;
	}

	/**
	 * Clear the entire cache.
	 */
	clearCache(): void {
		this.cache.clear();
		this.isDirty.clear();
	}

	/**
	 * Get cache statistics for monitoring.
	 */
	getStats(): CacheStats {
		const cachedFiles = this.cache.size;
		let totalTasks = 0;

		for (const tasks of this.cache.values()) {
			totalTasks += tasks.length;
		}

		// Estimate memory usage:
		// Each TaskInfo ~ 200 bytes (strings + metadata)
		// Each Map entry ~ 50 bytes overhead
		const memoryEstimate = (totalTasks * 200) + (cachedFiles * 50);

		return {
			cachedFiles,
			totalTasks,
			memoryEstimate
		};
	}

	/**
	 * Check if a file is marked dirty (needs re-parsing).
	 */
	isFileDirty(filePath: string): boolean {
		return this.isDirty.has(filePath);
	}
}
