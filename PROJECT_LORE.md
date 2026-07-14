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

## Gotchas

- Obsidian MetadataCache coerces YAML date-like values (e.g. `2025-01-15`) to JS Date objects, not strings — *why: frontmatter parsing silently breaks if you assume string type; use instanceof Date checks*
- TypeScript 4.7.4 lacks `esnext.disposable` which `@types/jest` references — *why: skipLibCheck: true is required in tsconfig.json or tsc fails on jest-mock types*
- RRULE params are semicolon-delimited (FREQ=WEEKLY;BYDAY=MO,WE,FR), not ampersand — *why: easy to confuse with URL query params when hand-parsing in recurrenceUtils.ts*
- TaskNotes plugin derives title from filename, not frontmatter — *why: parseTaskNoteFromFrontmatter must fall back to basename; requiring a `title` field causes "No habits found"*
- Obsidian's `HTMLElement.addClass('')` throws — *why: unlike standard DOM classList.add, Obsidian's polyfill rejects empty strings; always guard with `if (value)` before calling*
- Binary done/missed is wrong for interval habits in past days — *why: need sorted completion pointer to find most recent completion before each cell and check gap < intervalDays; without this, rest days show as red*
- SVG graph uses percentage-based x/width on rects (no viewBox, no preserveAspectRatio) with fixed px font-size on text — *why: cells stretch to fill container while markers stay proportional; adding viewBox would distort text or prevent cell stretching*

## Glossary

## Coupling

- TaskNote interface field names (src/types.ts) must match pick() key args in taskParser.ts — *why: adding or renaming a TaskNote field without updating the parser's pick() calls silently drops the value*
- parseRecurrence/isDueOn (recurrenceUtils.ts) are the scheduling authority for graphRenderer.ts: past rest/missed, fixed-schedule future cells, and streak gap days all consult isDueOn — *why: parseRecurrenceIntervalDays is now only a display/legacy heuristic that still drives the interval-kind future escalation ramp (0.75x/1.25x/1.5x); changing one bridge without the other silently diverges rendering*
- isDueOn's 'interval' branch must reproduce the legacy rolling-window math (gap >= days, due when no prior completion) — *why: generateDayCells and calculateStreak assume exact behavioral equivalence for plain-interval habits; the regression suite in graphRenderer.test.ts was verified against the pre-#11 implementation*
- tasksApi.ts duck-types `plugin.getCachedTaskNotes` — *why: renaming in main.ts without updating the string check silently falls back to uncached `parseTaskNotesFromAllFiles`*
- `generateDayCells` sortedCompletions pointer assumes completions sorted ascending — *why: the compIdx pointer advances forward through the array; reordering or unsorted input breaks per-cell rest-day detection*

## Do-not-touch
