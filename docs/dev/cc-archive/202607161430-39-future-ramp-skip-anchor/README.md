# Issue #39 - Future escalation ramp ignores skipped instances — forecast should use the completion-or-skip anchor

**Archived:** 2026-07-16
**Branch:** 39-future-ramp-skip-anchor
**Code SHA:** 9e98c2f
**PR:** #40
**Status:** Merged

## Summary

The #35 future escalation ramp (`future-too-early` → `future-ok` → `future-warning` → `future-overdue`) computed `daysSinceCompletion` from the last completion only, so after a skip the forecast disagreed with what the day would actually render when it arrived (daily habit completed 3 days ago, skipped yesterday and today → tomorrow painted red instead of light green). Fixed by anchoring the rolling-window ramp to `futureAnchorTime` = latest of last completion and last skip **on-or-before today** — deliberately today-INCLUSIVE, unlike the today escalation's strictly-before-today skip anchor from #37, because a skip ON today has no cell of its own to escalate but must still reset tomorrow's forecast. Thresholds (0.75x/1.25x/1.5x), colors, fixed-calendar future cells, today's cell, and `calculateStreak` all unchanged.

## Key Decisions

- **"Due then" forecast color is light green `future-ok`, never yellow** — user: "acknowledged, it should be green not yellow"; yellow stays reserved for `future-warning` and today's call to action. Pinned in chat before filing.
- **The forecast's skip anchor is today-inclusive** — the strict/inclusive asymmetry vs #37's today escalation is deliberate: reusing `lastSkipBeforeToday` for both branches passes most tests yet paints tomorrow red after skipping today (AC #1 fails).
- **Future-dated skips are out of scope** — the anchor scan caps at today; no known UI path creates future skips.

## Files Changed

- src/graphRenderer.ts — single skip scan feeds two accumulators (`lastSkipBeforeToday` strict, `lastSkipOnOrBeforeToday` inclusive); `futureAnchorTime` via `Math.max` with `lastCompletion` (synthetic 30-day fallback folds in cleanly); per-cell `daysSinceCompletion` renamed `daysSinceAnchor`
- src/__tests__/graphRenderer.test.ts — 6 new tests (reported bug, skip-on-today-only anchor pin, EVERY3 full ramp walk from skip, no-skips regression, fixed-schedule unaffected, today's cell still #37-governed); 210 total
- PROJECT_LORE.md — new ramp-anchor invariant with the inclusive/strict asymmetry pinned; coupling entry names `futureAnchorTime`

## Lessons Learned

- ~8 lines of production code, same shape as #37 one branch over; the only trap was the strict/inclusive asymmetry, which was identified during setup rather than debugging.
- Daily habits (interval 1) have an empty warning band — 1.25x–1.5x contains no whole day, so the forecast jumps green → red at gap 2; pre-existing threshold behavior, deliberately unchanged.
