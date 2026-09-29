# Issue #47 - Click a graph cell to mark a past day done or skipped (backfill via TaskNotes)

**Archived:** 2026-09-29
**Branch:** 47-click-cell-backfill-via-tasknotes
**Code SHA:** 0097fc8
**PR:** #48
**Status:** Merged. The manual Obsidian check is still open (see below).

## Summary

Clicking a past or today cell now cycles that day through blank, done, skipped and back to blank. Future cells can't be clicked. It works the same in the sidebar and in `habit-graph` code blocks.

Every write goes through TaskNotes' own toggles, reached as `app.plugins.plugins.tasknotes.taskService` (checked with `typeof`). That way TaskNotes still updates `scheduled`, `DTSTART` and occurrence notes itself.

After each click, a repair step re-marks the latest completion (off, then on) whenever `DTSTART` doesn't match it. This makes the result the same whatever order the days are clicked in, for habits that repeat from their last completion.

Rows now re-render in place when their note changes. Before this, code blocks never refreshed, and the sidebar only refreshed as a whole after a one-second debounce. A new setting, `enableCellClickEdit` (on by default), turns clicking off.

## Key Decisions

- **Guarding against mis-taps:** a brief notice after each change, plus a setting to turn clicking off. There's no confirm dialog, because undoing takes one more tap (the cycle wraps back to blank).
- **Re-render fix:** there's one shared `buildHabitRow`, and each container has one `HabitRowSet`. Its subscription is owned by the sidebar view or by a `HabitGraphBlock` (a `MarkdownRenderChild`).
  - This replaced the planner's design of one listener per row, cleaned up when the row is detached. That design leaked, because the sidebar rebuilds every row on any vault modify. It also misfired in code blocks, because reading view detaches off-screen sections and reattaches them later.
- **TaskNotes missing, or its API changed:** cells render inert with no pointer cursor. A click re-checks for TaskNotes and shows a notice if it has gone since render. Nothing is ever written to frontmatter directly.
- **Repair toggle:** the repair uses the plain `toggleRecurringTaskComplete`, not the `WithOccurrenceNotes` version, so occurrence notes aren't touched twice.
- **Fresh state:** `cycleDay` reads state from TaskNotes' `cacheManager.getTaskInfo`, which already holds the pending write. Two other sources were rejected: this plugin's cache lags the write, and the toggles' return value can be an occurrence task instead of the habit.

## Files Changed

- **`src/utils/completionAnchorRepair.ts`** (new): `dtstartRepairDate`, the pure decision on whether a repair is needed.
- **`src/tasknotes/taskNotesBridge.ts`** (new): `resolveTaskNotesBridge`, `nextCycleAction`, `cycleDay`, `recordDayClick` and the per-habit in-flight lock.
- **`src/ui/habitRow.ts`** (new): `buildHabitRow`, now the only place a habit is wired into the graph code, and `HabitRowSet` (debounced in-place re-render).
- **`src/ui/habitGraphBlock.ts`** (new): the code-block lifecycle owner.
- **`src/events/VaultEventHandler.ts`**: `onTaskChanged` listener API.
- **`src/main.ts`, `src/habitGraphView.ts`**: both now render through `HabitRowSet`.
- **`src/graphRenderer.ts`**: `isCellClickable`, plus a trailing `onCellClick` param on `renderGraph`.
- **`src/settings.ts`**: `enableCellClickEdit`.
- **`styles.css`**: `.clickable` cursor and hover outline (a stroke, not a CSS filter), plus the `.habit-busy` row state.
- **Tests**: `completionAnchorRepair.test.ts` (10 tests), `taskNotesBridge.test.ts` (22 tests, including 840 click orderings) and `graphRenderer.test.ts`. The suite went from 221 to 256 tests.
- **`PROJECT_LORE.md`, `README.md`**: the DTSTART repair invariant, three couplings, and a usage section.

## Still Open

The manual check in Obsidian (desktop, plus tapping on iOS) hasn't been done. It covers:
- a weekly and a monthly habit that repeat from completion
- a habit that repeats from its scheduled date
- backfilling out of order, then checking `DTSTART` and `scheduled` in the frontmatter
- TaskNotes disabled: cells inert, and no file changes
- a code block and the sidebar open on the same habit

Acceptance criteria 1 (cycling by click, future cells inert) and 5 (works in both the code block and the sidebar) are waiting on this check.

## Lessons Learned

- The issue assumed the existing `metadataCache 'changed'` handler already re-rendered the graph. It only updated the cache. Check such claims against the code before planning around them.
- To prove a guard test, disable the code with something like `Math.random() > 2`. A literal `if (false && …)` fails the TypeScript compile, so 0 tests run and the test looks like it "fails" for the wrong reason.
- Timezone tests only work with `TZ` pinned in `jest.config.js`. Jest caches the default Intl zone, so setting `TZ` mid-test does nothing.

## Session Log

`SESSION_LOG_1.md` covers the whole session before auto-compaction:
- the tooltip weekday fix (#45)
- pushing the stripe-pattern and label changes to main
- archiving #41 and #43
- the backfill design discussion
- setting up, building and opening the PR for #47
