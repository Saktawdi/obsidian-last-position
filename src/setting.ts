import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { getTranslation } from '.language/translations';
import { DataTable } from './component/dataTable';
import LastPositionPlugin from './main';
import { DataExportImportUtil } from './utils/dataExportImportUtil';
import { emptyPositionState, PositionState } from './position/positionStore';

export interface LastPositionSettings {
	//自动保存间隔时间,单位秒
	myInterval: number;
	//重试策略-重试次数最大值
	myRetryCount: number;
	//恢复任务的重试间隔,单位毫秒
	restoreIntervalMs: number;
	//恢复前等待原生导航完成的时间
	restoreDelayMs: number;
	//版本化的文件级与标签页级位置数据
	positionState: PositionState;
	//数据
	scrollHeightData: Map<string, ScrollPositionData>;
	//监听事件
	listenEvent: string;
	//表格每页显示的条目数
	pageSize: number;
	//是否启用数据自动清理
	enableAutoCleanup: boolean;
	//数据自动清理天数
	cleanupDays: number;
	//数据管理设置是否展开
	dataManagementSettingsOpen: boolean;
}

export interface ScrollPositionData {
	height: number | undefined;
	lastAccessed: number; // 时间戳，表示最后访问时间

}

export const DEFAULT_SETTINGS: LastPositionSettings = {
	myInterval: 3,
	myRetryCount: 30,
	restoreIntervalMs: 100,
	restoreDelayMs: 300,
	positionState: emptyPositionState(),
	//数据
	scrollHeightData: new Map<string, ScrollPositionData>(),
	//监听事件
	listenEvent: "mouseover",
	//表格每页显示的条目数,默认10条
	pageSize: 10,
	//是否启用数据自动清理
	enableAutoCleanup: false,	
	//数据自动清理天数,默认30天
	cleanupDays: 30,
	//数据管理设置是否展开
	dataManagementSettingsOpen: false,
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
						if (Number.isFinite(retryCount) && retryCount > 0) {
							this.plugin.settings.myRetryCount = retryCount;
							await this.plugin.saveSettings(); // 保存设置
							new Notice(t.restartNotice)
						}
					}));
		//恢复重试间隔设置
		new Setting(containerEl)
			.setName(t.restoreInterval)
			.setDesc(t.restoreIntervalDesc)
			.addText((text) =>
				text
					.setPlaceholder(t.inputRestoreInterval)
					.setValue(this.plugin.settings.restoreIntervalMs.toString())
					.onChange(async (value) => {
						const interval = Number(value);
						if (Number.isFinite(interval) && interval >= 0) {
							this.plugin.settings.restoreIntervalMs = interval;
							await this.plugin.saveSettings();
							new Notice(t.changeSuccess);
						}
					}));
		//恢复延迟设置
		new Setting(containerEl)
			.setName(t.restoreDelay)
			.setDesc(t.restoreDelayDesc)
			.addText((text) =>
				text
					.setPlaceholder(t.inputRestoreDelay)
					.setValue(this.plugin.settings.restoreDelayMs.toString())
					.onChange(async (value) => {
						const delay = Number(value);
						if (!isNaN(delay) && delay >= 0) {
							this.plugin.settings.restoreDelayMs = delay;
							await this.plugin.saveSettings();
							new Notice(t.changeSuccess);
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
		// 添加数据管理抽屉设置
		this.buildDataManagementSettings(containerEl.createEl("details", {
			cls: "lastposition-nested-settings",
			attr: {
				...(this.plugin.settings.dataManagementSettingsOpen ? { open: true } : {})
			}
		}));
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
	}

	buildDataManagementSettings(containerEl: HTMLDetailsElement) {
		const t = getTranslation();
		containerEl.empty();
				
		// 创建抽屉标题
		const summary = containerEl.createEl("summary", {cls: "lastposition-nested-settings"});
		summary.setText(t.dataManagement);
		
		// 自动清理设置
		new Setting(containerEl)
			.setName(t.enableAutoCleanup)
			.setDesc(t.enableAutoCleanupDesc)
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.enableAutoCleanup)
					.onChange(async (value) => {
						new Notice(t.cleanupDaysNotice);
						this.plugin.settings.enableAutoCleanup = value;
						await this.plugin.saveSettings();
					});
			});
		// 自动清理天数设置
		new Setting(containerEl)
		.setName(t.cleanupDays)
		.setDesc(t.cleanupDaysDesc)
		.addSlider(slider => {
			slider.setLimits(7, 365, 1)
				.setValue(this.plugin.settings.cleanupDays)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.cleanupDays = value;
					await this.plugin.saveSettings();
				});
		});
		// 导入导出按钮
		const importExportSetting = new Setting(containerEl)
			.setName(t.dataImportExport)
			.setDesc(t.dataImportExportDesc);
		
		// 导出按钮
		importExportSetting.addButton((button) => {
			button
				.setButtonText(t.exportData)
				.setCta()
				.onClick(async () => {
					DataExportImportUtil.exportData(this.plugin);
				});
		});
		// 导入按钮
		importExportSetting.addButton((button) => {
			button
				.setButtonText(t.importData)
				.onClick(async () => {
					DataExportImportUtil.importData(this.plugin, () => {
						this.display(); // 刷新界面
					});
				});
		});
	}
}




