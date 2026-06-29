# Render graph as SVG for mobile legibility - #24

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/24
- **State:** open
- **Labels:** none
- **Milestone:** none
- **Related Issues:** none

## Description

The current graph renders as a horizontal row of HTML `div` elements. At mobile layout widths the row is too wide to fit, requiring horizontal scrolling and making the graph hard to read.

Replace the HTML div-based rendering with SVG. Use a `viewBox` so the entire graph scales fluidly to the container width — no scrolling, no breakpoints. Each day cell becomes a `<rect>` with the same color semantics.

## Acceptance Criteria
- [ ] Graph renders as SVG instead of HTML divs
- [ ] Graph scales fluidly to container width via viewBox (no horizontal scrolling)
- [ ] Color semantics preserved: green=done, blue=rest, yellow=warning, red=overdue, gray=skipped
- [ ] Today marker (`!`) and completion marker (`*`) visible at small sizes
- [ ] Skipped marker (`~`) visible
- [ ] Habit label and streak count remain outside SVG as HTML
- [ ] `generateDayCells` unchanged (data model stays as-is)
- [ ] Works in both light and dark Obsidian themes
- [ ] Plugin loads and renders correctly on desktop and mobile widths

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 24-svg-graph-rendering
- **Current branch:** main

## Implementation Checklist

### Setup
- [ ] Fetch latest from main
- [ ] Create and checkout feature branch

### Task 1: Replace renderGraph HTML output with SVG
- Files: `src/graphRenderer.ts`
- Replace the body of `renderGraph()` (lines 115-251):
  - Keep outer container (`div.habit-graph-row`) and label as HTML
  - Replace `graphWrapper` + `graphContainer` + per-cell divs with a single `<svg>` element
  - Each DayCell → `<rect>` with fill color from a color map
  - Text markers (`*`, `!`, `~`) → `<text>` elements centered on the rect
  - SVG gets `width="100%"`, `height="20"`, no viewBox
  - Rects use percentage x/width: each cell = `(100/N)%` wide, x = `(100*i/N)%`
- Remove touch drag scroll handlers (lines 140-182) — no longer needed with fluid scaling
- Remove unused `recurrence` parameter (TS warning: declared but never read)
- Color map approach: define a `Record<string, string>` mapping status→fill color, use CSS custom properties for theme support
- Risk: Medium — core rendering rewrite, but interface (returns HTMLElement) stays the same

### Task 2: Update styles.css for SVG rendering
- Files: `styles.css`
- Remove HTML-specific styles that no longer apply:
  - `.habit-graph-wrapper` overflow/scroll styles
  - `.habit-graph` flex layout
  - `.habit-day` div styles (width/height/display/border)
  - `.habit-day:hover` transform (not relevant for SVG rects)
  - Mobile `@media` query for scrollable graph
- Add SVG-specific styles:
  - `.habit-graph-svg` — `width: 100%; height: auto; display: block;`
  - `.habit-day-rect` — stroke, CSS custom property fills for dark mode
  - Add `.habit-day.gray` / gray fill for skipped status (currently missing)
- Preserve: `.habit-graph-row`, `.habit-label`, error/empty states, dark mode color definitions
- Decision: use CSS classes on SVG `<rect>` elements (not inline fills) so dark mode works via `.theme-dark` selectors
- Risk: Low — straightforward CSS changes

### Task 3: Verify callers and test
- Files: `src/habitGraphView.ts`, `src/main.ts`
- Callers should need no changes since `renderGraph` still returns `HTMLElement`
- Verify `renderHabitGraphCodeBlock` in main.ts works (code block context)
- Build and visually verify in Obsidian
- Risk: Low — interface unchanged

### Quality Checks
- [ ] `npm run build` passes (no TypeScript errors)
- [ ] No remaining references to removed HTML classes in graphRenderer.ts
- [ ] Graph renders correctly in Obsidian sidebar view
- [ ] Graph renders correctly in code block embed
- [ ] Graph scales to narrow widths without scrolling
- [ ] Dark mode colors work correctly
- [ ] Today marker, completion markers, skipped markers all visible

## Technical Notes

### Architecture Considerations

**Interface stability:** `renderGraph()` returns `HTMLElement` — the outer container stays as an HTML div. Only the inner graph content changes from HTML divs to an SVG. Callers (`habitGraphView.ts`, `main.ts`) don't need changes.

**Color strategy:** Use CSS classes on SVG `<rect>` elements rather than inline `fill` attributes. This preserves the existing `.theme-dark` CSS pattern for dark mode support. The `fill` property on SVG rects can be set via CSS.

**No viewBox — percentage-based layout:** Instead of viewBox + preserveAspectRatio, the SVG uses `width="100%"` and fixed `height="20"`. Each rect gets percentage-based `x` and `width` calculated from cell count: cell width = `(100/N)%`, cell x = `(100*i/N)%`. This makes rects stretch to fill the container while keeping text in pixel coordinates (proportional, not distorted).

**Text in SVG:** `<text>` elements centered on rects via `text-anchor="middle"` and `dominant-baseline="central"`. Font size is fixed pixels (e.g. 10px), NOT relative to a viewBox. This is the key to keeping markers proportional while cells stretch.

### Current renderGraph structure (being replaced)
```
container div.habit-graph-row
  ├── labelContainer div.habit-label (+ optional streak span)  ← KEEP
  └── graphWrapper div.habit-graph-wrapper                     ← REPLACE with SVG
        ├── touch drag scroll handlers (JS)                    ← REMOVE
        └── graphContainer div.habit-graph                     ← REPLACE
              └── for each cell: div.habit-day                 ← REPLACE with <rect> + <text>
```

### SVG target structure
```
container div.habit-graph-row
  ├── labelContainer div.habit-label (+ optional streak span)  ← unchanged
  └── svg.habit-graph-svg [viewBox, width=100%]
        └── for each cell: <rect> + optional <text>
```

### Color map
```typescript
const COLOR_MAP: Record<string, string> = {
  'green': 'var(--habit-green)',
  'green-light': 'var(--habit-green-light)',
  'blue': 'var(--habit-blue)',
  'yellow': 'var(--habit-yellow)',
  'red': 'var(--habit-red)',
  'gray': 'var(--habit-gray)',
};
```

CSS custom properties defined in styles.css with `.theme-dark` overrides.

## Questions/Blockers

### Clarifications Needed
(All resolved — see Decisions Made)

### Blocked By
Nothing.

### Assumptions Made
- CSS custom properties for fill colors (supports dark mode cleanly)
- SVG rect elements can be styled via CSS classes (standard SVG/CSS behavior)

### Decisions Made
2026-06-29

**Q: How should SVG scale — proportional or stretch?**
**A:** Cells stretch to fill container width, but text/iconography stays proportional.
**Rationale:** Maximizes space usage at any width. Achieved by using percentage-based rect positioning (no viewBox) with fixed pixel font-size for text.

**Q: What height should the graph row be?**
**A:** Fixed ~20px.
**Rationale:** Matches current 18px cell height, keeps compact look.

## Work Log

### 2026-06-29 - Session 1
- Completed Task 1: Replaced renderGraph HTML with SVG — percentage-based rects, fixed font-size text, removed touch scroll handlers, removed unused recurrence param, updated 2 callers
- Completed Task 2: Rewrote styles.css — removed HTML div styles/scroll rules, added SVG rect/text fill rules, added gray/skipped color, updated dark mode
- Completed Task 3: Build passes (tsc + esbuild), 70/70 tests pass
- Ready for visual testing in Obsidian

---
**Generated:** 2026-06-29
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/24
