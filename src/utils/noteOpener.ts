import { Notice, TFile } from 'obsidian';
import type { App, WorkspaceLeaf } from 'obsidian';

/**
 * Open a TaskNote in the workspace.
 *
 * Behavior contract:
 * 1. If `path` does not resolve to an existing file, show a Notice and do
 *    nothing — never let Obsidian silently create an empty note at a stale path.
 * 2. If the note is already open in a markdown leaf, focus that leaf instead
 *    of opening a duplicate tab.
 * 3. Otherwise, open the note in a new tab.
 */
export async function openTaskNote(app: App, path: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		new Notice(`TaskNote not found: ${path}`);
		return;
	}

	for (const leaf of app.workspace.getLeavesOfType('markdown')) {
		// Shape check instead of instanceof MarkdownView: keeps the helper
		// testable with plain object fakes in the node jest environment
		const viewFile = (leaf as WorkspaceLeaf & { view?: { file?: TFile | null } }).view?.file;
		if (viewFile?.path === path) {
			app.workspace.setActiveLeaf(leaf, { focus: true });
			return;
		}
	}

	await app.workspace.getLeaf('tab').openFile(file);
}
