# Project Lore

Non-obvious context for future sessions. Each entry: one-line rule, *why*.
Inclusion test: would a future session waste time, repeat a mistake, or
make a wrong choice without this?

## Invariants

- TaskInfo and old Tasks-plugin parsers (parseTasksFromContent, etc.) must stay intact until #18-#19 complete the migration — *why: tasksApi.ts, TaskCacheManager.ts, VaultEventHandler.ts still consume TaskInfo*

## Gotchas

- Obsidian MetadataCache coerces YAML date-like values (e.g. `2025-01-15`) to JS Date objects, not strings — *why: frontmatter parsing silently breaks if you assume string type; use instanceof Date checks*
- TypeScript 4.7.4 lacks `esnext.disposable` which `@types/jest` references — *why: skipLibCheck: true is required in tsconfig.json or tsc fails on jest-mock types*
- RRULE params are semicolon-delimited (FREQ=WEEKLY;BYDAY=MO,WE,FR), not ampersand — *why: easy to confuse with URL query params when hand-parsing in recurrenceUtils.ts*

## Glossary

## Coupling

- TaskNote interface field names (src/types.ts) must match pick() key args in taskParser.ts — *why: adding or renaming a TaskNote field without updating the parser's pick() calls silently drops the value*
- parseRecurrenceIntervalDays (recurrenceUtils.ts) is the sole bridge between recurrence patterns and scheduling window color bands in graphRenderer.ts — *why: changing interval semantics silently shifts all future-day color thresholds (lines 64-72)*

## Do-not-touch
