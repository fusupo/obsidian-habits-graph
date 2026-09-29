# Click a graph cell to mark a past day done or skipped (backfill via TaskNotes) - #47

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/47
- **State:** open
- **Labels:** enhancement
- **Milestone:** none
- **Assignees:** none
- **Related Issues:** none linked. Builds on the render-wiring coupling recorded in lore (#27, #35, #39 and #43 changed the render call sites).

## Description
## Summary
Catching up on a habit you haven't been tracking means hand-editing `complete_instances`, `skipped_instances` and `scheduled`. TaskNotes' Edit Task → Completions calendar works, but it takes several clicks per habit. For habits that repeat from completion, its right-click Skip is also hidden on days before the rule's `DTSTART`. Clicking a cell in the graph should record that day directly.

## Proposed Behavior
- Clicking a **past or today** cell cycles it: **blank → done → skipped → blank**. Future cells can't be clicked.
- The graph passes each change to TaskNotes' own functions and never copies its scheduling logic:
  - blank → done: `taskService.toggleRecurringTaskCompleteWithOccurrenceNotes(task, date)`
  - done → skipped and skipped → blank: `taskService.toggleRecurringTaskSkipped(task, date)`. Skipping a completed day moves it from `complete_instances` to `skipped_instances`.
- TaskNotes then updates `scheduled`, the `DTSTART` of habits that repeat from completion, renamed property names, occurrence notes and its cache.
- The graph re-renders through the existing `metadataCache.on('changed')` handler. **(Wrong. See Potential Challenges: that handler only updates the cache. Task 4 fixes it.)**

## Design notes (from reading TaskNotes 4.13.6 `main.js`)
- **Where the functions live:** `app.plugins.plugins.tasknotes.taskService`. The first argument only needs `.path`, because TaskNotes re-reads the task from its own cache.
- **Dates:** TaskNotes formats the date using UTC components, so our midnight-UTC cell dates can be passed straight in.
- **No repeat-day check:** these functions don't check whether the date is a repeat day, so Skip works before `DTSTART`.
- **Order problem to fix:** for habits that repeat from completion, marking a day done sets `DTSTART` to that day, and un-marking never moves it back. Out-of-order clicks or a corrected mistake leave `DTSTART` on the wrong day. That shifts the next due date for weekly, every-2/4-week and monthly habits. Daily ones aren't affected.
  - **Repair after each click:** when a habit repeats from completion and `DTSTART` isn't the latest date in `complete_instances`, mark that latest date undone and then done again through TaskNotes. This resets `DTSTART` and makes TaskNotes recalculate `scheduled`, so the result depends only on which days are marked, not the click order.
- **Unofficial API:** `taskService` isn't a documented API. Check that it exists before each call (same pattern as `getCachedTaskNotes`). If it's missing, show a notice and write nothing. **Never fall back to editing the frontmatter directly**, because that leaves `scheduled` stuck.
- **Both callers need updating:** `renderGraph` is called from both `main.ts` (code block) and `habitGraphView.ts`. The click wiring has to reach both (see the render-wiring note in lore).

## Known TaskNotes behavior (not changed by this issue)
- For habits that repeat from completion, the next-due search window is max(30, 2×interval) days for daily rules (≥90 for weekly, ≥400 for monthly). A newest completion older than that leaves `scheduled` unchanged.
- For habits that repeat on a fixed interval from their scheduled date, the graph treats days before `scheduled` as not due. Backfilling moves `scheduled` forward, so missed days before it turn blue.

## Acceptance Criteria
- [ ] Clicking a past or today cell cycles blank → done → skipped → blank; future cells don't respond
- [x] All writes go through TaskNotes' `taskService`, and no scheduling logic is copied
- [x] Repair after each click: the final `DTSTART` and `scheduled` don't depend on click order, with a unit test using a fake `taskService` that shuffles click order
- [x] If `taskService` or its methods are missing, a notice appears and nothing is written
- [ ] Works in both the code-block graph and the sidebar view
- [x] PROJECT_LORE entry documenting the new dependency on TaskNotes' `taskService`

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 47-click-cell-backfill-via-tasknotes
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Fetch latest from base branch
- [x] Create and checkout feature branch (note: `manifest.json` is already modified in the working tree; do not include it in feature commits)

### Implementation Tasks
- [x] **Task 1: Pure helper `dtstartRepairDate` (self-heal decision)**
  - Files affected: `src/utils/completionAnchorRepair.ts` (new), `src/__tests__/completionAnchorRepair.test.ts` (new)
  - Why: The heal decision is the riskiest logic, so isolate it as a pure function `(anchor, recurrence, completeInstances) → 'YYYY-MM-DD' | null` with no Obsidian or TaskNotes imports.
  - Notes:
    - Return null when anchor is not `'completion'`. Scheduled-anchor habits never get DTSTART rewritten (`yce` only writes DTSTART for anchor `completion`, or adds it when absent), so they need no heal.
    - Return null when `completeInstances` is empty. There is nothing to re-toggle, and DTSTART can stay stale after the only completion is undone. This is a known limitation (see Potential Challenges).
    - Let L = max of the `YYYY-MM-DD` strings (lexicographic compare is safe). Parse DTSTART with `/DTSTART:(\d{8})/`, which handles both `DTSTART:20250118;...` and `DTSTART:20250118T000000Z;...`. Compare it to L with the dashes stripped.
    - Return L when DTSTART is missing or differs from L (including DTSTART later than L), otherwise null.
  - Tests: anchor scheduled → null; empty → null; DTSTART equals L → null; DTSTART earlier than L → L; DTSTART later than L → L; no DTSTART → L; the `T000000Z` form; unsorted input; malformed dates ignored.

- [x] **Task 2: TaskNotes bridge module (duck-typing guard and cycle logic)**
  - Files affected: `src/tasknotes/taskNotesBridge.ts` (new), `src/__tests__/taskNotesBridge.test.ts` (new)
  - Why: Keeps every dependency on TaskNotes internals in one file, per CLAUDE.md's "feature logic in focused modules". Follows the `noteOpener.ts` pattern, where a plain-object fake app is testable in node Jest.
  - Notes:
    - Minimal interfaces, not TaskNotes types: `TaskNotesService { toggleRecurringTaskCompleteWithOccurrenceNotes, toggleRecurringTaskComplete, toggleRecurringTaskSkipped }` and `TaskInfoReader { getTaskInfo(path): Promise<{recurrence, recurrence_anchor, complete_instances, skipped_instances} | null> }`.
    - `resolveTaskNotesBridge(app)`: reads `app.plugins?.plugins?.tasknotes`. Uses `typeof === 'function'` checks on all three toggles and on `cacheManager.getTaskInfo`. Returns `{service, reader}` or `null`. Call it fresh on every click (TaskNotes can be disabled or reloaded), and never cache the reference.
    - Pure `nextCycleAction(state, dateStr)`:
      - in complete → `'skip'` (`toggleRecurringTaskSkipped` moves it from complete to skipped)
      - in skipped → `'unskip'` (`toggleRecurringTaskSkipped` again)
      - neither → `'complete'` (`toggleRecurringTaskCompleteWithOccurrenceNotes`)
    - `cycleDay(bridge, path, date)`:
      1. Read fresh state via `reader.getTaskInfo(path)`. Do NOT derive it from the rendered cell or from this plugin's cache, both of which can be stale.
      2. Call the mapped toggle with `{path}` and the UTC-midnight `Date`.
      3. Re-read state, compute `dtstartRepairDate`, and if non-null call `toggleRecurringTaskComplete({path}, parseISODate(L))` twice, off then on. Use the plain method, NOT `...WithOccurrenceNotes`, for the heal. That avoids materializing or toggling occurrence notes twice when `occurrence_materialization` is `on_completion`.
      4. Return a result describing the action taken.
    - Errors: if any toggle throws (TaskNotes throws on "Task is not recurring" or file not found), catch it, show `new Notice(...)` with the message, and stop. Never write frontmatter directly.
    - Per-path in-flight lock (`Set<string>` at module level): a click while the path is busy is ignored, because the next state depends on the previous write. Release in `finally`.
  - Tests, with a fake taskService and reader backed by a small in-memory model. The fake mimics the verified TaskNotes semantics: complete toggles set membership, removes the date from skipped, and sets DTSTART=date on add when the anchor is `completion`; un-complete never touches DTSTART; skip toggle moves the date out of complete; `scheduled` is derived from DTSTART.
    - Cycle blank → done → skipped → blank.
    - Missing or partial bridge: Notice shown, zero calls.
    - A throwing toggle shows a Notice and releases the lock. Include the case where the *second* heal toggle throws.
    - The in-flight lock ignores a concurrent second click.
    - The heal calls the plain complete method (not WithOccurrenceNotes).
    - The `Date` passed through is the same timestamp as the cell date (TZ pinned to America/Los_Angeles).
    - Order-independence: for several target sets of marked days (done and skipped), run every permutation of click order (n ≤ 4, so at most 24 runs) and assert identical final `complete_instances`, `skipped_instances`, DTSTART (=== max complete date) and derived `scheduled`.
    - Scheduled-anchor habit: DTSTART untouched and no heal calls.

- [x] **Task 3: Make DayCell clickable in `renderGraph` (trailing optional param)**
  - Files affected: `src/graphRenderer.ts`, `src/__tests__/graphRenderer.test.ts`, `styles.css`
  - Why: The UI hook. It must not disturb the colour, marker or precedence logic.
  - Notes:
    - Append `onCellClick?: (cell: DayCell) => void` as the last param of `renderGraph`, after `onLabelClick`. Never insert (lore: positional call sites).
    - For each `g`, when `onCellClick` is set and `isCellClickable(cell)`, add the class `clickable` to the `g` and attach a plain `click` listener. The rows are discarded on re-render, the same reasoning as the existing label listener comment. Keep the `<title>` tooltip.
    - Do NOT touch `colorClassForCell`. Its `g` class is guarded by `if (colorClass)`, so add `clickable` via `classList.add`, which appends without clobbering (SVG `classList` works on Chromium and WebKit). Do not use Obsidian's `addClass`.
    - Extract a pure predicate `isCellClickable(cell): boolean` (`!cell.isFuture`) so the "future cells inert" rule is unit-testable without a DOM.
    - CSS: `.habit-graph-svg .clickable { cursor: pointer; }` plus a subtle hover outline that doesn't fight the `.today` tint fills, e.g. `.habit-graph-svg .clickable:hover rect { stroke: var(--text-muted); stroke-width: 1; }`. Do NOT use CSS `filter` (lore: WebKit ignores it on SVG). Add `.habit-graph-row.habit-busy { opacity: 0.6; pointer-events: none; }` for the in-flight state.
    - Mobile: `click` fires on tap in Obsidian mobile, so no separate handler is needed.

- [x] **Task 4: Shared row rendering with live re-render (fix the stale-render gap)**
  - Files affected: `src/ui/habitRow.ts` (new), `src/events/VaultEventHandler.ts`, `src/main.ts`, `src/habitGraphView.ts`
  - Why: `VaultEventHandler.handleChanged` only updates `TaskCacheManager`. The sidebar refreshes only via `main.ts`'s `vault.on('modify')` handler (1s debounce, whole view), and code blocks never re-render. Both call sites also duplicate the per-habit wiring (lore coupling). One shared row builder fixes both problems and removes the duplication trap.
  - Notes:
    - `buildHabitRow(plugin, task): HTMLElement` holds the `getCompletionHistory`, `getSkippedDates`, `parseISODateOrNull(task.scheduled)`, `generateDayCells`, `calculateStreak` and `renderGraph` wiring, including the trailing recurrenceAnchor/scheduledDate args. Both `main.ts` (`renderHabitGraphCodeBlock`) and `habitGraphView.ts` (`refresh`) call it, so the arg list exists once. Update the lore coupling entry that describes the duplication.
    - Add a change-listener API to `VaultEventHandler`: `onTaskChanged(path, cb): () => void`. After `cacheManager.setFileTasks` or `removeFile` in `handleChanged`, notify the listeners for that path. This runs after the cache is updated, so listeners read fresh data from `cacheManager.getFileTasks(path)`.
    - Each row subscribes. On notification, if `rowEl.isConnected`, it rebuilds itself from the cached task and calls `rowEl.replaceWith(newRow)`. If disconnected, it unsubscribes. Debounce per path (about 50ms) so the heal's burst of 2–3 writes yields one render.
    - Keep the existing sidebar `vault.on('modify')` full refresh unchanged, to avoid changing unrelated behaviour.
    - Do not re-render synchronously right after `cycleDay` resolves. Our cache lags the write (lore: metadataCache changed vs vault modify). Rely on the notification. As a safety net, if no `changed` notification arrives within about 3s of a completed `cycleDay`, rebuild the row from the cache once.

- [x] **Task 5: Wire the click handler into the shared row**
  - Files affected: `src/ui/habitRow.ts`
  - Why: Connects Task 3's hook to Task 2's bridge. With Task 4's shared builder this is one place, but verify both call paths render clickable cells.
  - Notes:
    - At row-build time, call `resolveTaskNotesBridge(app)`. If null, pass no `onCellClick`, so cells render inert with no pointer cursor (Decision 3).
    - The handler calls `resolveTaskNotesBridge(app)` again on click. If TaskNotes vanished since render, show `new Notice('TaskNotes plugin not available (or its API changed); cannot record this day.')` and write nothing. Otherwise call `cycleDay(bridge, task.path, cell.date)` and add or remove `habit-busy` on the row while it runs.
    - After success, show a brief Notice: `Marked 2026-09-01 done`, `… skipped` or `… cleared` (Decision 1).
    - Pass `cell.date` unchanged. It is UTC-midnight, which matches TaskNotes' `getUTC*` formatting.

- [x] **Task 6: Setting to disable click-to-edit**
  - Files affected: `src/settings.ts`, `src/ui/habitRow.ts`
  - Why: Writing data from a tap is a new capability, and mis-taps in a narrow mobile sidebar are a real risk (Decision 1).
  - Notes: `enableCellClickEdit`, default `true`. When disabled, don't pass `onCellClick`, so cells stay fully inert. Follow the existing settings interface + defaults pattern.

### Quality Checks
- [x] `npx jest --runInBand`
- [x] `npm run build` (tsc + esbuild) — run AFTER jest, never concurrently
- [x] Self-review for code quality
- [ ] Verify acceptance criteria met
- [ ] Manual check in Obsidian (desktop + iOS tap):
  - one completion-anchored WEEKLY and one MONTHLY habit
  - one scheduled-anchor habit
  - out-of-order backfill, then check `DTSTART` and `scheduled` in the frontmatter
  - TaskNotes disabled → cells inert, and no file change
  - a code block and the sidebar open at the same time on the same habit

### Documentation
- [x] Add PROJECT_LORE.md entries
  - **Coupling:** this plugin calls TaskNotes' undocumented `app.plugins.plugins.tasknotes.taskService` (`toggleRecurringTaskCompleteWithOccurrenceNotes`, `toggleRecurringTaskComplete`, `toggleRecurringTaskSkipped`) and `cacheManager.getTaskInfo`. All access goes through `src/tasknotes/taskNotesBridge.ts` behind `typeof` checks, so a missing or renamed method means Notice + no write. Never fall back to direct frontmatter writes (`scheduled` would go stale). Verified against TaskNotes 4.13.6.
  - **Invariant:** the DTSTART self-heal in `cycleDay` must not be removed. It exists because TaskNotes' complete plan (`yce`) rewrites DTSTART to the completed date unconditionally for `recurrence_anchor: completion`, and un-completing or skipping never reverts it. Without the heal, click order changes `scheduled` for weekly, biweekly and monthly habits. The heal re-toggles max(`complete_instances`) off and on with the plain `toggleRecurringTaskComplete`.
  - **Gotcha:** `metadataCache 'changed'` in `VaultEventHandler` updates the cache and notifies row listeners. It is not itself a re-render trigger, and code blocks re-render only through the row listener.
  - Update the existing coupling entry about `main.ts renderHabitGraphCodeBlock` / `habitGraphView.ts` duplicating render wiring to point at `buildHabitRow`.
- [x] README: one paragraph on click-to-mark behaviour and its TaskNotes requirement (only if a README section for the graph exists)

## Technical Notes

### Architecture Considerations
- **Module placement:** New logic lives in focused modules, not in `graphRenderer.ts` (already 413 lines). `graphRenderer.ts` gains only a callback param, a predicate and a CSS class. The bridge (`src/tasknotes/`), the pure heal decision (`src/utils/`), and the row builder (`src/ui/`) follow the recommended structure in CLAUDE.md.
- **Lore couplings respected:**
  - `renderGraph` gets a trailing optional param, and `generateDayCells` and `calculateStreak` signatures are untouched.
  - `colorClassForCell` and its `today` invariants are untouched.
  - SVG stays `createElementNS`.
  - The `if (colorClass)` guard on the `g` class stays, and `clickable` is added separately.
  - There is no CSS `filter` (WebKit).
  - Dates stay UTC-midnight.
- **Verified against TaskNotes 4.13.6 (`main.js`):**
  - `toggleRecurringTaskComplete` and `toggleRecurringTaskSkipped` do `getTaskInfo(e.path) || e`, so only `.path` is needed. Both write via the frontmatter helper, then `await cacheManager.waitForFreshTaskData(file)` and `updateTaskInfoInCache(path, updatedTask)`, then `return updatedTask`.
  - `toggleRecurringTaskCompleteWithOccurrenceNotes` can return an occurrence task (when one is materialized or on_completion materialization applies), so its return value is NOT reliable as the parent's fresh state. Otherwise it delegates to `toggleRecurringTaskComplete`.
  - Complete plan `yce`: when adding a completion with `recurrence_anchor === 'completion'` it does `C0(recurrence, date)`, which replaces or adds `DTSTART:<date>;` unconditionally. Un-completing does not revert it. Adding also removes the date from `skipped_instances`.
  - Skip plan `kce`: toggles membership in `skipped_instances`, removes the date from `complete_instances` when adding, and never writes `recurrence`. Neither plan checks that the date is an occurrence.
- **Fresh-state source: TaskNotes' `cacheManager.getTaskInfo(path)`.**
  - Evidence: after each write TaskNotes calls `waitForFreshTaskData` and `updateTaskInfoInCache`, which stores the planned task in `pendingTaskInfoByPath`. `getTaskInfo` prefers the pending entry when its `dateModified` differs from the native metadata-cache copy, so the value is correct immediately after `await toggle…`.
  - Rejected alternative: the toggles' return values (the WithOccurrenceNotes variant can return an occurrence task).
  - Rejected alternative: this plugin's `TaskCacheManager`, which lags the write.
- **Snake_case fields:** TaskNotes `TaskInfo` uses `complete_instances`, `skipped_instances` and `recurrence_anchor`, whereas this plugin's `TaskNote` is camelCase. The bridge reads TaskNotes' shape directly and does not reuse `TaskNote`.

### Implementation Approach
1. Land the pure heal decision, then the bridge with a rich fake, so the order-independence test exists before any UI work.
2. Add the UI hook and CSS, an inert change until wired.
3. Extract the shared row builder plus the per-row change subscription (fixes the stale-render gap), then wire clicks through it.
4. Setting, then lore and docs, then manual verification.

Click flow: cell click (today or past) → `resolveTaskNotesBridge` (null → Notice) → per-path lock → read fresh TaskNotes state → toggle mapped from state → read fresh state → `dtstartRepairDate` → maybe double-toggle L via the plain `toggleRecurringTaskComplete` → TaskNotes writes → Obsidian `metadataCache 'changed'` → `VaultEventHandler` updates the cache and notifies → row re-renders in place.

### Potential Challenges
- **Issue premise is wrong on re-render (verified).** `handleChanged` only updates `TaskCacheManager`. The sidebar refreshes via `vault.on('modify')` (1s debounce), and code blocks never re-render. Task 4 fixes this.
- **Stale DTSTART after undoing the only completion.** With `complete_instances` empty, there is no L to re-toggle, so DTSTART stays at the old date. That is TaskNotes' behaviour and can't be fixed without copying its logic. It only matters for completion-anchored habits with zero remaining completions.
- **Heal write amplification.** The heal does 2 extra writes and can trigger several `changed` events. Mitigated by the per-path debounce on re-render and the busy lock.
- **Heal is not atomic.** Between the off and on toggles, the file has L uncompleted. If the second toggle throws, L stays un-completed. On failure, show a Notice naming the date and re-render from the cache.
- **Occurrence notes.** With `occurrence_materialization: on_completion`, `...WithOccurrenceNotes` on a past date may materialize an occurrence note for that day. That's TaskNotes' own behaviour and is accepted. The heal uses the plain method to avoid doubling it.
- **Concurrency.** Two rows for the same habit (sidebar + code block) share the module-level per-path lock, so a click in either while busy is ignored.
- **Semantic side effects.** Fixed-interval (scheduled-anchor) habits: backfilling moves `scheduled` forward, so missed days before it turn blue (documented in the issue, unchanged). Clicking a rest or not-due day still records a completion or skip.
- **TaskNotes internals may change.** The guard protects against removal, not against changed semantics. Keep the verified version noted in lore.

## Questions/Blockers

### Clarifications Needed
(none; all resolved below)

### Blocked By
Nothing. TaskNotes 4.13.6 is installed in the vault for manual verification.

### Assumptions Made
- Only past and today cells are clickable. Rest days and not-due days are also clickable, because TaskNotes doesn't check that a date is an occurrence.
- The cycle state comes from TaskNotes' fresh task info, not the rendered cell.
- The heal uses the plain `toggleRecurringTaskComplete`, not `...WithOccurrenceNotes`.
- Rapid clicks on a busy habit are ignored (not queued).
- There is no optimistic UI update. The row re-renders when the metadata cache confirms the write.
- Tests stay in the node Jest environment (no DOM). DOM wiring is covered by pure predicate tests plus manual verification.

### Decisions Made
2026-09-29 (setup Q&A)

**Q: How should accidental taps (mobile, narrow sidebar) be guarded?**
**A:** A brief notice after each change, plus the `enableCellClickEdit` setting (default on). No confirm modal.
**Rationale:** Undo is one more tap (the cycle wraps back to blank), and a confirm modal would defeat quick backfill. Keep Task 6.

**Q: How far should the re-render fix go?**
**A:** A shared `buildHabitRow` plus a per-row live update on `changed` (Task 4 as planned).
**Rationale:** Fixes stale code blocks and the ~1s sidebar lag, and removes the duplicated-wiring hazard lore warns about.

**Q: If TaskNotes is missing or its API changed, should cells still look clickable?**
**A:** No. Detect at row-build time and render the cells inert. Clicks still re-check and show a notice if TaskNotes vanished since render.
**Rationale:** Don't advertise an action that can't work.

## Work Log

### 2026-09-29 - Session
- Commit policy (user): commit each task on the branch, no push.
- Completed: Task 1 (`dtstartRepairDate`)
  - Notes: params typed `unknown` so the bridge can pass raw TaskNotes fields without casting; 10 tests.
- Completed: Task 2 (TaskNotes bridge)
  - Notes: notices live in `recordDayClick` (the click handler body) rather than `cycleDay`, which returns a result, so `cycleDay` stays notice-free. Added `isDayClickInFlight(path)` for the row re-render to wait out a click. 22 tests. The click-order test (840 orderings, including a full mistaken cycle) fails with the repair disabled: DTSTART ends 09-15 instead of 09-22.
- Completed: Task 3 (clickable cells)
  - Notes: `isCellClickable` static + trailing `onCellClick`; `classList.add('clickable')` after the color class. The hover outline beats the dark-theme stroke rule on specificity.
- Completed: Task 4 (shared rows + live re-render). **Changed from the planner's design:**
  - The planner had a per-path listener per row, cleaned up when `!isConnected`. That leaks: the sidebar rebuilds every row on any vault modify, and discarded rows only unsubscribe when their own file changes. It's also wrong for code blocks, because reading view detaches off-screen sections and reattaches them later.
  - Instead: `VaultEventHandler.onTaskChanged(cb)` is a single global listener API. Each container owns a `HabitRowSet` and one subscription tied to Obsidian's lifecycle: the view's `this.register` for the sidebar, and `HabitGraphBlock extends MarkdownRenderChild` via `ctx.addChild` for code blocks.
  - The re-render is debounced 100ms and deferred while `isDayClickInFlight(path)`. I dropped the planner's 3s safety-net rebuild: the metadata cache always fires `changed` after a frontmatter write.
  - `main.ts` shrank to `new HabitGraphBlock(el, this)` + `ctx.addChild` + `render()`.
- Completed: Task 5 (click wiring in `buildHabitRow`): cells are clickable only if the bridge resolves at render time; the row gets `habit-busy` while writing.
- Completed: Task 6 (`enableCellClickEdit` setting, default on)
- Completed: Docs. Lore got 3 couplings (buildHabitRow is the only render wiring, replacing the duplication entry; the taskNotesBridge/taskService dependency; lifecycle-owned subscriptions) and 1 invariant (the DTSTART repair). README got usage section 4 and the settings bullet. I didn't touch the README's stale "Tasks plugin" wording, which is out of scope.

### 2026-09-29 - Session Complete
- All implementation tasks complete: 7 commits (cfdc1d0..eb18468)
- Quality checks: 256 tests pass (was 221), tsc clean, production build OK (main.js rebuilt in the plugin folder)
- Still open: manual check in Obsidian (desktop + iOS), which also covers acceptance criteria 1 and 5
- Ready for PR: after the manual check

---
**Generated:** 2026-09-29
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/47
