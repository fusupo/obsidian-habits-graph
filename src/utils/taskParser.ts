import { TFile, MetadataCache, Vault } from 'obsidian';
import type { TaskNote } from '../types';

function coerceDateValue(val: unknown): string | undefined {
	if (val == null) return undefined;
	if (val instanceof Date) {
		const y = val.getUTCFullYear();
		const m = String(val.getUTCMonth() + 1).padStart(2, '0');
		const d = String(val.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	if (typeof val === 'string') return val;
	return String(val);
}

function coerceDateArray(val: unknown): string[] {
	if (!Array.isArray(val)) return [];
	const result: string[] = [];
	for (const item of val) {
		const coerced = coerceDateValue(item);
		if (coerced) result.push(coerced);
	}
	return result;
}

function coerceStringArray(val: unknown): string[] {
	if (typeof val === 'string') return [val];
	if (Array.isArray(val)) return val.map(String);
	return [];
}

function pick<T>(fm: Record<string, unknown>, ...keys: string[]): T | undefined {
	for (const key of keys) {
		if (fm[key] !== undefined) return fm[key] as T;
	}
	return undefined;
}

function titleFromPath(filePath: string): string {
	const basename = filePath.split('/').pop() ?? filePath;
	return basename.replace(/\.md$/i, '');
}

export function parseTaskNoteFromFrontmatter(
	frontmatter: Record<string, unknown> | null | undefined,
	filePath: string
): TaskNote | null {
	if (!frontmatter) return null;
	// A TaskNote must have either a title or a recurrence field
	if (!frontmatter['title'] && !frontmatter['recurrence']) return null;

	const recurrenceAnchorRaw = pick<string>(frontmatter, 'recurrence_anchor', 'recurrenceAnchor');
	const recurrenceAnchor: 'scheduled' | 'completion' =
		recurrenceAnchorRaw === 'completion' ? 'completion' : 'scheduled';

	return {
		id: frontmatter['id'] != null ? String(frontmatter['id']) : undefined,
		title: frontmatter['title'] != null ? String(frontmatter['title']) : titleFromPath(filePath),
		status: frontmatter['status'] != null ? String(frontmatter['status']) : 'open',
		recurrence: frontmatter['recurrence'] != null ? String(frontmatter['recurrence']) : '',
		recurrenceAnchor,
		tags: coerceStringArray(frontmatter['tags']),
		path: filePath,
		scheduled: coerceDateValue(pick(frontmatter, 'scheduled')),
		due: coerceDateValue(pick(frontmatter, 'due')),
		completeInstances: coerceDateArray(pick(frontmatter, 'complete_instances', 'completeInstances')),
		skippedInstances: coerceDateArray(pick(frontmatter, 'skipped_instances', 'skippedInstances')),
		dateCreated: coerceDateValue(pick(frontmatter, 'dateCreated', 'date_created')),
		dateModified: coerceDateValue(pick(frontmatter, 'dateModified', 'date_modified')),
	};
}

export function parseTaskNoteFromFile(
	metadataCache: MetadataCache,
	file: TFile
): TaskNote | null {
	const cache = metadataCache.getFileCache(file);
	if (!cache?.frontmatter) return null;
	return parseTaskNoteFromFrontmatter(cache.frontmatter, file.path);
}

export function parseTaskNotesFromAllFiles(
	vault: Vault,
	metadataCache: MetadataCache,
	folderPath: string = ''
): Map<string, TaskNote> {
	const taskNotesByFile = new Map<string, TaskNote>();
	const files = vault.getMarkdownFiles();
	const prefix = folderPath ? folderPath.replace(/\/+$/, '') + '/' : '';

	for (const file of files) {
		if (prefix && !file.path.startsWith(prefix)) continue;
		const taskNote = parseTaskNoteFromFile(metadataCache, file);
		if (taskNote) {
			taskNotesByFile.set(file.path, taskNote);
		}
	}

	return taskNotesByFile;
}
