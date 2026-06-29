# Issue #17 - RRULE recurrence parsing

**Archived:** 2026-06-28
**Branch:** 17-rrule-recurrence-parsing
**Code SHA:** fc5e7b3
**PR:** #21
**Status:** Merged

## Summary

Part 2 of the Tasks Plugin to TaskNotes migration. Rewrote recurrence interval parsing to handle RFC 5545 RRULE format while preserving backward compatibility with legacy human-readable patterns.

- Extracted `parseRecurrenceInterval` from `GraphRenderer` (private static) to `parseRecurrenceIntervalDays` in `src/utils/recurrenceUtils.ts` (exported, testable)
- Added RRULE parsing: FREQ=DAILY/WEEKLY/MONTHLY with INTERVAL, BYDAY average-interval heuristic, DTSTART stripping
- Kept legacy human-readable fallback ("every day", "weekly", etc.) per PROJECT_LORE.md constraint
- 30 new unit tests (47 total pass)

## Key Decisions

- **Hand-rolled vs rrule npm**: Hand-rolled. rrule adds 46KB to a 17KB plugin (3.7x). We only need a single integer (interval in days), not occurrence generation.
- **BYDAY heuristic**: `Math.max(1, Math.round(7 / byDayCount))` as approximation. Proper day-of-week scheduling tracked in #11.
- **Task 4 deferred**: Default parameter update (`'every day'` to `'FREQ=DAILY'`) deferred to #19 since sole caller still passes human-readable text.

## Files Changed

- `src/utils/recurrenceUtils.ts` (new) - RRULE + legacy recurrence interval parser
- `src/__tests__/recurrenceUtils.test.ts` (new) - 30 unit tests
- `src/graphRenderer.ts` (modified) - Removed private static method, added import

## Lessons Learned

- Bundle size measurement before library decisions: `npx esbuild ... --bundle --minify | wc -c` is fast and decisive.
- Extracting private static methods to utility modules is a clean refactor pattern for testability.
