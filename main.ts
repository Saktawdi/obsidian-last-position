import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf, } from 'obsidian'
interface MyPluginSettings {
	//自动保存间隔时间,单位秒
	myInterval: number;
	//重试策略-重试次数最大值
	myRetryCount: number;
	//数据
	scrollHeightData: Map<string, number | undefined>;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	myInterval: 3,
	myRetryCount: 30,
	//数据
	scrollHeightData: new Map<string, number>(),
}

export default class LastPositionPlugin extends Plugin {
	settings: MyPluginSettings;
	view: MarkdownView | null;
	scrollHeight: number | undefined;
	fileName: string;
	
	async onload() {
		await this.loadSettings();
		// 等待Obsidian加载
		this.app.workspace.onLayoutReady(() => {
			// 获取当前活动的Markdown视图
			this.view = this.app.workspace.getActiveViewOfType(MarkdownView);
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
		statusBarItemEl.setText(`当前高度:${this.scrollHeight}`)
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AutoSaveScrollSettingsTab (this.app, this));

		//监听鼠标
		this.registerDomEvent(document, "mouseover", (ev) => {
			this.scrollHeight = this.view?.currentMode.getScroll();
			statusBarItemEl.setText(`当前高度: ${this.scrollHeight?.toFixed(0)}`);
		})
	}


	async readOpenFileInfo() {
		if (!this.view) {
			console.warn("当前没有活动的 Markdown 视图");
			return;
		}else{
			const file = this.view.file; // 获取当前文件对象
			if (!file) throw new Error("获取当前文件对象失败")
			
			this.fileName = file.path; // 获取文件名
			this.previewScrollTO();
		}
		this.app.workspace.on("file-open", async (file) => {
			if (!file) throw new Error("获取文件对象失败")
			this.fileName = file.path; // 更新文件名
			// 更新当前活动的Markdown视图
			this.view = this.app.workspace.getActiveViewOfType(MarkdownView);
			this.previewScrollTO();
		});
	}

	/**
	 * 采用重试策略
	 */
	async previewScrollTO(){
		const lastHeight = this.settings.scrollHeightData.get(this.fileName);
		if(lastHeight){
			let retryCount  = 0;
			const maxRetries = this.settings.myRetryCount;
			const retry = () => {
				if (retryCount >= maxRetries) {
					console.warn("重试次数达到上限，停止重试");
					return;
				}
				retryCount ++;
                if (this.scrollHeight !== lastHeight) {
					console.warn("尝试重试",retryCount - 1)
					setTimeout(retry, 100); // 每 100ms 重试一次
                }
				this.view?.currentMode.applyScroll(lastHeight);
				this.scrollHeight = this.view?.currentMode.getScroll();
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
		new Setting(containerEl)
			.setName('自动保存')
			.setDesc('设置自动保存时间，间隔单位为秒,默认为3秒，下次启动生效')
			.addText((text) =>
			text
				.setPlaceholder('输入时间间隔（秒）')
				.setValue(this.plugin.settings.myInterval.toString())
				.onChange(async (value) => {
					// 将输入的值转换为数字
					const interval = Number(value);
					if (!isNaN(interval) && interval > 0) {
						this.plugin.settings.myInterval = interval;
						await this.plugin.saveSettings(); // 保存设置
						new Notice("更改成功")
					}
				}));
		new Setting(containerEl)
			.setName('重试次数')
			.setDesc('设置重试策略的最大重试次数，默认为30次。⚠请谨慎更改！')
			.addText((text) =>
				text
					.setPlaceholder('输入重试次数')
					.setValue(this.plugin.settings.myRetryCount.toString())
					.onChange(async (value) => {
						// 将输入的值转换为数字
						const retryCount = Number(value);
						if (!isNaN(retryCount) && retryCount > 0) {
							this.plugin.settings.myRetryCount = retryCount;
							await this.plugin.saveSettings(); // 保存设置
							new Notice("更改成功")
						}
					}));
		// 展示 scrollHeightData 数据
        new Setting(containerEl)
            .setName('文件滚动高度数据')
            .setDesc('以下是存储的文件滚动高度数据：');

        this.plugin.settings.scrollHeightData.forEach((height, filename) => {
            new Setting(containerEl)
                .setName(filename) // 文件名
                .setDesc(`滚动高度: ${height ?? '未定义'}`) // 滚动高度
                .addButton((button) =>
                    button
                        .setButtonText('删除')
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
