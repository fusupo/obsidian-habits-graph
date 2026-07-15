# Issue #27 - Support recurrence_anchor ('scheduled' vs 'completion') in scheduling semantics

**Archived:** 2026-07-14
**Branch:** 27-support-recurrence-anchor
**Code SHA:** fc3c26a
**PR:** #31
**Status:** Merged

## Summary

`TaskNote.recurrenceAnchor` was parsed from frontmatter but never consumed by the
renderer — interval habits always behaved as completion-anchored, fixed-day schedules
as scheduled-anchored. This work made the anchor real for interval habits:
scheduled-anchor interval habits with a `scheduled` date now compute due days at fixed
cadence from that date (ignoring completion history, never due before it), get binary
future cells (no escalation ramp), and streaks respect the fixed cadence.
`recurrence_anchor: completion` on BYDAY/BYMONTHDAY is a documented no-op with a
console.warn. The load-bearing design rule: scheduled-anchor interval habits SILENTLY
fall back to legacy rolling-window math when no scheduled date is available — since
'scheduled' is the frontmatter default, this fallback is what keeps every pre-#27 habit
rendering unchanged.

Verified end-to-end in the vault with a throwaway `FREQ=DAILY;INTERVAL=3` +
`scheduled: 2026-07-04` TaskNote (missed due day rendered red despite a later
off-cadence completion; future cells binary).

## Key Decisions

- **Silent fallback vs warning when anchor='scheduled' but no scheduled date?** Silent
  fallback to rolling-window math — nearly every existing habit hits this path;
  documented via JSDoc + PROJECT_LORE instead of console noise.
- **`recurrence_anchor: completion` on fixed-day schedules?** No-op + console.warn,
  mirroring the INTERVAL>1-with-BYDAY warn-and-ignore pattern.
- **Biweekly (BYDAY + INTERVAL=2) in scope?** No — separate follow-up issue once #27
  lands; this work unblocks it (scheduledDate now reaches isDueOn).
- **Future ramp for scheduled-anchor interval habits?** Dropped — binary
  future-ok/future-too-early like BYDAY (same reasoning as #11).
- **Today-cell misbehavior on non-due days?** Out of scope — that is issue #28, queued
  next.

## Files Changed

- `src/utils/recurrenceUtils.ts` — `ParsedRecurrence` interval variant gains `anchor`;
  `parseRecurrence(pattern, anchor = 'scheduled')`; `isDueOn(..., scheduledDate = null)`
  with the scheduled-anchor branch + silent fallback; completion-on-fixed-day warn
- `src/graphRenderer.ts` — `generateDayCells`/`calculateStreak` gain trailing
  `recurrenceAnchor`/`scheduledDate` params; binary future cells for scheduled-anchor
  interval habits with a real scheduled date
- `src/utils/dateUtils.ts` — new tolerant `parseISODateOrNull` (plan deviation:
  taskParser passes raw frontmatter strings; TaskNotes emits datetimes, bare
  `parseISODate` would throw and break rendering)
- `src/main.ts`, `src/habitGraphView.ts` — call-site wiring (both render paths)
- `src/__tests__/recurrenceUtils.test.ts`, `src/__tests__/graphRenderer.test.ts`,
  `src/__tests__/dateUtils.test.ts` (new) — 162 tests total (up from 132)
- `PROJECT_LORE.md` — silent-fallback invariant pinned; coupling entries reconciled

Commits: b26e131, 7c1032f, 4af9db9, 681b700, 0212ab4, d7ea9a5

## Lessons Learned

- The parser's *default* anchor is `'scheduled'`, so naively consuming the field would
  have flipped default behavior for every interval habit — the null-scheduledDate
  fallback is the backward-compatibility mechanism, not an edge case.
- Never trust frontmatter date strings at render time: `coerceDateValue` passes raw
  strings through, so a tolerant parser (`parseISODateOrNull`) beats a throwing one.
- A misleadingly-named legacy test ("off-cadence completion does not extend the
  streak") was factually wrong about existing behavior; renamed rather than changing
  semantics.
- `gh pr edit --add-label` can fail on the Projects-classic GraphQL deprecation; the
  REST fallback `gh api repos/{owner}/{repo}/issues/{n}/labels -f "labels[]=..."` works.
