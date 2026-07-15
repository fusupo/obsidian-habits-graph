# Today cell shows 'today-missed' on non-due days for fixed-schedule habits - #28

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/28
- **State:** open
- **Labels:** bug
- **Milestone:** (none)
- **Assignees:** (none)
- **Related Issues:**
  - Related: #11/PR #26 (origin — fixed past/future cells but left the today branch out
    of scope), #27/PR #31 (merged — scheduled-anchor interval habits now also have
    calendar-fixed due days, so they hit this same bug on non-cadence todays)

## Description

#11 (PR #26) fixed past and future cells to respect fixed-day schedules
(`FREQ=WEEKLY;BYDAY=...`, `FREQ=MONTHLY;BYMONTHDAY=...`), but the today branch in
`generateDayCells` was out of scope and still ignores `isDueOn`:

```ts
status = completed ? 'today-done' : skippedSet.has(dateStr) ? 'skipped' : 'today-missed';
```

For a `FREQ=WEEKLY;BYDAY=MO,FR` habit on a Tuesday, today renders yellow `today-missed`
with the `!` marker — telling the user to do a habit that isn't due. Expected: today's
cell renders as a rest/not-due day while keeping the today marker so the current day
stays findable in the row.

Observed in real vault data after PR #26 (Mon/Fri habit completed on Tue 2026-07-14
showed `*!`; without the completion it would show the misleading yellow `!`).

**Key planner findings:**
- The past branch (graphRenderer.ts:102-108) already has exactly the right precedence
  pattern (`completed → skipped → !isDueOn → 'rest' → 'missed'`) and all needed inputs
  (`lastCompBeforeCell`, `scheduledDate`, `recurrence`) are already in scope at the
  today branch — the fix is a pure branch-logic change, no new plumbing/params.
- **The `!`/`*!` today marker (renderGraph:187-194) is driven by `cell.isToday` /
  `cell.completed`, NOT `cell.status`** — reusing `'rest'` keeps the marker
  automatically. `'rest'` also already has a colorClass case and a "Not due" tooltip.
- The bug is wider than the issue title: `isDueOn` also returns false for plain
  rolling-window interval habits inside the gap (e.g. every-3-days, completed
  yesterday) — the past branch already treats those days as `'rest'`, but today shows
  yellow. The past branch applies `isDueOn` unconditionally across recurrence kinds.
- `calculateStreak` has no today-specific logic and its backward walk already consults
  `isDueOn` for today when today isn't the latest completion — streaks are unaffected;
  no code change needed there.
- Pre-existing quirk, NOT in scope: a *skipped* today renders `!` instead of `~`
  because marker logic checks `isToday` before `status === 'skipped'`.

## Acceptance Criteria
- [ ] Non-due today renders as `'rest'` (blue, "Not due" tooltip — Q1 decision) while
      the today marker (`!`, or `*!` when completed) remains visible
- [ ] A genuinely-due, uncompleted, unskipped today still renders `today-missed`
      (existing behavior pinned by graphRenderer.test.ts:65-71 stays green)
