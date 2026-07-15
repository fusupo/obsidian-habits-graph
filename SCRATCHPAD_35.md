# Distinguish due-today (yellow) from past-due (red) in today's cell for rolling-window habits - #35

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/35
- **State:** open
- **Labels:** enhancement
- **Milestone:** none
- **Assignees:** none
- **Related Issues:**
  - Related: #33 (today tint; defines the exemption this issue extends), #28 (today-branch precedence chain this issue carves into), #27 (recurrence anchor semantics that define "rolling window")

## Description

Today's cell currently renders `today-missed` (yellow) for any due-and-undone habit, whether today is exactly the due day or the habit is already several days late. For rolling-window habits the due day drifts with the last completion, so "on the due day" and "past the due day" are genuinely different states — but they look identical today.

The future ramp already encodes this escalation (`future-ok` → `future-warning` → `future-overdue`); today should participate in the same idea.

**Proposed behavior:**
- `today-missed` (yellow, unchanged) — today is exactly the due day: "should be done today".
- `today-overdue` (new, bright red) — a rolling-window (completion-anchor / no-scheduled-date interval) habit whose gap since the last completion already exceeds its interval: the due day has passed, you're late.
- Fixed-schedule habits (BYDAY, BYMONTHDAY, scheduled-anchor cadence) are NOT affected: each due day is its own instance, so their undone due-today stays yellow.
- Like yellow, the red `today-overdue` cell is exempt from the #33 today tint — both are calls to action and must stay full strength.
- Tooltip for the new status: "Overdue".

## Acceptance Criteria
- [ ] Rolling-window habit, last completed exactly `interval` days ago → today renders yellow `today-missed`
- [ ] Rolling-window habit, gap > interval → today renders red `today-overdue`, untinted
- [ ] Fixed-schedule and scheduled-anchor habits: undone due-today stays yellow; non-due today unchanged
- [ ] `today-overdue` exempt from the today tint alongside `today-missed`
- [ ] Streak calculation unchanged

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 35-today-overdue-rolling-window
- **Current branch:** 35-today-overdue-rolling-window

## Implementation Checklist

### Setup
- [x] Fetch latest from base branch
- [x] Create and checkout feature branch

### Implementation Tasks

