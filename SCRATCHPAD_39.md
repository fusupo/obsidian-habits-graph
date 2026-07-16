# Future escalation ramp ignores skipped instances — forecast should use the completion-or-skip anchor - #39

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/39
- **State:** open
- **Labels:** bug
- **Related Issues:**
  - Related: #37 (introduced the completion-or-skip anchor for today), #35 (the escalation family), #27 (rolling-window vs fixed-calendar split in the future branch)

## Description

#37 made the `today-overdue` escalation skip-aware (anchor = latest of last completion and last skip), but the **future escalation ramp** (`future-too-early` → `future-ok` → `future-warning` → `future-overdue`) still computes `daysSinceCompletion` from the last completion only. After a skip, the forecast disagrees with what the day will actually render when it arrives.

Real case: daily habit, completed 07-14, skipped 07-15 and 07-16. Tomorrow (07-17) is the next due instance — it should show light green `future-ok` ("will be due then") — but the ramp projects from 07-14 (gap 3 ≥ 1.5×interval) and paints it red `future-overdue`.

**Confirmed with user (2026-07-16):** the "due then" forecast color is the existing light green `future-ok` — yellow stays reserved for `future-warning` and today's call to action. Keep the 0.75x/1.25x/1.5x thresholds unchanged; only the anchor moves.

## Acceptance Criteria
- [ ] Daily habit completed 3 days ago, skipped yesterday and today → tomorrow renders `future-ok`, escalating on subsequent days
- [ ] Rolling-window habit with no skips → future ramp unchanged (regression)
- [ ] Fixed-schedule future cells unchanged
- [ ] Today's cell and calculateStreak unaffected

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 39-future-ramp-skip-anchor
- **Current branch:** 39-future-ramp-skip-anchor

## Implementation Checklist

### Setup
- [x] Fetch latest from base branch
- [x] Create and checkout feature branch

### Implementation Tasks

