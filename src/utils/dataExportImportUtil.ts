import { Notice } from 'obsidian';
import { getTranslation } from '.language/translations';
import LastPositionPlugin from 'src/main';
import { ScrollPositionData } from 'src/setting';

export class DataExportImportUtil {
    /**
     * 导出滚动位置数据到文本文件
     * @param plugin 插件实例
     */
    static exportData(plugin: LastPositionPlugin): void {
        const t = getTranslation();
        if (plugin.settings.scrollHeightData.size === 0) {
            new Notice(t.noDataToExport);
            return;
        }

        // 将Map转换为JSON
        const dataToExport = Array.from(plugin.settings.scrollHeightData.entries())
            .map(([filename, data]) => ({
                filename,
                height: data.height,
                lastAccessed: data.lastAccessed
            }));
        
        const jsonString = JSON.stringify(dataToExport, null, 2);
        
        // 创建Blob和下载链接
        const blob = new Blob([jsonString], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        // 创建临时链接并触发下载
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `obsidian-last-position-export-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        
        // 清理
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(url);
        
        new Notice(t.dataExported);
    }

    /**
     * 从文本文件导入滚动位置数据
     * @param plugin 插件实例
     * @param onComplete 导入完成后的回调函数
     */
    static importData(plugin: LastPositionPlugin, onComplete: () => void): void {
        const t = getTranslation();
        
        // 创建文件输入元素
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.txt,text/plain';
        
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
                    const importedData = JSON.parse(content);
                    
                    if (!Array.isArray(importedData)) {
                        throw new Error('无效的数据格式');
                    }
                    
                    // 处理导入的数据
                    let importCount = 0;
                    for (const item of importedData) {
                        if (item.filename && (item.height !== undefined || item.lastAccessed)) {
                            plugin.settings.scrollHeightData.set(item.filename, {
                                height: item.height,
                                lastAccessed: item.lastAccessed || Date.now()
                            } as ScrollPositionData);
                            importCount++;
                        }
                    }
                    
                    await plugin.saveSettings();
                    onComplete();
                    new Notice(t.dataImported?.replace('{count}', importCount.toString()) || 
                              `Imported ${importCount} scroll position records`);
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