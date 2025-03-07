import { App } from 'obsidian';
import { getTranslation } from '.language/translations';
import { ConfirmModal } from './confirmedModal';
import LastPositionPlugin from '../main';

export interface DataTableOptions {
    containerEl: HTMLElement;
    plugin: LastPositionPlugin;
    app: App;
    onDataChanged: () => void;
}

export class DataTable {
    private containerEl: HTMLElement;
    private plugin: LastPositionPlugin;
    private app: App;
    private onDataChanged: () => void;
    private currentPage: number = 1;
    private static lastPage: number = 1; // 静态变量保存上次页码


    constructor(options: DataTableOptions) {
        this.containerEl = options.containerEl;
        this.plugin = options.plugin;
        this.app = options.app;
        this.onDataChanged = options.onDataChanged;
        // 从静态变量恢复上次页码
        this.currentPage = DataTable.lastPage;
    }

    render(): void {
        const t = getTranslation();
        const dataSection = this.containerEl.createDiv('data-table-section');
        dataSection.createEl('h3', { text: t.scrollData });
        dataSection.createEl('p', { text: t.scrollDataDesc });

        // 创建表格
        if (this.plugin.settings.scrollHeightData.size > 0) {
            const tableContainer = dataSection.createDiv('table-container');
            // 设置表格容器最大高度和滚动
            tableContainer.style.maxHeight = '300px';
            tableContainer.style.overflowY = 'auto';
            tableContainer.style.marginBottom = '10px';
            
            const table = tableContainer.createEl('table');
            // 设置表格宽度占满容器
            table.style.width = '100%';
            // 表头
            const thead = table.createEl('thead');
            // 样式：表头内容靠左
            thead.style.textAlign = 'left';
            const headerRow = thead.createEl('tr');
            headerRow.createEl('th', { text: t.table_fileName });
            headerRow.createEl('th', { text: t.table_scrollHeight });
            headerRow.createEl('th', { text: t.table_actions });
            
            // 表格内容
            const tbody = table.createEl('tbody');
            // 样式：表格内容靠左
            tbody.style.textAlign = 'left';
            // 样式：每行间隔
            tbody.style.padding = '20px';
            
            // 分页逻辑
            const entries = Array.from(this.plugin.settings.scrollHeightData.entries());
            const totalItems = entries.length;
            const pageSize = this.plugin.settings.pageSize;
            const totalPages = Math.ceil(totalItems / pageSize);
            
            // 确保当前页在有效范围内
            if (this.currentPage > totalPages) {
                this.currentPage = totalPages > 0 ? totalPages : 1;
            }
            
            // 计算当前页的数据范围
            const startIndex = (this.currentPage - 1) * pageSize;
            const endIndex = Math.min(startIndex + pageSize, totalItems);
            const currentPageData = entries.slice(startIndex, endIndex);
            
            // 渲染当前页数据
            currentPageData.forEach(([filename, height]) => {
                const row = tbody.createEl('tr');
                // 文件名列
                row.createEl('td', { text: filename });
                // 高度列
                row.createEl('td', { text: `${height?.toFixed(0) ?? t.undefined}` });
                // 操作列
                const actionCell = row.createEl('td');
                const deleteBtn = actionCell.createEl('button', { text: t.delete });
                deleteBtn.addEventListener('click', async () => {
                    // 使用确认对话框
                    const confirmModal = new ConfirmModal(this.app, {message: t.confirmClearMessage + '-[' + filename + ']'});
                    const confirmed = await confirmModal.openAndAwait();
                    if (confirmed) {
                        this.plugin.settings.scrollHeightData.delete(filename);
                        await this.plugin.saveSettings();
                        this.onDataChanged(); // 通知父组件数据已更改
                    }
                });
            });
            
            // 创建分页控件容器
            const paginationContainer = dataSection.createDiv('pagination-container');
            paginationContainer.style.display = 'flex';
            paginationContainer.style.justifyContent = 'space-between';
            paginationContainer.style.alignItems = 'center';
            paginationContainer.style.marginTop = '10px';
            
            // 左侧显示总条目数
            const itemCountDiv = paginationContainer.createDiv('item-count');
            itemCountDiv.setText(`${t.totalItems}: ${totalItems}`);
            
            // 右侧分页控件
            const paginationControls = paginationContainer.createDiv('pagination-controls');
            paginationControls.style.display = 'flex';
            paginationControls.style.alignItems = 'center';
            paginationControls.style.gap = '10px';
            
            // 上一页按钮
            const prevBtn = paginationControls.createEl('button', { text: t.prevPage });
            prevBtn.disabled = this.currentPage <= 1;
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    DataTable.lastPage = this.currentPage; // 保存当前页码到静态变量
                    this.onDataChanged(); // 刷新表格
                }
            });
            
            // 页码信息
            const pageInfo = paginationControls.createSpan();
            pageInfo.setText(`${this.currentPage} / ${totalPages}`);
            
            // 下一页按钮
            const nextBtn = paginationControls.createEl('button', { text: t.nextPage });
            nextBtn.disabled = this.currentPage >= totalPages;
            nextBtn.addEventListener('click', () => {
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    DataTable.lastPage = this.currentPage; // 保存当前页码到静态变量
                    this.onDataChanged(); // 刷新表格
                }
            });
        } else {
            dataSection.createEl('p', { text: t.noDataAvailable});
        }
    }

    getCurrentPage(): number {
        return this.currentPage;
    }

    setCurrentPage(page: number): void {
        this.currentPage = page;
        DataTable.lastPage = page;
    }
}