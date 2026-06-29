# Issue #18 - TaskNotes migration: API + cache layer update

**Archived:** 2026-06-28
**Branch:** 18-tasknotes-api-cache-layer-update
**Code SHA:** e17c031
**PR:** #22 (merged)
**Status:** Merged

## Summary

Rewrote the API layer (TasksApiWrapper), cache layer (TaskCacheManager), and event layer (VaultEventHandler) to use TaskNote objects instead of TaskInfo arrays. Updated consumers (HabitGraphView, main.ts code block renderer) to use the new API. Removed Tasks plugin dependency entirely — plugin now operates on frontmatter parsed by MetadataCache.

## Key Decisions

- Switched VaultEventHandler from `vault.on('modify')` to `metadataCache.on('changed')` to avoid stale frontmatter reads
- Removed `getUniqueHabits()` grouping — each TaskNote file is a unique habit
- `getCompletionHistory` simplified: reads `completeInstances` directly from TaskNote (no dedup/grouping)
- Title derived from filename when frontmatter lacks `title` field (bug fix for TaskNotes plugin compatibility)

## Files Changed

- `src/cache/TaskCacheManager.ts` — Map<string, TaskInfo[]> → Map<string, TaskNote>
- `src/events/VaultEventHandler.ts` — MetadataCache events, parseTaskNoteFromFile
- `src/tasksApi.ts` — Removed Tasks plugin dependency, simplified API
- `src/habitGraphView.ts` — Iterate TaskNote[] directly, use task.title
- `src/main.ts` — getCachedTaskNotes, removed Tasks plugin check
- `src/utils/taskParser.ts` — titleFromPath fallback, relaxed null guard
- `src/__tests__/taskCacheManager.test.ts` — 15 new tests
- `src/__tests__/tasksApi.test.ts` — 7 new tests
- `src/__tests__/taskNoteParser.test.ts` — Updated for title-from-filename

## Lessons Learned

- Obsidian's `vault.on('modify')` fires before MetadataCache updates — always use `metadataCache.on('changed')` for frontmatter-based parsing
- TaskNotes plugin uses filename as title, not a frontmatter field — parser must handle absence of `title`
- Duck-typed string coupling (`typeof plugin.getCachedTaskNotes`) requires atomic commits when renaming methods across files
