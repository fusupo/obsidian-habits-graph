# Migration: Tasks Plugin → TaskNotes

## Context

The obsidian-habits-graph plugin currently depends on the [Obsidian Tasks plugin](https://github.com/obsidian-tasks-group/obsidian-tasks) for task data. We are transitioning to [TaskNotes](https://tasknotes.dev/) (spec v0.2.0-draft), which uses a fundamentally different architecture.

This document captures the research, analysis, and implementation guidance needed to scope the migration into issues and execute it.

## Architectural Differences

### Tasks Plugin (Current)

Tasks are **inline checkboxes embedded in notes**. A single note can contain many tasks. Metadata is encoded via emoji markers inline:

```markdown
- [ ] Morning workout 🔁 every day #habit 📅 2025-01-18
- [x] Morning workout 🔁 every day #habit 📅 2025-01-17 ✅ 2025-01-17
```

Key characteristics:
- Task = a line of markdown text; no stable identity beyond the line content
- Recurrence is human-readable text: "every day", "every 2 weeks", "every week on Sunday"
- On completion, the Tasks plugin **duplicates the task line** — marks the original `[x]` and creates a new `[ ]` line with the next due date
- Completion history must be **reconstructed** by grouping duplicate completed lines by description and reading `✅` dates
- Status is a single checkbox character: `[ ]`, `[x]`, `[-]`, `[/]`
- Dates encoded with emojis: `📅` (due), `✅` (done), `⏳` (scheduled), `🛫` (start), `➕` (created)
- No native dependency or reminder support

### TaskNotes (Target)

Tasks are **individual markdown files** with YAML frontmatter. One file = one task.

```yaml
---
id: task-morning-workout
title: Morning workout
status: open
recurrence: FREQ=DAILY
recurrence_anchor: scheduled
scheduled: 2025-01-18
complete_instances: [2025-01-15, 2025-01-16, 2025-01-17]
skipped_instances: []
tags: [habit]
dateCreated: 2025-01-10T09:30:00Z
dateModified: 2025-01-18T08:02:11Z
---

Notes about the workout routine...
```

Key characteristics:
- Task = a standalone markdown file with YAML frontmatter
- Stable `id` field; file path as secondary identity
- Recurrence uses **RRULE format** (RFC 5545): `FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=MO,WE,FR`, `FREQ=MONTHLY;BYMONTHDAY=1`
- Completion tracked via **`complete_instances` date array** — single persistent file, no duplication
- `skipped_instances` array for skipped occurrences
- `recurrence_anchor`: `scheduled` (calendar-based, default) or `completion` (advances from last completion)
- Status is a configurable string enum in frontmatter: `open`, `in-progress`, `done`, `cancelled`
- Dates as YAML values: `due: 2025-01-20`, `scheduled: 2025-01-18`, `completedDate: 2025-01-20`
- Datetimes in UTC: `2025-01-20T09:00:00Z`
- First-class `blocked_by` dependencies with relationship types and gap durations
- First-class `reminders` (absolute and relative)
- Full markdown body for notes, attachments, backlinks
- Task detection is configurable: by tag (`#task`) or frontmatter property/value
- Field names are configurable via a mapping layer (semantic roles → actual YAML keys)
- Requires Obsidian 1.10.1+ and the Bases core plugin

### RRULE Recurrence Format Details

TaskNotes uses RFC 5545 RRULE-derived strings (not full iCalendar lines):

| Pattern | RRULE |
|---------|-------|
| Every day | `FREQ=DAILY` |
| Every 2 days | `FREQ=DAILY;INTERVAL=2` |
| Every week | `FREQ=WEEKLY` |
| Mon/Wed/Fri | `FREQ=WEEKLY;BYDAY=MO,WE,FR` |
| Every 2 weeks | `FREQ=WEEKLY;INTERVAL=2` |
| Monthly on 1st | `FREQ=MONTHLY;BYMONTHDAY=1` |
| With start date | `DTSTART:20250118;FREQ=WEEKLY;BYDAY=FR` |

Seed resolution for `DTSTART` (priority order):
1. Embedded `DTSTART` in the recurrence string
2. The `scheduled` field
3. The `date_created` field
4. Error if none found

### Instance State Model

For a recurring task, each occurrence date D has a state:
1. D in `complete_instances` → completed
2. D in `skipped_instances` → skipped
3. Otherwise → open/pending

Operations are idempotent:
- **Complete(D)**: add D to `complete_instances`, remove from `skipped_instances`
- **Uncomplete(D)**: remove D from `complete_instances`
- **Skip(D)**: add D to `skipped_instances`, remove from `complete_instances`
- **Unskip(D)**: remove D from `skipped_instances`

Invariant: no date may appear in both lists simultaneously.

## Current Codebase: File-by-File Impact

### Files to Rewrite

#### `src/types.ts`
Current `TaskInfo` interface:
```typescript
interface TaskInfo {
  description: string;
  recurrence: string;      // human text: "every day"
  tags: string[];
  path: string;
  line: number;
  completed: boolean;
  completedDate?: string;  // single date
  dueDate?: string;
}
```

New interface (proposed):
```typescript
interface TaskNote {
  id?: string;
  title: string;
  status: string;
  recurrence: string;           // RRULE: "FREQ=DAILY"
  recurrenceAnchor: 'scheduled' | 'completion';
  tags: string[];
  path: string;                 // file path (one file = one task)
  scheduled?: string;
  due?: string;
  completeInstances: string[];  // ["2025-01-15", "2025-01-16"]
  skippedInstances: string[];
  dateCreated?: string;
  dateModified?: string;
}
```

Note: `line` field is no longer needed (task is the whole file, not a line). `completed`/`completedDate` replaced by `completeInstances` array.

#### `src/utils/taskParser.ts`
**Complete rewrite.** Currently parses inline emoji markers from task lines. Needs to:
- Scan markdown files for YAML frontmatter
- Parse frontmatter for TaskNotes fields (recurrence, complete_instances, tags, etc.)
- Filter for habit tasks (files with the configured habit tag)
- Return `TaskNote` objects instead of `TaskInfo`

Obsidian provides `app.metadataCache.getFileCache(file)?.frontmatter` which may simplify parsing — investigate whether this is sufficient or if raw YAML parsing is needed for the full field set.

#### `src/tasksApi.ts` (`TasksApiWrapper`)
Currently:
- Checks for `obsidian-tasks-plugin` availability
- Gets all tasks, filters by habit tag + recurrence
- Groups duplicate lines by description to build completion history
- `getCompletionHistory()` filters completed lines and extracts `✅` dates

With TaskNotes:
- Plugin dependency check changes (check for TaskNotes plugin, or operate independently by reading frontmatter directly)
- `getAllTasks()` returns one `TaskNote` per file (not many per file)
- `getHabitTasks()` filters by tag + recurrence field presence — same concept, new field names
- `getCompletionHistory()` becomes trivial: just return `task.completeInstances` parsed as dates
- `getUniqueHabits()` is no longer needed — each file is already a unique habit (no deduplication)

#### `src/graphRenderer.ts` — `parseRecurrenceInterval()`
Currently parses human-readable patterns:
- `"every day"` / `"daily"` → 1
- `"every N days"` → N
- `"every week"` / `"weekly"` → 7
- etc.

Needs to parse RRULE format:
- `"FREQ=DAILY"` → 1
- `"FREQ=DAILY;INTERVAL=2"` → 2
- `"FREQ=WEEKLY"` → 7
- `"FREQ=WEEKLY;INTERVAL=2"` → 14
- `"FREQ=MONTHLY"` → 30
- `"FREQ=WEEKLY;BYDAY=MO,WE,FR"` → needs different logic (interval between specified days)

Consider using an RRULE parsing library (e.g., `rrule` npm package) vs hand-rolling. An RRULE library would also be useful for generating expected occurrence dates for the scheduling window.

### Files to Remove

#### `src/fileOrganizer.ts`
The entire concept of "organize completed task lines under active task lines" is irrelevant in TaskNotes. There are no duplicate lines to organize — completion is tracked in `complete_instances`. **Delete entirely.**

### Files to Modify (Moderate)

#### `src/habitGraphView.ts`
- Remove Tasks plugin availability check and error message (lines 41-44, 94-109)
- Update the "no habits found" example to show TaskNotes format instead of emoji format (lines 119-123)
- Update API calls to match new `TasksApiWrapper` interface
- `getCompletionHistory()` call simplifies — no longer needs to pass `habitDescription` since each task file already has its own history
- `getUniqueHabits()` call goes away — iterate tasks directly

#### `src/main.ts`
- Remove Tasks plugin availability check and Notice (lines 34-37)
- Remove `FileOrganizer` import and initialization (lines 8, 13, 27)
- Remove file organize commands (lines 69-91)
- Remove auto-organize logic in the modify handler (lines 124-129)
- Remove `#habit` + `🔁` content check in modify handler (line 127-128) — replace with frontmatter-based detection
- Update code block processor error messages
- Update dependency check in `renderHabitGraphCodeBlock()`

#### `src/settings.ts`
- Remove `autoOrganizeOnModify` setting (no longer relevant)
- Consider adding TaskNotes-specific settings:
  - Task folder path (if tasks are in a specific directory)
  - Status values that count as "completed" (configurable in TaskNotes)
  - Recurrence anchor preference display

#### `src/cache/TaskCacheManager.ts`
- Change `Map<string, TaskInfo[]>` to `Map<string, TaskNote>` (one task per file, not an array)
- Update `getAllCachedTasks()` to return `TaskNote[]` from single-value map entries
- Update memory estimate (TaskNote objects are larger due to instance arrays)
- Mostly structural — the caching strategy (lazy init, event-driven invalidation) still applies

#### `src/events/VaultEventHandler.ts`
- Update import from `taskParser` for new parsing functions
- Logic is the same — create/modify/delete/rename events → update cache
- May want to optimize: only parse files that look like task notes (check frontmatter quickly)

### Files Unchanged

#### `src/graphRenderer.ts` (except `parseRecurrenceInterval`)
- `generateDayCells()` — takes `completionDates: Date[]` and interval, data-source agnostic
- `renderGraph()` — pure HTML rendering from `DayCell[]`
- `calculateStreak()` — takes `completionDates: Date[]`, data-source agnostic
- `DayCell` interface — unchanged

#### `src/utils/dateUtils.ts`
- All date utility functions remain valid

#### `styles.css`
- Visual styling unchanged

## Migration Strategy

### Recommended Phased Approach

**Phase 1: Data Layer** (types + parser)
- Define new `TaskNote` interface in `types.ts`
- Rewrite `taskParser.ts` to read YAML frontmatter
- Unit-testable in isolation

**Phase 2: API Layer** (tasksApi)
- Update `TasksApiWrapper` to use `TaskNote`
- Simplify completion history (direct from `completeInstances`)
- Remove deduplication logic

**Phase 3: Recurrence** (graphRenderer)
- Rewrite `parseRecurrenceInterval()` for RRULE
- Evaluate RRULE library vs hand-rolled parsing
- Consider generating occurrence dates from RRULE for scheduling window accuracy

**Phase 4: UI + Plugin Shell** (view, main, settings)
- Update `HabitGraphView` to use new API shape
- Clean up `main.ts` — remove FileOrganizer, Tasks plugin checks
- Update settings, remove `autoOrganizeOnModify`
- Update example text and error messages

**Phase 5: Cleanup**
- Delete `src/fileOrganizer.ts`
- Update cache types
- Update event handler
- Update CLAUDE.md, README, manifest if needed

### Open Questions

1. **TaskNotes plugin detection**: ✅ Resolved — read frontmatter directly via Obsidian's MetadataCache, no runtime TaskNotes plugin check. More resilient, works without TaskNotes installed, simpler.
2. **RRULE library**: Use `rrule` npm package or parse the subset we need by hand? Library adds a dependency but handles edge cases (BYDAY, BYMONTHDAY, UNTIL, COUNT). → To be resolved in #17.
3. **Field mapping**: ✅ Resolved — assume canonical field names from the TaskNotes spec. Parser accepts both snake_case (`complete_instances`) and camelCase (`completeInstances`) for flexibility. Configurable field mapping is a known future enhancement.
4. **Task folder**: Should we scan the entire vault or allow users to specify a task folder? TaskNotes doesn't mandate a folder structure, but many users organize task files in a dedicated directory. → To be resolved in #19.
5. **Backward compatibility**: Support both Tasks and TaskNotes simultaneously during transition? Or clean break? → To be resolved in #19.
6. **Skipped instances**: Current plugin doesn't have a concept of "skipped". How should the graph render skipped days — as missed, as a distinct color, or omitted? → To be resolved in #19.

## References

- TaskNotes spec: https://tasknotes.dev/
- TaskNotes recurrence spec: https://tasknotes.dev/spec/04-recurrence/
- RFC 5545 RRULE: https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
- Current plugin repo: fusupo/obsidian-habits-graph
- Obsidian plugin API: https://docs.obsidian.md