- [x] **Task 1: Skip-aware anchor for the future ramp in `generateDayCells`**
  - Files affected: src/graphRenderer.ts, src/__tests__/graphRenderer.test.ts
  - The future forecast's skip anchor is **today-inclusive** (unlike the today escalation's strictly-before-today `lastSkipBeforeToday`): a skip ON today must reset tomorrow's forecast (issue AC #1 — "skipped yesterday and today → tomorrow future-ok"). Extend the existing skip scan (src/graphRenderer.ts:65-71) to also track `lastSkipOnOrBeforeToday` (`<= today`), one loop, two accumulators.
  - Compute once before the loop: `futureAnchorTime = Math.max(lastCompletion.getTime(), lastSkipOnOrBeforeToday?.getTime() ?? -Infinity)` — `lastCompletion` already carries the synthetic 30-days-ago fallback (line 41-43), so no null handling; a more recent skip simply outranks it.
  - Rolling-window future branch (lines 132-139): replace `daysSinceCompletion` with days since `futureAnchorTime`. `daysSinceCompletion` (lines 93-96) has no other consumer — fold/rename it (e.g. `daysSinceAnchor`) rather than leaving a dead variable.
  - Today branch and past branch untouched; fixed-calendar future arm (line 126-131) untouched.
  - Tests (new describe `generateDayCells — future ramp uses the completion-or-skip anchor (#39)`):
    - the reported case: daily, completed 3 days ago, skipped yesterday AND today → tomorrow `future-ok`; +2 days `future-overdue` (daily's warning band 1.25–1.5 is empty — straight to overdue, thresholds unchanged)
    - skip ON today only (old completion) → tomorrow `future-ok` — pins the today-inclusive anchor
    - EVERY3, completed 10 days ago, skipped 2 days ago → +1 `future-ok` (gap 3), +2 `future-warning` (gap 4), +3 `future-overdue` (gap 5) — full ramp walks from the skip
    - no-skips control: same habit without the skip keeps the pre-#39 ramp (explicit regression alongside the #11/#27 suites)
    - fixed-schedule (BYDAY) habit with skips → future cells still pure `isDueOn`-driven
    - today's cell unaffected: in the reported case today still renders `skipped` (precedence), and the strictly-before-today anchor of #37 still governs `today-overdue` (cheap assertion reusing a #37 scenario)
  - Why: the entire fix; one commit.

- [x] **Task 2: Documentation — lore entries note the shared anchor**
  - Files affected: PROJECT_LORE.md
  - Update the #35/#37 escalation invariant: the completion-or-skip anchor is shared with the future ramp since #39, noting the asymmetry (today's escalation: skip strictly before today; future forecast: skip on-or-before today).
  - Update the coupling entry naming parseRecurrenceIntervalDays as driver of the future escalation ramp: the ramp now anchors to the completion-or-skip anchor, not `lastCompletion` alone.
  - No README change: the legend doesn't enumerate future-ramp anchor mechanics.
  - Why: issue Notes explicitly request the lore updates.

### Quality Checks
- [x] `npx jest --runInBand` (NEVER parallel), then `npx tsc -noEmit -skipLibCheck` (sequential) — 210 passing
- [x] Self-review
- [x] Visual check in live vault ("give robel iron pills" scenario: completed 07-14, skipped 07-15/07-16 → tomorrow light green) — user: "looking pretty good"

## Technical Notes

### Architecture Considerations
- All in `src/graphRenderer.ts`; no signature changes (`skippedDates` is already a `generateDayCells` param), so the main.ts/habitGraphView.ts call-site coupling and the trailing-params rule are not in play.
- `calculateStreak` never reads future statuses — unaffected by construction; the today-branch assertion in Task 1 covers the "today unaffected" AC.
- The synthetic 30-days-ago `lastCompletion` fallback interacts benignly with the max: a real skip more recent than the synthetic date wins, which is exactly the desired "the skip proves the habit was live" semantics from #37.

### Implementation Approach
Same shape as #37, one branch over: move the ramp's anchor from `lastCompletion` to `max(lastCompletion, lastSkipOnOrBeforeToday)`. ~8 lines of production code; thresholds, colors, and fixed-calendar behavior untouched.

### Potential Challenges
- The only trap is the strict/inclusive asymmetry: today's escalation excludes a skip ON today (precedence chain renders it `skipped`), the future forecast includes it. Getting this backwards fails AC #1 while passing most other tests.
- Jest fake timers freeze today at Wed 2025-01-15 local.

## Questions/Blockers

### Clarifications Needed
(none — semantics and color decided in chat before filing; thresholds explicitly unchanged)

### Blocked By
(none)

### Assumptions Made
1. **Future-dated skips are out of scope** — the anchor scan caps at today; a hypothetical skip recorded for a future date does not move the forecast for cells beyond it. No known UI path creates future skips.

### Decisions Made
2026-07-16 (pre-filing chat, pinned in the issue)

**Q: What color is the "due then" forecast after a skip?**
**A:** Light green `future-ok` (existing class).
**Rationale:** User: "acknowledged, it should be green not yellow" — yellow stays reserved for `future-warning`.

## Work Log

### 2026-07-16 - Session
- Completed: Task 1 (skip-aware future anchor)
  - Notes: single skip scan now feeds two accumulators (`lastSkipBeforeToday` strict, `lastSkipOnOrBeforeToday` inclusive); `futureAnchorTime` = max with `lastCompletion` (synthetic 30-day fallback folds in cleanly); per-cell `daysSinceCompletion` renamed `daysSinceAnchor`. 6 new tests; 210 passing, tsc clean. Commit 6162657.
- Completed: Task 2 (lore updates)
  - Notes: new invariant for the ramp anchor with the inclusive/strict asymmetry pinned; coupling entry names `futureAnchorTime`. Commit ead5f43.

### 2026-07-16 - Session Complete
- All tasks complete; commits 6162657, ead5f43
- Quality checks passed (210 tests --runInBand, tsc clean, production build deployed)
- Visual check approved in live vault
- Ready for PR: yes

---
**Generated:** 2026-07-16
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/39
