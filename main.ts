import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, } from 'obsidian'
import { TRANSLATIONS, TranslationKey } from './language/translations';

interface LastPositionSettings {
	//自动保存间隔时间,单位秒
	myInterval: number;
	//重试策略-重试次数最大值
	myRetryCount: number;
	//数据
	scrollHeightData: Map<string, number | undefined>;
	//监听事件
	listenEvent: string;
	//语言
	language: TranslationKey;
}

const DEFAULT_SETTINGS: LastPositionSettings = {
	myInterval: 3,
	myRetryCount: 30,
	//数据
	scrollHeightData: new Map<string, number>(),
	//监听事件
	listenEvent: "mouseover",
	//语言
	language: "zh",
}

export default class LastPositionPlugin extends Plugin {
	settings: LastPositionSettings;
	scrollHeight: number | undefined;
	fileName: string;
	
	async onload() {
		await this.loadSettings();
		const t = TRANSLATIONS[this.settings.language];
		// 等待Obsidian加载
		this.app.workspace.onLayoutReady(() => {
			//获取当前文件信息，并且监听打开，并且跳转视图
			this.readOpenFileInfo();

			//注册时钟，每x秒钟就自动保存当前文件高度
			this.registerInterval(window.setInterval(() =>{
				this.settings.scrollHeightData.set(this.fileName,this.scrollHeight);
				this.saveSettings();
			},this.settings.myInterval * 1000));

		});
		// 右下角状态栏
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText(`${t.currentHeight}:${this.scrollHeight}`)
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AutoSaveScrollSettingsTab (this.app, this));

		//监听事件
		this.registerDomEvent(document, this.settings.listenEvent as keyof DocumentEventMap, (ev) => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			this.scrollHeight = view?.currentMode.getScroll();
			statusBarItemEl.setText(`${t.currentHeight}: ${this.scrollHeight?.toFixed(0)}`);
		})
	}


	async readOpenFileInfo() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const t = TRANSLATIONS[this.settings.language];
		if (!view) {
			console.warn(t.noActiveView);
			return;
		}else{
			const file = view.file; // 获取当前文件对象
			if (!file) throw new Error(t.getFileError)
			
			this.fileName = file.path; // 获取文件名
			this.previewScrollTO();
		}
		this.app.workspace.on("file-open", async (file) => {
			if (!file) throw new Error(t.getFileError)
			this.fileName = file.path; // 更新文件名
			this.previewScrollTO();
		});
	}

	/**
	 * 采用重试策略
	 */
	async previewScrollTO(){
		const lastHeight = this.settings.scrollHeightData.get(this.fileName);
		const t = TRANSLATIONS[this.settings.language];
		if(lastHeight){
			let retryCount  = 0;
			const maxRetries = this.settings.myRetryCount;
			const retry = () => {
				if (retryCount >= maxRetries) {
					console.warn(t.retryLimit);
					return;
				}
				retryCount ++;
                if (this.scrollHeight !== lastHeight) {
					setTimeout(retry, 100); // 每 100ms 重试一次
                }
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				view?.currentMode.applyScroll(lastHeight);
				this.scrollHeight = view?.currentMode.getScroll();
            };
            retry();
		}
	}

	onunload() {

	}

	async loadSettings() {
		const loadedData = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
        // 将 scrollHeightData 从普通对象转换为 Map
        if (loadedData.scrollHeightData && !(loadedData.scrollHeightData instanceof Map)) {
            this.settings.scrollHeightData = new Map<string, number | undefined>(
                Object.entries(loadedData.scrollHeightData)
            );
        }
	}

	async saveSettings() {
		// 将 scrollHeightData 转换为普通对象以便保存
        const dataToSave = {
            ...this.settings,
            scrollHeightData: Object.fromEntries(this.settings.scrollHeightData),
        };
        await this.saveData(dataToSave);
	}
}


class AutoSaveScrollSettingsTab  extends PluginSettingTab {
	plugin: LastPositionPlugin;

	constructor(app: App, plugin: LastPositionPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const t = TRANSLATIONS[this.plugin.settings.language];
		 // 语言设置
		 new Setting(containerEl)
		 .setName(t.language)
		 .setDesc(t.languageDesc)
		 .addDropdown((dropdown) => {
			 // 自动从TRANSLATIONS添加选项
			 Object.keys(TRANSLATIONS).forEach(lang => {
				 const label = lang === 'zh' ? '中文' : 
							  lang === 'en' ? 'English' : 
							  lang;
				 dropdown.addOption(lang, label);
			 });
			 
			 return dropdown
				 .setValue(this.plugin.settings.language)
				 .onChange(async (value: TranslationKey) => {
					 this.plugin.settings.language = value;
					 await this.plugin.saveSettings();
					 new Notice(t.restartNotice);
					 this.display();
				 });
		 });
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
		// 展示 scrollHeightData 数据
        new Setting(containerEl)
            .setName(t.scrollData)
            .setDesc(t.scrollDataDesc);
        this.plugin.settings.scrollHeightData.forEach((height, filename) => {
            new Setting(containerEl)
                .setName(filename) // 文件名
                .setDesc(`${t.currentHeight}: ${height ?? t.undefined}`) // 滚动高度
                .addButton((button) =>
                    button
                        .setButtonText(t.delete)
                        .onClick(async () => {
                            // 删除当前条目
                            this.plugin.settings.scrollHeightData.delete(filename);
                            await this.plugin.saveSettings(); // 保存设置
                            this.display(); // 刷新界面
                        })
                );
        });
	}
}
