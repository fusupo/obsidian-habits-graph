# Issue #3 - Limited recurrence pattern support

**Archived:** 2026-01-01
**PR:** #12 (Merged)
**Status:** Completed

## Summary

Enhanced the recurrence pattern parser in `graphRenderer.ts` to support generalized "every N days" and "every N weeks" patterns. Previously, only hardcoded patterns like "every 2 days" and "every 2 weeks" were supported. Now any numeric value works (e.g., "every 4 days", "every 10 weeks").

Added console warnings for unrecognized patterns to provide developer visibility instead of silently defaulting to daily recurrence.

## Key Decisions

**Q: Should we implement day-of-week patterns now, or focus on generalized numeric patterns first?**
**A:** Numeric patterns only (every N days/weeks)
**Rationale:** Simpler to implement, covers most use cases. Day-of-week patterns (like "every Monday" or "every 2 weeks on Monday") will be tracked in a separate issue for future enhancement.

## Files Changed

- `src/graphRenderer.ts` (lines 90-132)
  - Added regex pattern for "every N days" → `/every (\d+) days?/i`
  - Added regex pattern for "every N weeks" → `/every (\d+) weeks?/i`
  - Added console warning for unrecognized patterns
  - Added comprehensive JSDoc documentation with examples

## Implementation Highlights

- **Backward compatible:** Existing hardcoded patterns now handled by generalized regex
- **No breaking changes:** Default behavior unchanged (still defaults to daily if unrecognized)
- **Developer visibility:** Warning message lists all supported patterns for user guidance
- **27 insertions, 7 deletions:** Clean, focused enhancement

## Lessons Learned

- Monthly recurrence kept at 30 days (acceptable for scheduling window logic used in this plugin)
- Regex-based pattern matching more extensible than hardcoded string matching
- Console warnings provide valuable debugging feedback without breaking functionality
