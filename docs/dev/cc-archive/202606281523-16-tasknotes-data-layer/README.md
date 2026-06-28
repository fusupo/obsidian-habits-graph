# Issue #16 - TaskNotes migration: Data layer — TaskNote types + frontmatter parser

**Archived:** 2026-06-28
**Branch:** 16-tasknotes-data-layer
**Code SHA:** da00e23
**PR:** #20 (merged)
**Status:** Merged

## Summary

Added the TaskNote data model and YAML frontmatter parser as the foundation for migrating from the Tasks plugin to TaskNotes. This is Part 1 of a 4-issue migration plan (#16→#17/#18→#19).

## Key Decisions

- **Plugin detection:** Read frontmatter directly via Obsidian's MetadataCache, no runtime TaskNotes plugin check. More resilient, works without TaskNotes installed, simpler.
- **Field mapping:** Assume canonical field names from the TaskNotes spec. Parser accepts both snake_case (`complete_instances`) and camelCase (`completeInstances`) for flexibility. Configurable field mapping is a known future enhancement.
- **Parser architecture:** `parseTaskNoteFromFrontmatter` is a pure function (zero Obsidian API deps) — fully unit-testable without mocks. Vault-scanning wrappers are thin MetadataCache calls.
- **Additive only:** `TaskInfo` and all old parser functions remain in place. No breaking changes to downstream consumers.

## Files Changed

- `__mocks__/obsidian.ts` (new) — Minimal mock for Jest tests
- `docs/dev/tasknotes-migration.md` — Updated open questions with resolved decisions
- `jest.config.js` (new) — Jest configuration with ts-jest
- `package.json` / `package-lock.json` — Added jest, ts-jest, @types/jest
- `src/__tests__/taskNoteParser.test.ts` (new) — 17 unit tests
- `src/types.ts` — Added `TaskNote` interface
- `src/utils/taskParser.ts` — Added TaskNote parsing functions
- `tsconfig.json` — Added skipLibCheck, excluded test dirs
- `tsconfig.test.json` (new) — Test-specific TypeScript config

## Lessons Learned

- TypeScript 4.7.4 lacks `esnext.disposable` lib which Jest types reference — `skipLibCheck: true` is the pragmatic fix.
- Obsidian's MetadataCache may coerce YAML date-like values to JavaScript Date objects — explicit `instanceof Date` checks needed.
- `metadataCache.getFileCache()` is synchronous, so vault-scanning functions don't need to be async.
