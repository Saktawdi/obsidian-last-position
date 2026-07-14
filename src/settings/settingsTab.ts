import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { getTranslation } from '.language/translations';
import { DataTable, DataTableContext } from '../component/dataTable';
import { DataExportImportUtil } from '../utils/dataExportImportUtil';
import type { PositionStore } from '../storage/positionStore';
import type { PositionState } from '../domain/positionTypes';
import type { LastPositionSettings } from './settingsModel';

export interface SettingsTabContext extends DataTableContext {
	plugin: Plugin;
	saveSettings: () => Promise<void>;
	persistPositionState: () => Promise<void>;
	importPositionState: (state: PositionState) => Promise<void>;
}

export class AutoSaveScrollSettingsTab extends PluginSettingTab {
	private readonly context: SettingsTabContext;
	private dataTable: DataTable | null = null;

	constructor(context: SettingsTabContext) {
		super(context.app, context.plugin);
		this.context = context;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const t = getTranslation();

		new Setting(containerEl)
			.setName(t.autoSave)
			.setDesc(t.autoSaveDesc)
			.addText(text => text
				.setPlaceholder(t.inputInterval)
				.setValue(this.context.settings.myInterval.toString())
				.onChange(async value => {
					const interval = Number(value);
					if (!Number.isFinite(interval) || interval <= 0) return;
					this.context.settings.myInterval = interval;
					await this.context.saveSettings();
					new Notice(t.restartNotice);
				}));

		new Setting(containerEl)
			.setName(t.retryCount)
			.setDesc(t.retryCountDesc)
			.addText(text => text
				.setPlaceholder(t.inputRetryCount)
				.setValue(this.context.settings.myRetryCount.toString())
				.onChange(async value => {
					const retryCount = Number(value);
					if (!Number.isFinite(retryCount) || retryCount <= 0) return;
					this.context.settings.myRetryCount = retryCount;
					await this.context.saveSettings();
					new Notice(t.restartNotice);
				}));

		new Setting(containerEl)
			.setName(t.restoreInterval)
			.setDesc(t.restoreIntervalDesc)
			.addText(text => text
				.setPlaceholder(t.inputRestoreInterval)
				.setValue(this.context.settings.restoreIntervalMs.toString())
				.onChange(async value => {
					const interval = Number(value);
					if (!Number.isFinite(interval) || interval < 0) return;
					this.context.settings.restoreIntervalMs = interval;
					await this.context.saveSettings();
					new Notice(t.changeSuccess);
				}));

		new Setting(containerEl)
			.setName(t.restoreDelay)
			.setDesc(t.restoreDelayDesc)
			.addText(text => text
				.setPlaceholder(t.inputRestoreDelay)
				.setValue(this.context.settings.restoreDelayMs.toString())
				.onChange(async value => {
					const delay = Number(value);
					if (!Number.isFinite(delay) || delay < 0) return;
					this.context.settings.restoreDelayMs = delay;
					await this.context.saveSettings();
					new Notice(t.changeSuccess);
				}));

		new Setting(containerEl)
			.setName(t.listenEvent)
			.setDesc(t.listenEventDesc)
			.addDropdown(dropdown => dropdown
				.addOption('mouseover', t.mouseOver)
				.addOption('click', t.click)
				.addOption('scroll', t.scroll)
				.setValue(this.context.settings.listenEvent)
				.onChange(async value => {
					this.context.settings.listenEvent = value;
					await this.context.saveSettings();
					new Notice(t.restartNotice);
				}));

		new Setting(containerEl)
			.setName(t.pageSize)
			.setDesc(t.pageSizeDesc)
			.addDropdown(dropdown => dropdown
				.addOption('5', '5')
				.addOption('10', '10')
				.addOption('20', '20')
				.addOption('50', '50')
				.setValue(this.context.settings.pageSize.toString())
				.onChange(async value => {
					this.context.settings.pageSize = Number(value);
					this.dataTable?.setCurrentPage(1);
					await this.context.saveSettings();
					this.display();
				}));

		this.buildDataManagementSettings(containerEl.createEl('details', {
			cls: 'lastposition-nested-settings',
			attr: this.context.settings.dataManagementSettingsOpen ? { open: true } : {},
		}));

		this.dataTable = new DataTable({
			containerEl,
			context: this.context,
			onDataChanged: () => this.display(),
		});
		const currentPage = this.dataTable.getCurrentPage();
		this.dataTable.render();
		this.dataTable.setCurrentPage(currentPage);
	}

	private buildDataManagementSettings(containerEl: HTMLDetailsElement): void {
		const t = getTranslation();
		containerEl.empty();
		containerEl.createEl('summary', { cls: 'lastposition-nested-settings', text: t.dataManagement });

		new Setting(containerEl)
			.setName(t.enableAutoCleanup)
			.setDesc(t.enableAutoCleanupDesc)
			.addToggle(toggle => toggle
				.setValue(this.context.settings.enableAutoCleanup)
				.onChange(async value => {
					this.context.settings.enableAutoCleanup = value;
					await this.context.saveSettings();
					new Notice(t.cleanupDaysNotice);
				}));

		new Setting(containerEl)
			.setName(t.cleanupDays)
			.setDesc(t.cleanupDaysDesc)
			.addSlider(slider => slider
				.setLimits(7, 365, 1)
				.setValue(this.context.settings.cleanupDays)
				.setDynamicTooltip()
				.onChange(async value => {
					this.context.settings.cleanupDays = value;
					await this.context.saveSettings();
				}));

		const importExport = new Setting(containerEl)
			.setName(t.dataImportExport)
			.setDesc(t.dataImportExportDesc);
		importExport.addButton(button => button
			.setButtonText(t.exportData)
			.setCta()
			.onClick(() => DataExportImportUtil.exportData(this.context)));
		importExport.addButton(button => button
			.setButtonText(t.importData)
			.onClick(() => DataExportImportUtil.importData(this.context, () => this.display())));
	}
}
