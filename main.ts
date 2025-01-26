import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, } from 'obsidian'
interface MyPluginSettings {
	//自动保存间隔时间,单位秒
	myInterval: number;
	//首次打开延迟跳转时间，单位秒
	myDelay:number;
	//数据
	scrollHeightData: Map<string, number | undefined>;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	myInterval: 3,
	myDelay: 1,
	//数据
	scrollHeightData: new Map<string, number>(),
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	view: MarkdownView | null;
	scrollHeight: number | undefined;
	fileName: string;
	
	async onload() {
		await this.loadSettings();
		console.log("版本号：：：：v1.0.0.1")
		// 等待Obsidian完全加载
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
		this.addSettingTab(new SampleSettingTab(this.app, this));
		this.registerDomEvent(document, "mouseover", (ev) => {
			this.scrollHeight = this.view?.previewMode.getScroll();
			statusBarItemEl.setText(`当前高度: ${this.scrollHeight?.toFixed(0)}`);
		})
		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}
	async readOpenFileInfo() {
		if (this.view) {
			const file = this.view.file; // 获取当前文件对象
			if (!file) throw new Error("获取当前文件对象失败")
			this.fileName = file.basename; // 获取文件名
			const delay = 300 + (file.stat.size/10/1024);
			this.previewScrollTO(delay + this.settings.myDelay * 1000);
		}
		this.app.workspace.on("file-open", async (file) => {
			if (!file) throw new Error("获取文件对象失败")
			this.fileName = file.basename; // 更新文件名
			// 更新当前活动的Markdown视图
			this.view = this.app.workspace.getActiveViewOfType(MarkdownView);
			const delay = 300 + (file.stat.size/10/1024);
			this.previewScrollTO(delay);
		});
	}

	async previewScrollTO(delay:number){
		const lastHeight = this.settings.scrollHeightData.get(this.fileName);
		if(lastHeight){
			setTimeout(()=>{
				this.view?.previewMode.applyScroll(lastHeight);
			},delay)
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

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
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
					}
				}));
		//延迟时间设置
		new Setting(containerEl)
		.setName('首次延迟时间')
		.setDesc('刚打开软件，对于默认文件执行跳转的时间，无效则往后延迟，单位为秒')
		.addText((text) =>
		text
			.setPlaceholder('输入延迟时间（秒）')
			.setValue(this.plugin.settings.myDelay.toString())
			.onChange(async (value) => {
				// 将输入的值转换为数字
				const delay = Number(value);
				if (!isNaN(delay) && delay > 0) {
					this.plugin.settings.myDelay = delay;
					await this.plugin.saveSettings(); // 保存设置
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
