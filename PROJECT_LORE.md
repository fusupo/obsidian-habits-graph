# Project Lore

Non-obvious context for future sessions. Each entry: one-line rule, *why*.
Inclusion test: would a future session waste time, repeat a mistake, or
make a wrong choice without this?

## Invariants

- `getCachedTaskNotes` string in tasksApi.ts must match the method name in main.ts — *why: duck-typed `typeof` check; renaming one side silently falls back to uncached parsing*
- VaultEventHandler must use `metadataCache.on('changed')`, not `vault.on('modify')`, for frontmatter reads — *why: vault modify fires before MetadataCache parses frontmatter, giving stale data*
- `getTodayUTC()` must use local date components (`getFullYear/Month/Date`), not UTC (`getUTCFullYear/Month/Date`) — *why: at negative UTC offsets (e.g. PDT), UTC date can be tomorrow; "today" must match the user's wall clock*
- graphRenderer must guard `colorClass` before `setAttribute('class', ...)` on SVG `<g>` elements — *why: empty class attributes are harmless but the guard (`if (colorClass)`) prevents meaningless DOM writes; pattern replaced addClass() in the SVG rewrite*
- SVG elements in graphRenderer must use `document.createElementNS('http://www.w3.org/2000/svg', ...)`, not `document.createElement()` — *why: createElement produces HTML elements that render invisible inside SVG context*
- isDueOn's scheduled-anchor interval branch must SILENTLY fall back to rolling-window completion math when scheduledDate is null — *why: 'scheduled' is the frontmatter default and most habits set no scheduled date; this fallback is what keeps pre-#27 default behavior unchanged. Do not add a console.warn here (it's the common case) and do not "fix" it to throw*
- colorClassForCell's `today` tint modifier must exclude exactly the call-to-action statuses — `'today-missed'` (yellow) and `'today-overdue'` (bright red, since #35) — and 'today' is always appended to a base color class, never standalone — *why: the calls to action only ever appear on today, so tinting/replacing them destroys the graph's main signal (learned across five rejected today-indicator designs in #33: center line, halo, tint overlay, frame, flat purple); the tint is a CSS brightness filter on the base color, so a bare 'today' class renders an untinted transparent rect*
- generateDayCells' today "missed variant" slot escalates to `'today-overdue'` (`.red-bright` diagonal stripes) ONLY for rolling-window interval habits (completion-anchor, or scheduled-anchor with null scheduledDate) when the gap since the overdue anchor — latest of last completion and last skip before today (skip RESETS the clock, not pauses it, since #37), else the scheduled date — strictly exceeds the interval — *why: a habit needs an anchor to be overdue FROM: never-completed with no scheduled date and no skip stays yellow (day-one-due, pinned by the FREQ=DAILY/no-completions regression test), but a past scheduled date or a lone skip IS an anchor (a habit scheduled weeks ago and never done must not sit yellow forever); a skip means "that instance is no longer my responsibility" so it forgives even pre-skip accumulated lateness — do not "fix" it to pause-semantics; gap === interval is the due day itself, not overdue (strict >); fixed-schedule and scheduled-anchor-cadence habits treat each due day as its own instance so they never escalate; and the escalation is today-only — past over-gap days stay plain 'missed'/.red per user directive (#35)*
- the future escalation ramp anchors to `futureAnchorTime` = latest of last completion and last skip ON-OR-BEFORE today (today-INCLUSIVE, unlike the today escalation's strictly-before-today skip anchor) — *why: a skip ON today has no cell of its own to escalate but must still reset tomorrow's forecast (#39); reusing `lastSkipBeforeToday` for both branches passes most tests yet paints tomorrow red after skipping today — the asymmetry is deliberate, not a bug; the "due then" forecast color is light green `future-ok`, never yellow (user directive), and the 0.75x/1.25x/1.5x thresholds are unchanged*

## Gotchas

- Obsidian MetadataCache coerces YAML date-like values (e.g. `2025-01-15`) to JS Date objects, not strings — *why: frontmatter parsing silently breaks if you assume string type; use instanceof Date checks*
- TypeScript 4.7.4 lacks `esnext.disposable` which `@types/jest` references — *why: skipLibCheck: true is required in tsconfig.json or tsc fails on jest-mock types*
- RRULE params are semicolon-delimited (FREQ=WEEKLY;BYDAY=MO,WE,FR), not ampersand — *why: easy to confuse with URL query params when hand-parsing in recurrenceUtils.ts*
- TaskNotes plugin derives title from filename, not frontmatter — *why: parseTaskNoteFromFrontmatter must fall back to basename; requiring a `title` field causes "No habits found"*
- Obsidian's `HTMLElement.addClass('')` throws — *why: unlike standard DOM classList.add, Obsidian's polyfill rejects empty strings; always guard with `if (value)` before calling*
- Binary done/missed is wrong for interval habits in past days — *why: need sorted completion pointer to find most recent completion before each cell and check gap < intervalDays; without this, rest days show as red*
- Marker glyphs (markerForCell) are uniformly completed/status-driven (`*`/`~`/none) with NO today special-case; today is indicated by colorClassForCell's 'today' brightness-tint modifier instead (since #33) — *why: isToday looks dead if you only grep markers; do not reintroduce a `!` glyph or a 'today-rest' status, and a non-due today still reuses plain 'rest' (since #28)*
- SVG graph uses percentage-based x/width on rects (no viewBox, no preserveAspectRatio) with fixed px font-size on text — *why: cells stretch to fill container while markers stay proportional; adding viewBox would distort text or prevent cell stretching*

## Glossary

## Coupling

- TaskNote interface field names (src/types.ts) must match pick() key args in taskParser.ts — *why: adding or renaming a TaskNote field without updating the parser's pick() calls silently drops the value*
- parseRecurrence/isDueOn (recurrenceUtils.ts) are the scheduling authority for graphRenderer.ts: past rest/missed, today's rest/today-missed (since #28), fixed-schedule future cells, and streak gap days all consult isDueOn — *why: parseRecurrenceIntervalDays is now only a display/legacy heuristic that still drives the interval-kind future escalation ramp (0.75x/1.25x/1.5x, completion-anchor/fallback habits only since #27, anchored to the completion-or-skip `futureAnchorTime` since #39); changing one bridge without the other silently diverges rendering*
- generateDayCells' today branch must keep the past branch's exact precedence (completed → skipped → !isDueOn → rest → missed variant), unconditional across recurrence kinds; since #35 the missed-variant slot itself escalates (today-missed → today-overdue), which is a deliberate carve-out WITHIN the slot, not a precedence change — *why: #28 fixed today by mirroring the past branch; re-gating today's isDueOn by kind (or reordering precedence in one branch only) silently makes today inconsistent with the surrounding past cells; see the #35 invariant for the escalation's own rules*
- isDueOn's 'interval' branch must reproduce the legacy rolling-window math (gap >= days, due when no prior completion) on the completion-anchor/null-scheduledDate paths — *why: generateDayCells and calculateStreak assume exact behavioral equivalence for plain-interval habits; the regression suite in graphRenderer.test.ts was verified against the pre-#11 implementation*
- main.ts renderHabitGraphCodeBlock and habitGraphView.ts refresh duplicate the render wiring (parseISODateOrNull(task.scheduled) + recurrenceAnchor/scheduledDate trailing args to generateDayCells AND calculateStreak) — *why: changing the arg list at one call site without the other silently renders sidebar and code blocks differently*
- generateDayCells/calculateStreak new params must be appended trailing-with-defaults, never inserted — *why: all call sites (including the large test suites) pass positionally; inserting shifts meanings without a type error for same-typed params*
- tasksApi.ts duck-types `plugin.getCachedTaskNotes` — *why: renaming in main.ts without updating the string check silently falls back to uncached `parseTaskNotesFromAllFiles`*
- `generateDayCells` sortedCompletions pointer assumes completions sorted ascending — *why: the compIdx pointer advances forward through the array; reordering or unsorted input breaks per-cell rest-day detection*

## Do-not-touch
