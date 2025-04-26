import { App, Editor, MarkdownView, Notice, Plugin, WorkspaceLeaf} from 'obsidian'
import { TRANSLATIONS,getTranslation,getLanguage} from '.language/translations';
import { LastPositionSettings, DEFAULT_SETTINGS, AutoSaveScrollSettingsTab, ScrollPositionData } from './setting';

export default class LastPositionPlugin extends Plugin {
	settings: LastPositionSettings;
	scrollHeight: number | undefined;
	fileName: string;
	statusBarItemEl: HTMLElement; // 右下角状态栏用于显示滚动高度
	isLoading: boolean = false; //是否正在跳转至目标高度
	fileNameList: string[] = []; //文件名列表
	
	async onload() {
		await this.loadSettings();
		const lang = getLanguage();
		if (!TRANSLATIONS[lang]) {
			new Notice(`[Last-Position-Plugin]:Language "${lang}" not supported. Falling back to English.`);
		}
		const t = getTranslation();
		// 右下角状态栏
        this.statusBarItemEl = this.addStatusBarItem();
        this.statusBarItemEl.setText(`${t.currentHeight}: ${this.scrollHeight || 0}`);
		// 等待Obsidian加载
		this.app.workspace.onLayoutReady(() => {
			//获取当前文件信息，并且监听打开，并且跳转视图
			this.readOpenFileInfo();
			this.registerOpenFileEvent();
			//注册时钟，每x秒钟就自动保存当前文件高度
			this.registerInterval(window.setInterval(() =>{
				if(this.isLoading){
					return;
				}
				//如果文件名不存在，则不保存,调用readOpenFileInfo()
				if(!this.fileName){
					this.readOpenFileInfo();
					return;
				}
				//scrollHeight为undefined，则不保存
				if(!this.scrollHeight){
					return;
				}
				this.settings.scrollHeightData.set(this.fileName,{
					height: this.scrollHeight,
					lastAccessed: Date.now()
				});
				this.saveSettings();
				// 保存时状态栏变色效果
				this.flashStatusBar();
			},this.settings.myInterval * 1000));

		});
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new AutoSaveScrollSettingsTab (this.app, this));
		//监听事件：触发高度数据更新
		this.registerDomEvent(document, this.settings.listenEvent as keyof DocumentEventMap, (ev) => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			this.scrollHeight = view?.currentMode.getScroll();
			this.statusBarItemEl.setText(`${t.currentHeight}: ${this.scrollHeight?.toFixed(0)}`);
		})
		// 如果启用了自动清理，执行一次清理
		if (this.settings.enableAutoCleanup) {
			this.cleanupOldData();
		}
	}

	/**
	 * 闪烁状态栏
	 */
    flashStatusBar() {
        const t = getTranslation();
        const originalText = this.statusBarItemEl.getText();
        const originalColor = this.statusBarItemEl.style.color;
        
        // 变成绿色并显示保存成功信息
        this.statusBarItemEl.style.color = 'var(--text-success, #50fa7b)';
        this.statusBarItemEl.setText(`${t.currentHeight}: ${this.scrollHeight?.toFixed(0) || 0}`);
        
        // 500毫秒后恢复原来的颜色和文本
        setTimeout(() => {
            this.statusBarItemEl.style.color = originalColor;
            this.statusBarItemEl.setText(originalText);
        }, 500);
    }

	//读取打开的文件信息
	async readOpenFileInfo() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		const t = getTranslation();
		if (!view) {
			//console.warn(t.noActiveView);
			return;
		}else{
			const file = view.file; // 获取当前文件对象
			if (!file){
				console.warn(t.getFileError);
				return;
			}
			this.fileName = file.path; // 获取文件名
		}
	}

	//注册文件打开事件
	async registerOpenFileEvent(){
		const t = getTranslation();
		//如果首次打开第一个文件，则添加文件名，并且跳转
		if(this.fileNameList.length === 0){
			this.fileNameList.push(this.fileName);
			this.previewScrollTO();
		}
		this.registerEvent(
			this.app.workspace.on("file-open", async (file) => {
				if (!file){
					console.warn(t.getFileError);
					return;
				}
				this.fileName = file.path; // 更新文件名
				//如果文件名列表中不存在，则添加且跳转
				if(!this.fileNameList.includes(this.fileName)){
					this.fileNameList.push(this.fileName);
					this.previewScrollTO();
				}
			})
		);
	}

	/**
	 * 采用重试策略
	 */
	async previewScrollTO(){
		this.isLoading = true;
		const lastPositionData = this.settings.scrollHeightData.get(this.fileName);
		const t = getTranslation();
		if(lastPositionData && lastPositionData.height !== undefined){
			let retryCount = 0;
			const maxRetries = this.settings.myRetryCount;
			const targetHeight = lastPositionData.height;
			const retry = () => {
				//如果重试次数大于最大重试次数，则停止重试
				if (retryCount >= maxRetries) {
					console.warn(t.retryLimit);
					new Notice(t.retryLimit);
					this.isLoading = false;
					return;
				}
				retryCount++;
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!view) {
					setTimeout(retry, 100);
					return;
				}
				view.currentMode.applyScroll(targetHeight);
				this.scrollHeight = view.currentMode.getScroll();
				// 检查是否成功设置了滚动位置
				if (Math.abs(this.scrollHeight - targetHeight) > 1) {
					setTimeout(retry, 100); // 每 100ms 重试一次
				}else{
					this.isLoading = false;
				}
			};
			retry();
		}else{
			this.isLoading = false;
		}
	}

	onunload() {

	}

	async loadSettings() {
		const loadedData = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		// 将 scrollHeightData 从普通对象转换为 Map
		if (loadedData.scrollHeightData && !(loadedData.scrollHeightData instanceof Map)) {
			this.settings.scrollHeightData = new Map(
				Object.entries(loadedData.scrollHeightData).map(([key, value]) => {
					// 兼容旧版本数据格式（直接是数字）
					if (typeof value === 'number') {
						return [key, {
							height: value,
							lastAccessed: Date.now()
						}];
					}
					// 新版本数据格式（已经是对象）
					return [key, value as ScrollPositionData];
				})
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
	/**
	 * 清理过期数据
	 */
	cleanupOldData() {
		if (!this.settings.enableAutoCleanup) return;
		
		const now = Date.now();
		const cutoffTime = now - (this.settings.cleanupDays * 24 * 60 * 60 * 1000); // 转换天数为毫秒
		let cleanedCount = 0;
		
		// 遍历所有数据，删除过期的
		for (const [path, data] of this.settings.scrollHeightData.entries()) {
			if (data.lastAccessed && data.lastAccessed < cutoffTime) {
				this.settings.scrollHeightData.delete(path);
				cleanedCount++;
			}
		}
		
		// 如果有数据被清理，保存设置
		if (cleanedCount > 0) {
			console.log(`[Last-Position-Plugin]: Cleaned up ${cleanedCount} old entries`);
			this.saveSettings();
		}
	}
}


