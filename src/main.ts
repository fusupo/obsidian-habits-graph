import { Notice, Plugin, WorkspaceLeaf, TFile, MarkdownPostProcessorContext } from 'obsidian';
import { HabitGraphSettings, DEFAULT_SETTINGS, HabitGraphSettingTab } from './settings';
import { TasksApiWrapper } from './tasksApi';
import { HabitGraphView, VIEW_TYPE_HABIT_GRAPH } from './habitGraphView';
import { FileOrganizer } from './fileOrganizer';
import { GraphRenderer } from './graphRenderer';
import { TaskCacheManager } from './cache/TaskCacheManager';
import { VaultEventHandler } from './events/VaultEventHandler';

export default class OrgHabitsGraphPlugin extends Plugin {
	settings: HabitGraphSettings;
	tasksApi: TasksApiWrapper;
	fileOrganizer: FileOrganizer;
	cacheManager: TaskCacheManager;
	eventHandler: VaultEventHandler;

	async onload() {
		await this.loadSettings();

		// Initialize cache manager (lazy - populated on first use)
		this.cacheManager = new TaskCacheManager();

		// Initialize Tasks API wrapper
		this.tasksApi = new TasksApiWrapper(this.app);
		// Connect TasksApiWrapper to cache for performance
		this.tasksApi.setPlugin(this);
		this.fileOrganizer = new FileOrganizer(this.app.vault);

		// Setup vault event handlers for cache invalidation
		this.eventHandler = new VaultEventHandler(this, this.cacheManager);
		this.eventHandler.setupEventListeners();

		// Check if Tasks plugin is available
		if (!this.tasksApi.isTasksPluginAvailable()) {
			new Notice('⚠️ Org Habits Graph requires the Tasks plugin.\nPlease install and enable it first.', 10000);
			// Don't return - still register the view so user can see error message
		}

		// Register the habit graph view
		this.registerView(
			VIEW_TYPE_HABIT_GRAPH,
			(leaf) => new HabitGraphView(leaf, this)
		);

		// Add ribbon icon
		this.addRibbonIcon('calendar-check', 'Open Org Habits Graph', () => {
			this.activateView();
		});

		// Add command to open view
		this.addCommand({
			id: 'open-habit-graph',
			name: 'Open habit consistency graph',
			callback: () => {
				this.activateView();
			}
		});

		// Add command to refresh view
		this.addCommand({
			id: 'refresh-habit-graph',
			name: 'Refresh habit graphs',
			callback: () => {
				this.refreshView();
			}
		});

		// Add command to organize current file
		this.addCommand({
			id: 'organize-habit-file',
			name: 'Organize habits in current file',
			editorCallback: async (editor, view) => {
				const file = view.file;
				if (file) {
					await this.fileOrganizer.organizeHabitFile(file);
					new Notice('Habit tasks organized!');
				} else {
					new Notice('No file open');
				}
			}
		});

		// Add command to organize all habit files
		this.addCommand({
			id: 'organize-all-habit-files',
			name: 'Organize habits in all files',
			callback: async () => {
				const count = await this.fileOrganizer.organizeAllHabitFiles();
				new Notice(`Organized ${count} file(s) with habit tasks`);
			}
		});

		// Add command to show cache statistics
		this.addCommand({
			id: 'show-cache-stats',
			name: 'Show cache statistics',
			callback: () => {
				const stats = this.cacheManager.getStats();
				const memoryMB = (stats.memoryEstimate / 1024 / 1024).toFixed(2);
				new Notice(
					`📊 Task Cache Statistics\n\n` +
					`Files cached: ${stats.cachedFiles}\n` +
					`Total tasks: ${stats.totalTasks}\n` +
					`Memory usage: ~${memoryMB} MB`,
					8000
				);
			}
		});

		// Add settings tab
		this.addSettingTab(new HabitGraphSettingTab(this.app, this));

		// Register code block processor for embedding habit graphs in notes
		this.registerMarkdownCodeBlockProcessor('habit-graph', async (source, el, ctx) => {
			await this.renderHabitGraphCodeBlock(source, el, ctx);
		});

		// Auto-refresh and auto-organize when files change (debounced)
		let refreshTimeout: NodeJS.Timeout;
		this.registerEvent(
			this.app.vault.on('modify', async (file) => {
				clearTimeout(refreshTimeout);
				refreshTimeout = setTimeout(async () => {
					// Auto-organize if enabled
					if (this.settings.autoOrganizeOnModify && file instanceof TFile) {
						const content = await this.app.vault.read(file);
						if (content.includes('#habit') && content.includes('🔁')) {
							await this.fileOrganizer.organizeHabitFile(file);
						}
					}
					// Refresh view
					this.refreshView();
				}, 1000);
			})
		);
	}

