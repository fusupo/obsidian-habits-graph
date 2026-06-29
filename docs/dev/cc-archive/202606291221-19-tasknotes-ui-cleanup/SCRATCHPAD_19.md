# TaskNotes migration: UI, plugin shell, and cleanup - #19

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/19
- **State:** open
- **Labels:** none
- **Milestone:** none
- **Related Issues:**
  - Depends on: #16 (merged), #17 (merged), #18 (merged)
  - Related: #11 (day-of-week recurrence)

## Description

Part 4 (final) of the Tasks Plugin → TaskNotes migration. Remove all remaining old code: FileOrganizer, Tasks plugin checks, auto-organize logic, old settings, TaskInfo type and parsers. Handle skipped instances rendering. Clean up user-facing text.

## Already Done in #18

These items from the issue body were completed in PR #22:
- ✅ habitGraphView.ts — already uses new API shape (getHabitTaskNotes, task.title, no getUniqueHabits)
- ✅ habitGraphView.ts — "no habits found" example already shows TaskNotes frontmatter format
- ✅ main.ts — Tasks plugin availability check and Notice already removed
- ✅ main.ts — renderHabitGraphCodeBlock already uses new API
- ✅ main.ts — getCachedTaskNotes already uses parseTaskNotesFromAllFiles

## Acceptance Criteria
- [ ] `main.ts` cleaned of FileOrganizer, auto-organize logic, file organize commands
- [ ] `settings.ts` updated — `autoOrganizeOnModify` removed
- [ ] `fileOrganizer.ts` deleted
- [ ] `TaskInfo` type removed from `types.ts`
- [ ] Old TaskInfo parsers removed from `taskParser.ts`
- [ ] Skipped instances rendering decided and implemented
- [ ] Task folder path setting added and functional
- [ ] Skipped days do not break streaks
- [ ] Plugin loads, detects TaskNotes habits, and renders graphs correctly

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 19-tasknotes-ui-cleanup
- **Current branch:** main

## Implementation Checklist

### Setup
- [ ] Fetch latest from main
- [ ] Create and checkout feature branch

### Task 1: Remove FileOrganizer and related code from main.ts
- Files: `src/main.ts`, `src/fileOrganizer.ts`
- Remove `import { FileOrganizer }` (line 5)
- Remove `fileOrganizer: FileOrganizer` property (line 13)
- Remove `this.fileOrganizer = new FileOrganizer(...)` init (line 27)
- Remove 'organize-habit-file' command (lines 63-75)
- Remove 'organize-all-habit-files' command (lines 78-85)
- Remove auto-organize logic in vault modify handler (lines 119-123) — keep the `refreshView()` call
- Delete `src/fileOrganizer.ts` entirely
- Risk: Low — FileOrganizer is self-contained, no other modules reference it

### Task 2: Remove autoOrganizeOnModify from settings
- Files: `src/settings.ts`
- Remove `autoOrganizeOnModify` from `HabitGraphSettings` interface (line 9)
- Remove `autoOrganizeOnModify: true` from `DEFAULT_SETTINGS` (line 17)
- Remove the "Auto-organize on file change" Setting UI (lines 84-91)
- Risk: Low — the setting only controlled FileOrganizer behavior

### Task 3: Remove TaskInfo type and old parsers
- Files: `src/types.ts`, `src/utils/taskParser.ts`
- Delete `TaskInfo` interface from `types.ts` (lines 1-13)
- Remove from `taskParser.ts`:
  - `TaskInfo` import (line 2)
  - `TASK_EMOJIS` constant (line 8)
  - `findFirstEmojiPosition()` (lines 14-23)
  - `extractDescription()` (lines 29-36)
  - `extractRecurrence()` (lines 42-46)
  - `extractDate()` (lines 54-68)
  - `parseTasksFromContent()` (lines 74-116)
  - `parseTasksFromFile()` (lines 121-127)
  - `parseTasksFromAllFiles()` (lines 133-145)
- Keep all TaskNote-related code (line 147+)
- Update import: `import type { TaskNote } from '../types'` (remove TaskInfo)
- Risk: Low — no remaining consumers after #18. Tests don't reference these.
- Note: PROJECT_LORE invariant says "must stay intact until #19" — this IS #19.

### Task 4: Add skipped instances rendering to GraphRenderer
- Files: `src/graphRenderer.ts`
- The `DayCell` interface needs a `skipped` boolean field
- `generateDayCells` needs to accept `skippedDates: Date[]` parameter
- For past days: add `'skipped'` status (distinct from `'missed'`)
- Render skipped days with a distinct visual (gray/neutral color, `~` marker)
- Update tooltip: "Skipped" instead of "Missed" for skipped days
- Update `habitGraphView.ts` and `main.ts` code block renderer to pass skippedInstances
- Risk: Medium — touches rendering logic and adds a new status type

