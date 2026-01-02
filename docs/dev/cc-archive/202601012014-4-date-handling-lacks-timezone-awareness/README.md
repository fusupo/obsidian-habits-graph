# Issue #4 - Date handling lacks timezone awareness

**Archived:** 2026-01-01
**PR:** #13 (Merged)
**Status:** Completed

## Summary

Eliminated timezone-dependent date handling by implementing UTC-normalized date operations throughout the plugin. This ensures consistent behavior for users across all timezones and eliminates date shift bugs.

## Key Decisions

**Q: How should the plugin handle timezone interpretation for habit completions?**
**A:** UTC-based calendar days
**Rationale:** All dates treated as UTC. Simple, consistent across users. A task marked at 11pm PST logs as current day, not next day.

**Q: Should the plugin allow users to mark habit completions for future dates?**
**A:** Allow future dates
**Rationale:** No validation needed. Users can pre-mark habits or plan ahead. Most flexible approach.

**Q: What scope should this refactoring PR include?**
**A:** dateUtils module only
**Rationale:** Create src/utils/dateUtils.ts and update date handling. Focused, easy to review. Leave broader refactoring for later.

## Files Changed

1. **src/utils/dateUtils.ts** (NEW)
   - Created 5 UTC-aware utility functions
   - Comprehensive JSDoc documentation

2. **src/tasksApi.ts**
   - Updated `extractDate()` to validate with `parseISODate`
   - Updated `getCompletionHistory()` to parse dates with UTC normalization

3. **src/graphRenderer.ts**
   - Replaced fragile `.split('T')[0]` with `formatISODate()`
   - Updated "today" logic to use `getTodayUTC()`
   - Updated date comparisons to use `isSameDay()`
   - Replaced manual date arithmetic with `addDays()` utility

4. **src/habitGraphView.ts**
   - Updated console logging to use `formatISODate()`

## Implementation Highlights

### UTC Date Utilities Created
- `parseISODate(dateStr)` - Parse YYYY-MM-DD as UTC with validation
- `formatISODate(date)` - Format Date to YYYY-MM-DD in UTC
- `getTodayUTC()` - Get current date as UTC midnight
- `isSameDay(date1, date2)` - Compare calendar days in UTC
- `addDays(date, days)` - Add days to UTC date

### 5 Atomic Commits
1. de77d86 - ✨ feat(utils): Add UTC-aware date utility functions
2. 4cab2d6 - ♻️ refactor(parsing): Use parseISODate for task date parsing
3. 7654886 - ♻️ refactor(formatting): Replace split('T')[0] with formatISODate
4. 17afe27 - ♻️ refactor(comparison): Update date comparison logic to use UTC
5. 441318e - ♻️ refactor(generation): Use addDays utility for date generation

## Lessons Learned

- **Timezone bugs are subtle**: Users in negative UTC offsets (PST, EST) would see date shifts with the old implementation
- **UTC normalization is simple**: No need for external date libraries - built-in Date.UTC() is sufficient
- **Backward compatibility**: Maintaining YYYY-MM-DD storage format meant no data migration needed
- **Atomic commits aid review**: Each commit independently reviewable and testable
- **JSDoc is valuable**: Explicit documentation of UTC assumptions helps future maintainers

## Stats

- **Lines changed:** 155 insertions, 22 deletions
- **Files modified:** 4
- **Commits:** 5
- **Quality checks:** Type checker passed, backward compatible
