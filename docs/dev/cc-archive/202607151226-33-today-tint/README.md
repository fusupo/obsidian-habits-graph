# Issue #33 - Replace '!' today marker with an SVG-native today indicator

**Archived:** 2026-07-15
**Branch:** 33-vertical-today-line
**Code SHA:** e3db478
**PR:** #34 (merged)
**Status:** Merged

## Summary

Removed the `!` character glyph that marked today's column (and the crowded
`!*` combination on days completed today). Today is now indicated by tinting
the cell's normal status color in place — a CSS `brightness()` filter
(darkened 0.7 in light theme, brightened 1.35 in dark theme) applied via a
`today` class modifier appended to the base color class. The yellow
`today-missed` cell is exempt: it is the graph's call-to-action and stays
full strength.

Presentation logic was made testable by extracting two pure static functions
from `renderGraph`: `markerForCell` (uniform `*`/`~`/none glyphs, no today
special-case) and `colorClassForCell` (status → color class + conditional
`today` modifier). 12 new tests; suite at 182.

## Key Decisions

- Marker position: cell center; line color: `--interactive-accent` (early
  line-based design, later superseded).
- Extract pure functions rather than adding jsdom for renderGraph coverage.
- Final design reached after five rejected today-indicator designs, iterated
  live against screenshots: center vertical line → glow/halo → accent line at
  0.5 opacity → tint overlay rect (dark, then light) → frame → flat purple
  cell → **in-place brightness tint on the normal status color, yellow
  exempt**.
- Yellow-wins rule pinned as a PROJECT_LORE invariant: the `today` tint
  modifier must exclude `today-missed` and only that; `today` is always
  appended to a base color class, never standalone.
- Follow-up question (due-today yellow vs. past-due red for rolling-window
  habits) split out as issue #35.

## Files Changed

- `src/graphRenderer.ts` — removed `!` glyph branch and all line/overlay
  rendering; added `markerForCell` and `colorClassForCell` pure statics
- `src/__tests__/graphRenderer.test.ts` — two new describes (12 tests)
- `styles.css` — `.today rect` brightness filters (light + `.theme-dark`)
- `README.md` — graph legend updated ("Tinted cell - Today")
- `PROJECT_LORE.md` — new invariant (yellow-wins tint rule), rewritten #28
  marker gotcha

## Lessons Learned

- Any today-indicator that overlays, tints, or replaces the yellow cell
  degrades the graph's primary signal, because yellow only ever appears on
  today. This killed all five overlay/replacement designs and forced the
  conditional in-cell approach.
- CSS specificity: `.habit-graph-svg .blue rect` (and `.theme-dark` variants)
  out-specify a sibling overlay class for rects inside color groups — overlay
  elements must not rely on class-only selectors beating the color rules.
- A bare `today` class renders an untinted transparent rect (the base fill
  comes from the color class), which is why the modifier is always appended,
  never standalone.
