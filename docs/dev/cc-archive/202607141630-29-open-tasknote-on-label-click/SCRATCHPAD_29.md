# Open the TaskNote in a new tab when clicking a habit's label - #29

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/29
- **State:** open
- **Labels:** enhancement
- **Milestone:** (none)
- **Assignees:** (none)
- **Related Issues:**
  - Related: #24 (SVG graph rendering, closed — produced the current renderGraph structure), #27/#28 (queued after this per user ordering)

## Description

Habit rows in the graph (sidebar view and `habit-graph` code block) render the
task title as plain text. Clicking the label should open the backing TaskNote
file in a new tab, making the graph a navigation surface as well as a display.

Proposed behavior (from issue):
- Clicking the `.habit-label` text opens the habit's note (`task.path`) in a new tab
- Applies to both `HabitGraphView` and the code block processor
- Hover affordance (pointer cursor, underline on hover) so it reads as clickable

## Acceptance Criteria
- [ ] Label click in the sidebar view opens the TaskNote (reuse existing tab if already open, else new tab — per Q1 decision)
- [ ] Label click in code-block-rendered graphs does the same
- [ ] Visual hover affordance on the label
- [ ] Missing/deleted TaskNote: Notice + no-op (never silently create an empty note)

## Branch Strategy
- **Base branch:** main (local main is 1 commit ahead of origin — the #11 archive commit; push main before opening the PR, same as the #11 lesson)
- **Feature branch:** 29-open-tasknote-on-label-click
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Create and checkout feature branch from local main

### Implementation Tasks

- [x] **Task 1: Add `openTaskNote(app, path)` helper + unit tests**
  - Files affected: `src/utils/noteOpener.ts` (new), `src/__tests__/noteOpener.test.ts` (new), `__mocks__/obsidian.ts` (extend stubs as needed: TFile, Notice, MarkdownView)
  - Why: The open logic has real branching (missing-file guard, reuse-vs-new-tab)
    shared by both call sites; factoring it out avoids duplication and makes it
    unit-testable in the existing node jest environment (no DOM required —
    mocked App/workspace/vault only).
  - Behavior:
    1. `app.vault.getAbstractFileByPath(path)` — if not a `TFile`, `new Notice('TaskNote not found: ...')` and return
    2. Scan `app.workspace.getLeavesOfType('markdown')`; if a leaf's view file
       matches `path`, `app.workspace.setActiveLeaf(leaf, { focus: true })` and return
    3. Else `app.workspace.getLeaf('tab').openFile(file)`

- [x] **Task 2: Wire `onLabelClick` through `renderGraph` and both call sites**
  - Files affected: `src/graphRenderer.ts` (renderGraph ~line 119-130), `src/habitGraphView.ts` (~line 62-67), `src/main.ts` (~line 194-199)
  - Why: `renderGraph` is static with no App reference (by design — keep it
    framework-agnostic). Add optional `onLabelClick?: () => void` param;
    attach `labelContainer.addEventListener('click', onLabelClick)` when provided.
    Callers pass `() => openTaskNote(this.app, task.path)`.
  - Cleanup note: plain addEventListener is safe — elements are discarded on every
    re-render (`refresh()` empties the container; code block gets a fresh `el`),
    so no `registerDomEvent` needed.
  - DOM wiring itself ships untested (node jest env, no jsdom — per Q3 decision).

- [x] **Task 3: Hover affordance on `.habit-label`**
  - Files affected: `styles.css`
  - Why: Acceptance criterion — label must read as clickable.
    `cursor: pointer` on `.habit-label`, `text-decoration: underline` on hover.
  - ⚠️ COORDINATION: `styles.css` has pre-existing UNCOMMITTED local changes
    (mobile-label tweak in the `@media` block) and `manifest.json` has an
    uncommitted version regression (0.2.0→0.1.0). Stage ONLY the hover-rule
    hunk for this commit (`git add -p` / precise staging). Do NOT touch
    manifest.json at all.

### Quality Checks
- [x] `npx jest --runInBand` (NEVER parallel — machine constraint) — 132 pass
- [x] `npm run build` (run AFTER jest, never simultaneously) — clean
- [x] Self-review for code quality
- [ ] Verify acceptance criteria met (manual click test in vault after rebuild — USER)

### Documentation
- [x] JSDoc on `openTaskNote` (behavior contract: guard → reuse → new tab)
- [x] PROJECT_LORE.md: no changes needed (no new gotchas surfaced)

## Technical Notes

### Architecture Considerations
- `GraphRenderer` stays free of `obsidian` App imports — Obsidian API usage lives
  at the call sites / in the new util. The callback param preserves renderGraph's
  pure-render nature.
- Both call sites have `task: TaskNote` (with `.path`) and `this.app` in scope:
  `habitGraphView.ts` (ItemView → View.app) and `main.ts` (Plugin.app).
- `TaskNote.path` comes from the same cache as everything else; the TFile guard
  in openTaskNote is the stale-cache defense.
- The 🔥streak span is a child of `.habit-label`, so clicks on it bubble to the
  label handler — intended (whole label is one clickable unit, per Q4 decision).

### Implementation Approach
Optional callback param on renderGraph + shared `openTaskNote` util. Alternatives
rejected:
1. Pass `App` + path into renderGraph — couples the renderer to Obsidian API,
   breaks its current framework-agnostic design.
2. Attach handlers in callers after renderGraph returns (querySelector on
   `.habit-label`) — fragile coupling to renderer's internal DOM structure.
3. Duplicate open logic inline at both call sites — two copies of the
   guard/reuse/open branching.

### Potential Challenges
- `__mocks__/obsidian.ts` currently has only class stubs; Task 1 tests need
  workable fakes for `Notice`, `TFile` (instanceof check), and a hand-built
  app object (vault.getAbstractFileByPath, workspace.getLeavesOfType/
  setActiveLeaf/getLeaf). Keep fakes minimal and local to the test file where
  possible.
- `MarkdownView.file` access on leaves: use a defensive shape check
  (`leaf.view?.file?.path`) rather than instanceof MarkdownView if the mock
  cost outweighs the benefit — decide during implementation, note in Work Log.
- Precise staging for Task 3 (see coordination warning above).

## Questions/Blockers

### Clarifications Needed
(none — all resolved 2026-07-14, see Decisions Made)

### Blocked By
(none)

### Assumptions Made
- "Markdown" leaves are sufficient for the reuse scan (TaskNotes are .md files).

### Decisions Made
2026-07-14

**Q: Always open a new tab, or reuse if the note is already open?**
**A:** Reuse the existing leaf (focus it) if the note is open; otherwise open a
new tab. Avoids duplicate-tab buildup on repeated clicks.

**Q: Missing/deleted TaskNote file on click?**
**A:** Guard with a vault lookup; `Notice('TaskNote not found: ...')` and no-op.
Never let Obsidian silently create an empty note at the stale path.

**Q: jsdom test infra for renderGraph DOM wiring?**
**A:** Out of scope — DOM wiring ships untested (consistent with the rest of
renderGraph). The extracted `openTaskNote` logic IS unit-tested in the node env.

**Q: Streak-count span click also opens the note (bubbling)?**
**A:** Yes — whole label is one clickable unit; no stopPropagation.

## Work Log

### 2026-07-14 - Session 1
- Completed: Task 1 (commit 7159c43) — openTaskNote helper + 6 unit tests.
  - Used jest.mock('obsidian') factory with jest.requireActual on the shared
    mock, overriding only Notice with jest.fn() — shared mock untouched.
  - Leaf reuse uses a defensive shape check (leaf.view?.file?.path) instead of
    instanceof MarkdownView, keeping the helper testable with object fakes.
- Completed: Task 2 (commit 4cbe918) — optional onLabelClick param on
  renderGraph; both call sites pass () => openTaskNote(this.app, task.path).
  Plain addEventListener (element discarded on every re-render; no
  registerDomEvent needed).
- Completed: Task 3 (commit 297449c) — cursor:pointer + underline-on-hover.
  - Staged ONLY the hover hunk via a hand-built patch + `git apply --cached`
    (the pre-existing uncommitted mobile tweak shared the same diff region);
    manifest.json untouched, mobile tweak still unstaged in working tree.

### 2026-07-14 - Session Complete
- All 3 implementation tasks complete (3 commits on 29-open-tasknote-on-label-click).
- Quality checks: 132 tests pass (jest --runInBand), npm run build clean;
  fresh main.js produced — user can reload plugin to verify clicks manually.
- Reminder for PR: push local main first (it is 1 commit ahead of origin with
  the #11 archive commit) so the PR contains exactly the 3 issue commits.
- Ready for PR: yes (pending user's manual click verification).

---
**Generated:** 2026-07-14
**By:** Issue Setup Skill (planner agent: ac411f578806ed597)
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/29
