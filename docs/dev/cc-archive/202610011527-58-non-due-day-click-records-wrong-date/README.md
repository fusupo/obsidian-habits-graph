# Issue #58 - Clicking a non-due day on a fixed-schedule habit records the wrong date

**Archived:** 2026-10-01
**Branch:** 58-non-due-day-click-records-wrong-date
**Code SHA:** 4cdf00c
**PR:** #59
**Status:** Merged. The manual Obsidian check is still open (see below).

## Summary

In 0.3.0, clicking a day that isn't a due day on a habit that repeats from its scheduled date (TaskNotes' default) recorded a different day. TaskNotes' toggles move such a date onto the latest missed due day, but the plugin's notice still named the day you clicked. Clicking again marked earlier missed days one after another.

The fix:
- **Off days** are written exactly with TaskNotes' `updateProperty`. Then `scheduled` moves to where TaskNotes' toggles would put it: the first due day on or after the later of that day and today that isn't done or skipped.
- **Due days and completion-anchored habits** still go through the toggles, as before.
- **Undo:** clearing the day you owed puts `scheduled` back on it, when nothing later is marked and no other due day lies in between.
- **Notices** come from a before/after diff of `complete_instances` and `skipped_instances`, so they always name the date that was actually written.

## Key Decisions

- **No `updateProperty`** (an older or changed TaskNotes): only off-day clicks refuse, with a notice, and nothing is written. Due days and completion-anchored habits still work. Off days never fall back to the toggles, because that fallback is the bug.
- **`due` is left alone** when the plugin moves `scheduled`. This is a known limit, recorded in the lore.
- **If TaskNotes still moves a date** (our due-day check disagrees with its rule expansion), the plugin reports it and doesn't auto-correct. The notice names the date written and the cell to click.
- **Rules the plugin doesn't fully model** (no DTSTART, INTERVAL with BYDAY, COUNT/UNTIL, yearly and others): the exact date is written, `scheduled` is left as is, and the notice says so.
- **Data-loss guards.** `updateProperty('scheduled')` deletes every instance on or after the new date unless `confirmClearInstances` resolves false. So the lists are written first and `scheduled` last, with that option refusing. The plugin then re-reads the task and puts back anything deleted anyway.

## Files Changed

- **`src/utils/scheduledAnchor.ts`** (new): due days counted from DTSTART, `chooseWritePath`, `isScheduleModeled`, `scheduledAfterClick`, `undoScheduledTarget` and the exact list changes.
- **`src/utils/instanceDiff.ts`** (new): `diffInstances` and `describeOutcome`, which build the notice from what was actually written.
- **`src/tasknotes/exactDayWrite.ts`** (new): `writeExactDay` and `moveScheduled`. These were split out of the bridge when it reached 357 lines.
- **`src/tasknotes/taskNotesBridge.ts`**: `cycleDay` dispatches to the exact path or the toggles. Changes:
  - optional `updateProperty`
  - a trailing `today` param
  - `CycleResult` gains `writePath`, `matchedClick` and `message`
- **`src/utils/recurrenceUtils.ts`**: `parseRRuleParams` is now exported.
- **`src/ui/habitRow.ts`**: a comment only.
- **Tests** (256 → 345):
  - `scheduledAnchor.test.ts` (54)
  - `instanceDiff.test.ts` (8)
  - `taskNotesBridge.test.ts` (49). Its fake TaskNotes now copies the real date moving (`fce`/`UUe`), the `scheduled` recalculation (`Cd`) and `updateProperty` deleting instances.
- **`PROJECT_LORE.md`, `README.md`**:
  - lore: a corrected TaskNotes coupling, the fake coupling, the `moveScheduled` invariant and four gotchas
  - README: a paragraph on off days and undo

## Still Open

The manual check in Obsidian (desktop) on "Upper expander adjustment" (MO/WE/FR) hasn't been done. It covers:
- clicking an off day: the exact date is recorded, and `scheduled` moves to the next due day
- the off-day cycle done → skipped → blank stays on that day
- clearing Wednesday puts `scheduled` back to 9/30
- TaskNotes' own "complete" afterwards lands on the right date

The real habit also still has Wed 9/30 marked done by the 0.3.0 bug. Clicking that cell twice (done → skipped → blank) clears it.

## Lessons Learned

- **#47's fake TaskNotes recorded every click on the exact date,** so every test passed while real TaskNotes moved off-day clicks. #47 had only checked the completion-anchor path, where `fce` returns null. Check the fake against TaskNotes' `main.js` for every anchor, not just the one being built.
- **TaskNotes' own "complete"** (list checkbox, kanban, context menu) acts on `scheduled`, not today. So where `scheduled` sits decides which day TaskNotes completes next. That is why the plugin moves it on off-day clicks and undo.
- **`updateTask` looks like the obvious way to write the lists, but it's unsafe.** It skips an empty `skipped_instances`, re-normalizes tags and can inject DTSTART. `updateProperty` writes as given.
- **Writing the new tests before the fix proved them:** 8 of 11 failed on behaviour first. The 3 that passed describe behaviour the fix had to keep: due days and completion-anchored habits still use the toggles.

## Session Log

`SESSION_LOG_1.md` covers the session from 2026-09-29 up to auto-compaction:
- archiving #47
- pushing the manifest, bumping to 0.3.0 and cutting the first GitHub release
- filing improvement issues #49–#57
- diagnosing the off-day bug and filing #58
- setting up and building #58, opening PR #59, and the cleanup after the merge
