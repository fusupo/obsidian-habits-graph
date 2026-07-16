# Overdue escalation ignores skipped instances — skip should reset the escalation clock - #37

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/37
- **State:** open
- **Labels:** bug
- **Related Issues:**
  - Related: #35 (introduced the escalation and its gap math), #28 (today precedence chain), #33 (tint exemption)

## Description

The #35 `today-overdue` escalation computes its gap as `today − last completion` (falling back to the scheduled date) and is blind to `skipped_instances`. Everywhere else a skip means "excused" (calculateStreak walks over skips; skipped cells render gray with precedence over missed), but the escalation still counts skipped days as delinquency.

Real case: daily habit (completion anchor), completed 07-14, **skipped 07-15**, today 07-16 → gap 2 > interval 1 → striped `today-overdue`, despite yesterday's miss being explicitly sanctioned.

**Decided semantics (chat, 2026-07-16): RESET, not pause.** A skip means "that instance is no longer my responsibility, but the next one may be." Even a habit already several days overdue before a skip returns to yellow after it.

## Acceptance Criteria
- [ ] Daily habit completed 2 days ago, skipped yesterday → today renders yellow `today-missed`
- [ ] Rolling-window habit already overdue before a skip → still resets to yellow the day after the skip (reset, not pause)
- [ ] Gap since the most recent skip exceeding the interval (no completion/skip since) → `today-overdue` returns
- [ ] Skips do not affect fixed-schedule habits, past cells, or `calculateStreak`
- [ ] PROJECT_LORE #35 invariant updated to name the skip anchor

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 37-skip-resets-overdue-clock
- **Current branch:** 37-skip-resets-overdue-clock

## Implementation Checklist

### Setup
- [x] Fetch latest from base branch
- [x] Create and checkout feature branch

### Implementation Tasks

- [x] **Task 1: Skip-aware overdue anchor in `generateDayCells`**
  - Files affected: src/graphRenderer.ts, src/__tests__/graphRenderer.test.ts
  - Compute once, before the cell loop: `lastSkipBeforeToday` = latest date in `skippedDates` strictly before today (a skip ON today is already handled by the precedence chain → gray).
  - Today branch's `overdueGap` anchor becomes: `max(lastCompBeforeCell, lastSkipBeforeToday)` if either exists, else `scheduledDate`, else null (brand-new habit with no anchor stays yellow, unchanged).
  - `isDueOn`, rest days, past cells, future ramp, and `calculateStreak` untouched — reset affects only today's yellow-vs-stripes choice.
  - Tests (new describe `generateDayCells — skip resets the overdue clock (#37)`):
    - daily, completed 2 days ago, skipped yesterday → `today-missed` (the reported bug)
    - EVERY3 already overdue (completed 7 days ago), skipped yesterday → `today-missed` AND still due (not `rest`) — reset-not-pause, isDueOn unaffected
    - EVERY3, completed 7 days ago, skipped 5 days ago, nothing since → gap since skip 5 > 3 → `today-overdue` returns
    - skip older than the last completion → completion wins the max (e.g. skipped 6 days ago, completed 4 days ago, interval 3 → gap 4 > 3 → `today-overdue`)
    - never-completed habit with a lone past skip beyond the interval → `today-overdue` (the skip is an anchor: it acknowledges the habit was live) — flag as assumption
    - skip TODAY still renders `skipped` (precedence regression, cheap assertion)
  - Why: the entire fix; one commit.

- [x] **Task 2: Documentation — lore invariant + README legend**
  - Files affected: PROJECT_LORE.md, README.md
  - Update the #35 escalation invariant: overdue anchor is "last completion or last skip (whichever is later), else the scheduled date"; note reset-not-pause and the never-completed-but-skipped case.
  - README legend bright-red line: "gap since the last completion **or skip** exceeds its interval".
  - Why: issue AC explicitly requires the lore update; README precedent from #33/#35.

### Quality Checks
- [x] `npx jest --runInBand` (NEVER parallel), then `npx tsc -noEmit -skipLibCheck` (sequential) — 204 passing
- [x] Self-review
- [x] Visual check in live vault: "Give Robel iron pills" (completed 07-14, skipped 07-15) shows yellow today — user proceeded to PR

## Technical Notes

### Architecture Considerations
- All in `src/graphRenderer.ts`: `skippedDates` is already a `generateDayCells` param; `skippedSet` exists for per-cell lookups but the anchor needs the latest skip *date*, computed once outside the loop (today is the only consumer).
- Anchor precedence (from the issue): `max(last completion ≤ cell date, last skip < today)` → else scheduled date → else null.
- A skip does NOT make today `rest` — `isDueOn` stays skip-blind; the habit is still due, just not overdue.

### Implementation Approach
Reset semantics: the most recent excused instance is as good as a completion for the escalation clock (and only for the escalation clock). ~6 lines of production code plus tests.

### Potential Challenges
- None significant. Watch the strict inequalities: skip *strictly before* today (today's skip is precedence-handled), gap *strictly greater* than interval (unchanged #35 boundary).

## Questions/Blockers

### Clarifications Needed
(none — semantics decided in chat before filing)

### Blocked By
(none)

### Assumptions Made
1. **Never-completed habit with a past skip gets the skip as its anchor** — so it CAN go overdue even without any completion (the skip proves the habit was live). Consistent with "the next instance may be my responsibility."
2. **Skip beats scheduled-date fallback** — an actual instance event outranks the static scheduled date, even if the scheduled date is more recent.

### Decisions Made
2026-07-16

**Q: Should a skip pause the escalation clock (excuse only the skipped day) or reset it (like a completion)?**
**A:** Reset.
**Rationale:** User: "skip for my purposes basically means i don't have to do it, that particular instance is no longer my responsibility but the next one may be."

## Work Log

### 2026-07-16 - Session
- Completed: Task 1 (skip-aware overdue anchor)
  - Notes: `lastSkipBeforeToday` computed once before the cell loop; anchor via Math.max of epoch times (-Infinity sentinel) so the completion/skip max falls through to the scheduledDate fallback cleanly. 7 new tests incl. past-cells-unaffected and skip-today precedence regressions. 204 tests passing.
- Completed: Task 2 (lore invariant + README legend); production build deployed.

### 2026-07-16 - Session Complete
- All tasks complete; commits 0dd4d6e, f64a563
- Quality checks passed (204 tests --runInBand, tsc clean); visual check approved
- Ready for PR: yes

---
**Generated:** 2026-07-16
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/37