### Task 5: Wire skipped instances through the view layer
- Files: `src/habitGraphView.ts`, `src/main.ts`
- Parse `task.skippedInstances` → `Date[]` via `parseISODate` (same as completeInstances)
- Pass skipped dates to `GraphRenderer.generateDayCells()`
- Add to `tasksApi.ts`: `getSkippedHistory(task: TaskNote): Date[]` method
- Risk: Low — follows same pattern as completion history

### Task 6: Add task folder path setting
- Files: `src/settings.ts`, `src/utils/taskParser.ts`, `src/tasksApi.ts`
- Add `taskFolderPath: string` to `HabitGraphSettings` (default: `''` = scan entire vault)
- Add Setting UI: text input for folder path
- Filter in `parseTaskNotesFromAllFiles`: skip files not under `taskFolderPath` (when non-empty)
- Pass setting through `tasksApi.getAllTaskNotes()` → filter or pass to parser
- Risk: Low — additive feature, empty string = current behavior

### Quality Checks
- [ ] `npm run build` passes
- [ ] `npm test` passes (all tests — old TaskInfo tests don't exist)
- [ ] `fileOrganizer.ts` no longer exists
- [ ] No `TaskInfo` references remain anywhere in `src/`
- [ ] No `FileOrganizer` references remain anywhere in `src/`
- [ ] Skipped instances render distinctly from missed days
- [ ] Plugin loads and renders graphs correctly

## Technical Notes

### Architecture Considerations

**Removal scope:** FileOrganizer is entirely self-contained — only main.ts imports it. No event handler, cache, or API code references it.

**TaskInfo cleanup:** After removing TaskInfo and old parsers, `taskParser.ts` becomes purely TaskNote-focused. The emoji constants, findFirstEmojiPosition, extractDescription, extractRecurrence, and extractDate helpers are all orphaned (only used by parseTasksFromContent).

**Skipped instances rendering:** The `DayCell` status union currently has no concept of "skipped". Adding `'skipped'` as a new status value and a corresponding gray color class is the minimal approach. The skippedInstances data is already in TaskNote and parsed by the frontmatter parser.

### Skipped Instances Design

**Approach:** Render skipped days with a distinct neutral color (gray) and `~` marker.
- Past skipped days: gray background, `~` character
- This differentiates from: green (done), red (missed), blue/yellow (future)
- Tooltip shows "Skipped" instead of "Missed"
- Skipped days do NOT break streaks (they're intentional absences)

**Data flow:**
```
TaskNote.skippedInstances → parseISODate() → Date[] → generateDayCells(skippedDates) → DayCell.status='skipped'
```

### What's NOT changing
- `habitGraphView.ts` — already migrated in #18 (only adding skipped instances pass-through)
- `tasksApi.ts` — already migrated in #18 (only adding getSkippedHistory)
- `TaskCacheManager` — no changes needed
- `VaultEventHandler` — no changes needed
- `GraphRenderer.renderGraph()` — just adding one more case to the switch

## Questions/Blockers

### Clarifications Needed
(All resolved — see Decisions Made)

### Blocked By
Nothing — #16, #17, #18 are all merged.

### Assumptions Made
- Skipped instances rendered as gray/neutral (option 2 from issue: "distinct color/indicator")
- `autoOrganizeOnModify` setting removal won't break existing users (the setting becomes unused; old saved data is harmlessly ignored by Object.assign)

### Decisions Made
2026-06-28

**Q: Should skipped days break the streak counter?**
**A:** No — skipping is intentional, streak only breaks on missed (unexcused) days.
**Rationale:** Skipping is a deliberate action; penalizing it discourages honest tracking.

**Q: Add new TaskNotes-specific settings in this PR or defer?**
**A:** Add task folder path setting (restrict which folder is scanned for TaskNotes). Defer completed status values to a future issue.
**Rationale:** Task folder path is immediately useful; completed status values need more design work.

## Work Log

### 2026-06-28 - Session 1
- Completed all 6 implementation tasks
- Task 1: Removed FileOrganizer import/property/init, organize commands, auto-organize logic from main.ts; deleted fileOrganizer.ts
- Task 2: Removed autoOrganizeOnModify from settings interface, defaults, and UI
- Task 3: Removed TaskInfo interface from types.ts; removed all old emoji-based parsers from taskParser.ts (TASK_EMOJIS, helpers, parseTasksFromContent/File/AllFiles)
- Task 4: Added skipped instances rendering — new 'skipped' status, gray color, ~ marker, tooltip "Skipped", updated calculateStreak to skip over skipped days
- Task 5: Added getSkippedDates to tasksApi, wired through habitGraphView and main.ts code block renderer
- Task 6: Added taskFolderPath setting — filters vault scanning to specific folder, empty = entire vault
- All quality checks pass: npm run build clean, npm test 70/70, no TaskInfo/FileOrganizer refs remain

---
**Generated:** 2026-06-28
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/19
