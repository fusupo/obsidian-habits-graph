# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Type

This is an Obsidian community plugin - a TypeScript-based extension that runs inside the Obsidian note-taking application. The plugin is bundled into a single `main.js` file that Obsidian loads at runtime.

## Build System

**Bundler**: esbuild (required - do not replace without updating esbuild.config.mjs)
**Package Manager**: npm (required - package.json defines npm-specific scripts)

### Development Commands

```bash
# Install dependencies
npm install

# Development mode (watch mode with source maps)
npm run dev

# Production build (minified, no source maps, type checking)
npm run build

# Version bump (after manually updating minAppVersion in manifest.json)
npm version patch|minor|major
```

### Build Configuration

- Entry point: `main.ts` → bundled to `main.js`
- Target: ES2018, CommonJS format
- External dependencies (not bundled): `obsidian`, `electron`, CodeMirror packages, builtin modules
- Development builds include inline source maps; production builds are minified

## Critical Files

- **manifest.json**: Plugin metadata. The `id` field must never change after release. Version must follow SemVer.
- **versions.json**: Maps plugin versions to minimum Obsidian app versions
- **main.ts**: Current entry point with plugin lifecycle and sample implementations
- **esbuild.config.mjs**: Build configuration - handles bundling with watch mode
- **version-bump.mjs**: Automated version synchronization script

## Architecture Guidelines

### Current State
The codebase currently has all plugin logic in a single `main.ts` file (~135 lines). This is acceptable for a sample/template but should be refactored for real plugins.

### Recommended Structure (from AGENTS.md)
When extending this plugin, organize code into focused modules:

```
src/
  main.ts           # Plugin lifecycle only (onload, onunload, registerCommands)
  settings.ts       # Settings interface and defaults
  commands/         # Command implementations
  ui/              # Modals, views, custom UI components
  utils/           # Helper functions, constants
  types.ts         # TypeScript interfaces
```

**Key principle**: Keep `main.ts` minimal (lifecycle management only). Delegate all feature logic to separate modules. If any file exceeds 200-300 lines, split it.

## Plugin Lifecycle

1. **onload()**: Initialize plugin - load settings, register commands/ribbon icons/status bars, attach event listeners
2. **onunload()**: Cleanup (automatic if using `this.register*()` helpers)
3. Use `this.registerEvent()`, `this.registerDomEvent()`, `this.registerInterval()` for automatic cleanup

## Settings Management

- Persist with `this.loadData()` / `this.saveData()`
- Define interface + defaults pattern (see main.ts:5-10)
- Provide settings tab via `this.addSettingTab()`

## Commands

- Add via `this.addCommand({ id, name, callback })`
- Command IDs must be stable - never rename after release
- Use `checkCallback` for conditional commands (see main.ts:52-66)
- Editor commands use `editorCallback` (see main.ts:43-46)

## Release Process

1. Update `minAppVersion` in manifest.json if using new APIs
2. Run `npm version patch|minor|major` (auto-updates manifest.json, package.json, versions.json)
3. Run `npm run build` to create production main.js
4. Create GitHub release with tag matching version exactly (no 'v' prefix)
5. Attach `manifest.json`, `main.js`, and `styles.css` (if exists) as release assets

## Security & Privacy Requirements

- Default to offline/local operation
- No network requests without explicit user need and documentation
- No telemetry without opt-in
- Never execute remote code or auto-update outside official releases
- Only access files within the vault
- Use `this.register*()` helpers to ensure clean unload

## Mobile Compatibility

- Set `isDesktopOnly: true` in manifest.json if using Node/Electron APIs
- Avoid desktop-only assumptions
- Test on iOS/Android when feasible

## TypeScript Configuration

- Strict mode enabled (noImplicitAny, strictNullChecks)
- Target: ES6, Module: ESNext
- Inline source maps for development

## Obsidian API Usage

- Import from `obsidian` package (externalized, not bundled)
- Common classes: `Plugin`, `Modal`, `Notice`, `PluginSettingTab`, `Setting`, `Editor`, `MarkdownView`
- API docs: https://docs.obsidian.md and https://github.com/obsidianmd/obsidian-api

## Additional Resources

Detailed project conventions and best practices are documented in AGENTS.md, which includes:
- File organization patterns
- Manifest requirements
- UX/copy guidelines
- Performance considerations
- Common implementation patterns