- [ ] Completing on a non-due today still shows `today-done` (Q2 decision;
      matches the past branch's completed-before-isDueOn precedence)
- [ ] Fix applies uniformly to ALL recurrence kinds (Q3 decision) — including
      rolling-window interval habits inside the gap (yellow → rest)
- [ ] `calculateStreak` verified unaffected — no code change, no regression
      (documented, not a task)

## Branch Strategy
- **Base branch:** main (local main is 1 commit ahead of origin — the #27 archive
  commit 1255a14; push main before opening the PR, same lesson as #11/#27/#29)
- **Feature branch:** 28-today-cell-non-due-days
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Create and checkout feature branch from local main

### Implementation Tasks

- [x] **Task 1: Consult `isDueOn` in the today branch of `generateDayCells`**
  - Files affected: `src/graphRenderer.ts`, `src/__tests__/graphRenderer.test.ts`
  - Why: core fix — mirror the past branch's precedence exactly
    (`completed → skipped → !isDueOn → non-due status → 'today-missed'`), using the
    already-in-scope `lastCompBeforeCell` and `scheduledDate`. No new parameters
    (guards the trailing-params-only PROJECT_LORE coupling). No kind-gating (Q3:
    uniform, matching the past branch's unconditional isDueOn).
  - Non-due status literal: `'rest'` (Q1 decision).
  - Tests (same commit): BYDAY habit where the frozen Wednesday (2025-01-15) is
    non-due (e.g. `FREQ=WEEKLY;BYDAY=TU,TH`) → today is the non-due status;
    scheduled-anchor interval habit on a non-cadence today; rolling-window interval
    habit completed yesterday with gap < interval (Q3: uniform → covered); due-today
    regression (yellow `today-missed` unchanged); completed non-due today →
    `today-done`; skipped non-due today precedence.

- ~~**Task 2: `'today-rest'` status wiring**~~ — DROPPED per Q1 decision (reuse
  `'rest'`; no new status/CSS/tooltip surface needed).

- [x] **Task 2: PROJECT_LORE.md update**
  - Files affected: `PROJECT_LORE.md`
  - Why: new coupling — today-branch non-due precedence must stay in sync with the
    past branch's `isDueOn` precedence; new gotcha/invariant — the today marker is
    driven by `isToday`/`completed`, not `status` (future sessions must not assume
    marker/status are coupled).

### Quality Checks
- [x] `npx jest --runInBand` — 170 tests green (162 + 8 new), run before the build
- [x] `npm run build` — tsc + production bundle clean, main.js rebuilt
- [x] Self-review for code quality
- [x] Verify acceptance criteria met (manual vault check pending — 3 TEST notes staged)

### Documentation
- [x] Covered by Task 2 (PROJECT_LORE.md); no README changes needed

## Technical Notes

### Architecture Considerations
- `cell.status` is consumed only inside graphRenderer.ts (colorClass switch + tooltip);
  no other file branches on it — blast radius is one file (plus styles.css only if a
  new status is introduced).
- No function signatures change → the main.ts/habitGraphView.ts dual call-site
  coupling and the trailing-params rule are not at risk.

### Implementation Approach
Mirror the past branch verbatim in the today branch:
```ts
status = completed ? 'today-done'
    : skippedSet.has(dateStr) ? 'skipped'
    : !isDueOn(recurrence, date, lastCompBeforeCell, scheduledDate) ? 'rest'
    : 'today-missed';
```
`isDueOn`'s scheduled-anchor branch silently falls back when scheduledDate is null
(PROJECT_LORE invariant) — pass through the existing values, add no null handling and
no warnings.

### Potential Challenges
- Jest fake timers freeze today at Wed 2025-01-15 (local). Rather than adding a second
  `jest.setSystemTime` scope, use recurrence patterns where Wednesday is non-due
  (e.g. `BYDAY=TU,TH`; scheduled-anchor cadence anchored off-Wednesday) — keeps the
  suite's single global time fixture. (Assumption, see below.)
- Uniform scope (Q3) changes behavior for common rolling-window habits (today inside
  the gap goes from yellow to not-due) — the existing today test (FREQ=DAILY, no
  completions → still due → still yellow) is compatible.

## Questions/Blockers

### Clarifications Needed
(none — all resolved, see Decisions Made)

### Blocked By
(none — #27 merged)

### Assumptions Made
- Test strategy: keep the single global fake-time fixture (Wed 2025-01-15) and pick
  recurrence patterns where Wednesday is non-due, instead of introducing a second
  `jest.setSystemTime` scope.
- The skipped-today marker quirk (`!` instead of `~`) is pre-existing and out of scope.

### Decisions Made
2026-07-14

**Q: Which status does a non-due today get?**
**A:** Reuse `'rest'` — same blue as surrounding rest days; the `!` today marker still
shows because markers are driven by `isToday`/`completed`, not `status`. Zero new
CSS/type/tooltip surface. (Asked twice — clarified in plain terms before deciding.)

**Q: Should completing on a non-due day still show `today-done`?**
**A:** Yes, keep `today-done`. Matches the past branch's completed-before-isDueOn
precedence (a completed non-due past day renders `'done'`).

**Q: Fix scope — all recurrence kinds or fixed-schedule/scheduled-anchor only?**
**A:** All kinds, uniform — mirrors the past branch's unconditional `isDueOn`. Also
fixes rolling-window habits showing misleading yellow inside the gap.

## Work Log

### 2026-07-14 - Session 1
- Completed: Task 1 (commit c7f1cf1) — today branch now mirrors the past branch's
  precedence verbatim (`completed → skipped → !isDueOn → 'rest' → 'today-missed'`),
  using the already-in-scope `lastCompBeforeCell`/`scheduledDate`; no signature
  changes. 8 new tests in a dedicated "#28" describe: fixed-schedule non-due/due
  today, completed/skipped non-due today, rolling-window in-gap/at-gap today,
  scheduled-anchor off-/on-cadence today. Note: when the isDueOn arm is reached,
  `lastCompBeforeCell` is strictly earlier than today (the `completed` check
  short-circuits first) — identical semantics to the past branch.
- Completed: Task 2 (commit 606bea1) — PROJECT_LORE: new gotcha (marker driven by
  isToday/completed, not status), new coupling (today branch must keep past-branch
  precedence, unconditional across kinds), and the scheduling-authority entry now
  lists today's classification among isDueOn consumers.
- Quality checks: 170/170 tests green (`--runInBand`), then `npm run build` clean
  (sequential per resource constraints). main.js rebuilt → fix live in vault.
- Manual verification staged: 3 TEST notes in TaskNotes/Tasks (BYDAY Mon+Thu,
  rolling-window INTERVAL=3 completed yesterday, existing scheduled-anchor note) —
  all showed baseline yellow `!` pre-fix; expect blue rest + `!` post-fix, BYDAY
  streak 3 intact.

### 2026-07-14 - Session Complete
- All implementation tasks complete
- Quality checks: passed
- Ready for PR: yes (pending user's visual confirmation in the vault)

---
**Generated:** 2026-07-14
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/28
