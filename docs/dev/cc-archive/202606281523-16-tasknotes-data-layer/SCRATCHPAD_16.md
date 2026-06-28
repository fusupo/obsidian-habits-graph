# TaskNotes migration: Data layer — TaskNote types + frontmatter parser - #16

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/16
- **State:** open
- **Labels:** none
- **Milestone:** none
- **Related Issues:**
  - Blocks: #17, #18, #19

## Description

Part 1 of the Tasks Plugin → TaskNotes migration. This is the foundation — all subsequent migration work depends on it.

TaskNotes uses individual markdown files with YAML frontmatter instead of inline checkboxes with emoji markers. This issue covers the new data model and the parser that reads it.

## Acceptance Criteria
- [ ] `TaskNote` interface defined in `types.ts`
- [ ] `taskParser.ts` rewritten to parse YAML frontmatter into `TaskNote` objects
- [ ] Unit tests for the new parser
- [ ] Plugin detection / field mapping approach documented in code

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 16-tasknotes-data-layer
- **Current branch:** main

## Implementation Checklist

### Setup
- [x] Fetch latest from main
- [x] Create and checkout feature branch

### Task 1: Add `TaskNote` interface to `src/types.ts`
- Files: `src/types.ts`
- **Keep `TaskInfo` intact** — removing it breaks `tasksApi.ts`, `taskParser.ts`, `TaskCacheManager.ts`. Add `TaskNote` as a new export alongside it.
- Fields:
  ```typescript
  interface TaskNote {
    id?: string;
    title: string;
    status: string;
    recurrence: string;           // RRULE: "FREQ=DAILY"
    recurrenceAnchor: 'scheduled' | 'completion';
    tags: string[];
    path: string;                 // file path (one file = one task)
    scheduled?: string;
    due?: string;
    completeInstances: string[];  // ["2025-01-15", "2025-01-16"]
    skippedInstances: string[];
    dateCreated?: string;
    dateModified?: string;
  }
  ```
- Risk: None. Purely additive.

### Task 2: Set up Jest test infrastructure
- Files: `package.json`, `jest.config.js` (new), `__mocks__/obsidian.ts` (new), `tsconfig.test.json` (new)
- Add `jest`, `ts-jest`, `@types/jest` to devDependencies
- Add `"test": "jest --runInBand"` script (serial per global CLAUDE.md constraint)
- Create `jest.config.js` with `ts-jest` preset, `moduleNameMapper` for `obsidian`
- Create `tsconfig.test.json` extending root with `"module": "CommonJS"` (needed because root uses `isolatedModules: true`)
- Risk: `isolatedModules: true` + ts-jest can clash if type-only imports aren't marked with `import type`

### Task 3: Implement `parseTaskNoteFromFrontmatter()` with unit tests
- Files: `src/utils/taskParser.ts` (add new function alongside old ones), `src/__tests__/taskNoteParser.test.ts` (new)
- Signature: `parseTaskNoteFromFrontmatter(frontmatter: Record<string, unknown>, filePath: string): TaskNote | null`
- Pure function, zero Obsidian API calls — only imports `TaskNote` from `../types`
- Implementation:
  - Return `null` if frontmatter falsy or lacks `title`
  - Map YAML snake_case keys to TS camelCase (`complete_instances` → `completeInstances`)
  - Accept both `complete_instances` and `completeInstances` spellings
  - Coerce YAML Date objects to ISO strings (YAML may parse `2025-01-15` as Date)
  - Defaults: `recurrence: ''`, `status: 'open'`, `recurrenceAnchor: 'scheduled'`
  - Normalize `tags` (string or array) to `string[]`
- Test cases:
  - Full valid frontmatter — all fields present
  - Minimal frontmatter — only `title`; verify defaults
  - Missing `title` — returns `null`
  - `complete_instances` as YAML Date objects — coerced to strings
  - Empty `complete_instances: []`
  - `tags` as single string vs array
  - `recurrence_anchor: 'completion'` mapping

