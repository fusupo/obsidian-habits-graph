# Fixed-schedule past cells: paint overdue carry-over days red, distinguish missed due dates with bright red - #43

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/43
- **State:** open
- **Labels:** enhancement
- **Related Issues:**
  - Related: #35 (today escalation tiers), #41 (CSS filter → explicit fills), #11 (weekly-bydays/monthly-bymonthday), #27 (scheduled-anchor split)

## Description

Fixed-schedule habits (weekly-bydays, monthly-bymonthday, scheduled-anchor with non-null scheduledDate) currently paint non-due past days as blue (rest) even when a previous due date was missed and the task is still outstanding. Three tiers of red for past overdue:

1. **Bright red (solid, no stripes)** — past due dates that were missed
2. **Base red** — overdue carry-over days between a missed due date and the next completion/skip
3. **Striped red** — today-overdue only (unchanged)

## Acceptance Criteria
- [ ] Past non-due days after a missed fixed-schedule due date render as base red (carry-over overdue)
- [ ] Past missed due dates themselves render as bright red (solid, no stripes)
- [ ] Carry-over stops at a completion or skip (subsequent non-due days return to blue rest)
- [ ] Rolling-window habits unchanged
- [ ] Future cells unchanged
- [ ] Today's non-due cell shows `today-overdue` (striped red) when carry-over is active — not blue rest
- [ ] Desktop and iOS rendering correct (plain fills per #41)

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 43-fixed-schedule-overdue-carry-over
- **Current branch:** 43-fixed-schedule-overdue-carry-over

## Implementation Checklist

### Setup
- [x] Fetch latest from base branch
- [x] Create and checkout feature branch

### Implementation Tasks

- [x] **Task 1: Carry-over logic, new statuses, CSS, and rendering updates**
  - Files affected: src/graphRenderer.ts, styles.css
  - Add two new `DayCell.status` values to the inline union: `'overdue'` (carry-over, maps to existing `.red`) and `'missed-overdue'` (missed fixed-schedule due date, maps to new `.red-bright-solid`)
  - `generateDayCells` past branch (`i < 0`): track `fixedScheduleCarryOverActive` flag, only meaningful when `!isRollingWindowInterval`:
    - completed → `'done'`, reset carry-over
    - skipped → `'skipped'`, reset carry-over
    - `!isDueOn`: if fixed-schedule and carry-over active → `'overdue'`; else → `'rest'` (unchanged)
    - due (missed): if fixed-schedule → `'missed-overdue'`, set carry-over active; else → `'missed'` (unchanged)
  - Today branch: if carry-over active and `!isDueOn` → `'today-overdue'` (striped red, the loudest call to action — reuses existing status, no new CSS or today-tint pair needed); mirrors the past-branch carry-over carve-out within the `!isDueOn` slot
  - `colorClassForCell`: add switch cases — `'overdue'` → `'red'`, `'missed-overdue'` → `'red-bright-solid'`
  - `markerForCell`: both new statuses → no glyph (no completion/skip marker)
  - `renderGraph` tooltip `statusText`: `'overdue'` → `'Overdue'`, `'missed-overdue'` → `'Missed'`
  - CSS: add `.red-bright-solid rect { fill: #ff2d20; }` and `.red-bright-solid text { fill: white; }` (both themes), reusing the bright red hex without the stripe pattern
  - Why: the entire feature; one commit.

- [x] **Task 2: Tests — update existing + add new**
  - Files affected: src/__tests__/graphRenderer.test.ts
  - **Update existing tests** (planner verified line-by-line):
    - `weekly-bydays past days (#11)` lines 116-134: missed due dates → `'missed-overdue'`; non-due days after a miss → `'overdue'`
    - `scheduled-anchor interval past days (#27)` lines 231-252: same treatment
    - `monthly-bymonthday past days (#11)` lines 567-572: same treatment
  - **New tests** (new describe block):
    - Consecutive missed due dates: carry-over persists across multiple missed cycles
    - Skip resets carry-over: a skip between missed due dates stops the red
    - `colorClassForCell` cases: `'overdue'` → `'red'`, `'missed-overdue'` → `'red-bright-solid'`
    - `markerForCell` cases: both → no glyph
    - Rolling-window regression: explicitly assert no `'overdue'`/`'missed-overdue'` on rolling-window habits
    - Today carry-over: non-due today with active carry-over → `'today-overdue'` (striped)
    - Today carry-over reset: completion/skip on today clears carry-over (today shows `'today-done'`/`'skipped'` as usual)
  - Why: verify the new behavior and protect unchanged paths.

- [x] **Task 3: Lore updates**
  - Files affected: PROJECT_LORE.md
  - Add invariant: fixed-schedule carry-over (`'overdue'`/`'missed-overdue'`) is past-only by construction (or past+today per Q1), gated by `!isRollingWindowInterval`; rolling-window habits never produce these statuses
  - Update coupling: if a new status can co-occur with today tint, it needs a `.X.today` fill pair per #41
  - Update the past/today branch precedence coupling to note the carry-over carve-out within `!isDueOn → rest`
  - Why: prevents a future session from breaking the guard or precedence.

### Quality Checks
- [x] `npx jest --runInBand` (NEVER parallel), then `npx tsc -noEmit -skipLibCheck` (sequential) — 220 passing, tsc clean
- [x] `npm run build` (deploys live)
- [x] Self-review
- [ ] Visual check: "clean bathroom" biweekly on desktop — missed 07-12 due date bright red, carry-over days base red, today striped

## Technical Notes

### Architecture Considerations
- `DayCell.status` union is declared inline in graphRenderer.ts (not types.ts). Confirmed no other file reads `.status` — blast radius is graphRenderer + tests + CSS.
- `calculateStreak` never reads `DayCell.status` — uses `isDueOn` directly. No streak changes needed (already test-pinned at line 596: `'today-overdue scenario leaves the streak unchanged'`).
- The `isRollingWindowInterval` guard (graphRenderer.ts:55-56) is the correct partition — it already treats weekly-bydays, monthly-bymonthday, and scheduled-anchor-with-date uniformly everywhere else.
- `tsc` enforces exhaustive switch: adding new status values without handling them in `colorClassForCell` produces a "used before being assigned" error on `let base: string`.
- Both new statuses (`'overdue'`, `'missed-overdue'`) are past-only by construction (set inside `i < 0`). Today's carry-over reuses the existing `'today-overdue'` status (striped red), which is already fully handled in colorClassForCell, markerForCell, tooltips, and CSS. No new today-tint pairs needed.

### Implementation Approach
Track a `fixedScheduleCarryOverActive` boolean flag in the day loop, toggled only in the past branch. This is a carve-out WITHIN the existing `!isDueOn → rest` and `due → missed` slots — same pattern as #35's today escalation carve-out within the missed-variant slot. No precedence reorder.

### Potential Challenges
- The carry-over flag must be initialized correctly. The loop walks from oldest (`-daysBefore`) to newest. At the start (earliest day), carry-over should be false — we can't know what happened before the visible window. If a due date was missed at the very start of the window, carry-over activates from there forward.
- The styles.css protected `.habit-label` hunk: same filtered-patch staging as #41.
- Updating existing tests is the bulk of the work — the planner identified 5 test blocks that assert the old `'rest'` behavior for non-due days after a miss.

## Questions/Blockers

### Clarifications Needed
(none — all resolved)

### Blocked By
(none)

### Assumptions Made
1. Carry-over applies to **all three fixed-schedule kinds** (weekly-bydays, monthly-bymonthday, scheduled-anchor-with-date) via the existing `!isRollingWindowInterval` guard, not just scheduled-anchor-interval as the issue's prose narrowly describes — this matches how that guard is used everywhere else in the file.

### Decisions Made
2026-07-17 (pre-filing chat, pinned in the issue)

**Q: What color for the carry-over days vs missed due dates?**
**A:** Carry-over = base red (`#d9534f`), missed due dates = bright red solid (`#ff2d20`, no stripes).
**Rationale:** Three tiers of red — subtle enough that the graph doesn't scream, but you can pick out exactly which due dates were missed. Stripes stay today-only as the loudest call to action.

**Q: Should today participate in carry-over?**
**A:** Yes — today shows `today-overdue` (striped red) when carry-over is active and today is not a due date.
**Rationale:** Marc: "yes, but today should show the red-white stripes in that case" — if you're behind, today should scream at you. Reuses the existing `today-overdue` status; no new CSS needed.

## Work Log

### 2026-07-17 - Session
- Completed: Task 1 (carry-over logic + CSS)
  - Notes: `fixedScheduleCarryOverActive` flag in past loop, carve-out in `!isDueOn` slot (past → `'overdue'`, today → `'today-overdue'`). Missed fixed-schedule due dates → `'missed-overdue'` → `.red-bright-solid` (same bright hex as stripes, but solid). Completion or skip resets. tsc forced exhaustive switch update. Commit 786ff38.
- Completed: Task 2 (tests)
  - Notes: updated 5 existing test blocks; added 7 new tests (consecutive misses, skip/completion reset, today carry-over with stripes, rolling-window regression × 2, colorClassForCell/markerForCell). Also split the #28 scheduled-anchor off-cadence today test into carry-over vs no-carry-over variants. 210 → 220 tests. One initial test mistake (Tue is TUTH due day, not carry-over). Commit d2c9eb5.
- Completed: Task 3 (lore)
  - Notes: two new invariants (carry-over tiers, today-overdue's second path), updated past/today precedence coupling and #41 today-tint coupling. Commit f09b87b.
- Quality checks: 220 tests, tsc clean, build deployed
- Remaining: visual check on desktop

---
**Generated:** 2026-07-17
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/43
