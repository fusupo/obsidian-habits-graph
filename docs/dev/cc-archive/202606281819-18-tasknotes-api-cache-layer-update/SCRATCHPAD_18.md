# TaskNotes migration: API + cache layer update - #18

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/18
- **State:** open
- **Labels:** none
- **Milestone:** none
- **Related Issues:**
  - Depends on: #16 (merged), #17 (merged)
  - Blocks: #19 (UI/cleanup)
  - Related: #11 (day-of-week recurrence)

## Description

Part 3 of the Tasks Plugin → TaskNotes migration. Rewrite the API layer (`TasksApiWrapper`), cache layer (`TaskCacheManager`), and event layer (`VaultEventHandler`) to use `TaskNote` objects (from #16) instead of `TaskInfo` arrays. Update consumers (`HabitGraphView`, `main.ts` code block renderer) to use the new API.

## Acceptance Criteria
- [x] `TasksApiWrapper` returns `TaskNote` objects
- [x] Completion history reads directly from `completeInstances` (no dedup/grouping)
- [x] `getUniqueHabits()` removed
- [x] `TaskCacheManager` uses `Map<string, TaskNote>`
- [x] `VaultEventHandler` uses new parser
- [x] Tests updated

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 18-tasknotes-api-cache-layer-update
- **Current branch:** main

## Implementation Checklist

### Setup
- [ ] Fetch latest from main
- [ ] Create and checkout feature branch

### Task 1: Update TaskCacheManager from TaskInfo[] to TaskNote
- Files: `src/cache/TaskCacheManager.ts`
- Change `Map<string, TaskInfo[]>` → `Map<string, TaskNote>`
- `getFileTasks(path)` → returns `TaskNote | null` (not `TaskInfo[]`)
- `setFileTasks(path, task)` → takes `TaskNote | null` (if null, remove from cache)
- `bulkSet(map)` → takes `Map<string, TaskNote>`
- `getAllCachedTasks()` → returns `TaskNote[]` (from map values, not array spreading)
- `renameFile(old, new)` → update `.path` field in TaskNote (not `.path` in each TaskInfo)
- `getStats()` → update memory estimate (~400 bytes per TaskNote due to instance arrays)
- Remove all `TaskInfo[]` array-spreading logic
- Risk: Low — self-contained module, no external callers until Task 2-3 wire it up.

### Task 2: Update VaultEventHandler to use MetadataCache + TaskNote parser
- Files: `src/events/VaultEventHandler.ts`, `src/main.ts` (constructor wiring)
- Add `App` dependency to constructor (for MetadataCache access)
- Replace vault `create`/`modify` events with `metadataCache.on('changed', (file) => ...)` for content updates
  - Why: MetadataCache parses frontmatter asynchronously after vault modify; reading it on vault modify gives stale data
  - `changed` event fires when a file's metadata cache is updated — guaranteed fresh frontmatter
- Keep vault `delete`/`rename` events (MetadataCache doesn't provide these)
- Handler: `parseTaskNoteFromFile(metadataCache, file)` → if non-null, `setFileTasks(path, taskNote)`; if null, `removeFile(path)`
- Update `main.ts` constructor call to pass `this.app`
- Risk: Medium — MetadataCache event timing is different from vault events. The `changed` callback receives `(file, data, cache)` — verify the callback signature matches Obsidian API.

### Task 3: Rewrite TasksApiWrapper + rename main.ts getCachedTasks (ATOMIC)
- Files: `src/tasksApi.ts`, `src/main.ts`
- **⚠️ CRITICAL COUPLING:** `tasksApi.ts:34` checks `typeof this.plugin.getCachedTasks === 'function'` (duck-typed string). If main.ts renames to `getCachedTaskNotes` without updating this string check, it silently falls back to uncached `parseTasksFromAllFiles` (wrong types, no error). **Both files must change in one commit.**
- **Remove:** `getTasksPlugin()`, `isTasksPluginAvailable()`, `getUniqueHabits()`
- **Remove Tasks plugin dependency entirely** — plugin operates on frontmatter, no external plugin needed
- `getAllTasks()` → `getAllTaskNotes()`: returns `TaskNote[]` from cache (or fallback: `parseTaskNotesFromAllFiles(vault, metadataCache)`)
  - String check: `typeof this.plugin.getCachedTaskNotes === 'function'`
  - Needs `MetadataCache` access — use `this.app.metadataCache`
- `getHabitTasks(habitTag)` → `getHabitTaskNotes(habitTag)`: filter `TaskNote[]` by `task.tags.includes(habitTag) && task.recurrence`
- `getCompletionHistory(task: TaskNote)` → **simplified**: parse `task.completeInstances` as Date[] via `parseISODate()`, sort ascending
  - No longer needs to filter by description or deduplicate — each TaskNote is already a unique habit
  - Signature change: takes single `TaskNote`, not `(TaskInfo[], string)`
- **main.ts:** rename `getCachedTasks()` → `getCachedTaskNotes()`, use `parseTaskNotesFromAllFiles(vault, metadataCache)` for lazy init
- Risk: Medium — atomic commit neutralizes the string-coupling hazard.

### Task 4: Update consumers (HabitGraphView + main.ts)
- Files: `src/habitGraphView.ts`, `src/main.ts`

**HabitGraphView.refresh():**
- Remove `isTasksPluginAvailable()` check and error rendering
- Get habit tasks: `await this.plugin.tasksApi.getHabitTasks(tag)` → `TaskNote[]`
- **No grouping** — iterate `TaskNote[]` directly (each TaskNote = unique habit)
- For each TaskNote:
  - `completionDates = this.plugin.tasksApi.getCompletionHistory(task)`
  - `cells = GraphRenderer.generateDayCells(completionDates, before, after, task.recurrence)`
  - `streak = GraphRenderer.calculateStreak(completionDates)`
  - `graphEl = GraphRenderer.renderGraph(cells, task.title, task.recurrence, streak, showStreak)`
  - Note: use `task.title` not `task.description`
- Update `renderEmpty()` example text to reflect TaskNotes format (frontmatter, not emoji)

**main.ts:**
- `getCachedTasks()` → use `parseTaskNotesFromAllFiles(vault, metadataCache)` for lazy init
  - `cacheManager.bulkSet(taskNotesByFile)` (already returns `Map<string, TaskNote>`)
  - Return `cacheManager.getAllCachedTasks()`
- Remove Tasks plugin check + Notice in `onload()`
- `renderHabitGraphCodeBlock()` → same changes as HabitGraphView.refresh()
- Auto-organize on modify: the `#habit` + `🔁` check is Tasks-plugin specific — leave for #19 or update
- Risk: Medium — user-facing behavior change. Error messages and examples change.

### Task 5: Add/update tests
- Files: `src/__tests__/taskCacheManager.test.ts` (new), `src/__tests__/tasksApi.test.ts` (new)
- **TaskCacheManager tests:**
  - setFileTasks / getFileTasks round-trip
  - bulkSet populates correctly
  - getAllCachedTasks returns all TaskNotes
  - removeFile removes entry
  - renameFile updates path
  - invalidateFile / isFileDirty
  - getStats returns correct counts and memory estimate
  - setFileTasks with null removes from cache
- **TasksApiWrapper tests:**
  - getHabitTasks filters by tag + recurrence
  - getCompletionHistory parses and sorts completeInstances
  - getCompletionHistory returns empty array for empty completeInstances
- Risk: Low — pure unit tests.

### Quality Checks
- [ ] `npm run build` passes
- [ ] `npm test` passes (all existing + new tests)
- [ ] Old TaskInfo type and parsers (parseTasksFromContent, parseTasksFromFile, parseTasksFromAllFiles) still exist in codebase (removed in #19)
- [ ] No TaskInfo references remain in cache, API, event handler, or consumers
- [ ] GraphRenderer behavior unchanged (receives same data types)

## Technical Notes

### Architecture Considerations

**Three-layer migration (all must change together):**
```
VaultEventHandler  →  TaskCacheManager  →  TasksApiWrapper  →  HabitGraphView / main.ts
      ↓                     ↓                    ↓                     ↓
parseTaskNoteFromFile   Map<str,TaskNote>    TaskNote[]          task.title, task.completeInstances
(MetadataCache)         (single per file)    (no grouping)       (no dedup)
```

**Current flow (TaskInfo):**
```
vault.on('modify') → parseTasksFromFile(vault, file) → TaskInfo[] → Map<str, TaskInfo[]>
getAllTasks() → flatten arrays → filter by tag/recurrence → group by description → per-group history
```

**New flow (TaskNote):**
```
metadataCache.on('changed') → parseTaskNoteFromFile(cache, file) → TaskNote | null → Map<str, TaskNote>
getAllTasks() → collect values → filter by tag/recurrence → per-TaskNote history from completeInstances
```

### Key Simplifications
1. **No deduplication**: TaskInfo had multiple task lines per file (completed copies). TaskNote is one per file with a `completeInstances` array.
2. **No grouping**: `getUniqueHabits()` grouped TaskInfo[] by description. With TaskNote, each file is a unique habit.
3. **No Tasks plugin dependency**: TaskNotes use frontmatter parsed by MetadataCache, not an external plugin.
4. **Sync parsing**: `parseTaskNoteFromFile` is synchronous (reads from MetadataCache). `parseTasksFromFile` was async (reads file content via vault.read).

### MetadataCache Event vs Vault Event
The critical change in VaultEventHandler: switching content updates from `vault.on('modify')` to `metadataCache.on('changed')`.

**Why:** When vault fires `modify`, the MetadataCache may not have re-parsed the file yet. If we call `metadataCache.getFileCache(file)` at that moment, we get stale frontmatter. The `changed` event fires after MetadataCache has processed the file.

**Obsidian API signature:** `metadataCache.on('changed', (file: TFile, data: string, cache: CachedMetadata) => void)`
- `file`: the changed file
- `data`: file content
- `cache`: the updated cache entry (has `.frontmatter`)

**Delete/rename:** Keep on vault events — MetadataCache doesn't provide dedicated events for these.

### Backward Compatibility (PROJECT_LORE.md)
Old TaskInfo type and parsing functions (`parseTasksFromContent`, `parseTasksFromFile`, `parseTasksFromAllFiles`) remain in `types.ts` and `taskParser.ts` but will be unused after this issue. They'll be removed in #19 (UI/cleanup).

### What About FileOrganizer?
`FileOrganizer` assumes Tasks-plugin format (emoji-based task lines). It's not referenced in #18 acceptance criteria. Leave for #19.

## Questions/Blockers

### Clarifications Needed
1. The auto-organize trigger in `main.ts` (lines 121-135) checks for `#habit` + `🔁` emoji — should we disable this for now or leave it? It won't fire for TaskNotes (no `🔁` emoji in frontmatter).

### Blocked By
Nothing — #16 and #17 are merged.

### Assumptions Made
- MetadataCache `changed` event fires reliably for all file modifications (well-documented Obsidian API)
- `parseTaskNoteFromFile` returning null for non-TaskNote files is the correct filter (only files with `title` in frontmatter are cached)
- FileOrganizer changes are out of scope (#19)
- Old TaskInfo code stays in codebase (unused) until #19

## Work Log

### 2026-06-28 - Session 1
- Completed all 5 implementation tasks
- Task 1: Updated TaskCacheManager — Map<string, TaskInfo[]> → Map<string, TaskNote>, simplified all methods (no array spreading)
- Task 2: Updated VaultEventHandler — switched from vault.on('create'/'modify') to metadataCache.on('changed'), uses parseTaskNoteFromFile, null → removeFile
- Task 3: Rewrote TasksApiWrapper + renamed getCachedTasks→getCachedTaskNotes atomically — removed Tasks plugin dependency, getUniqueHabits(), simplified getCompletionHistory()
- Task 4: Updated HabitGraphView + main.ts code block renderer — removed Tasks plugin checks, iterate TaskNote[] directly, use task.title, updated empty state examples to frontmatter format
- Task 5: Added 22 new tests (15 TaskCacheManager, 7 TasksApiWrapper)
- All quality checks pass: npm run build clean, npm test 69/69, tsc clean

---
**Generated:** 2026-06-28
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/18
