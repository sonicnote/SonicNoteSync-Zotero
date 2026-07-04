# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Zotero 7+ plugin (`sonicnote-sync@easylinkin.com`) that syncs recordings from the SonicNote (妙记) cloud service as standalone Zotero Note items. Built on [zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template).

## Commands

```bash
npm install            # install dependencies
npm run build          # bundle with esbuild + type-check (tsc --noEmit)
npm run start          # watch mode + auto-reload into Zotero (needs Zotero path config)
npm run release        # build release .xpi
npm run test           # run tests
```

## Architecture

### Plugin bootstrap flow

`addon/bootstrap.js` (Firefox addon sandbox entry) → loads the bundled `src/index.ts` via `Services.scriptloader.loadSubScript` → instantiates `Addon` class and mounts it at `Zotero.SonicNoteSync` → calls `hooks.onStartup()`.

Key sequence: `bootstrap.startup()` → `index.ts` creates `new Addon()` → `hooks.onStartup()` → waits for `Zotero.initializationPromise` / `unlockPromise` / `uiReadyPromise` → attaches to main window → `onMainWindowLoad()` registers the Tools menu and sets up auto-sync timer.

### Addon class (`src/addon.ts`)

Singleton that holds `data` (alive flag, config, env, ztoolkit instance, initialized flag), `hooks`, and `api`. The `ztoolkit` is a `ZoteroToolkit` from `zotero-plugin-toolkit` but is lazily/defensively constructed — **the plugin does not depend on it at runtime** (menus use native DOM manipulation, sync uses `Zotero.ProgressWindow`). If toolkit construction fails, it degrades gracefully.

### Hooks (`src/hooks.ts`)

Lifecycle: `onStartup` → `onMainWindowLoad` (idempotent — skips if already handled for the same window object) → `onMainWindowUnload` → `onShutdown`.

Menu registration is fallback-aware: tries multiple known popup IDs (`menu_ToolsPopup`, `menu_Tools-popup`, `menu_Tools_menupopup`) since Zotero versions differ.

### Sync data flow

1. **API layer** (`src/modules/api.ts`): HTTP calls to SonicNote server. `login()` exchanges API key for token; `authedGet()` wraps GET with auto-re-login on 401-equivalent. Token stored in Zotero prefs.
2. **Sync orchestrator** (`src/modules/sync.ts`): `syncAll()` paginates through all recordings (page size 50), checks dedup index, fetches summary (+ optionally transcript), creates or updates Note items.
3. **Zotero writer** (`src/modules/zotero-writer.ts`): Creates/updates `Zotero.Item("note")` with `h1` title + body HTML. `ensureCollection()` finds or creates the target collection. Note: `libraryID` is a runtime-settable property but `zotero-types` marks it readonly — code casts through `unknown`.

### Dedup mechanism

Each synced note gets two tags:
- `sonicnote:audio_id:<audioId>` — primary key for matching
- `sonicnote:nick:<recordingName>` — detects title renames (if nick changed, update the existing note)

`buildExistingIndex()` scans all non-deleted note items in the user library for these tags and builds a `Map<audioId, {item, nick}>`. If an entry exists and the nick matches → skip; if nick differs → update; if no entry → create.

### Markdown → HTML (`src/modules/md-to-html.ts`)

No-dependency converter covering the subset SonicNote summaries produce: ATX headings, unordered/ordered lists, fenced code blocks, bold/italic, inline code, links. `transcriptToHtml()` renders speaker-labelled transcript segments as a `<ul>`.

### Preferences (`src/utils/prefs.ts`)

All prefs under prefix `extensions.sonicnotesync.*` (from `package.json` config). Typed accessors: `getStringPref`, `getBoolPref`, `getIntPref`. Stored keys: `apiKey`, `token`, `userId`, `collectionName`, `includeTranscript`, `autoSyncIntervalMin`, `serverUrl`, `lastSyncTime`.

### Settings window

XUL window (`addon/content/preferences.xhtml`) with external script (`addon/content/prefs-window.js`). The script is external (not inline) to avoid CSP issues in Zotero 9 chrome windows. It accesses hooks via `window.opener.Zotero.SonicNoteSync.hooks` as a fallback.

### Build config (`zotero-plugin.config.ts`)

- Entry: `src/index.ts` → `.scaffold/build/addon/content/scripts/sonicnotesync.js`
- Target: `firefox115` (Zotero 7's Firefox version)
- Template vars like `__addonRef__`, `__addonName__` are replaced by the scaffold in `addon/bootstrap.js` and `addon/manifest.json`

## Key constraints

- **No `npm test` in CI**: The `zotero-plugin test` command requires a running Zotero instance; build-time verification is `tsc --noEmit` (type-check only).
- **Zotero 7+ only** (`strict_min_version: "6.999"` in manifest).
- The plugin avoids `zotero-plugin-toolkit` runtime APIs — all UI is native DOM/XUL. This protects against toolkit version incompatibility with newer Zotero releases (e.g., Zotero 8/9 on Firefox 140+).