### Task 4: Add vault-scanning TaskNote functions and document decisions
- Files: `src/utils/taskParser.ts` (add functions), `docs/dev/tasknotes-migration.md` (update open questions)
- New functions:
  ```typescript
  parseTaskNoteFromFile(vault: Vault, metadataCache: MetadataCache, file: TFile): Promise<TaskNote | null>
  parseTaskNotesFromAllFiles(vault: Vault, metadataCache: MetadataCache): Promise<Map<string, TaskNote>>
  ```
- Uses `metadataCache.getFileCache(file)?.frontmatter` — passes to `parseTaskNoteFromFrontmatter`
- Returns `Map<string, TaskNote>` (one task per file, not array)
- Document in code: no runtime plugin check, canonical field names only, configurable mapping not yet supported
- Risk: MetadataCache may not be ready on initial load → return `null`, let lazy-init handle

### Quality Checks
- [x] `npm run build` passes (TypeScript type check + esbuild)
- [x] `npm test` passes (17 tests, new parser tests)
- [x] Old `TaskInfo` consumers still compile (no breaking changes)

## Technical Notes

### Architecture Considerations
- **Additive only**: `TaskInfo` and all old parser functions remain in place. Downstream consumers (`tasksApi.ts`, `TaskCacheManager.ts`, `VaultEventHandler.ts`) will migrate in Issues #18/#19.
- **Pure core + Obsidian shell**: `parseTaskNoteFromFrontmatter` is a pure function (testable without mocks). The vault-scanning wrappers are thin Obsidian API calls that delegate to it.
- **MetadataCache over vault.read**: Uses Obsidian's built-in cache for frontmatter instead of reading+parsing files directly. Faster for full-vault scans and consistent with how Obsidian plugins typically work.

### YAML Date Coercion Risk
Obsidian's MetadataCache may return date-like YAML values (e.g., `2025-01-15`) as JavaScript `Date` objects rather than strings. The parser normalizes with explicit `typeof`/`instanceof` checks. Helper: `coerceDateValue(val: unknown): string | undefined`.

### Decisions Made

**Plugin detection:** Read frontmatter directly, no runtime TaskNotes plugin check. More resilient, works without TaskNotes installed, simpler.

**Field mapping:** Assume canonical field names from the TaskNotes spec (snake_case YAML keys). Accept both `complete_instances` and `completeInstances` for flexibility. Configurable field mapping is a known future enhancement, not in scope.

**Parser export:** `parseTaskNoteFromFrontmatter` is exported — it's the testable core and will be useful for `VaultEventHandler` which calls MetadataCache directly.

**Test location:** `src/__tests__/` directory (conventional Jest pattern).

## Questions/Blockers

### Clarifications Needed
None — decisions resolved during analysis.

### Blocked By
Nothing — this is the foundation layer.

### Assumptions Made
- TaskNotes YAML uses the canonical field names from the spec (not user-configured mappings)
- Obsidian's MetadataCache will be available by the time parsing is needed (lazy-init covers cold start)

## Work Log

### 2026-06-28 - Session 1
- Completed all 4 implementation tasks
- Task 1: Added `TaskNote` interface alongside existing `TaskInfo`
- Task 2: Set up Jest + ts-jest infrastructure, added `tsconfig.test.json` for CommonJS compat, `__mocks__/obsidian.ts`, `skipLibCheck` in root tsconfig to avoid Jest type conflicts with TS 4.7.4
- Task 3: Implemented `parseTaskNoteFromFrontmatter()` — pure function with 17 unit tests covering full/minimal/null frontmatter, YAML Date coercion, snake_case/camelCase field mapping, tag normalization
- Task 4: Added `parseTaskNoteFromFile()` and `parseTaskNotesFromAllFiles()` using MetadataCache (synchronous, no file I/O). Updated migration doc open questions with resolved decisions.
- All quality checks pass: `tsc --noEmit` clean, `npm test` 17/17

---
**Generated:** 2026-06-28
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/16
