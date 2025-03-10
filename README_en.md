# Last Position Plugin

![Obsidian](https://img.shields.io/badge/Obsidian-%23483699?style=for-the-badge&logo=obsidian&logoColor=white)

![GitHub release (latest by date)](https://img.shields.io/github/v/release/Saktawdi/obsidian-last-position?style=for-the-badge)
![GitHub all releases](https://img.shields.io/github/downloads/Saktawdi/obsidian-last-position/total?style=for-the-badge)
![License](https://img.shields.io/github/license/Saktawdi/obsidian-last-position?style=for-the-badge)

**Last Position** is an Obsidian plugin that automatically saves and restores the scroll position of Markdown documents. When you reopen a file, the plugin automatically scrolls the view to the last browsed position, enhancing reading and editing continuity.

[English](README_en.md) | [中文](README.md)

## Features

- **Auto-save Scroll Position**: The plugin periodically saves the current scroll position while editing or browsing documents.
- **Auto-restore Scroll Position**: When reopening a file, the plugin automatically scrolls the view to the last saved position.
- **Configurable Save Interval**: Users can adjust the auto-save time interval according to their needs.
- **Retry Mechanism**: When restoring the scroll position, the plugin attempts multiple times to ensure successful scrolling.
- **Status Bar Display**: Shows the current scroll position in the status bar at the bottom right of Obsidian.
- **Data Management**: Provides data import and export functions for backup and migration.
- **Auto Cleanup**: Optional feature to automatically clean up position records for files that haven't been accessed for a long time.
- **Multi-language Support**: Supports both English and Chinese interfaces.

## Installation

1. Open Obsidian.
2. Go to **Settings** > **Community Plugins**.
3. Click **Browse** and search for "Last Position".
4. Once found, click **Install**.
5. After installation, click **Enable**.

## Usage

1. **Auto-save**: The plugin automatically saves the current file's scroll position in the background, no manual operation required.
2. **Auto-restore**: When reopening a file, the plugin automatically scrolls the view to the last saved position.
3. **Status Bar**: You can see the current scroll position in the status bar at the bottom right of Obsidian.

## Configuration Options

The plugin provides the following configuration options, which can be adjusted in **Settings** > **Last Position**:

- **Auto-save Interval**: Set the time interval for automatically saving scroll positions (in seconds). Default value is `3` seconds.
- **Retry Count**: Set the maximum number of retries when restoring scroll positions. Default value is `30` times.
- **Listen Event**: Set the event type that triggers saving the scroll position (mouse hover, click, or scroll).
- **Page Size**: Set the number of entries displayed per page in the data table.
- **Data Management**:
  - **Enable Auto Cleanup**: When enabled, the plugin automatically cleans up file position records that haven't been accessed for a long time.
  - **Cleanup Days**: Set the threshold for auto cleanup, default is `30` days.
  - **Data Import/Export**: Provides data import and export functions for backup and migration.

## Notes

- **Performance Impact**: The plugin periodically saves scroll positions, and frequent save operations may have a slight impact on performance. It's recommended to adjust the save interval according to your actual needs.
- **Retry Mechanism**: If restoring the scroll position fails, the plugin will try multiple times. If the retry count reaches the limit, the plugin will stop trying and output a warning log.
- **Compatibility**: The plugin has been tested on Windows. If you encounter any issues, please submit an Issue.

## License

This project is licensed under the [MIT License](LICENSE).