# Today tint invisible on iOS — WebKit ignores CSS filter on SVG elements - #41

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/41
- **State:** open
- **Labels:** bug
- **Related Issues:**
  - Related: #33 (introduced the today tint modifier), #25 (SVG rewrite that made cells SVG rects), #35 (call-to-action exclusions the tint must respect)

## Description

The 'today' highlight does not render in Obsidian mobile on iOS; desktop is unaffected. The tint is `filter: brightness(0.7)` / `brightness(1.35)` applied via CSS to SVG `<rect>` elements, and WebKit does not apply the CSS `filter` property to SVG elements (long-standing, caniuse-documented limitation) — it silently no-ops. The `today-overdue` stripes still render on iOS (SVG `<pattern>` works), confirming only the CSS filter is lost.

**Approach pinned in chat (2026-07-16):** replace the two brightness-filter rules with explicit per-base compound-selector fills. The `today` modifier can only co-occur with three bases — `green` (done), `gray` (skipped), `blue` (rest) — because the missed variants are excluded call-to-action colors. Six plain-hex CSS rules total; no TypeScript changes. The three combos are already pinned by tests (graphRenderer.test.ts:766-776).

## Acceptance Criteria
- [ ] Today's cell is visibly tinted on iOS (light and dark theme)
- [ ] Desktop rendering unchanged in intent: same three tinted combos; call-to-action cells (today-missed yellow, today-overdue stripes) stay full strength
- [ ] No TypeScript/renderer changes; existing tests untouched and passing
- [ ] PROJECT_LORE.md updated: #33 invariant no longer claims a brightness filter; enumeration coupling noted

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 41-ios-today-tint
- **Current branch:** 41-ios-today-tint

## Implementation Checklist

### Setup
- [x] Fetch latest from base branch
- [x] Create and checkout feature branch

### Implementation Tasks

- [x] **Task 1: Replace brightness filters with per-base `.X.today` fills in styles.css**
  - Files affected: styles.css only
  - Delete `.habit-graph-svg .today rect { filter: brightness(0.7); }` (line ~91) and `.theme-dark .habit-graph-svg .today rect { filter: brightness(1.35); }` (line ~147); replace each with three compound rules.
  - Starting hexes = exact filter math applied to the current base fills (tune during visual check if needed):
    - Light (×0.7): `.green.today` #408140 (from #5cb85c), `.blue.today` #557499 (from #7aa6da), `.gray.today` #777777 (from #aaaaaa)
    - Dark (×1.35): `.green.today` #64c664 (from #4a934a), `.blue.today` #80b9e8 (from #5f89ac), `.gray.today` #b8b8b8 (from #888888)
  - Keep the explanatory comment block (lines ~85-90), rewritten: tint is now explicit per-base fills because WebKit ignores CSS `filter` on SVG elements; enumeration is exhaustive per the today-branch precedence.
  - **Commit caveat:** styles.css carries Marc's protected uncommitted `.habit-label` media-query hunk that must NEVER be committed. Stage via filtered patch: `git diff styles.css > patch`, strip the `.habit-label` hunk, `git apply --cached`, verify with `git diff --cached styles.css` before committing. Never `git add styles.css` wholesale.
  - Why: the entire fix; one commit (🐛 fix).

- [x] **Task 2: Lore updates**
  - Files affected: PROJECT_LORE.md
  - Edit the #33 colorClassForCell invariant: the tint is no longer "a CSS brightness filter on the base color" — it's explicit `.{green,gray,blue}.today` fills (the bare-'today'-renders-untinted consequence still holds and stays).
  - Add coupling entry: any new status that can appear on a non-call-to-action today needs a matching `.X.today` fill pair in both themes, or today renders untinted on that status — *why: the tint went from generic filter to exhaustive enumeration in #41 because WebKit ignores CSS filter on SVG elements; do not "simplify" back to brightness()*.
  - Add gotcha: WebKit (iOS Obsidian) silently ignores CSS `filter` on SVG elements; SVG `<pattern>` fills work fine — *why: a filter-based effect looks correct on desktop and invisibly no-ops on mobile*.
  - Why: prevents a future session from reintroducing the filter; issue AC requests it.

### Quality Checks
- [x] `npx jest --runInBand` (NEVER parallel), then `npx tsc -noEmit -skipLibCheck` (sequential) — 210 passing, tsc clean
- [x] `npm run build` (deploys live to the vault)
- [x] Self-review; verified the committed styles.css diff excludes the protected `.habit-label` hunk
- [ ] Visual check: desktop light + dark theme (today tint still reads correctly); Marc checks iOS

## Technical Notes

### Architecture Considerations
- Pure CSS change — colorClassForCell, generateDayCells, markers, and all call sites untouched. The renderer already emits the compound classes.
- The three-combo enumeration is exhaustive by construction: today precedence is completed → skipped → !isDueOn → rest → missed-variant, and both missed variants are call-to-action-excluded from the tint.

### Implementation Approach
Swap 2 filter rules for 6 fill rules whose hexes reproduce the current desktop appearance exactly (0.7x / 1.35x of each base), so desktop users see no change while iOS gains the tint.

### Potential Challenges
- The protected styles.css working-tree hunk (see Task 1 caveat) — the only non-trivial part of the change is staging around it.
- Hand-picked hexes may want tuning after visual check; the math-derived values are the starting point, not sacred.

## Questions/Blockers

### Clarifications Needed
(none — approach, combos, and trade-off pinned in chat and in the issue)

### Blocked By
(none)

### Assumptions Made
1. Desktop appearance should be preserved as-is, so starting hexes replicate the current filter output rather than redesigning the tint.

### Decisions Made
2026-07-16 (pre-filing chat, pinned in the issue)

**Q: Overlay rect, SVG `<filter>`, or explicit secondary colors?**
**A:** Explicit per-base `.X.today` fills.
**Rationale:** Marc: "wouldn't it just be easier to have a secondary color for this purpose" — only three combos exist and they're already test-pinned, so the filter's generality buys nothing; plain fills work in every engine. Accepted trade-off: enumeration coupling for future statuses (captured in lore).

## Work Log

### 2026-07-16 - Session
- Completed: Task 1 (CSS fix)
  - Notes: deleted the two `filter: brightness()` rules; added six `.X.today rect` fills (green/blue/gray × light/dark). Staged via `filterdiff --hunks=2,3` to exclude the protected `.habit-label` hunk. Hexes are exact 0.7x/1.35x math on the base fills. 210 tests pass, tsc clean, production build deployed. Commit c4a0e59.
- Completed: Task 2 (lore updates)
  - Notes: rewrote #33 invariant (per-base fills, not brightness filter); added coupling entry (new today status needs .X.today fill pair); added WebKit gotcha. Commit 23106ed.
- Quality checks: 210 tests, tsc clean, build deployed
- Remaining: visual check on desktop + iOS

---
**Generated:** 2026-07-16
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/41
