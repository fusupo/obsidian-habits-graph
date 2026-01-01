# Task parsing is fragile and regex-based - #2

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/2
- **State:** open
- **Labels:** none
- **Milestone:** none
- **Assignees:** none
- **Related Issues:** none

## Description
The task parser in `tasksApi.ts:44-76` uses regex patterns that assume exact emoji order and format.

**Problems:**
- Brittle if Tasks plugin format changes
- Doesn't handle escaped markdown or edge cases
- Description extraction pattern `[^📅⏳🛫✅🔁]+` may fail with unexpected content

**Potential fix:** Use Tasks plugin API directly if available, or implement more robust structured parsing.

## Acceptance Criteria
- [ ] Task parsing handles edge cases gracefully (emoji in descriptions, different formats)
- [ ] Description extraction doesn't break with unexpected characters
- [ ] Date parsing is more flexible or fails gracefully with clear feedback
- [ ] Consider Tasks plugin API integration if available

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 2-robust-task-parsing
- **Current branch:** main

## Implementation Checklist

### Setup
- [ ] Fetch latest from main
- [ ] Create and checkout feature branch

### Implementation Tasks

- [x] Investigate Tasks plugin API availability
  - Files affected: `src/tasksApi.ts`
  - Why: Determine if Tasks plugin exposes usable parsing API we can leverage

- [x] Improve description extraction regex
  - Files affected: `src/tasksApi.ts:48-49`
  - Why: Current pattern `[^📅⏳🛫✅🔁]+` is fragile; need approach that handles emoji in descriptions

- [x] Add fallback/validation for date parsing
  - Files affected: `src/tasksApi.ts:54-55, 57-58`
  - Why: Only accepts strict YYYY-MM-DD; should handle failures gracefully

- [x] Refactor recurrence extraction
  - Files affected: `src/tasksApi.ts:51-52`
  - Why: Pattern `/🔁\s+([^📅⏳🛫✅#]+)/` may break with unexpected content

- [x] Add optional debug logging for parse failures
  - Files affected: `src/tasksApi.ts`
  - Why: Silent failures make debugging difficult; optional console logging helps

- [x] Test with edge cases from TEST-HABITS.md
  - Files affected: `TEST-HABITS.md`
  - Why: Verify fixes don't break existing task formats

### Quality Checks
- [x] Run `npm run build` - verify no type errors
- [ ] Test in Obsidian with various task formats
- [x] Verify existing TEST-HABITS.md tasks still parse correctly

## Technical Notes

### Architecture Considerations
- TasksApiWrapper is the central parsing class
- Parsed tasks flow to: HabitGraphView, FileOrganizer, graphRenderer
- Breaking changes to TaskInfo interface would cascade

### Current Regex Patterns (tasksApi.ts:44-76)
| Pattern | Purpose |
|---------|---------|
| `/^[\s]*-\s\[([ xX])\]\s(.+)$/` | Task detection |
| `/^([^📅⏳🛫✅🔁]+)/` | Description extraction |
| `/🔁\s+([^📅⏳🛫✅#]+)/` | Recurrence extraction |
| `/✅\s+(\d{4}-\d{2}-\d{2})/` | Completion date |
| `/📅\s+(\d{4}-\d{2}-\d{2})/` | Due date |

### Implementation Approach
Two viable strategies:
1. **Tasks Plugin API** - If available, delegate parsing to the official plugin
2. **Improved Regex** - Make patterns more defensive with better fallbacks

Recommend hybrid: Check for Tasks API first, fall back to improved regex.

### Potential Challenges
- Tasks plugin API may not be public/stable
- Overly defensive parsing could mask legitimate issues
- Performance impact of more complex regex patterns (likely negligible)

## Questions/Blockers

### Clarifications Needed
None - resolved via Q&A

### Blocked By
None

### Assumptions Made
- Tasks plugin emoji format (🔁, 📅, ✅) is the primary expected format
- Existing TEST-HABITS.md represents valid input formats

### Decisions Made
**2025-12-31**

**Q: Should we prioritize Tasks plugin API or standalone regex?**
**A:** Tasks API first
**Rationale:** Check for Tasks plugin API availability, fall back to improved regex if not available. Best of both worlds.

**Q: How should parse failures be handled?**
**A:** Debug logging
**Rationale:** Log warnings to console.debug for troubleshooting without cluttering user's console.

## Work Log

### 2025-12-31 - Session Start
- Starting: Investigate Tasks plugin API availability
- **Finding:** Tasks plugin API (v1) only exposes UI methods (`createTaskLineModal`, `editTaskLineModal`, `executeToggleTaskDoneCommand`) - NO parsing API available
- **Decision:** Proceed with improved standalone regex parser
- Completed: Investigation task

### 2025-12-31 - Refactored Parser
- Implemented robust parsing helpers:
  - `findFirstEmojiPosition()` - Finds first task emoji in text
  - `extractDescription()` - Gets text before first emoji (not fragile regex)
  - `extractRecurrence()` - Improved regex that stops at next emoji/tag
  - `extractDate()` - With validation and debug logging
- Extended emoji support: Added ⏫🔼🔽🆔⛔🔺➕ (priority, id, blocking, created)
- Build passes with no type errors

### 2025-12-31 - Implementation Complete
- All implementation tasks complete
- Verified TEST-HABITS.md format compatibility with new parser
- Ready for commit and PR

---
**Generated:** 2025-12-31
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/2
