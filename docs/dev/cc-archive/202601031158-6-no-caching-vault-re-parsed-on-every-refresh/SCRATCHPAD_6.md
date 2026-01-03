# No caching - vault is re-parsed on every refresh - #6

## Issue Details
- **Repository:** fusupo/obsidian-habits-graph
- **GitHub URL:** https://github.com/fusupo/obsidian-habits-graph/issues/6
- **State:** open
- **Labels:** performance
- **Milestone:** None
- **Assignees:** None
- **Related Issues:** None

## Description
`getAllTasks()` reads and parses every markdown file in the vault on each refresh.

For large vaults (500+ files), this could cause noticeable lag.

**Fix:** Implement caching with invalidation on file changes.

## Acceptance Criteria
- [ ] Implement in-memory caching for parsed task data
- [ ] Implement cache invalidation on file changes (modify, delete, rename)
- [ ] Maintain correctness - cache stays in sync with file changes
- [ ] Improve performance for large vaults (500+ files)
- [ ] getAllTasks() completes in <10ms after initial cache population
- [ ] Memory usage remains reasonable (<10 MB for 1000-file vault)

## Branch Strategy
- **Base branch:** main
- **Feature branch:** 6-no-caching-vault-is-re-parsed-on-every-refresh
- **Current branch:** main

## Implementation Checklist

### Setup
- [ ] Fetch latest from main branch
- [ ] Create and checkout feature branch

### Implementation Tasks

#### Task 1: Create cache manager module
- [ ] Create `src/types.ts` - Extract Task interface
- [ ] Create `src/cache/TaskCacheManager.ts` - Centralize caching logic
  - Files affected: `src/types.ts` (new), `src/cache/TaskCacheManager.ts` (new)
  - Why: Foundation for caching, separates caching logic from plugin lifecycle

#### Task 2: Extract task parsing to utility module
- [ ] Create `src/utils/taskParser.ts` - Move parsing logic from main.ts
- [ ] Refactor `main.ts` to use new parsing utilities
  - Files affected: `src/utils/taskParser.ts` (new), `main.ts` (modified)
  - Why: Enables reuse in both full scan and incremental update scenarios

#### Task 3: Implement vault event listeners
- [ ] Create `src/events/VaultEventHandler.ts` - Handle file change events
- [ ] Register event handlers in `main.ts` onload()
  - Files affected: `src/events/VaultEventHandler.ts` (new), `main.ts` (modified)
  - Why: Detect file changes and invalidate cache automatically

#### Task 4: Integrate caching into getAllTasks()
- [ ] Refactor getAllTasks() to use cache-first approach
- [ ] Add cache initialization logic
  - Files affected: `main.ts` (modified)
  - Why: Replace full vault scan with efficient cache lookups

#### Task 5: Add cache statistics and debugging
- [ ] Add stats tracking to TaskCacheManager
- [ ] Add "Show cache statistics" command
  - Files affected: `src/cache/TaskCacheManager.ts` (modified), `main.ts` (modified)
  - Why: Provide visibility into cache performance for troubleshooting

### Quality Checks
- [ ] Run TypeScript compiler (npm run build)
- [ ] Test in Obsidian with small vault (<50 files)
- [ ] Test in Obsidian with large vault (500+ files if available)
- [ ] Verify file modifications update cache correctly
- [ ] Verify file deletions remove tasks from cache
- [ ] Verify file renames preserve tasks under new path
- [ ] Self-review for code quality
- [ ] Verify acceptance criteria met

### Documentation
- [ ] Update CLAUDE.md if architecture changes significantly (modular structure)
- [ ] Add inline comments for cache invalidation logic

## Technical Notes

### Architecture Considerations

**Module Structure:**
Following CLAUDE.md recommendations for modular organization:

```
src/
  main.ts              # Plugin lifecycle only (onload, onunload, registerCommands)
  types.ts             # Task interface
  cache/
    TaskCacheManager.ts  # Cache operations
  utils/
    taskParser.ts        # File parsing logic
  events/
    VaultEventHandler.ts # Vault event handling
```

**Cache Strategy:** In-memory Map<filePath, Task[]> with event-driven invalidation

**Obsidian Vault Events Available:**
- `vault.on('create', callback)` - New file created
- `vault.on('modify', callback)` - File content changed
- `vault.on('delete', callback)` - File deleted
- `vault.on('rename', callback)` - File renamed

