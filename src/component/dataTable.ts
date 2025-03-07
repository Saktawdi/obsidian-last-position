import { App } from 'obsidian';
import { getTranslation } from '.language/translations';
import { ConfirmModal } from './confirmedModal';
import LastPositionPlugin from 'src/main';
import { ScrollPositionData } from 'src/setting';
import { DataExportImportUtil } from 'src/utils/dataExportImportUtil';

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
    private static sortField: string = 'lastAccessed'; // 默认排序字段
    private static sortDirection: 'asc' | 'desc' = 'desc'; // 默认降序排列（最新的在前）


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

            // 创建可排序的表头
            this.createSortableHeader(headerRow, 'fileName', t.table_fileName);
            this.createSortableHeader(headerRow, 'height', t.table_scrollHeight);
            this.createSortableHeader(headerRow, 'lastAccessed', t.table_lastAccessed);
            headerRow.createEl('th', { text: t.table_actions });
            
            // headerRow.createEl('th', { text: t.table_fileName });
            // headerRow.createEl('th', { text: t.table_scrollHeight });
            // headerRow.createEl('th', { text: t.table_lastAccessed });
            // headerRow.createEl('th', { text: t.table_actions });
            
            // 表格内容
            const tbody = table.createEl('tbody');
            // 样式：表格内容靠左
            tbody.style.textAlign = 'left';
            // 样式：每行间隔
            tbody.style.padding = '20px';
            
            // 分页逻辑
            let entries = Array.from(this.plugin.settings.scrollHeightData.entries());
            // 根据当前排序字段和方向排序
            entries = this.sortEntries(entries);

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
            currentPageData.forEach(([filename, data]) => {
                const row = tbody.createEl('tr');
                // 文件名列
                row.createEl('td', { text: filename });
                // 高度列
                row.createEl('td', { text: `${data.height?.toFixed(0) ?? t.undefined}` });
                // 最后访问时间列
                const lastAccessedDate = data?.lastAccessed ? new Date(data.lastAccessed) : null;
                const formattedDate = lastAccessedDate 
                    ? lastAccessedDate.toLocaleString() 
                    : t.never;
                row.createEl('td', { text: formattedDate });
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

    // 创建可排序的表头
    private createSortableHeader(headerRow: HTMLTableRowElement, field: string, text: string): void {
        const th = headerRow.createEl('th');
        const headerContent = th.createSpan({ text });
        
        // 添加排序指示器
        const sortIndicator = th.createSpan({ cls: 'sort-indicator' });
        if (this.sortField === field) {
            sortIndicator.setText(this.sortDirection === 'asc' ? ' ↑' : ' ↓');
        }
        
        // 添加点击事件
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            if (this.sortField === field) {
                // 切换排序方向
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                // 切换排序字段
                this.sortField = field;
                // 默认方向：文件名升序，其他降序
                this.sortDirection = field === 'fileName' ? 'asc' : 'desc';
            }
            this.onDataChanged(); // 刷新表格
        });
    }

    // 根据当前排序设置对条目进行排序
    private sortEntries(entries: [string, ScrollPositionData][]): [string, ScrollPositionData][] {
        return entries.sort((a, b) => {
            let result: number;
            
            switch (this.sortField) {
                case 'fileName':
                    result = a[0].localeCompare(b[0]);
                    break;
                case 'height':
                    const heightA = a[1].height || 0;
                    const heightB = b[1].height || 0;
                    result = heightA - heightB;
                    break;
                case 'lastAccessed':
                default:
                    const timeA = a[1].lastAccessed || 0;
                    const timeB = b[1].lastAccessed || 0;
                    result = timeA - timeB;
                    break;
            }
            // 如果是降序，反转结果
            return this.sortDirection === 'asc' ? result : -result;
        });
    }

    get sortField(): string {
        return DataTable.sortField;
    }

    set sortField(value: string) {
        DataTable.sortField = value;
    }

    get sortDirection(): 'asc' | 'desc' {
        return DataTable.sortDirection;
    }

    set sortDirection(value: 'asc' | 'desc') {
        DataTable.sortDirection = value;
    }


    getCurrentPage(): number {
        return this.currentPage;
    }

    setCurrentPage(page: number): void {
        this.currentPage = page;
        DataTable.lastPage = page;
    }
}