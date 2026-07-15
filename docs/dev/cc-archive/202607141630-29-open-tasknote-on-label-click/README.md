# Issue #29 - Open the TaskNote in a new tab when clicking a habit's label

**Archived:** 2026-07-14
**Branch:** 29-open-tasknote-on-label-click
**Code SHA:** c072c1a
**PR:** #30
**Status:** Merged

## Summary

Habit labels in both the sidebar view and `habit-graph` code blocks are now
clickable navigation surfaces. Clicking a label opens the backing TaskNote:
if the note is already open in a markdown leaf, that leaf is focused; otherwise
it opens in a new tab. A missing/deleted note shows a Notice and does nothing
(never silently creates an empty file). Hover affordance (pointer cursor +
underline) makes the label read as clickable.

Implementation: a new `openTaskNote(app, path)` helper in
`src/utils/noteOpener.ts` holds the guard/reuse/new-tab branching and is fully
unit-tested (6 tests) in the node jest environment. `GraphRenderer.renderGraph`
gained an optional `onLabelClick` callback param, keeping the renderer free of
Obsidian App imports; both call sites pass `() => openTaskNote(this.app,
task.path)`. Plain `addEventListener` is used since label elements are
discarded on every re-render.

## Key Decisions

- **Reuse vs new tab:** Reuse (focus) an existing leaf if the note is already
  open; otherwise open a new tab — avoids duplicate-tab buildup.
- **Missing file:** Vault lookup guard → `Notice('TaskNote not found: ...')`
  and no-op.
- **Testing scope:** DOM wiring ships untested (no jsdom infra, consistent with
  the rest of renderGraph); the extracted `openTaskNote` logic is unit-tested.
- **Click target:** The whole label — including the 🔥streak span, via
  bubbling — is one clickable unit; no stopPropagation.

## Files Changed

- `src/utils/noteOpener.ts` (new) — openTaskNote helper
- `src/__tests__/noteOpener.test.ts` (new) — 6 unit tests
- `src/graphRenderer.ts` — optional `onLabelClick` param on renderGraph
- `src/habitGraphView.ts` — pass openTaskNote callback
- `src/main.ts` — pass openTaskNote callback in code block processor
- `styles.css` — cursor: pointer + underline on hover for `.habit-label`

## Lessons Learned

- Leaf reuse uses a defensive shape check (`leaf.view?.file?.path`) instead of
  `instanceof MarkdownView`, keeping the helper testable with plain object
  fakes in the node environment.
- `jest.mock('obsidian')` with `jest.requireActual` on the shared mock allows
  overriding only `Notice` with `jest.fn()` without touching `__mocks__/obsidian.ts`.
- Precise staging via a hand-built patch + `git apply --cached` cleanly
  separated the hover-rule hunk from a pre-existing uncommitted mobile tweak
  in the same region of `styles.css`.
- Push local main before opening a PR when it is ahead of origin (carried
  lesson from #11) — kept PR #30 to exactly the 3 issue commits.
