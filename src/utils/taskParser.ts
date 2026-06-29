import { Vault, TFile, MetadataCache } from 'obsidian';
import type { TaskInfo, TaskNote } from '../types';
import { parseISODate } from './dateUtils';

/**
 * Task emoji markers used by the Tasks plugin.
 */
const TASK_EMOJIS = ['📅', '⏳', '🛫', '✅', '🔁', '⏫', '🔼', '🔽', '🆔', '⛔', '🔺', '➕'] as const;

/**
 * Find the position of the first task-related emoji in a string.
 * Returns -1 if no emoji found.
 */
function findFirstEmojiPosition(text: string): number {
	let firstPos = -1;
	for (const emoji of TASK_EMOJIS) {
		const pos = text.indexOf(emoji);
		if (pos !== -1 && (firstPos === -1 || pos < firstPos)) {
			firstPos = pos;
		}
	}
	return firstPos;
}

/**
 * Extract description from task content.
 * Description is everything before the first task emoji.
 */
function extractDescription(taskContent: string): string {
	const firstEmojiPos = findFirstEmojiPosition(taskContent);
	if (firstEmojiPos === -1) {
		// No emojis found, entire content is description
		return taskContent.trim();
	}
	return taskContent.substring(0, firstEmojiPos).trim();
}

/**
 * Extract recurrence pattern from task content.
 * Handles various formats: "every day", "every 2 days", "every week on Sunday", etc.
 */
function extractRecurrence(taskContent: string): string {
	// Match 🔁 followed by recurrence text (stop at next emoji, tag, or end)
	const recurrenceMatch = taskContent.match(/🔁\s*(.+?)(?=\s*[📅⏳🛫✅⏫🔼🔽🆔⛔🔺➕#]|$)/);
	return recurrenceMatch ? recurrenceMatch[1].trim() : '';
}

/**
 * Extract and validate a date from task content using the given emoji marker.
 * Returns undefined if date not found or invalid.
 *
 * Uses UTC-aware parseISODate for validation to ensure timezone-independent behavior.
 */
function extractDate(taskContent: string, emoji: string): string | undefined {
	const datePattern = new RegExp(`${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})`);
	const match = taskContent.match(datePattern);
	if (!match) return undefined;

	const dateStr = match[1];
	// Validate the date is actually valid using UTC-aware parsing
	try {
		parseISODate(dateStr);
		return dateStr;
	} catch (error) {
		console.debug(`[habits-graph] Invalid date format: ${dateStr}`);
		return undefined;
	}
}

/**
 * Parse tasks from markdown content.
 * This is a simple parser that looks for Tasks plugin format.
 */
export function parseTasksFromContent(content: string, filePath: string): TaskInfo[] {
	const tasks: TaskInfo[] = [];
	const lines = content.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// Match task format: - [ ] or - [x]
		const taskMatch = line.match(/^[\s]*-\s\[([ xX])\]\s(.+)$/);
		if (!taskMatch) continue;

		const completed = taskMatch[1].toLowerCase() === 'x';
		const taskContent = taskMatch[2];

		// Check for recurrence emoji 🔁
		if (!taskContent.includes('🔁')) continue;

		// Extract task components using robust helpers
		const description = extractDescription(taskContent);
		const recurrence = extractRecurrence(taskContent);

		// Extract tags (can appear anywhere in the task)
		const tagMatches = taskContent.matchAll(/#([\w-]+)/g);
		const tags = Array.from(tagMatches, m => m[1]);

		// Extract dates with validation
		const completedDate = extractDate(taskContent, '✅');
		const dueDate = extractDate(taskContent, '📅');

		tasks.push({
			description,
			recurrence,
			tags,
			path: filePath,
			line: i,
			completed,
			completedDate,
			dueDate
		});
	}

	return tasks;
}

/**
 * Parse tasks from a single file.
 */
export async function parseTasksFromFile(
	vault: Vault,
	file: TFile
): Promise<TaskInfo[]> {
	const content = await vault.read(file);
	return parseTasksFromContent(content, file.path);
}

/**
 * Parse tasks from all markdown files in the vault.
 * Returns a Map of filePath -> TaskInfo[] for easy caching.
 */
export async function parseTasksFromAllFiles(
	vault: Vault
): Promise<Map<string, TaskInfo[]>> {
	const tasksByFile = new Map<string, TaskInfo[]>();
	const files = vault.getMarkdownFiles();

	for (const file of files) {
		const tasks = await parseTasksFromFile(vault, file);
		tasksByFile.set(file.path, tasks);
	}

	return tasksByFile;
}

// --- TaskNotes frontmatter parsing ---

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
	metadataCache: MetadataCache
): Map<string, TaskNote> {
	const taskNotesByFile = new Map<string, TaskNote>();
	const files = vault.getMarkdownFiles();

	for (const file of files) {
		const taskNote = parseTaskNoteFromFile(metadataCache, file);
		if (taskNote) {
			taskNotesByFile.set(file.path, taskNote);
		}
	}

	return taskNotesByFile;
}