- [x] **Task 1: Core status — `today-overdue` in `generateDayCells`**
  - Files affected: src/graphRenderer.ts, src/__tests__/graphRenderer.test.ts
  - Extend `DayCell['status']` union with `'today-overdue'`.
  - Extract a shared rolling-window guard near where `recurrence` is computed and reuse it in BOTH the future branch (pure refactor of its inline fixed-calendar check, no behavior change) and the new today clause, so the two branches' due-day-kind logic can't drift:
    `const isRollingWindowInterval = recurrence.kind === 'interval' && !(recurrence.anchor === 'scheduled' && scheduledDate);`
  - Today branch: escalation lives *within* the final "missed variant" slot of the #28 precedence chain (completed → skipped → !isDueOn → rest → missed variant):
    `(isRollingWindowInterval && lastCompBeforeCell !== null && daysSincePriorComp > intervalDays) ? 'today-overdue' : 'today-missed'`
  - `intervalDays` (from `parseRecurrenceIntervalDays`) is numerically identical to `recurrence.days` when `kind === 'interval'` — reuse it, no union-narrowing needed.
  - Tests (new describe `generateDayCells — today-overdue for rolling-window habits (#35)`):
    - completion-anchor (or default scheduled-anchor with null scheduledDate), gap > interval → `today-overdue`
    - gap === interval → `today-missed` (existing test ~line 309–313; annotate as now load-bearing for #35's boundary)
    - never-completed rolling-window habit → `today-missed`, NOT `today-overdue` (existing test ~line 68–70; gap is Infinity — annotate)
    - fixed-schedule (weekly-bydays / monthly-bymonthday) due-today with large gap → stays `today-missed`
    - scheduled-anchor WITH scheduledDate, on-cadence today, gap > interval → stays `today-missed`
    - explicit `anchor: 'completion'` with a scheduledDate also set → still rolling window → `today-overdue` (easy to get backwards)
  - Why: this is the semantics change; everything else hangs off the new status value.

- [x] **Task 2: New `red-bright` color for `today-overdue`, tint-exempt in `colorClassForCell`**
  - Files affected: src/graphRenderer.ts, styles.css, src/__tests__/graphRenderer.test.ts
  - Add `case 'today-overdue': base = 'red-bright'; break;` — a NEW color class, brighter than the established `.red`, today-only. Past missed days keep `.red` unchanged.
  - styles.css: add `.habit-graph-svg .red-bright rect` (+ text fill white) in both light and dark sections — noticeably brighter/more saturated than `.red` (#d9534f light / #b43c39 dark); exact shade subject to visual iteration in the live vault.
  - Change the tint exemption from single-status equality to the call-to-action set (`today-missed`, `today-overdue`). Update the JSDoc and the styles.css tint comment (~lines 76–80) to name both.
  - Tests: `today-overdue` + isToday → `'red-bright'` with no `today` suffix; base-mapping sanity check alongside the existing per-status table.
  - Why: user directive — the escalation is a today-only signal that must out-shout the ordinary red history behind it; keeps both calls to action full strength per the #33 invariant's intent.

- [ ] **Task 3: "Overdue" tooltip label in `renderGraph`**
  - Files affected: src/graphRenderer.ts
  - Extend the `statusText` ternary with `cell.status === 'today-overdue' ? 'Overdue'` before the generic `'Missed'` fallback.
  - No tests: renderGraph is DOM-building and untested (node jest env, no jsdom); verified by tsc only. Staying in scope.
  - Why: issue specifies the tooltip text.

- [ ] **Task 4: Regression test — `calculateStreak` unaffected**
  - Files affected: src/__tests__/graphRenderer.test.ts only
  - `calculateStreak` never reads `DayCell.status` (confirmed by construction), but the issue asks to verify. Add a rolling-window overdue scenario (e.g. FREQ=DAILY;INTERVAL=3, last completion 4+ days ago, today undone) asserting the pre-#35 streak value.
  - May fold into Task 1's commit if preferred.
  - Why: acceptance criterion "Streak calculation unchanged".

- [ ] **Task 5: Documentation — PROJECT_LORE.md + README.md legend**
  - Files affected: PROJECT_LORE.md, README.md
  - New lore invariant documenting the carve-out: today's "missed variant" slot escalates to `today-overdue` for rolling-window habits (gap > interval, prior completion required — never-completed stays yellow despite Infinity gap); an escalation WITHIN the #28 precedence chain, not a new level; fixed-schedule/scheduled-anchor untouched.
  - Update the #33 tint-exemption lore entry: excludes the call-to-action statuses (`today-missed`, `today-overdue`), no longer "only that".
  - README.md line ~69: legend mentions rolling-window habits past their interval stay full-strength red.
  - Why: the setup prompt explicitly requires documenting the #28 divergence rather than silently breaking the invariant; README/lore sync is project precedent (49fd82d).

### Quality Checks
- [ ] `npx tsc --noEmit -skipLibCheck` (sequential, never concurrent with jest)
- [ ] `npx jest --runInBand` (NEVER parallel)
- [ ] Self-review for code quality
- [ ] Verify acceptance criteria met (visual check in live vault after `npm run build`)

### Documentation
- [ ] PROJECT_LORE.md + README.md updates (Task 5)

## Technical Notes

### Architecture Considerations
- `src/graphRenderer.ts` owns everything: `DayCell` status union (~line 11), `generateDayCells` today branch (~lines 83–90), `colorClassForCell` (~145–162), tooltip ternary in `renderGraph` (~232), `calculateStreak` (~246–292, does not read status).
- `daysSincePriorComp` (`cell.daysFromLastCompletion`) already exists via the sorted-completions pointer — no new tracking.
- The future branch's inline fixed-calendar check is the negation of the rolling-window guard; extracting one shared boolean addresses the lore coupling risk directly.
- `isDueOn`'s interval branch (recurrenceUtils.ts) is the authoritative definition: fixed cadence only when `anchor === 'scheduled' && scheduledDate`; everything else rolls.
- CSS: NEW `.red-bright` class for `today-overdue` (user decision) — brighter than `.red` in both themes so today's overdue cell out-shouts past missed cells; the stale styles.css tint comment (~lines 76–80, "NEVER to a yellow (today-missed) cell") also needs to name `today-overdue` (both in Task 2).

### Implementation Approach
Escalate within the existing "missed variant" slot, gated on (rolling-window kind) AND (prior completion exists) AND (gap > interval). Strict `>` keeps gap === interval yellow, matching the existing boundary regression test.

### Potential Challenges
- The extracted `isRollingWindowInterval` must produce byte-identical future-branch behavior — the #11/#27 future-branch test suites are the safety net.
- Easy-to-invert case: `anchor: 'completion'` with a scheduledDate set is STILL rolling window.
- Jest fake timers freeze today at Wed 2025-01-15 local.

## Questions/Blockers

### Clarifications Needed
(none — issue text plus existing regression tests fully determine behavior)

### Blocked By
(none)

### Assumptions Made
1. ~~**No new CSS color** — `.red` reused~~ **OVERRIDDEN by user, 2026-07-15** — see Decisions Made.
2. **Never-completed rolling-window habits stay `today-missed`** — forced by the existing FREQ=DAILY/no-completions regression test (gap is Infinity); also matches day-one UX (nothing to be overdue from yet).
3. **README legend update included** — project precedent (49fd82d) keeps README and lore in sync; drop from Task 5 if scope should stay src/ + lore only.

### Decisions Made
2026-07-15

**Q: Should `today-overdue` reuse the existing `.red` or get its own brighter red?**
**A:** New brighter red (`red-bright` class), applied to today ONLY. Past missed days stay the established `.red`.
**Rationale:** User: "I just need bright red on 'today', not necessarily on previous days that were also past due. those can stay the established red color, but 'today' needs to be bright red." The escalation is a today-only call to action and must stand out against ordinary red history cells.

## Work Log

### 2026-07-15 - Session Start
- Completed: Task 1 (today-overdue status in generateDayCells)
  - Notes: TS definite-assignment forced the `case 'today-overdue': base = 'red-bright'` line into Task 1 (switch must stay exhaustive to compile); tint exemption/CSS/tests remain Task 2. Also fixed the stale "vertical accent line" comment in the today branch (leftover from #33's early design). Extracted `isRollingWindowInterval` and refactored the future branch to use it (pure refactor, #11/#27 suites green). 10 new tests incl. today-only escalation (past over-gap days stay plain 'missed') and precedence (done/skipped beat overdue). 192 tests passing.
- Completed: Task 2 (red-bright color + tint exemption)
  - Notes: tint exemption now the call-to-action set (today-missed, today-overdue); .red-bright fills #ff2d20 light / #ff453a dark (vivid vs the muted .red #d9534f/#b43c39 — subject to visual iteration); styles.css committed via the hunk-only blob technique (user's .habit-label edit excluded). 194 tests passing.

---
**Generated:** 2026-07-15
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/35
