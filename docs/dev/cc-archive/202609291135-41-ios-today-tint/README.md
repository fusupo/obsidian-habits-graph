# Issue #41 - Today tint invisible on iOS — WebKit ignores CSS filter on SVG elements

**Archived:** 2026-09-29
**Branch:** 41-ios-today-tint
**Code SHA:** 68591b9
**PR:** #42
**Status:** Merged

## Summary

The #33 today tint was a CSS `filter: brightness()` on the today cell's `<rect>`. iOS Obsidian's WebKit silently ignores CSS `filter` on SVG elements, so today looked like any other day on mobile. Replaced the two brightness-filter rules with explicit per-base `.X.today rect` fills (green/blue/gray × light/dark = six rules), using the exact 0.7x/1.35x values the filter produced. CSS-only; no renderer or test changes.

## Key Decisions

- **Explicit secondary fills instead of an overlay rect or SVG `<filter>`.** Marc: "wouldn't it just be easier to have a secondary color for this purpose". Only three tinted combos exist and they're already pinned by tests, so the filter's generality bought nothing, and plain fills work in every engine. Accepted trade-off: any future status that can appear on a non-call-to-action today needs its own `.X.today` fill pair (recorded as a lore coupling).

## Files Changed

- styles.css — removed the `filter: brightness()` rules; added six `.X.today rect` fills
- PROJECT_LORE.md — rewrote the #33 invariant (per-base fills, not a brightness filter); added the enumeration coupling entry and the WebKit CSS-filter gotcha

## Lessons Learned

- WebKit ignores CSS `filter` on SVG elements but renders SVG `<pattern>` fills. Anything that looks right on desktop Chromium needs an iOS check.
- The acceptance-criteria and visual-check boxes in the scratchpad were never ticked, but the work shipped in #42.
