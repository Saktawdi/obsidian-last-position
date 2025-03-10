# Last Position Plugin

![Obsidian](https://img.shields.io/badge/Obsidian-%23483699?style=for-the-badge&logo=obsidian&logoColor=white)

![GitHub release (latest by date)](https://img.shields.io/github/v/release/Saktawdi/obsidian-last-position?style=for-the-badge)
![GitHub all releases](https://img.shields.io/github/downloads/Saktawdi/obsidian-last-position/total?style=for-the-badge)
![License](https://img.shields.io/github/license/Saktawdi/obsidian-last-position?style=for-the-badge)


**Last Position** 是一个 Obsidian 插件，用于自动保存和恢复 Markdown 文档的滚动位置。当你重新打开一个文件时，插件会自动将视图滚动到最后一次浏览的位置，提升阅读和编辑的连续性。

[English](README_en.md) | [中文](README.md)

## 功能特性

- **自动保存滚动位置**：在编辑或浏览文档时，插件会定期保存当前的滚动位置。
- **自动恢复滚动位置**：重新打开文件时，插件会自动将视图滚动到最后保存的位置。
- **可配置的保存间隔**：用户可以根据需要调整自动保存的时间间隔。
- **重试机制**：在恢复滚动位置时，插件会尝试多次以确保滚动成功。
- **状态栏显示**：在 Obsidian 右下角状态栏中显示当前滚动位置。
- **数据管理**：提供数据导入导出功能，方便备份和迁移。
- **自动清理**：可选择启用自动清理功能，清除长时间未访问的文件位置记录。
- **多语言支持**：支持中文和英文界面。

## 安装方法

1. 打开 Obsidian。
2. 进入 **设置** > **社区插件**。
3. 点击 **浏览**，搜索 "Last Position"。
4. 找到插件后，点击 **安装**。
5. 安装完成后，点击 **启用**。

## 使用方法

1. **自动保存**：插件会在后台自动保存当前文件的滚动位置，无需手动操作。
2. **自动恢复**：重新打开文件时，插件会自动将视图滚动到最后保存的位置。
3. **状态栏**：在 Obsidian 右下角状态栏中，你可以看到当前的滚动位置。

## 配置选项

插件提供了以下配置选项，可以在 **设置** > **Last Position** 中进行调整：

- **自动保存间隔时间**：设置自动保存滚动位置的时间间隔（单位：秒）。默认值为 `3` 秒。
- **重试次数**：设置恢复滚动位置时的最大重试次数。默认值为 `30` 次。
- **监听事件**：设置触发保存滚动位置的事件类型（鼠标悬停、点击或滚动）。
- **每页显示条目数**：设置数据表格每页显示的条目数。
- **数据管理**：
  - **启用自动清理**：启用后，插件会自动清理长时间未访问的文件位置记录。
  - **清理天数**：设置自动清理的天数阈值，默认为 `30` 天。
  - **数据导入导出**：提供数据导入和导出功能，方便备份和迁移。

## 注意事项

- **性能影响**：插件会定期保存滚动位置，频繁的保存操作可能会对性能产生轻微影响。建议根据实际需求调整保存间隔。
- **重试机制**：如果恢复滚动位置失败，插件会尝试多次。如果重试次数达到上限，插件会停止尝试并输出警告日志。
- **兼容性**：插件已在 Windows、macOS 和 Linux 上测试通过。如果发现问题，请提交 Issue。

## 许可证

本项目采用 [MIT 许可证](LICENSE) 进行许可。