	onunload() {
		// Cleanup
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_HABIT_GRAPH);
		// Clear cache on plugin unload
		this.cacheManager.clearCache();
	}

	/**
	 * Get all tasks with caching.
	 * Uses cache-first approach with lazy initialization.
	 * Event handlers keep cache synchronized with file changes.
	 */
	async getCachedTasks() {
		// Lazy initialization: populate cache on first call
		if (this.cacheManager.isEmpty()) {
			const { parseTasksFromAllFiles } = await import('./utils/taskParser');
			const tasksByFile = await parseTasksFromAllFiles(this.app.vault);
			this.cacheManager.bulkSet(tasksByFile);
		}

		// Return all cached tasks (O(1) operation after initialization)
		return this.cacheManager.getAllCachedTasks();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Refresh view when settings change
		this.refreshView();
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_HABIT_GRAPH);

		if (leaves.length > 0) {
			// View already exists, reveal it
			leaf = leaves[0];
		} else {
			// Create new leaf in right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({
					type: VIEW_TYPE_HABIT_GRAPH,
					active: true
				});
			}
		}

		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async refreshView() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_HABIT_GRAPH);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof HabitGraphView) {
				await view.refresh();
			}
		}
	}

	/**
	 * Render habit graph in a code block
	 */
	async renderHabitGraphCodeBlock(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	): Promise<void> {
		// Check if Tasks plugin is available
		if (!this.tasksApi.isTasksPluginAvailable()) {
			const errorEl = el.createDiv({ cls: 'habit-graph-error' });
			errorEl.createEl('h3', { text: '⚠️ Error' });
			errorEl.createEl('p', { text: 'Tasks plugin is required but not found. Please install and enable the Tasks plugin.' });
			return;
		}

		// Get habit tasks
		const habitTasks = await this.tasksApi.getHabitTasks(
			this.settings.habitTag
		);

		if (habitTasks.length === 0) {
			const emptyEl = el.createDiv({ cls: 'habit-graph-empty' });
			emptyEl.createEl('h3', { text: 'No habits found' });
			emptyEl.createEl('p', {
				text: `Create recurring tasks with #${this.settings.habitTag} tag to track habits.`
			});
			return;
		}

		// Group by unique habit
		const habits = this.tasksApi.getUniqueHabits(habitTasks);

		// Render each habit graph
		for (const [description, tasks] of habits) {
			// Get the most recent task info for this habit
			const currentTask = tasks.find(t => !t.completed) || tasks[tasks.length - 1];

			// Get completion history
			const completionDates = this.tasksApi.getCompletionHistory(
				tasks,
				description
			);

			// Generate day cells with recurrence pattern for scheduling window
			const cells = GraphRenderer.generateDayCells(
				completionDates,
				this.settings.daysBeforeToday,
				this.settings.daysAfterToday,
				currentTask.recurrence
			);

			// Calculate streak
			const streak = GraphRenderer.calculateStreak(completionDates);

			// Render graph
			const graphEl = GraphRenderer.renderGraph(
				cells,
				description,
				currentTask.recurrence,
				streak,
				this.settings.showStreakCount
			);

			el.appendChild(graphEl);
		}
	}
}
