import { App, Plugin, TFile } from 'obsidian';
import { TaskCacheManager } from '../cache/TaskCacheManager';
import { parseTaskNoteFromFile } from '../utils/taskParser';

/**
 * Handles Obsidian vault events to keep the task cache synchronized.
 *
 * Events handled:
 * - metadataCache changed: File frontmatter updated (create or modify)
 * - vault delete: File removed from vault
 * - vault rename: File path changed
 *
 * Uses metadataCache.on('changed') instead of vault.on('modify') to ensure
 * frontmatter is fully parsed before we read it.
 */
export class VaultEventHandler {
	private changeListeners = new Set<(path: string) => void>();

	constructor(
		private plugin: Plugin,
		private cacheManager: TaskCacheManager,
		private app: App
	) {}

	/**
	 * Subscribe to a file's task data being re-cached. Fires after the cache
	 * update, so listeners read fresh data from the cache.
	 *
	 * @returns unsubscribe function; pass it to a component's register()
	 */
	onTaskChanged(listener: (path: string) => void): () => void {
		this.changeListeners.add(listener);
		return () => {
			this.changeListeners.delete(listener);
		};
	}

	setupEventListeners(): void {
		const { vault, metadataCache } = this.app;

		// Handle file content changes via MetadataCache (fires after frontmatter is parsed)
		this.plugin.registerEvent(
			metadataCache.on('changed', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.handleChanged(file);
				}
			})
		);

		// Handle file deletion
		this.plugin.registerEvent(
			vault.on('delete', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.handleDelete(file);
				}
			})
		);

		// Handle file rename
		this.plugin.registerEvent(
			vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.handleRename(file, oldPath);
				}
			})
		);
	}

	private handleChanged(file: TFile): void {
		const taskNote = parseTaskNoteFromFile(this.app.metadataCache, file);
		if (taskNote) {
			this.cacheManager.setFileTasks(file.path, taskNote);
		} else {
			this.cacheManager.removeFile(file.path);
		}
		for (const listener of this.changeListeners) {
			listener(file.path);
		}
	}

	private handleDelete(file: TFile): void {
		this.cacheManager.removeFile(file.path);
	}

	private handleRename(file: TFile, oldPath: string): void {
		this.cacheManager.renameFile(oldPath, file.path);
	}
}
