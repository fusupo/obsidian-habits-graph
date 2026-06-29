# TaskNotes migration: RRULE recurrence parsing - #17

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/17
- **State:** open
- **Labels:** none
- **Milestone:** none
- **Related Issues:**
  - Depends on: #16 (merged)
  - Blocks: #19
  - Related: #11 (day-of-week recurrence patterns)

## Description

Part 2 of the Tasks Plugin → TaskNotes migration. TaskNotes uses RFC 5545 RRULE-derived strings instead of human-readable recurrence text. This issue rewrites `parseRecurrenceInterval()` to handle RRULE format while keeping backward compatibility with the old human-readable patterns.

## Acceptance Criteria
- [ ] `parseRecurrenceInterval()` handles RRULE format
- [ ] BYDAY patterns handled (average-interval heuristic)
- [ ] Library vs hand-rolled decision made and documented
- [ ] Unit tests for RRULE parsing

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 17-rrule-recurrence-parsing
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Fetch latest from main
- [x] Create and checkout feature branch

### Task 1: Extract `parseRecurrenceInterval` to utility module ✅
- Files: `src/utils/recurrenceUtils.ts` (new), `src/graphRenderer.ts` (modify)
- Move `parseRecurrenceInterval` from `private static` in `GraphRenderer` to an exported function in `src/utils/recurrenceUtils.ts`
- Rename to `parseRecurrenceIntervalDays` for clarity
- Update `graphRenderer.ts` line 39 to import and call the extracted function
- Keep all existing human-readable logic intact (no behavior change)
- Verify `npm run build` compiles clean
- Risk: None. Pure extraction refactor.

### Task 2: Add RRULE parsing branch ✅
- Files: `src/utils/recurrenceUtils.ts`
- Detect RRULE by presence of `FREQ=` — add RRULE branch **before** the existing human-readable branch
- Strip any `DTSTART:...;` prefix before parsing FREQ
- Handle:
  - `FREQ=DAILY` → 1
  - `FREQ=DAILY;INTERVAL=N` → N
  - `FREQ=WEEKLY` → 7
  - `FREQ=WEEKLY;INTERVAL=N` → N*7
  - `FREQ=WEEKLY;BYDAY=MO,WE,FR` → `Math.max(1, Math.round(7 / byDayCount))`
  - `FREQ=MONTHLY` → 30
  - `FREQ=MONTHLY;INTERVAL=N` → 30*N
- Unrecognized RRULE → console.warn + return 1
- Keep old human-readable patterns as else-branch fallback (not deleted — load-bearing per PROJECT_LORE.md)
- Risk: BYDAY heuristic is an approximation. Document that #11 tracks proper day-of-week scheduling.

### Task 3: Unit tests ✅
- Files: `src/__tests__/recurrenceUtils.test.ts` (new)
- Test cases:
  - FREQ=DAILY → 1
  - FREQ=DAILY;INTERVAL=2 → 2
  - FREQ=WEEKLY → 7
  - FREQ=WEEKLY;INTERVAL=2 → 14
  - FREQ=MONTHLY → 30
  - FREQ=MONTHLY;INTERVAL=3 → 90
  - FREQ=WEEKLY;BYDAY=MO,WE,FR → 2 (7/3 rounded)
  - FREQ=WEEKLY;BYDAY=MO,FR → 4 (7/2 rounded)
  - FREQ=WEEKLY;BYDAY=TU → 7 (same as plain WEEKLY)
  - DTSTART:20250118;FREQ=WEEKLY;BYDAY=FR → 7 (DTSTART stripped)
  - Old patterns still work: "every day" → 1, "every 2 days" → 2, "weekly" → 7, "every 2 weeks" → 14, "monthly" → 30
  - Unrecognized string → 1 (no throw)
  - Empty string → 1

