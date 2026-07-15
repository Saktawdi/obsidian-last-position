# 1.0.0 Release Readiness Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the targeted source cleanup, README refresh, and version-metadata correction required before publishing Last Position 1.0.0.

**Architecture:** Keep all runtime behavior and module boundaries unchanged. Apply mechanical lint fixes in four TypeScript files, replace the two user-facing README files with synchronized localized documentation, and correct only the 1.0.0 minimum-version mapping.

**Tech Stack:** TypeScript 4.7, ESLint, Node.js test runner with tsx, esbuild, Obsidian plugin manifest metadata, Markdown.

## Global Constraints

- Release version remains exactly 1.0.0.
- Minimum supported Obsidian version remains exactly 1.8.0.
- Do not change package naming, dependencies, author metadata, runtime behavior, or public interfaces.
- Do not modify todo.md, existing untracked planning files, archived files, package.json, or manifest.json.
- README.md and README_en.md describe the same features but do not contain release notes.
- GitHub Release notes are delivered separately and are not written to the repository.

---

### Task 1: Clear the existing ESLint errors

**Files:**
- Modify: src/component/confirmedModal.ts:11
- Modify: src/component/dataTable.ts:25-27
- Modify: src/component/dataTable.ts:188-203
- Modify: src/settings/settingsTab.ts:1-8
- Modify: src/settings/settingsTab.ts:70-103
- Modify: src/storage/positionStore.ts:1-7

**Interfaces:**
- Consumes: Existing ConfirmModal, DataTable, AutoSaveScrollSettingsTab, and PositionStore implementations.
- Produces: The same classes and exports with zero ESLint errors and no behavior changes.

- [ ] **Step 1: Confirm the lint baseline**

Run:

~~~powershell
npx --no-install eslint "src/**/*.ts"
~~~

Expected: 13 errors across the four listed files.

- [ ] **Step 2: Apply the exact mechanical cleanup**

In src/component/confirmedModal.ts, replace the inferred boolean declaration with:

~~~ts
private result = false;
~~~

In src/component/dataTable.ts, use inferred primitive types:

~~~ts
private currentPage = 1;
private static lastPage = 1; // 静态变量保存上次页码
private static sortField = 'lastAccessed'; // 默认排序字段
private static sortDirection: 'asc' | 'desc' = 'desc'; // 默认降序排列（最新的在前）
~~~

Wrap the lexical declarations in switch-case blocks:

~~~ts
switch (this.sortField) {
    case 'fileName':
        result = a[0].localeCompare(b[0]);
        break;
    case 'height': {
        const heightA = a[1].height || 0;
        const heightB = b[1].height || 0;
        result = heightA - heightB;
        break;
    }
    case 'lastAccessed':
    default: {
        const timeA = a[1].lastAccessed || 0;
        const timeB = b[1].lastAccessed || 0;
        result = timeA - timeB;
        break;
    }
}
~~~

In src/settings/settingsTab.ts, keep only used imports:

