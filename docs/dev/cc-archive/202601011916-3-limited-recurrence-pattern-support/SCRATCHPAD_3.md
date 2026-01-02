# Limited recurrence pattern support - #3

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/3
- **State:** open
- **Labels:** none
- **Milestone:** none
- **Assignees:** none
- **Related Issues:** none

## Description
Recurrence parsing in `graphRenderer.ts:93-111` only handles a few patterns:
- daily
- every 2 days
- every 3 days
- weekly
- every 2 weeks
- monthly

**Problems:**
- Complex patterns like "every 2 weeks on Monday" silently default to daily
- No warning when a pattern isn't recognized
- Monthly uses 30 days (not accurate for all months)

**Fix:** Expand pattern support or at minimum log warnings for unrecognized patterns.

## Acceptance Criteria
- [ ] Support generalized "every N days" patterns (not just 2 and 3)
- [ ] Support generalized "every N weeks" patterns (not just 2)
- [ ] Add console warnings for unrecognized recurrence patterns
- [ ] Document which patterns are supported vs unsupported
- [ ] Keep monthly at 30 days (accurate enough for scheduling window purposes)

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 3-limited-recurrence-pattern-support
- **Current branch:** main

## Implementation Checklist

### Setup
- [ ] Fetch latest from main
- [ ] Create and checkout feature branch `3-limited-recurrence-pattern-support`

### Implementation Tasks

- [ ] Enhance parseRecurrenceInterval to support generalized "every N days" pattern
  - Files affected: `src/graphRenderer.ts`
  - Why: Support patterns like "every 4 days", "every 10 days", etc.
  - Approach: Use regex to extract the number from patterns like "every N day(s)"

- [ ] Enhance parseRecurrenceInterval to support generalized "every N weeks" pattern
  - Files affected: `src/graphRenderer.ts`
  - Why: Support patterns like "every 3 weeks", "every 4 weeks", etc.
  - Approach: Use regex to extract the number from patterns like "every N week(s)"

- [ ] Add console warning for unrecognized recurrence patterns
  - Files affected: `src/graphRenderer.ts`
  - Why: Alert users/developers when a pattern doesn't parse correctly instead of silently defaulting to daily
  - Approach: Add console.warn() before returning default value

- [ ] Add JSDoc comment documenting supported pattern formats
  - Files affected: `src/graphRenderer.ts`
  - Why: Make it clear what patterns are supported
  - Approach: Update method's JSDoc with examples of supported patterns

### Quality Checks
- [ ] Run build to ensure no TypeScript errors: `npm run build`
- [ ] Test in Obsidian with various recurrence patterns
- [ ] Verify warning appears for unrecognized patterns
- [ ] Self-review for code quality

### Documentation
- [ ] JSDoc comment on parseRecurrenceInterval is sufficient (no separate README update needed)

## Technical Notes

### Architecture Considerations
- This is a focused change to a single private method in GraphRenderer
- No API contract changes - method is private
- No breaking changes - new patterns are additive, default behavior unchanged
- Warning is informational only, doesn't affect functionality

### Implementation Approach
**Strategy:** Enhance pattern parsing with regex-based extraction for generalized patterns

**Current implementation:**
- Hard-coded pattern matching with string.includes()
- Silent fallback to daily (return 1)

**Enhanced implementation:**
1. Try existing hard-coded patterns first (for exact matches)
2. Try generalized regex patterns:
   - `/every (\d+) days?/i` → extract number, return number
   - `/every (\d+) weeks?/i` → extract number, return number * 7
3. If still no match, log warning and return default

**Why this approach:**
- Maintains backward compatibility with existing patterns
- Enables extensible pattern matching via regex
- Provides developer visibility into parsing failures
- Minimal code change, low risk

**Regex patterns to add:**
```typescript
// Match "every N day(s)"
const daysMatch = pattern.match(/every (\d+) days?/i);
if (daysMatch) return parseInt(daysMatch[1]);

// Match "every N week(s)"
const weeksMatch = pattern.match(/every (\d+) weeks?/i);
if (weeksMatch) return parseInt(weeksMatch[1]) * 7;
```

### Potential Challenges
- Need to ensure regex doesn't break existing patterns
- Order of pattern checks matters (specific before general)
- Warning should be helpful but not noisy

### Monthly pattern note
Keeping monthly at 30 days is acceptable for the scheduling window logic used in this plugin. The scheduling window uses percentage-based thresholds (0.75x, 1.25x, 1.5x) which work fine with an approximate 30-day month. Adding calendar-accurate month calculations would add complexity without meaningful UX improvement.

## Questions/Blockers

### Clarifications Needed
None - all clarifications resolved (see Decisions Made)

### Blocked By
None

### Assumptions Made
- Console warnings are acceptable output mechanism
- Generalized "every N days/weeks" covers most use cases
- Monthly staying at 30 days is acceptable (not requiring calendar-accurate months)
- Day-of-week patterns are deferred to future enhancement

### Decisions Made
2026-01-01

**Q: Should we implement day-of-week patterns now, or focus on generalized numeric patterns first?**
**A:** Numeric patterns only (every N days/weeks)
**Rationale:** Simpler to implement, covers most use cases. Day-of-week patterns (like "every Monday" or "every 2 weeks on Monday") will be tracked in a separate issue for future enhancement.

## Work Log

### 2026-01-01 - Implementation Session

**Setup completed:**
- ✅ Fetched latest from main (already up to date)
- ✅ Switched to feature branch `3-limited-recurrence-pattern-support`

**Implementation completed:**
- ✅ Enhanced parseRecurrenceInterval with generalized pattern support
  - Added regex pattern for "every N days" → `/every (\d+) days?/i`
  - Added regex pattern for "every N weeks" → `/every (\d+) weeks?/i`
  - Console warning for unrecognized patterns
  - Comprehensive JSDoc documentation with examples
  - File: `src/graphRenderer.ts:90-132`

**Quality checks:**
- ✅ Build passes with no TypeScript errors
- ✅ Self-review completed - all acceptance criteria met
- ⏳ Manual testing in Obsidian (pending user verification)

**Notes:**
- Existing hardcoded patterns (every 2/3 days, every 2 weeks) now handled by generalized regex
- Backward compatible - no breaking changes
- Warning message lists all supported patterns for user guidance

---
**Generated:** 2026-01-01
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/3
