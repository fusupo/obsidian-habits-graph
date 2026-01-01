# Issue #2 - Task parsing is fragile and regex-based

**Archived:** 2025-12-31
**PR:** #10
**Status:** Merged

## Summary

Refactored the task parser in `tasksApi.ts` to use more robust parsing methods instead of fragile regex patterns that assumed exact emoji order and format.

## Key Decisions

**Q: Should we prioritize Tasks plugin API or standalone regex?**
**A:** Tasks API first (check for availability, fall back to improved regex)
**Result:** Tasks plugin API only exposes UI methods - no parsing API available. Proceeded with standalone regex improvements.

**Q: How should parse failures be handled?**
**A:** Debug logging - Log warnings to console.debug for troubleshooting without cluttering user's console.

## Files Changed

- `src/tasksApi.ts` - Complete parser refactoring with new helper methods:
  - `findFirstEmojiPosition()` - Position-based emoji detection
  - `extractDescription()` - Text extraction before first emoji
  - `extractRecurrence()` - Improved regex with lookahead
  - `extractDate()` - With validation and debug logging

## Implementation Approach

- Replaced negative character class regex (`[^...]`) with position-based extraction
- Extended emoji support: Added ⏫🔼🔽🆔⛔🔺➕ (priority, id, blocking, created)
- Added date validation with `new Date()` and `isNaN()` checking
- Debug logging for invalid date formats

## Lessons Learned

- Tasks plugin API (v1) only provides UI methods (`createTaskLineModal`, `editTaskLineModal`, `executeToggleTaskDoneCommand`) - no parsing capabilities exposed
- Position-based string extraction is more robust than negative character class regex for emoji-delimited content
