# Replace text-based today marker with a vertical today line in the SVG graph - #33

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/33
- **State:** open
- **Labels:** enhancement
- **Milestone:** (none)
- **Assignees:** (none)
- **Related Issues:**
  - Related: #24 (SVG rewrite that makes this possible), #28 (non-due today renders
    'rest' relying on the `!` marker for findability — the line takes over that role)

## Description

The graph marks today with text glyphs rendered inside the SVG: `!` on today's cell,
or a crowded `*!` when today is also completed. Since the SVG rewrite (#24), today
can be indicated graphically. Replace the glyphs with a thin vertical accent line at
today's cell. Each habit row is its own `<svg>`, so the line is drawn per row at
today's x-position — stacked rows read as one continuous line spanning the graph.

**Key planner findings:**
- The marker fix is a *deletion*, not new branching: removing the
  `if (cell.isToday) { marker = ... }` block lets today fall through to the same
  `completed → skipped` precedence as every other day — which simultaneously delivers
  "completed today shows `*`" and fixes the skipped-today `!`-instead-of-`~` quirk.
- `cell.isToday` remains consumed — now only for line placement, not marker text.
  `generateDayCells` / `DayCell.status` semantics untouched (pure presentation change).
- A `<line>` fits the established no-viewBox layout exactly: percentage `x1`/`x2`
  (same math as the marker text: `cellWidthPct * i + cellWidthPct / 2`), absolute
  `y1="0"`/`y2="20"`, bare-number `stroke-width` → fixed-pixel thickness at any
  container width (a percentage-width rect couldn't do that).
- Paint order matters: the line goes inside today's `<g>` AFTER the `rect`, BEFORE
  the marker `<text>`, so the background paints under the line and `*`/`~` stay
  legible on top.
- **`renderGraph` has zero existing test coverage**: jest env is `node` (no jsdom),
  the Obsidian mock provides no DOM polyfills, and no test ever calls `renderGraph`.
  There are no `!`/`*!` assertions to update. Test strategy is therefore an explicit
  decision (Q3): extract a pure `markerForCell` function and unit-test that.
- Tooltip (`<title>`) logic never references `isToday` — unaffected, verified.
- README.md:69 (`**! (Border)** - Today's indicator`) becomes actively wrong; the
  surrounding legend was already stale from #24.

## Acceptance Criteria
- [ ] Today is indicated by a vertical accent line; no `!`/`*!` glyphs remain
- [ ] Completed today renders the standard `*` marker (Q2 of issue; via fall-through)
- [ ] Skipped today renders `~` (fixes pre-existing marker-precedence quirk)
- [ ] Line position aligns across stacked rows (cell-center percentage x per row)
- [ ] Works in both light and dark themes (`var(--interactive-accent)` stroke)

## Branch Strategy
- **Base branch:** main (local main is 1 commit ahead of origin — the #28 archive
  commit 48f7035; push main before opening the PR, same lesson as #11/#27/#28)
- **Feature branch:** 33-vertical-today-line
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Create and checkout feature branch from local main

### Implementation Tasks

- [x] **Task 1: Remove `!`/`*!` glyphs, add today line, fix skipped-today precedence**
  - Files affected: `src/graphRenderer.ts`, `src/__tests__/graphRenderer.test.ts`
  - Why: core change. Extract marker selection into a pure static
    `markerForCell(cell): '' | '*' | '~'` (Q3 decision) with uniform
    `completed → skipped → ''` precedence — no isToday branch. In the cell loop,
    when `cell.isToday`, append a namespaced `<line>` (class `today-line`,
    `x1`/`x2` = cell center %, `y1="0"`, `y2="20"`) after `rect`, before marker text.
    Use `document.createElementNS` (PROJECT_LORE invariant). Update the now-stale
    #28 comment at the today branch of generateDayCells ("The `!` today marker
    survives — it keys off cell.isToday, not status").
  - Tests (same commit): markerForCell — completed today → `*` (not `*!`);
    uncompleted due today → `''` (not `!`); skipped today → `~` (not `!`);
    completed past day → `*`; skipped past day → `~`; plain day → `''`.

- [x] **Task 2: Style the today line**
  - Files affected: `styles.css`
  - Why: `.habit-graph-svg .today-line { stroke: var(--interactive-accent);
    stroke-width: 2; }` (Q2 decision) — theme variable, no `.theme-dark` override
    needed, unlike the hardcoded hex status colors.
  - ⚠️ styles.css has unrelated uncommitted USER edits (`.habit-label` font-size/
    overflow hunk). Stage ONLY the new rule via `git add -p styles.css` — never
    `git add -A`/`git add .` anywhere in this issue (manifest.json is also dirty).

- [x] **Task 3: PROJECT_LORE.md reconciliation + README legend line**
  - Files affected: `PROJECT_LORE.md`, `README.md`
  - Why: the #28 Gotcha ("today marker driven by cell.isToday/completed, NOT
    cell.status") becomes STALE — rewrite it: markers are now uniformly
    status/completed-driven; today is indicated by the `<line>` and `cell.isToday`
    is consumed only for line placement (not a dead field). Add invariant: the
    today `<line>` must sit between `rect` and marker `<text>` inside today's `<g>`
    (paint order) or `*`/`~` are hidden on today. README.md:69: replace
    `**! (Border)** - Today's indicator` with the vertical-line description
    (Q4 decision: just that line, rest of the stale legend is separate cleanup).

### Quality Checks
- [x] `npx jest --runInBand` — 177 tests green (170 + 7 new), run before the build
- [x] `npm run build` — tsc + production bundle clean, main.js rebuilt
- [x] Self-review for code quality
- [x] Verify acceptance criteria met (manual vault check — user iterated line
      styling twice via screenshots and approved the final soft look)

### Documentation
- [x] Covered by Task 3 (PROJECT_LORE.md + README.md line 69)

## Technical Notes

### Architecture Considerations
- Pure presentation change: `cell.status` producers/consumers and all function
  signatures unchanged → dual call-site coupling (main.ts/habitGraphView.ts) and
  trailing-params rule not at risk.
- SVG constraints (PROJECT_LORE): createElementNS for all SVG elements; percentage
  x + no viewBox layout must be preserved; guard class strings before setAttribute.

### Implementation Approach
```ts
// marker selection — pure, uniform for every cell (no isToday branch)
static markerForCell(cell: DayCell): '' | '*' | '~' {
    return cell.completed ? '*' : cell.status === 'skipped' ? '~' : '';
}

// in the cell loop, after rect, before marker text:
if (cell.isToday) {
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('class', 'today-line');
    line.setAttribute('x1', `${cellWidthPct * i + cellWidthPct / 2}%`);
    line.setAttribute('x2', `${cellWidthPct * i + cellWidthPct / 2}%`);
    line.setAttribute('y1', '0');
    line.setAttribute('y2', '20');
    g.appendChild(line);
}
```

### Potential Challenges
- The line inherits nothing from the `<g>`'s color class (those target rect fill /
  text fill); the stroke rule must be specific enough to apply regardless of the
  parent `g` class.
- `generateDayCells` always includes i=0, so the line renders in every row —
  no out-of-window guard needed (checking `cell.isToday` per cell is inherently
  safe anyway).

## Questions/Blockers

### Clarifications Needed
(none — all resolved, see Decisions Made)

### Blocked By
(none)

### Assumptions Made
- stroke-width 2 (thin but visible at row height 20); adjust during manual vault
  check if it reads too heavy/light.
- Marker `<text>` fill keeps its current styling; legibility over the accent line
  verified manually.

### Decisions Made
2026-07-15

**Q: Line x-position — cell center or cell edge?**
**A:** Cell center — same x as the marker glyph; stacked rows read as one continuous
line through today. Paint order keeps `*`/`~` on top.

**Q: Theme variable for line color?**
**A:** `var(--interactive-accent)` — Obsidian's standard accent; adapts to theme and
user accent settings; more marker-appropriate than the text-oriented `--text-accent`.

**Q: Test strategy given renderGraph has zero coverage (node env, no jsdom)?**
**A:** Extract pure `markerForCell(cell)` and unit-test it in the existing node
environment. No new devDependency/polyfill layer; SVG DOM verified manually in the
vault, consistent with how renderGraph has always been verified.

**Q: README.md:69 stale "! (Border)" legend line?**
**A:** Fix just that line here; the rest of the (already #24-stale) legend is
separate cleanup.

## Work Log

### 2026-07-15 - Session 1
- Completed: Task 1 (commit 79f9fce) — extracted pure `markerForCell` (uniform
  `completed → skipped → ''`, deletes the isToday glyph branch, fixing the
  skipped-today `!` quirk); today `<line class="today-line">` at cell center,
  appended between rect and marker text (paint-order constraint commented in
  code). 7 new markerForCell tests → 177 total green (`--runInBand`), then
  `npm run build` clean (sequential). main.js rebuilt → change live in vault.
- Completed: Task 2 (commit 0024286) — `.habit-graph-svg .today-line { stroke:
  var(--interactive-accent); stroke-width: 2; }`. Staged hunk-only by building
  the index blob from `HEAD:styles.css` + the rule (`git hash-object` +
  `git update-index --cacheinfo`) since `git add -p` is interactive; user's
  unrelated `.habit-label` media-query edit verified still unstaged-only.
- Completed: Task 3 (commit 49fd82d) — rewrote the stale #28 marker gotcha
  (markers uniform, isToday only places the line — not a dead field), added
  paint-order invariant, README.md legend line now "Vertical accent line".
- Iteration from vault checks (commit d837b71): 2px `--interactive-accent`
  line blended into blue cells; tried a background-colored halo but the user
  disliked the glow → final: keep the thin 2px line, stroke
  `var(--text-normal)` (near-white in dark / near-black in light) for maximum
  contrast against the muted cell colors. Halo experiment amended away
  (branch unpushed) so the PR history stays clean. 177 tests green, build
  clean, hunk-only styles.css staging re-verified after each iteration.
- Manual-check aid: created vault note `TaskNotes/Tasks/TEST completed today.md`
  (FREQ=DAILY, completed Jul 14+15) — today should show green + legible `*`
  over the line, streak 2. Delete after testing.
- Manual vault verification complete: user screenshot-reviewed three styling
  iterations (accent → halo (rejected: "glow") → text-normal (too stark) →
  final 0.5 stroke-opacity) and approved.

- Post-PR design pivot (commit 4b90306, pushed to the open PR #34): the line
  still felt "in the way" → replaced with a tinted column overlay — a
  `<rect class="today-overlay">` covering today's cell, `--text-normal` fill
  at 0.25 opacity (darkens in light theme, lightens in dark, hue preserved).
  Structural gotcha: the rect must be a SIBLING appended after today's `<g>`;
  inside the group, `.blue rect`-style color rules (esp. `.theme-dark`
  variants) out-specify `.today-overlay` and silently kill the tint. Lore
  invariant + README legend updated; PR title/body PATCHed via REST.

- Second design pivot (commit d91519e, pushed to PR #34): tint overlay muddied
  yellow (dark) or pastel-ambiguated colors (light); frame variant rejected as
  ugly. Final: dedicated 'today' purple applied in cell rendering via new pure
  `colorClassForCell()` (the renderGraph color switch, extracted and tested),
  overriding every today status EXCEPT 'today-missed' — yellow always wins
  (it only ever appears on today; it IS the call to action). Overlay rect
  removed. Purple #9b59b6 / #7d4394 (theme-dark) — only hue absent from the
  palette. 182 tests (12 new total), build clean, PR title/body re-PATCHed.
  Key lesson pinned in lore: any today-indicator that tints/overlays cells
  degrades yellow, the primary signal.

- Third design pivot (commit 0346dfd, pushed): flat purple erased the status
  signal on today ("sortof almost") → final: `colorClassForCell` appends a
  `today` MODIFIER to the normal color class (`blue today`, `green today`,
  `gray today`); CSS applies `filter: brightness(0.7)` (light) /
  `brightness(1.35)` (dark) to today's rect — the dark-overlay effect baked
  into the cell, color relationships intact. `today-missed` exempt: yellow
  never dims. Tests updated (182 green), PR title/body re-PATCHed.

### 2026-07-15 - Session Complete
- All implementation tasks complete
- Quality checks: passed (177 tests, clean build, visual sign-off)
- Ready for PR: yes (PR #34 open; overlay pivot pushed, awaiting final visual OK)

---
**Generated:** 2026-07-15
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/33
