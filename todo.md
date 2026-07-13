# Last Position TODO

调研日期：2026-07-12。依据当前代码与 7 个开放 GitHub issue 整理；优先处理会改变阅读位置或导致恢复失败的问题。

## P0：恢复正确性

- [x] **重构滚动位置的状态模型（关联 #7、#8、#4）**
  - 不再只使用全局 `fileName`、`scrollHeight` 和 `Map<file.path, ...>`；以 workspace leaf / tab 实例为恢复与保存的最小单位，并保留文件级回退记录。
  - 在切换标签、工作区布局恢复、分栏和同一文件的多个标签页时，分别保存和恢复各自的位置。
  - 验收：同一文件打开于两个标签页，各自滚动后切换，位置互不覆盖；切换工作区后也能恢复。
  - 来源：[issue #4](https://github.com/Saktawdi/obsidian-last-position/issues/4)、[issue #7](https://github.com/Saktawdi/obsidian-last-position/issues/7)、[issue #8](https://github.com/Saktawdi/obsidian-last-position/issues/8)。

- [x] **改用事件驱动的保存与恢复流程（关联 #6、#7、#10、#11）**
  - 监听实际 Markdown 视图的滚动变化，并使用 debounce 保存；在 leaf 失焦、文件关闭和插件卸载前进行最后一次保存。
  - 将恢复改为“等待视图准备完成 + 有上限的时间窗口”，而非每 100ms 固定轮询；每次尝试确认对应 leaf 和文件仍是目标，避免旧任务覆盖新导航。
  - 将 `isLoading` 由单一全局布尔值改为按 leaf 管理、可取消的恢复任务。
  - 验收：快速连续切换文件后回到原文件，位置精确稳定；编辑或重命名标题不会把视图推到文档顶部。
  - 来源：[issue #6](https://github.com/Saktawdi/obsidian-last-position/issues/6)、[issue #7](https://github.com/Saktawdi/obsidian-last-position/issues/7)、[issue #10](https://github.com/Saktawdi/obsidian-last-position/issues/10)、[issue #11](https://github.com/Saktawdi/obsidian-last-position/issues/11)。

- [x] **尊重链接锚点导航（关联 #11）**
  - 导航目标包含 `#heading` 或 block reference 时，优先让 Obsidian 完成锚点跳转；插件不得以已保存位置覆盖该结果。
  - 为普通文件打开提供可配置的恢复延迟；默认值应经过异步渲染场景验证，避免与 Obsidian 原生导航竞争。
  - 验收：首次点击 `[[note#section]]` 即落在 section，而不是先跳到已保存位置；无锚点时仍可恢复已保存位置。
  - 来源：[issue #11](https://github.com/Saktawdi/obsidian-last-position/issues/11)。

## P1：数据与设置

- [x] **修复 retry count 的语义并增加可观测性（关联 #10）**
  - 保留旧版 `myRetryCount` 作为最大尝试次数，新增可配置的重试间隔；恢复任务只由最大尝试次数结束。
  - 达到最大尝试次数后提示并停止恢复；测试阶段的调试埋点和设置开关不保留在产品中。
  - 验收：增加最大次数不会因固定短间隔而无效；长文档或延迟渲染的文件可完成最大次数内的恢复尝试。
  - 来源：[issue #10](https://github.com/Saktawdi/obsidian-last-position/issues/10)。
  - 评估结果：采用最大次数与重试间隔，移除恢复超时和测试埋点

- [x] **清理已删除文件的记录（关联 #9）**
  - 在设置页提供“清理不存在文件的记录”命令；自动清理启用时同时检查保留期和 `vault.getAbstractFileByPath(path)` 是否仍为文件。
  - 显示删除数量并在执行后持久化；保留用户手动删除数据表条目的能力。
  - 验收：删除笔记后执行清理，其位置记录不会再出现在数据表或导出数据中。
  - 来源：[issue #9](https://github.com/Saktawdi/obsidian-last-position/issues/9)。
  - 评估结果：有过期数据自动清理，本质是重复功能，暂不考虑更新

- [ ] **提供安全的数据迁移与导入校验**
  - 为新的 per-leaf 数据结构增加 schema version 和从现有文件级记录迁移的逻辑。
  - 导入前校验 JSON、路径、数值范围和时间戳；支持 `.json`，并明确合并还是覆盖的行为。
  - 新版本导入需兼容旧版本导出的 `.txt` 数组格式，以及旧版文件级映射格式；旧数据导入后合并到 v2 状态，不覆盖无关的 leaf 记录。
  - 验收：旧版数据加载后可恢复；无效导入不会破坏已有记录。
  - 评估结果：需要做

## P2：交互与扩展功能

- [ ] **补齐保存触发方式与设置生效机制（关联 #4）**
  - 允许组合启用滚动 debounce、点击、切换/关闭视图时保存；设置改变后立即重新绑定事件或重建定时器，无需重启插件。
  - 将当前全局 `document` 事件监听替换为视图范围事件，避免非 Markdown 区域操作写入错误位置。
  - 来源：[issue #4](https://github.com/Saktawdi/obsidian-last-position/issues/4)。

- [ ] **评估并实现位置书签（关联 #4）**
  - 定义书签数据结构、命令和快捷键；按笔记存储并支持跳转、删除和可访问的列表界面。
  - 书签恢复应使用编辑器位置或块/标题标识，不能只依赖易漂移的像素高度。
  - 来源：[issue #4](https://github.com/Saktawdi/obsidian-last-position/issues/4)。

- [ ] **整理设置、文案与视觉反馈（关联 #4）**
  - 修复 README 与源码中的乱码和过期信息；将 package 元数据从 sample-plugin 默认值更新为实际插件信息。
  - 允许使用主题成功色或可配置色，并避免频繁状态栏闪烁干扰阅读。
  - 来源：[issue #4](https://github.com/Saktawdi/obsidian-last-position/issues/4)。

## 验证与发布

- [ ] 为状态存储、迁移、清理、调度和锚点抑制添加单元测试。
- [ ] 在桌面端和 Android 上手工验证：普通文件、长文件、编辑/阅读模式、标题重命名、`[[file#heading]]`、快速切换、分栏、同文件多标签及工作区切换。
- [ ] 更新 manifest、versions、README 中的版本兼容性说明，并在发布前执行 `npm run build`。
