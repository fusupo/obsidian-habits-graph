# Issue #19 - TaskNotes migration: UI, plugin shell, and cleanup

**Archived:** 2026-06-29
**Branch:** 19-tasknotes-ui-cleanup
**Code SHA:** 664fb5e
**PR:** #23
**Status:** Merged

## Summary

Final part of the Tasks Plugin → TaskNotes migration. Removed all old code (FileOrganizer, TaskInfo type, emoji-based parsers, auto-organize settings), added skipped instances rendering (gray/~ marker, streak-preserving), and added task folder path setting. Also fixed three bugs discovered during live testing: timezone issue with "today" calculation, interval-aware past-day rendering, and addClass('') crash.

## Key Decisions

- **Skipped days do NOT break streaks** — skipping is intentional, streak only breaks on missed (unexcused) days
- **Task folder path setting** added to restrict vault scanning to a specific folder
- **Org-habit color semantics adopted** — green=done, blue=rest/not-due, yellow=warning, red=overdue/missed, gray=skipped
- **getTodayUTC uses local date components** — prevents UTC date from being ahead of user's wall clock in negative UTC offsets

## Files Changed

- `src/fileOrganizer.ts` — DELETED (147 lines removed)
- `src/types.ts` — Removed TaskInfo interface
- `src/utils/taskParser.ts` — Removed old emoji-based parsers, added folder path filter
- `src/settings.ts` — Removed autoOrganizeOnModify, added taskFolderPath
- `src/main.ts` — Removed FileOrganizer, organize commands, auto-organize logic
- `src/graphRenderer.ts` — Added skipped/rest statuses, per-cell interval tracking, streak interval awareness
- `src/habitGraphView.ts` — Wired skippedDates through to renderer
- `src/tasksApi.ts` — Added getSkippedDates method
- `src/utils/dateUtils.ts` — Fixed getTodayUTC to use local date

## Lessons Learned

- `getTodayUTC()` using `getUTCFullYear/Month/Date` returns the UTC calendar date, which at negative UTC offsets (e.g. PDT) can be tomorrow — must use local date components
- Obsidian's `HTMLElement.addClass('')` throws — always guard with `if (colorClass)`
- Per-cell interval tracking (sorted completion pointer) is needed for correct rest-day rendering in past days — binary done/missed is insufficient for interval habits