~~~ts
import { Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { TextComponent } from 'obsidian';
import { getTranslation } from '.language/translations';
import { DataTable, DataTableContext } from '../component/dataTable';
import { DataExportImportUtil } from '../utils/dataExportImportUtil';
import type { PositionState } from '../domain/positionTypes';
~~~

Remove the standalone fixedDelaySetting declaration, retain fixedDelayInput, and use this complete smart/fixed-delay block:

~~~ts
let fixedDelayInput: TextComponent | undefined;

new Setting(containerEl)
    .setName(t.smartRestoreDelay)
    .setDesc(t.smartRestoreDelayDesc)
    .addToggle(toggle => toggle
        .setValue(this.context.settings.enableSmartRestoreDelay)
        .onChange(async value => {
            this.context.settings.enableSmartRestoreDelay = value;
            await this.context.saveSettings();
            fixedDelaySetting.settingEl.classList.toggle('is-hidden', value);
            fixedDelayInput?.setDisabled(value);
            new Notice(t.changeSuccess);
        }));

const fixedDelaySetting = new Setting(containerEl)
    .setName(t.restoreDelay)
    .setDesc(t.restoreDelayDesc)
    .addText(text => {
        fixedDelayInput = text;
        this.configureNumericInput(text.inputEl, 0, 50);
        text.setPlaceholder(t.inputRestoreDelay)
            .setValue(this.context.settings.restoreDelayMs.toString())
            .setDisabled(this.context.settings.enableSmartRestoreDelay)
            .onChange(async value => {
                const delay = Number(value);
                if (!Number.isFinite(delay) || delay < 0) return;
                this.context.settings.restoreDelayMs = delay;
                await this.context.saveSettings();
                new Notice(t.changeSuccess);
            });
    });
fixedDelaySetting.settingEl.classList.toggle(
    'is-hidden',
    this.context.settings.enableSmartRestoreDelay,
);
~~~

In src/storage/positionStore.ts, remove LeafPositionRecord only from the import block while preserving it in the export-type block:

~~~ts
import type {
    LegacyPositionData,
    PositionBookmark,
    PositionState,
    ScrollPositionRecord,
} from '../domain/positionTypes';
~~~

- [ ] **Step 3: Verify lint and behavior**

Run:

~~~powershell
npx --no-install eslint "src/**/*.ts"
npm test
~~~

Expected: ESLint exits with zero errors and all 104 tests pass.

- [ ] **Step 4: Commit the source cleanup**

~~~powershell
git add -- src/component/confirmedModal.ts src/component/dataTable.ts src/settings/settingsTab.ts src/storage/positionStore.ts
git commit -m "chore: clear release lint errors"
~~~

### Task 2: Synchronize the Chinese and English README files

**Files:**
- Modify: README.md
- Modify: README_en.md

**Interfaces:**
- Consumes: Implemented commands, status-bar interactions, settings defaults, manifest compatibility, and GitHub Release asset names.
- Produces: Parallel Chinese and English user documentation covering features, installation, usage, configuration, notes, and licensing.

- [ ] **Step 1: Replace README.md with the approved content structure**

Use these sections and facts:

~~~markdown
# Last Position

![Obsidian](https://img.shields.io/badge/Obsidian-%23483699?style=for-the-badge&logo=obsidian&logoColor=white)
![GitHub release](https://img.shields.io/github/v/release/Saktawdi/obsidian-last-position?style=for-the-badge)
![GitHub downloads](https://img.shields.io/github/downloads/Saktawdi/obsidian-last-position/total?style=for-the-badge)
![License](https://img.shields.io/github/license/Saktawdi/obsidian-last-position?style=for-the-badge)

[English](README_en.md) | 中文

Last Position 是一个 Obsidian 插件，用于按标签页自动保存和恢复 Markdown 笔记的滚动位置，让阅读、编辑和工作区切换保持连续。

## 功能

- 按标签页保存和恢复位置，支持编辑模式、阅读模式、分栏和同一文件的多个标签页。
- 尊重标题与块引用锚点导航，不使用历史位置覆盖目标锚点。
- 提供“跳转到上次位置”命令，随时返回当前文件已保存的位置。
- 提供位置书签，可命名保存、搜索跳转和删除；重名书签会自动添加数字后缀。
- 状态栏显示当前高度；左键保存书签，右键打开当前文件的书签列表。
- 支持固定恢复延迟和智能恢复延迟（Beta），并可配置最大重试次数及重试间隔。
- 支持位置数据表、分页、删除、JSON 导入导出和过期数据自动清理。
- 界面支持中文和英文，可在桌面端和移动端 Obsidian 中使用。

## 安装

### 社区插件

1. 打开 Obsidian 的“设置 → 社区插件”。
2. 关闭安全模式（如有提示），点击“浏览”。
3. 搜索 “Last Position”，点击“安装”，然后启用插件。

### 从 GitHub Release 手动安装

1. 从 Releases 页面下载 main.js、manifest.json 和 styles.css。
2. 在仓库的 .obsidian/plugins/ 目录下创建 last-position 文件夹。
3. 将三个文件放入 .obsidian/plugins/last-position/。
4. 重新加载 Obsidian，在“设置 → 社区插件”中启用 Last Position。

需要 Obsidian 1.8.0 或更高版本。

## 使用

插件启用后会自动记录 Markdown 视图的位置，并在再次打开文件或切换标签页时恢复。

可从命令面板使用以下命令：

- Last Position: 跳转到上次位置
- Last Position: 保存书签
- Last Position: 选择书签
- Last Position: 删除书签

状态栏显示当前滚动高度。左键点击状态栏可保存当前位置为书签；右键点击可直接打开当前文件的书签列表。

## 配置

- 自动保存：保存位置的 debounce 间隔，默认 3 秒；修改后重启插件生效。
- 智能恢复延迟（Beta）：根据来源和目标笔记的字数计算恢复延迟，默认关闭。
- 恢复延迟：智能延迟关闭时使用的固定等待时间，默认 300 毫秒。
- 重试次数：恢复位置的最大尝试次数，默认 30 次；修改后重启插件生效。
- 恢复重试间隔：两次恢复尝试之间的等待时间，默认 100 毫秒。
- 每页显示条目数：位置数据表每页显示 5、10、20 或 50 条，默认 10 条。
- 自动清理：插件启动时清理超过保留天数的位置数据，默认关闭。
- 清理天数：可设置为 7–365 天，默认 30 天。
- 数据导入导出：将位置和书签导出为 JSON，或把兼容数据合并导入当前数据。

## 注意事项

- 书签记录的是滚动高度；如果文档内容大幅变化，书签对应的位置可能发生偏移。
- main.js 不纳入源码仓库提交，应从 GitHub Release 附件下载。
- 如遇问题，请在 GitHub Issues 中反馈，并附上 Obsidian 版本、平台和复现步骤。

## 许可证

本项目使用 [MIT License](LICENSE)。
~~~

- [ ] **Step 2: Replace README_en.md with the matching English content**

Use the same section order and facts, translated naturally:

~~~markdown
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

1. Download main.js, manifest.json, and styles.css from the Releases page.
2. Create .obsidian/plugins/last-position/ inside your vault.
3. Copy the three files into that folder.
4. Reload Obsidian and enable Last Position under “Settings → Community plugins”.

Obsidian 1.8.0 or later is required.

## Usage

Once enabled, the plugin records Markdown view positions automatically and restores them when files or tabs are reopened.

The following commands are available from the command palette:

- Last Position: To last position
- Last Position: Save Bookmark
- Last Position: Select Bookmark
- Last Position: Remove Bookmark

The status bar shows the current scroll height. Left-click it to save the current position as a bookmark, or right-click it to open the current file's bookmark list.

## Configuration

- Auto Save: debounce interval for saving positions; defaults to 3 seconds and takes effect after restarting the plugin.
- Smart Restore Delay (Beta): calculates a delay from the source and target note lengths; disabled by default.
- Restore Delay: fixed wait used when smart delay is disabled; defaults to 300 ms.
- Retry Count: maximum restore attempts; defaults to 30 and takes effect after restarting the plugin.
- Restore Retry Interval: wait between restore attempts; defaults to 100 ms.
- Page Size: shows 5, 10, 20, or 50 position records per page; defaults to 10.
- Auto Cleanup: removes expired position data when the plugin starts; disabled by default.
- Cleanup Days: configurable from 7 to 365 days; defaults to 30.
- Data Import/Export: exports positions and bookmarks as JSON or merges compatible data into the current store.

## Notes

- Bookmarks store scroll heights. Large document edits can shift the corresponding visual position.
- main.js is not committed to the source repository; download it from the GitHub Release assets.
- When reporting an issue, include the Obsidian version, platform, and reproduction steps.

## License

This project is licensed under the [MIT License](LICENSE).
~~~

- [ ] **Step 3: Review the two documents for parity**

Run:

~~~powershell
rg -n "^## |1\.8\.0|300|100|30|Bookmark|书签|GitHub Release" README.md README_en.md
~~~

Expected: Both documents contain matching feature, installation, usage, configuration, notes, and license coverage; neither contains a changelog or release-notes section.

- [ ] **Step 4: Commit the README refresh**

~~~powershell
git add -- README.md README_en.md
git commit -m "docs: refresh 1.0.0 usage guides"
~~~

### Task 3: Correct the 1.0.0 version mapping

**Files:**
- Modify: versions.json:4

**Interfaces:**
- Consumes: package.json version 1.0.0 and manifest.json version 1.0.0 with minAppVersion 1.8.0.
- Produces: versions.json mapping 1.0.0 to 1.8.0.

- [ ] **Step 1: Confirm the inconsistent baseline**

Run:

~~~powershell
$manifest = Get-Content -Raw manifest.json | ConvertFrom-Json
$versions = Get-Content -Raw versions.json | ConvertFrom-Json
if ($versions.($manifest.version) -eq $manifest.minAppVersion) { throw 'Expected the baseline to be inconsistent' }
~~~

Expected: command exits successfully because 0.15.0 does not equal 1.8.0.

- [ ] **Step 2: Correct versions.json**

Set its complete content to:

~~~json
{
    "0.2.7": "1.8.0",
    "0.2.8": "1.8.0",
    "1.0.0": "1.8.0"
}
~~~

- [ ] **Step 3: Verify all version metadata**

Run:

~~~powershell
$package = Get-Content -Raw package.json | ConvertFrom-Json
$manifest = Get-Content -Raw manifest.json | ConvertFrom-Json
$versions = Get-Content -Raw versions.json | ConvertFrom-Json
if ($package.version -ne '1.0.0') { throw 'package.json is not 1.0.0' }
if ($manifest.version -ne '1.0.0') { throw 'manifest.json is not 1.0.0' }
if ($manifest.minAppVersion -ne '1.8.0') { throw 'manifest minAppVersion is not 1.8.0' }
if ($versions.'1.0.0' -ne '1.8.0') { throw 'versions.json is inconsistent' }
~~~

Expected: command exits with no output and status 0.

- [ ] **Step 4: Commit the version correction**

~~~powershell
git add -- versions.json
git commit -m "chore: align 1.0.0 version metadata"
~~~

### Task 4: Perform final release-candidate verification

**Files:**
- Verify: src/**/*.ts
- Verify: tests/**/*.test.ts
- Verify: README.md
- Verify: README_en.md
- Verify: package.json
- Verify: manifest.json
- Verify: versions.json
- Verify: main.js

**Interfaces:**
- Consumes: Deliverables from Tasks 1–3.
- Produces: A verified 1.0.0 release candidate and copy-ready GitHub Release notes.

- [ ] **Step 1: Run all automated checks**

Run:

~~~powershell
npx --no-install eslint "src/**/*.ts"
npm test
npm run build
~~~

Expected: ESLint reports zero errors, all 104 tests pass, and esbuild produces main.js successfully.

- [ ] **Step 2: Check release metadata and artifacts**

Run:

~~~powershell
$manifest = Get-Content -Raw manifest.json | ConvertFrom-Json
$versions = Get-Content -Raw versions.json | ConvertFrom-Json
if ($manifest.version -ne '1.0.0' -or $versions.'1.0.0' -ne $manifest.minAppVersion) { throw 'Release metadata mismatch' }
Get-Item main.js, manifest.json, styles.css | Select-Object Name, Length
~~~

Expected: version metadata is consistent and all three Release assets exist with non-zero sizes.

- [ ] **Step 3: Inspect the final diff and preserve user files**

Run:

~~~powershell
git status --short
git diff --check HEAD~3..HEAD
git log -5 --oneline
~~~

Expected: No unintended changes to todo.md, existing untracked plans, or 归档; the three implementation commits follow the plan and design commits.

- [ ] **Step 4: Deliver GitHub Release notes**

Provide the following copy-ready Chinese and English text:

~~~markdown
## 中文

Last Position 1.0.0 是一次面向恢复可靠性、标签页隔离和位置管理的完整升级。

### 主要内容

- 按 workspace leaf / 标签页分别保存和恢复位置，支持编辑模式、阅读模式、分栏以及同一文件的多个标签页。
- 改进快速切换、文件打开、工作区恢复和渲染重置时的恢复稳定性，用户主动滚动会取消过期恢复任务。
- 尊重标题和块引用锚点导航，并支持跨文件锚点在视图准备后重新定位。
- 新增位置书签：可命名保存、搜索选择、跳转和删除；状态栏左键保存书签，右键打开当前文件的书签列表。
- 新增“Last Position: 跳转到上次位置”命令。
- 新增智能恢复延迟（Beta），同时保留固定延迟、最大尝试次数和重试间隔设置。
- 引入版本化位置数据、旧数据迁移、安全导入校验、JSON 导入导出和过期数据清理。
- 更新中英文设置界面和使用文档。

### 兼容性与安装

需要 Obsidian 1.8.0 或更高版本。手动安装时，请下载本 Release 的 main.js、manifest.json 和 styles.css，并放入仓库的 .obsidian/plugins/last-position/ 目录。

## English

Last Position 1.0.0 is a major reliability and position-management update focused on stable restoration and per-tab isolation.

### Highlights

- Saves and restores positions independently per workspace leaf/tab across editing mode, reading mode, split panes, and multiple tabs showing the same file.
- Improves restoration during rapid navigation, file opening, workspace loading, and late renderer resets; explicit user scrolling cancels stale restore work.
- Respects heading and block-reference navigation, including delayed replay for cross-file anchors after the target view is ready.
- Adds named position bookmarks with search, jump, and removal; left-click the status bar to save and right-click to open the current file's bookmark list.
- Adds the “Last Position: To last position” command.
- Adds Smart Restore Delay (Beta) while retaining fixed-delay, maximum-attempt, and retry-interval controls.
- Introduces versioned position storage, legacy migration, validated imports, JSON import/export, and cleanup of expired data.
- Refreshes the Chinese and English settings experience and documentation.

### Compatibility and installation

Requires Obsidian 1.8.0 or later. For manual installation, download main.js, manifest.json, and styles.css from this Release and place them in .obsidian/plugins/last-position/ inside your vault.
~~~
