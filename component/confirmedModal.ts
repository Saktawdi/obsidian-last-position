import { App, Modal, Setting, getLanguage } from 'obsidian';
import { TRANSLATIONS, Translation } from '.language/translations';

function getTranslation(): Translation {
    const lang = getLanguage();
    const t = TRANSLATIONS[lang] || TRANSLATIONS['en'];
    return t;
}

export class ConfirmModal extends Modal {
    private result: boolean = false;
    private resolvePromise: (value: boolean) => void;
    private title: string;
    private message: string;
    private confirmText: string;
    private cancelText: string;

    constructor(
        app: App, 
        {
            title, 
            message, 
            confirmText, 
            cancelText
        }: {
            title?: string;
            message?: string;
            confirmText?: string;
            cancelText?: string;
        } = {}
    ) {
        super(app);
        const t = getTranslation();
        this.title = title || t.confirmClearTitle;
        this.message = message || t.confirmClearMessage;
        this.confirmText = confirmText || t.confirmed;
        this.cancelText = cancelText || t.cancel;
    }

    onOpen() {
        const { contentEl, titleEl } = this;
        
        // 设置标题
        titleEl.setText(this.title);
        
        // 添加消息内容
        contentEl.createEl("p", { text: this.message });
        
        // 添加按钮
        new Setting(contentEl)
            .addButton(btn => 
                btn
                    .setButtonText(this.cancelText)
                    .onClick(() => {
                        this.result = false;
                        this.close();
                    })
            )
            .addButton(btn => 
                btn
                    .setButtonText(this.confirmText)
                    .setCta() // 设置为主要按钮
                    .onClick(() => {
                        this.result = true;
                        this.close();
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        if (this.resolvePromise) {
            this.resolvePromise(this.result);
        }
    }

    /**
     * 打开模态框并返回一个Promise，如果确认则返回true，否则返回false
     */
    public async openAndAwait(): Promise<boolean> {
        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.open();
        });
    }
}