# Last Position

![Obsidian](https://img.shields.io/badge/Obsidian-%23483699?style=for-the-badge&logo=obsidian&logoColor=white)
![GitHub release](https://img.shields.io/github/v/release/Saktawdi/obsidian-last-position?style=for-the-badge)
![GitHub downloads](https://img.shields.io/github/downloads/Saktawdi/obsidian-last-position/total?style=for-the-badge)
![License](https://img.shields.io/github/license/Saktawdi/obsidian-last-position?style=for-the-badge)

English | [中文](README.md)

Last Position is an Obsidian plugin that saves and restores Markdown scroll positions per workspace leaf, keeping reading and editing continuous across files and tabs.

## Features

- Saves and restores positions per tab in editing mode, reading mode, split panes, and multiple tabs showing the same file.
- Respects heading and block-reference navigation instead of overriding anchors with saved history.
- Provides a “To last position” command for returning to the current file's saved position.
- Provides named position bookmarks with search, jump, and removal; duplicate names receive numeric suffixes.
- Shows the current height in the status bar; left-click saves a bookmark and right-click opens the current file's bookmark list.
- Supports a fixed restore delay, Smart Restore Delay (Beta), a maximum attempt count, and a retry interval.
- Provides a paginated position table, deletion, JSON import/export, and optional cleanup of expired data.
- Includes Chinese and English interfaces and is available on desktop and mobile Obsidian.

## Installation

### Community Plugins

1. Open “Settings → Community plugins” in Obsidian.
2. Disable Restricted mode if prompted, then select “Browse”.
3. Search for “Last Position”, install it, and enable the plugin.

### Manual installation from GitHub Releases

1. Download `main.js`, `manifest.json`, and `styles.css` for the same version from the [Releases](https://github.com/Saktawdi/obsidian-last-position/releases) page.
2. Create `.obsidian/plugins/last-position/` inside your Obsidian vault.
3. Copy the three files into that folder.
4. Reload Obsidian and enable Last Position under “Settings → Community plugins”.

Obsidian `1.8.0` or later is required.

## Usage

Once enabled, the plugin records Markdown view positions automatically and restores them when files or tabs are reopened. Heading and block-reference link targets take priority over saved history.

The following commands are available from the command palette:

- `Last Position: To last position`
- `Last Position: Save Bookmark`
- `Last Position: Select Bookmark`
- `Last Position: Remove Bookmark`

The status bar shows the current scroll height. Left-click it to save the current position as a bookmark, or right-click it to open the current file's bookmark list.

## Configuration

- **Auto Save**: debounce interval for saving positions; defaults to `3` seconds and takes effect after restarting the plugin.
- **Listen Event**: event that triggers position saving; supports mouseover, click, or scroll, defaults to `mouseover`, and takes effect after restarting the plugin.
- **Smart Restore Delay (Beta)**: calculates a delay from the source and target note lengths; disabled by default and overrides the fixed delay when enabled.
- **Restore Delay**: fixed wait used when smart delay is disabled; defaults to `300` ms.
- **Retry Count**: maximum restore attempts; defaults to `30` and takes effect after restarting the plugin.
- **Restore Retry Interval**: wait between restore attempts; defaults to `100` ms.
- **Page Size**: shows `5`, `10`, `20`, or `50` position records per page; defaults to `10`.
- **Auto Cleanup**: removes expired position data when the plugin starts; disabled by default.
- **Cleanup Days**: configurable from `7–365` days; defaults to `30`.
- **Data Import/Export**: exports positions and bookmarks as JSON or merges validated compatible data into the current store.

## Notes

- Bookmarks store scroll heights. Large document edits can shift the corresponding visual position.
- Long notes or notes with extensive asynchronous rendering may need a longer restore delay or more retry attempts.
- `main.js` is not committed to the source repository; download it from the GitHub Release assets.
- When reporting a problem in [GitHub Issues](https://github.com/Saktawdi/obsidian-last-position/issues), include the Obsidian version, platform, and reproduction steps.

## License

This project is licensed under the [MIT License](LICENSE).
