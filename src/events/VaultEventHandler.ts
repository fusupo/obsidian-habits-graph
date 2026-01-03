import { Plugin, TFile } from 'obsidian';
import { TaskCacheManager } from '../cache/TaskCacheManager';
import { parseTasksFromFile } from '../utils/taskParser';

/**
 * Handles Obsidian vault events to keep the task cache synchronized.
 *
 * Events handled:
 * - create: New markdown file created
 * - modify: Markdown file content changed
 * - delete: File removed from vault
 * - rename: File path changed
 *
 * All event handlers are registered via plugin.registerEvent() for automatic cleanup.
 */
export class VaultEventHandler {
	constructor(
		private plugin: Plugin,
		private cacheManager: TaskCacheManager
	) {}

	/**
	 * Setup all vault event listeners.
	 * Must be called during plugin onload().
	 */
	setupEventListeners(): void {
		const { vault } = this.plugin.app;

		// Handle file creation - parse and cache immediately
		this.plugin.registerEvent(
			vault.on('create', async (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					await this.handleCreate(file);
				}
			})
		);

		// Handle file modification - re-parse and update cache
		this.plugin.registerEvent(
			vault.on('modify', async (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					await this.handleModify(file);
				}
			})
		);

		// Handle file deletion - remove from cache
		this.plugin.registerEvent(
			vault.on('delete', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.handleDelete(file);
				}
			})
		);

		// Handle file rename - update cache with new path
		this.plugin.registerEvent(
			vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.handleRename(file, oldPath);
				}
			})
		);
	}

	/**
	 * Handle new file creation.
	 * Parse the new file and add to cache if it contains tasks.
	 */
	private async handleCreate(file: TFile): Promise<void> {
		try {
			const tasks = await parseTasksFromFile(this.plugin.app.vault, file);
			this.cacheManager.setFileTasks(file.path, tasks);
		} catch (error) {
			console.error(`[habits-graph] Error parsing new file ${file.path}:`, error);
		}
	}

	/**
	 * Handle file modification.
	 * Re-parse the file and update cache.
	 */
	private async handleModify(file: TFile): Promise<void> {
		try {
			const tasks = await parseTasksFromFile(this.plugin.app.vault, file);
			this.cacheManager.setFileTasks(file.path, tasks);
		} catch (error) {
			console.error(`[habits-graph] Error re-parsing modified file ${file.path}:`, error);
			// Mark as dirty so it gets re-parsed on next access
			this.cacheManager.invalidateFile(file.path);
		}
	}

	/**
	 * Handle file deletion.
	 * Remove file from cache entirely.
	 */
	private handleDelete(file: TFile): void {
		this.cacheManager.removeFile(file.path);
	}

	/**
	 * Handle file rename.
	 * Update cache to reflect new file path.
	 */
	private handleRename(file: TFile, oldPath: string): void {
		this.cacheManager.renameFile(oldPath, file.path);
	}
}
