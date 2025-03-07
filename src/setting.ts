import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { getTranslation } from '.language/translations';
import { DataTable } from './component/dataTable';
import LastPositionPlugin from './main';

export interface LastPositionSettings {
	//自动保存间隔时间,单位秒
	myInterval: number;
	//重试策略-重试次数最大值
	myRetryCount: number;
	//数据
	scrollHeightData: Map<string, number | undefined>;
	//监听事件
	listenEvent: string;
	//表格每页显示的条目数
	pageSize: number;
}

export const DEFAULT_SETTINGS: LastPositionSettings = {
	myInterval: 3,
	myRetryCount: 30,
	//数据
	scrollHeightData: new Map<string, number>(),
	//监听事件
	listenEvent: "mouseover",
	//表格每页显示的条目数,默认10条
	pageSize: 10,
}

export class AutoSaveScrollSettingsTab  extends PluginSettingTab {
	plugin: LastPositionPlugin;
	private dataTable: DataTable | null = null;

	constructor(app: App, plugin: LastPositionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const t = getTranslation();
		//自动保存时间间隔设置
		new Setting(containerEl)
			.setName(t.autoSave)
			.setDesc(t.autoSaveDesc)
			.addText((text) =>
			text
				.setPlaceholder(t.inputInterval)
				.setValue(this.plugin.settings.myInterval.toString())
				.onChange(async (value) => {
					// 将输入的值转换为数字
					const interval = Number(value);
					if (!isNaN(interval) && interval > 0) {
						this.plugin.settings.myInterval = interval;
						await this.plugin.saveSettings(); // 保存设置
						new Notice(t.restartNotice)
					}
				}));
		//重试次数设置
		new Setting(containerEl)
			.setName(t.retryCount)
			.setDesc(t.retryCountDesc)
			.addText((text) =>
				text
					.setPlaceholder(t.inputRetryCount)
					.setValue(this.plugin.settings.myRetryCount.toString())
					.onChange(async (value) => {
						// 将输入的值转换为数字
						const retryCount = Number(value);
						if (!isNaN(retryCount) && retryCount > 0) {
							this.plugin.settings.myRetryCount = retryCount;
							await this.plugin.saveSettings(); // 保存设置
							new Notice(t.restartNotice)
						}
					}));
		//监听事件设置
		new Setting(containerEl)
			.setName(t.listenEvent)
			.setDesc(t.listenEventDesc)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('mouseover', '鼠标悬停(mouseover)')
					.addOption('click', '鼠标点击(click)')
					.addOption('scroll', '滚动(scroll)')
					.setValue(this.plugin.settings.listenEvent)
					.onChange(async (value) => {
						this.plugin.settings.listenEvent = value;
						await this.plugin.saveSettings(); // 保存设置
						new Notice(t.restartNotice)
					})
			);
		//每页显示条目数设置
		new Setting(containerEl)
			.setName(t.pageSize)
			.setDesc(t.pageSizeDesc)
			.addDropdown((dropdown) => {
				dropdown
					.addOption('5', '5')
					.addOption('10', '10')
					.addOption('20', '20')
					.addOption('50', '50')
					.setValue(this.plugin.settings.pageSize.toString())
					.onChange(async (value) => {
						const pageSize = Number(value);
						this.plugin.settings.pageSize = pageSize;
						if (this.dataTable) {
							this.dataTable.setCurrentPage(1); // 重置到第一页
						}
						await this.plugin.saveSettings();
						this.display(); // 刷新界面
					});
			});
		// 使用DataTable组件渲染表格
		this.dataTable = new DataTable({
			containerEl: containerEl,
			plugin: this.plugin,
			app: this.app,
			onDataChanged: () => {
				this.display(); // 刷新整个设置页面
			}
		});
		// 如果之前有页码状态，恢复它
		if (this.dataTable) {
			const currentPage = this.dataTable.getCurrentPage();
			this.dataTable.render();
			this.dataTable.setCurrentPage(currentPage);
		}
		// // 展示 scrollHeightData 数据 - 使用表格形式
		// const dataSection = containerEl.createDiv('data-table-section');
		// dataSection.createEl('h3', { text: t.scrollData });
		// dataSection.createEl('p', { text: t.scrollDataDesc });
		// // 创建表格
		// if (this.plugin.settings.scrollHeightData.size > 0) {
		// 	const table = dataSection.createEl('table');
		// 	// 设置表格宽度占满容器
		// 	table.style.width = '100%';
		// 	// 表头
		// 	const thead = table.createEl('thead');
		// 	// 样式：表头内容靠左
		// 	thead.style.textAlign = 'left';
		// 	const headerRow = thead.createEl('tr');
		// 	headerRow.createEl('th', { text: t.table_fileName });
		// 	headerRow.createEl('th', { text: t.table_scrollHeight });
		// 	headerRow.createEl('th', { text: t.table_actions });
		// 	// 表格内容
		// 	const tbody = table.createEl('tbody');
		// 	// 样式：表格内容靠左
		// 	tbody.style.textAlign = 'left';
		// 	// 样式：每行间隔
		// 	tbody.style.padding = '20px';
		// 	this.plugin.settings.scrollHeightData.forEach((height, filename) => {
		// 		const row = tbody.createEl('tr');
		// 		// 文件名列
		// 		row.createEl('td', { text: filename });
		// 		// 高度列
		// 		row.createEl('td', { text: `${height?.toFixed(0) ?? t.undefined}` });
		// 		// 操作列
		// 		const actionCell = row.createEl('td');
		// 		const deleteBtn = actionCell.createEl('button', { text: t.delete });
		// 		deleteBtn.addEventListener('click', async () => {
		// 		// 使用确认对话框
		// 		const confirmModal = new ConfirmModal(this.app,{message: t.confirmClearMessage + '-[' + filename + ']'});
		// 		const confirmed = await confirmModal.openAndAwait();
		// 		if (confirmed) {
		// 			this.plugin.settings.scrollHeightData.delete(filename);
		// 			await this.plugin.saveSettings();
		// 			this.display(); // 刷新界面
		// 		}
		// 		});
		// 	});
		// } else {
		// 	dataSection.createEl('p', { text: t.noDataAvailable});
		// }
	}
}