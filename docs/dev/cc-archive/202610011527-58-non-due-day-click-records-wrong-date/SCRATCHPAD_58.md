# Clicking a non-due day on a fixed-schedule habit records the wrong date - #58

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/58
- **State:** open
- **Labels:** bug
- **Milestone:** none
- **Assignees:** none
- **Related Issues:**
  - Caused by: #47 / PR #48, click-to-record, released in 0.3.0
  - Related: #49, the manual Obsidian check, during which this bug was found

## Description
## Summary
On a habit anchored to its scheduled date (`recurrence_anchor: scheduled`, TaskNotes' default) with a fixed schedule, clicking a **non-due** day records the wrong date. TaskNotes moves the completion or skip onto a missed due day. The plugin's notice still reports the date you clicked, and clicking the same cell again marks earlier missed due days one after another. Released in 0.3.0 (#47 / #48).

## Repro
"Upper expander adjustment": `FREQ=WEEKLY;BYDAY=MO,FR,WE`, `recurrence_anchor: scheduled`, `scheduled: 2026-09-30`, with Wed 9/30 not done.
1. On Thu 2026-10-01, click today's cell.
2. The notice says **"Marked 2026-10-01 done"**.
3. In the frontmatter, `complete_instances` gained **2026-09-30** (not 10-01), and `scheduled` moved to 2026-10-02.

## Root cause (TaskNotes 4.13.6 `main.js`)
- **Both toggles move the date.** `toggleRecurringTaskComplete` (plan `yce`) and `toggleRecurringTaskSkipped` (plan `kce`) both pass the date through `fce(task, date)`.
  - For any anchor other than `completion`, `fce` calls `UUe`.
  - If the date is a due day of the rule, `UUe` keeps it.
  - Otherwise `UUe` returns the latest due day in a look-back window that is neither complete nor skipped. The window comes from `$Ue`: weekly max(90, 14×interval) days, daily max(30, 2×interval), monthly max(400, …).
  - If no such day exists, it returns the next due day on or after the date (`Ob`).
  - For `completion`-anchored habits `fce` returns null, so the date is used exactly. That's the only path #47 checked, which is why #47 wrongly concluded that "neither plan checks the date is an occurrence".
- **`scheduled` jumps forward on every toggle.** After any toggle, `yce` sets `scheduled` to the next due day on or after max(marked date, today) that isn't already done or skipped (`Cd` with `minOccurrenceDate`). Un-marking a date never moves `scheduled` back.
- **TaskNotes' own "complete" uses `scheduled`.** The list-view checkbox, kanban and the context menu with no date (`getTaskActionDate` / `qE` / `gM`) complete the `scheduled` date (or `due`), not today. So a `scheduled` left on a missed day makes TaskNotes complete that missed day.
- **`taskService.updateProperty(task, prop, value)` exists.** It's a generic write (plan `Tfe`): it sets the value and `dateModified` through TaskNotes' field mapper and cache, without recomputing anything about the recurrence.

## What goes wrong in 0.3.0
- Completing or skipping a non-due day on a scheduled-anchor habit records a different date. This includes interval habits anchored to their scheduled date, e.g. `FREQ=DAILY;INTERVAL=2`.
- The notice reports the clicked date, not the one that was written.
- `nextCycleAction` looks for the *clicked* date, so the next step in the cycle is chosen wrongly. Clicking the same off-day cell again marks 9/28, then 9/25, and so on.
- Un-marking the day you owed leaves `scheduled` on the next due day, so "undo" doesn't really undo.

## Proposed fix
Applies only to scheduled-anchor habits. Completion-anchored habits are already correct (with the DTSTART repair from #47).

**1. Pick the write path for each click.**
- **Due day** (by `isDueOn`): use the TaskNotes toggles, as now.
- **Non-due day:** write the exact date with `updateProperty`, mirroring the toggles' list changes. Done adds the date to `complete_instances` and removes it from skipped. Skip moves it from complete to skipped. Clear removes it.
  - Then set `scheduled` (also with `updateProperty`) the way TaskNotes would: the next due day on or after max(date, today) that isn't done or skipped.
  - This stops TaskNotes' own "complete" from later landing on a missed day.

**2. Undo puts `scheduled` back.** After a click clears day D, check:
- nothing after D is marked;
- the latest due day on or before D is blank;
- no other due day lies between that day and the `scheduled` TaskNotes would choose.

If all three hold, set `scheduled` to that latest due day. Examples for the Mon/Wed/Fri habit on Thu 10/1:

| Cleared | Result |
|---|---|
| Wed 9/30, nothing later marked | `scheduled` → Wed 9/30 |
| Thu 10/1 (non-due day), Wed 9/30 blank | `scheduled` → Wed 9/30 |
| Wed 9/30, but Thu 10/1 marked done | stays Fri 10/2 |
| Mon 9/28, Wed 9/30 also blank | stays Fri 10/2 (not a straight undo) |
| today or a future due day | whatever TaskNotes picks (already right) |

**3. Report what was actually written.** Compare `complete_instances` and `skipped_instances` before and after each click. The notice names the date that was actually written. If TaskNotes wrote a different date than the one clicked (e.g. `isDueOn` and TaskNotes' RRULE expansion disagree on whether it's a due day), say so plainly instead of claiming success.
- Known area of disagreement: scheduled-anchor interval habits with no `scheduled` date. Our check falls back to every-N-days math, while TaskNotes counts from DTSTART.

## Acceptance Criteria
- [x] Clicking a non-due day on a scheduled-anchor habit records exactly that date, and done → skipped → blank stays on that date
- [x] After marking a non-due day, `scheduled` is the next due day that isn't done or skipped (Thu 10/1 → Fri 10/2)
- [x] The undo rule matches the table above
- [x] The notice always reports the date that was actually written, and says so when it differs from the click
- [x] Due-day clicks and completion-anchored habits behave exactly as before; the 840-ordering test still passes
- [x] The fake TaskNotes in `taskNotesBridge.test.ts` copies how real TaskNotes moves dates (`UUe`), how it recomputes `scheduled` after a toggle, and `updateProperty`; the repro above is a test
- [x] PROJECT_LORE:
  - correct the taskNotesBridge coupling (the toggles only use the exact date for completion-anchored habits and for due days)
  - add an exception: the plugin sets `scheduled` itself in the two cases above, using `isDueOn`, and checks the result after writing

## Context
- Found while manually checking #49.
- Workaround until fixed: on fixed-schedule habits, only click due days.

## Acceptance Criteria
- [x] Clicking a non-due day on a scheduled-anchor habit records exactly that date, and done → skipped → blank stays on that date
- [x] After marking a non-due day, `scheduled` is the next due day that isn't done or skipped (Thu 10/1 → Fri 10/2)
- [x] The undo rule matches the issue's table
- [x] The notice always reports the date that was actually written, and says so when it differs from the click
- [x] Due-day clicks and completion-anchored habits behave exactly as before; the 840-ordering test still passes
- [x] The fake TaskNotes copies how real TaskNotes moves dates (`UUe`), how it recalculates `scheduled` after a toggle, and `updateProperty`; the repro is a test
- [x] PROJECT_LORE corrected (the toggles only keep the exact date for completion anchors and due days) and the exception for setting `scheduled` recorded

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 58-non-due-day-click-records-wrong-date
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Fetch latest from base branch
- [x] Create and checkout feature branch

### Implementation Tasks

- [x] **Task 1: Pure due-day helpers**
  - Files affected: `src/utils/scheduledAnchor.ts` (new), `src/__tests__/scheduledAnchor.test.ts` (new)
  - Why: The core of the fix, kept free of Obsidian and TaskNotes imports so it can be unit-tested. It follows the `completionAnchorRepair.ts` pattern.
  - Inputs: TaskNotes' raw snake_case fields and UTC-midnight `Date`s. Read dates with UTC accessors only.
  - Functions:
    - `isDueDay(recurrence, anchor, date, completeInstances, scheduled)`
      - Wraps `parseRecurrence` and `isDueOn`.
      - Call `parseRecurrence` only when the anchor isn't `completion`; it warns on fixed-day rules otherwise.
      - `scheduledDate` = `parseISODateOrNull` on a string `scheduled`.
      - `lastCompletionBefore` = the latest completion strictly before the date. Only the rolling-window fallback uses it, and that fallback stays silent (lore).
    - `chooseWritePath(state, date)` → `'toggle'` when the anchor is `completion`, the recurrence isn't a string, or the day is due; otherwise `'exact'`.
    - `isScheduleModeled(recurrence, anchor, scheduled)` → false for:
      - `INTERVAL` combined with BYDAY or BYMONTHDAY
      - `BYSETPOS`, `COUNT`, `UNTIL`
      - `YEARLY`, or plain `MONTHLY`
      - no `DTSTART` in the string
      - a rolling-window interval (scheduled anchor with no `scheduled`)

      For these, the exact date is still written but `scheduled` is left alone (Decision 4).
    - `nextUnhandledDueOnOrAfter(state, from, boundDays)`: the first due day on or after `from` that is in neither list. Bound: 400 days plus the interval for interval rules; return null if nothing is found.
    - `latestDueOnOrBefore(state, date, boundDays)`
    - `exactInstanceLists(complete, skipped, dateStr, action)`: copies the toggles' list changes.
      - complete → add to complete, drop from skipped
      - skip → drop from complete, add to skipped
      - unskip → drop from skipped
    - `scheduledAfterMark(state, dateStr, today)`: the next unhandled due day on or after max(date, today).
    - `undoScheduledTarget(stateAfter, clearedDate, today, scheduledNow)`:
      - S = the latest due day on or before the cleared date D.
      - Return S only if all hold: D ≤ today; S is blank; nothing is marked after S; no due day lies strictly between S and `scheduledNow`; and S ≠ `scheduledNow`.
      - Otherwise return null.
    - `withScheduledSuffix(oldScheduled, newDate)`: keeps a time suffix such as `T09:00`, the way TaskNotes' `hce`/`Cte` does.
  - Tests:
    - due-day boundaries for weekly BYDAY and BYMONTHDAY
    - interval rules with and without `scheduled`
    - `scheduled` that isn't a string
    - the search bound
    - every row of the undo table
    - the time suffix
    - each unmodeled rule shape

- [x] **Task 2: Instance diff and truthful outcome text**
  - Files affected: `src/utils/scheduledAnchor.ts` (or a small `instanceDiff.ts`), tests
  - Why: The notice must name the date that was actually written (issue item 3).
  - Notes:
    - `diffInstances(before, after)` returns `{complete:{added,removed}, skipped:{added,removed}}` as set differences.
    - `describeOutcome(clickedDateStr, action, diff)` returns `{writtenDate | null, matchedClick, message}`.
  - Messages:
    - a match keeps today's text: `Marked 2026-10-01 done` / `… skipped` / `… cleared`
    - a mismatch: `Clicked 2026-10-01, but TaskNotes recorded 2026-09-30 as done instead. Click 2026-09-30 to undo it.`
    - nothing changed: `Nothing changed for 2026-10-01.`
  - Tests: each action, each mismatch shape, and an unexpected extra change.

- [x] **Task 3: Make the fake TaskNotes behave like the real one (test-only commit)**
  - Files affected: `src/__tests__/taskNotesBridge.test.ts`
  - Why: The #47 fake used exact dates for every anchor, so the tests couldn't catch this bug. This is the main lesson of #58.
  - Keep: the completion-anchor branch and its `rescheduled()` DTSTART+14 untouched, so the 840-ordering test still expects `2026-10-06`.
  - Occurrence source: an **independent** mini expander, not our `isDueOn`.
    - It handles `FREQ=WEEKLY;BYDAY` (plus `INTERVAL`) and `FREQ=DAILY;INTERVAL`, with DTSTART as the lower bound.
    - Because it's independent, the disagreement path can be tested. Keep the supported shapes to a minimum.
  - Fake `fce`/`UUe`, for anchors other than completion:
    - keep the date if it's an occurrence
    - otherwise take the latest unhandled occurrence in [date − window, date], where the window is DAILY max(30, 2n), WEEKLY max(90, 14n), MONTHLY max(400, 62n), else 365
    - otherwise take the next occurrence ≥ date
  - Fake `yce`/`kce`: list changes as now, then `scheduled` = the first unhandled occurrence ≥ max(target, today), keeping the time suffix.
  - Fake `updateProperty(task, prop, value, options)`:
    - handles only `complete_instances`, `skipped_instances` and `scheduled`, and throws on any other property
    - sets the value and `dateModified`
    - **copies the clearing of instances ≥ the new `scheduled`**, unless `confirmClearInstances` resolves false (then it writes nothing)
    - keeps a call log
  - `getTaskInfo` returns a clone.
  - Fix existing tests that click non-due days with `recurrence_anchor: 'scheduled'` + `INTERVAL=2` (e.g. 9/18, 9/06). Point them at due days, or switch them to a BYDAY habit, keeping what each test proves.
  - Update the exact `toEqual` on `CycleResult` shapes.
  - Add a characterization test: the fake's own toggle on Thu 10/1 records 9/30 (checks the fake against the issue).

- [x] **Task 4: Truthful reporting on the toggle path**
  - Files affected: `src/tasknotes/taskNotesBridge.ts`, its test
  - Why: Even when our due-day check is wrong, the user must see what was actually written (Decision 3: report it, don't auto-correct).
  - Notes:
    - Extend `TaskNotesTaskState` with `scheduled?`, `due?` and `recurrence?`.
    - `cycleDay` diffs the pre-click read against the post-click read; the DTSTART repair is net-zero as a set.
    - The `done` result gains `writtenDate`, `matchedClick` and `message`.
    - `recordDayClick` shows `result.message`.
  - Tests:
    - Disagreement: an `INTERVAL=2;BYDAY` rule. The fake expands it as every other week, while `isDueOn` treats it as weekly. Click a Monday in the off week and assert the mismatch notice. Mock `console.warn` so the run stays quiet.
    - Notices for normal clicks are unchanged.

- [x] **Task 5: Exact-date path and the forward `scheduled` rule**
  - Files affected: `src/tasknotes/taskNotesBridge.ts`, its test
  - Why: Issue item 1. A non-due day on a scheduled-anchor habit gets exactly the clicked date, and `scheduled` moves past it the way TaskNotes would.
  - Notes:
    - Add `updateProperty(task, prop, value, options?)` to `TaskNotesService`, as optional (see Task 7). Call it as a method, `bridge.service.updateProperty(...)`.
    - `cycleDay` takes `today = getTodayUTC()` as a trailing default parameter (so does `recordDayClick`).
    - **Write order:** each list only if it changed; then `scheduled` last, and only if `isScheduleModeled` and the value differs. Always pass `{ confirmClearInstances: async () => false }`.
    - **Never use `updateTask`.** It can't write an empty `skipped_instances`, and it has side effects (tags, DTSTART injection, title handling).
    - **After the writes:** re-read with `getTaskInfo` and diff.
      - If `scheduled` was refused (later days are marked), the notice says `scheduled` was left as is.
      - If the lists don't match the plan (e.g. a future TaskNotes ignores the refusal), rewrite them from the pre-click snapshot and report an error.
      - If a write throws after another succeeded, restore the lists from the snapshot and report the error with the date.
    - Leave `due` alone (Decision 2).
  - Tests:
    - **Repro:** MO/WE/FR, today Thu 2026-10-01, `scheduled` 9/30, Wed 9/30 unhandled. Click 10/1 → `complete_instances` gains `2026-10-01`, `scheduled` = `2026-10-02`, notice `Marked 2026-10-01 done`. No toggle calls; `updateProperty` calls in order.
    - The off-day cycle done → skipped → blank stays on 10/1.
    - Due-day and completion-anchor clicks still use the toggles.
    - When a later day is already marked, `scheduled` is refused and the lists stay intact; the notice says so.
    - The time suffix is preserved.
    - An unmodeled rule writes the exact date and leaves `scheduled` alone; the notice says so.

- [x] **Task 6: Undo puts `scheduled` back**
  - Files affected: `src/tasknotes/taskNotesBridge.ts`, its test
  - Why: Issue item 2. Clearing the day you owed makes it owed again.
  - Notes:
    - Only the step that clears a day (`unskip`) counts as undo; done → skipped leaves `scheduled` alone. Applies on either path.
    - `scheduledNow` = the `scheduled` read back after TaskNotes' toggle, or the value we computed on the exact path.
    - If `undoScheduledTarget` returns a date, write it with `updateProperty('scheduled', …)` with the refusal, then check the result.
  - Tests (MO/WE/FR, Thu 2026-10-01):

    | Setup | Expected |
    |---|---|
    | Wed 9/30 done → skipped → cleared, nothing later marked | `scheduled` 9/30 |
    | Thu 10/1 done → skipped → cleared, 9/30 blank | `scheduled` 9/30 (10/2 after "done") |
    | 10/1 done; 9/30 skipped then cleared | stays 10/2 |
    | 9/28 skipped then cleared, 9/30 blank, `scheduled` 10/2 | stays 10/2 |
    | future due day cleared | no `updateProperty`; TaskNotes' value |

    Plus three more: a marked off-day between S and D blocks the restore; D after today blocks it; a failed `scheduled` write is reported truthfully.

- [x] **Task 7: Missing `updateProperty`: refuse only off-days**
  - Files affected: `src/tasknotes/taskNotesBridge.ts`, its test, `src/ui/habitRow.ts` (comment only)
  - Why: Decision 1. Due days and completion-anchored habits can still be recorded exactly through the toggles.
  - Notes:
    - `resolveTaskNotesBridge` still requires the three toggles and `getTaskInfo`, and adds `canWriteExactDate = typeof updateProperty === 'function'`.
    - An off-day click without it shows `TaskNotes' updateProperty isn't available, so this day can't be recorded exactly. Nothing was written.` and writes nothing. **Never fall back to the toggles**, because that is the bug.
    - Update the comment on the number of writes in `habitRow.ts` (the rerender already waits for an in-flight click, so there's no logic change).
  - Tests: resolving without `updateProperty`; an off-day click gives the notice and makes zero writes; a due-day click still works.

- [x] **Task 8: PROJECT_LORE and README**
  - Files affected: `PROJECT_LORE.md`, `README.md`
  - Lore:
    - Correct the taskNotesBridge coupling: the toggles keep the exact date only for completion anchors and due days; other anchors go through `fce`/`UUe`.
    - Add an invariant: the plugin sets `scheduled` itself in two cases (marking an off-day, and undo) using `isDueOn`; lists are written first and `scheduled` last, always with a refusing `confirmClearInstances`, because `updateProperty('scheduled')` deletes instances ≥ the new date.
    - Add a gotcha: never use `updateTask` for the lists, because it can't write an empty `skipped_instances`.
    - Add a known limit: `due` is not shifted when the plugin moves `scheduled`.
    - Add a gotcha: the TaskNotes "complete" menu uses `scheduled`, not today.
  - README: one or two sentences in "Record or Backfill Days" on non-due days for fixed-schedule habits (exact date; `scheduled` moves to the next due day; undo puts it back).

### Quality Checks
- [x] `npx jest --runInBand`
- [x] `npm run build` (tsc + esbuild), run AFTER jest and never at the same time
- [x] Self-review for code quality
- [x] Verify acceptance criteria met
- [ ] Manual check in Obsidian (desktop) on "Upper expander adjustment":
  - [ ] off-day click → exact date, `scheduled` → next due day
  - [ ] the off-day done → skipped → blank cycle stays put
  - [ ] clearing Wednesday restores `scheduled` 9/30
  - [ ] TaskNotes' own "complete" afterwards lands on the right date

### Documentation
- [x] PROJECT_LORE.md (Task 8)
- [x] README (Task 8)

## Technical Notes

### Verified TaskNotes facts (4.13.6 `main.js`; checked by me and by the planner)
- **The toggles move the date.** `toggleRecurringTaskComplete` builds plan `yce`; `toggleRecurringTaskSkipped` builds `kce`. Both pass the date through `fce(task, date)`.
  - For a `completion` anchor, `fce` returns null, so the exact date is used.
  - Otherwise `fce` calls `UUe`, which keeps an occurrence; else takes the latest unhandled occurrence in the look-back window (`$Ue`); else takes the next occurrence (`Ob`).
- **How `scheduled` is recalculated.** `yce`/`kce` set `scheduled = Cd(..., {minOccurrenceDate: max(dateStr, today)})`, the first unhandled occurrence ≥ that day.
  - This keeps a time suffix and may shift `due` (`maintainDueDateOffsetInRecurring`).
  - Un-marking never moves it back.
  - If nothing is found within the search horizon (`Ite`), `scheduled` is unchanged.
- **Which date the TaskNotes UI uses.** List, kanban and the context menu (no date) complete `scheduled` (or `due`), not today (`getTaskActionDate`, `qE`, `gM`).
- **`updateProperty(task, prop, value, options)`:**
  - plan `Tfe`; `_qe` passes our properties through unchanged; `kfe` maps internal names to the user's field names; `bfe` writes
  - stamps `dateModified`
  - `applyPropertyChangeSideEffects` → `Dqe` waits for fresh data, then `updateTaskInfoInCache`, so `getTaskInfo` is fresh right after the await
  - fires `EVENT_TASK_UPDATED`, plus webhook and calendar sync if enabled
- **Hazard (verified):** `updateProperty('scheduled', S)` on a recurring task whose old `scheduled` is a string and differs from S **removes every complete/skipped instance ≥ S**, unless `options.confirmClearInstances` resolves false. In that case it returns without writing anything.
- **`updateTask`:** goes through `mz` (`mapToFrontmatter`), which skips an empty `skipped_instances`. It also re-normalizes tags, can inject DTSTART, and handles title and status. Unsafe for this.
- **Google sync:** `mM` on a `scheduled` change only matters for Google-synced habits.
- **Implicit DTSTART:** with no DTSTART in the string, TaskNotes uses `scheduled` as DTSTART. Moving `scheduled` would then move the start of the occurrences, which is why `isScheduleModeled` is false for those rules.

### Architecture Considerations
- New pure logic goes in `src/utils/scheduledAnchor.ts`; the bridge stays the only place that touches TaskNotes. `buildHabitRow` and `habitRow.ts` wiring don't change (lore coupling).
- New params are trailing, with defaults (`today`).
- Dates stay UTC-midnight; `getTodayUTC()` gives today.
- The completion-anchor path, the DTSTART repair and the 840-ordering test are untouched.

### Implementation Approach
1. The pure helpers and diff come first, with full tests.
2. Then the fake is made to behave like TaskNotes, so the bug shows up in tests before it's fixed.
3. Then truthful reporting (a safety net for every path).
4. Then the exact path, then undo, then the missing-API case.
5. Lore and README last.

Click flow:
1. Click
2. Resolve the bridge, take the lock, read state (before)
3. `chooseWritePath`
   - toggle path: toggle → read → DTSTART repair (completion anchor)
   - exact path: lists → `scheduled` (refusal) → read
4. If the click cleared a day, run the undo check and maybe write `scheduled`, then read
5. Diff before and after, then show the notice built from what was actually written
6. Release the lock

### Potential Challenges
- **Data loss** from `updateProperty('scheduled')` clearing instances. Guarded by the refusal option, the write order, the check after each write and the snapshot restore.
- **Our due-day check and TaskNotes disagree** on unmodeled rules: the toggle path can still move dates. That gets reported, not prevented (Decision 3).
- **More writes per click** (2–3 on the exact path). The in-flight lock and the 100 ms rerender that waits on it already cope; webhooks and calendar sync fire per write.
- **Occurrence notes:** the exact path doesn't create occurrence notes for off-days. Acceptable, since off-days aren't occurrences.
- **Existing scheduled-anchor tests change meaning** under the new fake (Task 3). Keep what each one proves.

## Questions/Blockers

### Clarifications Needed
(none; all resolved below)

### Blocked By
Nothing.

### Assumptions Made
- **Undo rule** (slightly stricter than the issue's wording): "nothing marked after S" rather than after D, and only when D ≤ today. It gives the same results on all five table rows. It also never sets `scheduled` below a marked day, which `updateProperty` would delete anyway.
- **Only the clearing step counts as undo.**
- **The search bound is 400 days** (plus the interval length).
- **No auto-correction** of moved dates (see Decision 3).

### Decisions Made
2026-10-01 (setup Q&A)

**Q: If `updateProperty` is missing, what should clicks do?**
**A:** Only off-days refuse, with a notice; due days and completion-anchored habits still work through the toggles.
**Rationale:** Most clicks still work, and off-days never fall back to the date-moving toggles.

**Q: What happens to `due` when the plugin moves `scheduled`?**
**A:** Leave `due` alone; record it as a known limit.
**Rationale:** Copying TaskNotes' due offset means reading another undocumented setting, and the user's habits don't use `due`.

**Q: If TaskNotes still moves a date (our due-day check is wrong for that rule)?**
**A:** Report it: the notice names the date written and which cell to click to undo it.
**Rationale:** Auto-correcting adds writes and more ways to fail.

**Q: For rules our check doesn't fully understand, should off-day clicks still move `scheduled`?**
**A:** Write the exact date, leave `scheduled` alone, and say so.
**Rationale:** Don't guess the next due day where our model may be wrong.

## Work Log

### 2026-10-01 - Session
- Commit policy (user): commit each task on the branch, no push.
- Completed: Task 1 (`src/utils/scheduledAnchor.ts`, 53 tests), commit 9d54d31
  - **Due = an occurrence counted from DTSTART** (or `scheduled` when there's no DTSTART), as TaskNotes expands the rule. The graph's rule isn't usable here: it anchors interval cadences on `scheduled` and treats nothing before it as due, so undo would never find yesterday's due day once TaskNotes had moved `scheduled` past it. Days before DTSTART are never due, so a click there takes the exact path; the toggles would move it.
  - `isScheduleModeled` needs DTSTART, and allows only these parameters: FREQ, INTERVAL, BYDAY, BYMONTHDAY, WKST. It accepts:
    - DAILY with any interval
    - WEEKLY without BYDAY (any interval), or with plain BYDAY at interval 1
    - MONTHLY with plain BYMONTHDAY 1–31 at interval 1
  - Renamed `scheduledAfterMark` → `scheduledAfterClick`. It applies to every click on the exact path, because TaskNotes recalculates `scheduled` on every toggle (mark or clear).
  - `scheduledAfterClick` and `undoScheduledTarget` return null for rules we don't model, so `scheduled` is left alone (Decision 4).
  - Exported `parseRRuleParams` from recurrenceUtils.
- Completed: Task 2 (`src/utils/instanceDiff.ts`, 8 tests)
  - The status (done/skipped/cleared) comes from the diff, not from the click's action, so the notice always matches the file.
  - The mismatch hint is "Click X to change it", not "to undo it": undoing a done day takes two clicks (done → skipped → blank).
  - `describeOutcome` takes no action parameter; `ClickOutcome` = {matchedClick, changes, message}.
- Completed: Task 3 (test fake, 27 tests in the bridge suite)
  - The fake's `isOccurrence` handles DAILY and WEEKLY (with or without BYDAY), each with INTERVAL, counted from DTSTART, with Monday as the start of the week. It is independent of `isDueOn`.
  - The completion-anchor branch is unchanged, so the 840-ordering test still expects 10-06.
  - The fake service is built as a variable before going into the bridge literal, so `updateProperty` passes the excess-property check before it's in `TaskNotesService` (Task 5 adds it).
  - Scheduled-anchor tests use `MWF_HABIT`. 9/18 is a Friday, so most keep their dates. The "never repairs" test now clicks Mon 9/07 with 9/21 done.
  - `UPPER_EXPANDER` is the real habit's lists from the screenshot (many completions on off days).
- Completed: Task 4 (truthful notices, 28 bridge tests)
  - The diff runs from the pre-click read to the post-click read, before the DTSTART repair (which is net-zero on the lists). The `done` result gains `matchedClick` and `message`; `recordDayClick` shows `message`.
  - The disagreement test uses every other Monday (`DTSTART:20260706;FREQ=WEEKLY;INTERVAL=2;BYDAY=MO`). The plugin reads it as every Monday, so it will still take the toggle path after Task 5, and the test stays valid.
- Completed: Task 5 (exact path, 39 bridge tests, 334 total)
  - Tests were written first; 8 of 11 failed on behaviour before the fix. The 3 that passed (due days and completion anchor use the toggles) describe behaviour the fix must keep.
  - **Split:** the exact-date writes went to `src/tasknotes/exactDayWrite.ts` (127 lines), because the bridge reached 357 lines. It imports only types from the bridge, so there's no runtime cycle. Lore must say "src/tasknotes/", not just the bridge file (Task 8).
  - `CycleResult` gains `writePath: 'toggle' | 'exact'`. `cycleDay` and `recordDayClick` take a trailing `today = getTodayUTC()`.
  - The missing-`updateProperty` check and its message are already in `writeExactDay`; Task 7 adds the tests.
  - Error handling:
    - List writes: restore every list attempted, including the one that threw.
    - Scheduled write throwing: the day stays recorded; the notice says "couldn't move scheduled".
    - Drift after a scheduled move: put the planned lists back and report an error.
    - Refusal: detected because `scheduled` didn't change after the write.
  - Notices name `scheduled` only when it isn't what you'd expect (refused, unmodeled rule, write failed).
- Completed: Task 6 (undo, 342 tests total)
  - `moveScheduled(bridge, path, expected, target)` in exactDayWrite.ts: write with KEEP_INSTANCES, re-read, put back any deleted days (error), and give a note when `scheduled` didn't land. It's used by the exact path and by the toggle path's undo.
  - `undoScheduledTarget` now returns null for completion-anchored habits, whose undo comes from the DTSTART repair.
  - Toggle path: if `updateProperty` is missing, the clear still happens and only the `scheduled` undo is skipped, with no note.
  - The notice gains "; scheduled back to X" when undo restores it.
  - Task 5's off-day cycle test now expects the undo, because `UPPER_EXPANDER` has Wed 9/30 blank.
- Completed: Task 7 (345 tests total)
  - No `canWriteExactDate` flag was needed: `resolveTaskNotesBridge` stays as it was (`updateProperty` is optional on the interface), and the exact path checks for it at click time.
  - Tests:
    - the bridge resolves without `updateProperty`
    - an off-day click gives the notice, writes nothing, and calls no toggles
    - a due day still records
    - the toggle-path undo is skipped (Task 6 test)
  - Updated the comment in `habitRow.ts` on the number of writes.
- Completed: Task 8 (lore + README)
  - Coupling corrected to cover src/tasknotes/ and `updateProperty`, with the date-moving explained. New coupling: the fake must copy TaskNotes' real rules.
  - New invariant: `moveScheduled` and the two cases where the plugin sets `scheduled`.
  - New gotchas: due days count from DTSTART, unlike the graph; never use `updateTask` for the lists; `due` isn't shifted (known limit). The `getTaskInfo` freshness gotcha now also covers `updateProperty`.
  - README: one paragraph in "Record or Backfill Days".

### 2026-10-01 - Session Complete
- All 8 implementation tasks are complete: 8 commits (9d54d31..b0a4720) on `58-non-due-day-click-records-wrong-date`, not pushed.
- Quality checks: 345 tests pass (was 256), tsc clean, production build OK. `main.js` was rebuilt in the plugin folder, so reloading the plugin in Obsidian picks it up.
- Self-review: `toggleDay` and `writeExactDay` read cleanly.
  - Edge case accepted: if our due-day check is wrong and TaskNotes moves a *clear*, undo still works from TaskNotes' real result. It needs the owed day blank and nothing marked after it, so it can't land somewhere harmful.
- All acceptance criteria are met by the automated tests. The manual Obsidian check is still open.
- Ready for PR: yes (manual check can happen before or after the PR).

---
**Generated:** 2026-10-01
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/58
