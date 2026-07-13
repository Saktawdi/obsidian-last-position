import { Notice } from 'obsidian';
import { getTranslation } from '.language/translations';
import LastPositionPlugin from 'src/main';
import { parsePositionExport, serializePositionState } from '../position/positionDataTransfer';

export class DataExportImportUtil {
    /**
     * 导出滚动位置数据到版本化 JSON 文件
     * @param plugin 插件实例
     */
    static exportData(plugin: LastPositionPlugin): void {
        const t = getTranslation();
        const positionState = plugin.positionStore.snapshot();
        if (Object.keys(positionState.files).length === 0
            && Object.keys(positionState.leaves).length === 0) {
            new Notice(t.noDataToExport);
            return;
        }

        const jsonString = serializePositionState(positionState);
        
        // 创建Blob和下载链接
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // 创建临时链接并触发下载
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `obsidian-last-position-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        
        // 清理
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
        
        new Notice(t.dataExported);
    }

    /**
     * 从版本化 JSON 或旧版 TXT 文件导入滚动位置数据
     * @param plugin 插件实例
     * @param onComplete 导入完成后的回调函数
     */
    static importData(plugin: LastPositionPlugin, onComplete: () => void): void {
        const t = getTranslation();
        
        // 创建文件输入元素
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,.txt,application/json,text/plain';
        
        fileInput.addEventListener('change', async (event) => {
            const target = event.target as HTMLInputElement;
            const files = target.files;
            
            if (!files || files.length === 0) {
                return;
            }
            
            const file = files[0];
            const reader = new FileReader();
            
            reader.onload = async (e) => {
                try {
                    const content = e.target?.result as string;
                    const imported = parsePositionExport(content);
                    await plugin.importPositionState(imported.state);
                    onComplete();
                    new Notice(t.dataImported?.replace('{count}', imported.recordCount.toString()) ||
                              `Imported ${imported.recordCount} scroll position records`);
                } catch (error) {
                    console.error('Import error:', error);
                    new Notice(t.importError);
                }
            };
            
            reader.readAsText(file);
        });
        
        // 触发文件选择
        fileInput.click();
    }
}