**Integration Points:**
- Event handlers must use `plugin.registerEvent()` for automatic cleanup
- Cache manager should be instantiated in plugin onload()
- Cache is cleared automatically on plugin unload (memory-based)

### Implementation Approach

**Cache Manager (Task 1):**
```typescript
export class TaskCacheManager {
  private cache: Map<string, Task[]> = new Map();
  private isDirty: Set<string> = new Set(); // Files needing re-parse

  invalidateFile(filePath: string): void
  getFileTasks(filePath: string): Task[] | null
  setFileTasks(filePath: string, tasks: Task[]): void
  getAllCachedTasks(): Task[]
  clearCache(): void
  getStats(): { cachedFiles, totalTasks, memoryEstimate }
}
```

**Task Parser (Task 2):**
```typescript
export async function parseTasksFromFile(
  vault: Vault,
  file: TFile
): Promise<Task[]>

export async function parseTasksFromAllFiles(
  vault: Vault
): Promise<Map<string, Task[]>>
```

**Event Handler (Task 3):**
```typescript
export class VaultEventHandler {
  setupEventListeners(plugin: Plugin): void
  private async handleModify(file: TFile): Promise<void>
  private handleDelete(file: TFile): void
  private handleRename(file: TFile, oldPath: string): void
}
```

**Refactored getAllTasks() (Task 4):**
```typescript
async getAllTasks(): Promise<Task[]> {
  // First time: populate cache from all files
  if (this.cacheManager.isEmpty()) {
    const allTasks = await this.taskParser.parseTasksFromAllFiles(this.app.vault);
    this.cacheManager.bulkSet(allTasks);
  }

  // Return cached tasks (event handlers keep cache fresh)
  return this.cacheManager.getAllCachedTasks();
}
```

### Potential Challenges

**Cache-File Synchronization:**
- Risk: Cache becomes stale if file change events are missed
- Mitigation: Thorough testing of all event handlers (modify, delete, rename)
- Edge case: External file edits (handled by Obsidian's file watcher)

**Memory Usage:**
- Risk: Large vaults (>10k files) could consume significant memory
- Mitigation: Estimated 2 MB for 1000 files, ~20 MB for 10k files (acceptable)
- Alternative: Could add cache size limits if needed (unlikely)

**Plugin Lifecycle:**
- Risk: Cache persistence across plugin reload
- Decision: Cache is intentionally ephemeral (cleared on unload)
- Rationale: Simpler implementation, no stale cache issues

### Performance Expectations

**Before (current):**
- Large vault (500 files): ~500-1000ms per refresh
- O(n×m) complexity: parses every file, every line

**After (cached):**
- First load: Same as before (must populate cache)
- Subsequent: ~1-5ms (Map lookup only)
- File modification: ~10-20ms (re-parse single file)

**Memory:**
- 1000-file vault: ~2 MB cache
- Per task: ~200 bytes (file path + line + text + metadata)

## Questions/Blockers

### Clarifications Needed

✓ All clarifications resolved (see Decisions Made section)

### Blocked By
None

### Assumptions Made
- In-memory cache is acceptable (no persistence needed)
- Obsidian's file watcher reliably triggers events for all file changes
- Performance improvement is measurable and significant for vaults with 500+ files
- Module refactoring aligns with project's direction (per CLAUDE.md recommendations)

### Decisions Made
**2026-01-03**

**Q: Should the cache include only markdown files (.md), or also other file types?**
**A:** Markdown only (.md)
**Rationale:** Maintains current behavior and scope. Tasks are typically tracked in markdown files in Obsidian.

**Q: When should the cache be populated?**
**A:** Lazy (on first use)
**Rationale:** Preserves current startup speed. Cache populates when getAllTasks() is first called, avoiding any delay to Obsidian startup.

**Q: What vault size should we optimize for as the primary performance target?**
**A:** 500-1000 files
**Rationale:** Typical large personal vault size. Implementation should handle this comfortably without additional optimizations.

## Work Log

(This section fills in during execution)

---
**Generated:** 2026-01-03
**By:** Issue Setup Skill
**Source:** https://github.com/fusupo/obsidian-habits-graph/issues/6
**Analyzed By:** Scratchpad-Planner Agent (a4e06b5)
