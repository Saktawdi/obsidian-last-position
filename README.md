# Last Position Plugin

![Obsidian](https://img.shields.io/badge/Obsidian-%23483699?style=for-the-badge&logo=obsidian&logoColor=white)

**Last Position** 是一个 Obsidian 插件，用于自动保存和恢复 Markdown 文档的滚动位置。当你重新打开一个文件时，插件会自动将视图滚动到最后一次浏览的位置，提升阅读和编辑的连续性。

---

## 功能特性

- **自动保存滚动位置**：在编辑或浏览文档时，插件会定期保存当前的滚动位置。
- **自动恢复滚动位置**：重新打开文件时，插件会自动将视图滚动到最后保存的位置。
- **可配置的保存间隔**：用户可以根据需要调整自动保存的时间间隔。
- **重试机制**：在恢复滚动位置时，插件会尝试多次以确保滚动成功。
- **状态栏显示**：在 Obsidian 右下角状态栏中显示当前滚动位置。

---

## 安装方法

1. 打开 Obsidian。
2. 进入 **设置** > **社区插件**。
3. 点击 **浏览**，搜索 "Last Position"。
4. 找到插件后，点击 **安装**。
5. 安装完成后，点击 **启用**。

---

## 使用方法

1. **自动保存**：插件会在后台自动保存当前文件的滚动位置，无需手动操作。
2. **自动恢复**：重新打开文件时，插件会自动将视图滚动到最后保存的位置。
3. **状态栏**：在 Obsidian 右下角状态栏中，你可以看到当前的滚动位置。

---

## 配置选项

插件提供了以下配置选项，可以在 **设置** > **Last Position** 中进行调整：

- **自动保存间隔时间**：设置自动保存滚动位置的时间间隔（单位：秒）。默认值为 `3` 秒。
- **重试次数**：设置恢复滚动位置时的最大重试次数。默认值为 `30` 次。
- **文件滚动高度数据**：查看和管理已保存的文件滚动高度数据。你可以删除不需要的条目。

---

## 注意事项

- **性能影响**：插件会定期保存滚动位置，频繁的保存操作可能会对性能产生轻微影响。建议根据实际需求调整保存间隔。
- **重试机制**：如果恢复滚动位置失败，插件会尝试多次。如果重试次数达到上限，插件会停止尝试并输出警告日志。
- **兼容性**：插件已在 Windows上测试通过。如果发现问题，请提交 Issue。

---

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