### Task 4: Update `generateDayCells` default parameter (optional)
- Files: `src/graphRenderer.ts`
- Change `recurrencePattern: string = 'every day'` to `'FREQ=DAILY'`
- Only if safe — the only caller (`habitGraphView.ts:74`) currently passes `TaskInfo.recurrence` which is human-readable. The default is only hit if recurrence is omitted entirely.
- Defer to #19 if uncertain about caller behavior.

### Quality Checks
- [x] `npm run build` passes
- [x] `npm test` passes (47 tests: 17 existing + 30 new recurrence tests)
- [x] Old human-readable patterns still work (backward compat — 9 legacy tests pass)
- [x] `GraphRenderer.generateDayCells` behavior unchanged for existing callers

## Technical Notes

### Architecture Considerations
- **Extract to utility**: Consistent with existing `dateUtils.ts` and `taskParser.ts` patterns. Makes the function testable (currently `private static`, unreachable from tests).
- **Additive RRULE branch**: RRULE detection via `FREQ=` prefix. Falls through to old human-readable matching if no RRULE detected. No behavior change for current callers.
- **Single caller**: Only `generateDayCells` calls this function, and only to compute a proportional scaling factor for the scheduling window color bands (lines 63-69). Not used for date arithmetic or occurrence generation.

### BYDAY Heuristic
`FREQ=WEEKLY;BYDAY=MO,WE,FR` has no single fixed interval (gaps are 2, 2, 3 days). We use `Math.max(1, Math.round(7 / byDayCount))` as an approximation. This keeps the color-coded scheduling window directionally correct without requiring a full occurrence-date engine. Issue #11 tracks proper day-of-week scheduling.

### Library Decision: Hand-Roll

**Decision: Hand-roll the RRULE subset parser. No `rrule` npm dependency.**

Reasons:
- We only extract a single integer (interval in days) — the `rrule` package is designed for generating occurrence date sequences, which is massive overkill
- The needed subset is small and bounded: FREQ, INTERVAL, BYDAY count, DTSTART stripping
- Bundle size matters for Obsidian plugins (single `main.js`, loaded on mobile too) — `rrule` adds ~25KB minified
- esbuild 0.17.3 doesn't tree-shake `rrule` well at CommonJS output
- CLAUDE.md: "don't add abstractions beyond what the task requires"

**If** future work needs occurrence date generation (e.g., showing next 5 due dates), the `rrule` package would be justified. That's not in scope for #17.

### Backward Compatibility
From PROJECT_LORE.md: "TaskInfo and old parsers must stay intact until #17-#19 complete migration." The sole call site (`habitGraphView.ts:74`) still passes `TaskInfo.recurrence` (human-readable) until tasksApi migrates in a later issue. Old pattern matching is load-bearing.

## Questions/Blockers

### Clarifications Needed
None — analysis resolved the key questions (BYDAY handling, library decision).

### Blocked By
Nothing — #16 is merged.

### Assumptions Made
- Average-interval heuristic for BYDAY is acceptable for the scheduling window (proportional color bands, not exact date math)
- FREQ=YEARLY is out of scope (habits are not yearly)
- No UNTIL or COUNT support needed (irrelevant for habit interval calculation)

## Work Log

### 2026-06-28 - Session 1
- Completed all 3 implementation tasks
- Task 1: Extracted `parseRecurrenceInterval` from `GraphRenderer` (private static) to `parseRecurrenceIntervalDays` in `src/utils/recurrenceUtils.ts` (exported). Updated import in `graphRenderer.ts`.
- Task 2: Added RRULE parsing branch — detects `FREQ=` presence, strips DTSTART prefix, handles DAILY/WEEKLY/MONTHLY with INTERVAL, BYDAY average-interval heuristic. Legacy human-readable patterns kept as else-branch fallback.
- Task 3: Created 30 unit tests covering all RRULE variants, BYDAY heuristic (1-7 days), DTSTART stripping, case insensitivity, legacy patterns, edge cases.
- Task 4 (update default param): Deferred to #19 — the sole caller still passes human-readable text until tasksApi migrates.
- All quality checks pass: `npm run build` clean, `npm test` 47/47

---
**Generated:** 2026-06-28
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/17
