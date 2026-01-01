# Issue #1 - Bug: Streak count is calculated but never displayed

**Archived:** 2025-12-31
**PR:** #9
**Status:** Merged

## Summary

Fixed a bug where the streak count was being calculated by `calculateStreak()` in `graphRenderer.ts` but never displayed in the habit graph UI. The "Show streak count" toggle in settings had no visible effect.

## Solution

Added streak display code in `renderGraph()` method after the habit label creation:

```typescript
// Display streak count if enabled
if (showStreak && streak > 0) {
    const streakEl = labelContainer.createSpan({ cls: 'habit-streak' });
    streakEl.textContent = ` 🔥${streak}`;
}
```

## Files Changed

- `src/graphRenderer.ts` - Added streak display in `renderGraph()` (lines 133-136)
- `src/tasksApi.ts` - Fixed pre-existing TypeScript error (cast `this.app` to `any`)

## Key Decisions

- Display streak with fire emoji format: `🔥{count}`
- Only show streak when `showStreak` setting is enabled AND streak > 0
- Streak appears as a span element next to the habit name with `habit-streak` class
