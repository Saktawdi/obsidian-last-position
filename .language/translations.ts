import { getLanguage as obsidianGetLanguage } from 'obsidian';

export function getTranslation(): Translation {
	const lang = obsidianGetLanguage();
	const t = TRANSLATIONS[lang] || TRANSLATIONS['en'];
	return t;
}

export function getLanguage(): string {
	return obsidianGetLanguage();
}


export interface Translation {
    currentHeight: string;
    autoSave: string;
    autoSaveDesc: string;
    inputInterval: string;
    retryCount: string;
    retryCountDesc: string;
    inputRetryCount: string;
    restoreInterval: string;
    restoreIntervalDesc: string;
    inputRestoreInterval: string;
    restoreDelay: string;
    restoreDelayDesc: string;
    inputRestoreDelay: string;
    listenEvent: string;
    listenEventDesc: string;
    mouseOver: string;
    click: string;
    scroll: string;
    language: string;
    languageDesc: string;
    scrollData: string;
    scrollDataDesc: string;
    undefined: string;
    delete: string;
    changeSuccess: string;
    restartNotice: string;
    noActiveView: string;
    getFileError: string;
    retryLimit: string;
    table_fileName: string;
    table_scrollHeight: string;
    table_actions: string;
    noDataAvailable: string;
    confirmClearTitle: string;
    confirmClearMessage: string;
    confirmed: string;
    cancel: string;
    pageSize: string;
    pageSizeDesc: string;
    totalItems: string;
    prevPage: string;
    nextPage: string;
    table_lastAccessed: string;
    never: string;

    dataManagement: string;
    exportData: string;
    importData: string;
    noDataToExport: string;
    dataExported: string;
    dataImported: string;
    importError: string;
    enableAutoCleanup: string;
    enableAutoCleanupDesc: string;
    dataImportExport: string;
    dataImportExportDesc: string;
    cleanupDays: string;
    cleanupDaysDesc: string;
    cleanupDaysNotice: string;
    saveBookmarkCommand: string;
    selectBookmarkCommand: string;
    removeBookmarkCommand: string;
    bookmarkNameTitle: string;
    bookmarkNamePlaceholder: string;
    bookmarkSaved: string;
    bookmarkListTitle: string;
    bookmarkListPlaceholder: string;
    noBookmarks: string;
    bookmarkStale: string;
    bookmarkSaveFailed: string;
    bookmarkDeleteConfirmTitle: string;
    bookmarkDeleteConfirmMessage: string;
    bookmarkDeleted: string;
    bookmarkDeleteFailed: string;
    statusBarSaveBookmarkHint: string;
    statusBarOpenBookmarkListHint: string;
}

export const TRANSLATIONS: Record<string, Translation> = {
    zh: {
        currentHeight: '当前高度',
        autoSave: '自动保存',
        autoSaveDesc: '设置自动保存时间，间隔单位为秒,默认为3秒，下次启动生效',
        inputInterval: '输入时间间隔（秒）',
        retryCount: '重试次数',
        retryCountDesc: '设置重试策略的最大重试次数，默认为30次。⚠请谨慎更改！',
        inputRetryCount: '输入重试次数',
        restoreInterval: '恢复重试间隔',
        restoreIntervalDesc: '恢复失败后的重试间隔，单位毫秒，默认100毫秒',
        inputRestoreInterval: '输入重试间隔（毫秒）',
        restoreDelay: '恢复延迟',
        restoreDelayDesc: '打开笔记后等待多少毫秒再恢复位置，默认300毫秒',
        inputRestoreDelay: '输入恢复延迟（毫秒）',
        listenEvent: '监听事件',
        listenEventDesc: '设置监听事件用于触发滚动高度保存，默认为mouseover',
        mouseOver: '鼠标悬停(mouseover)',
        click: '鼠标点击(click)',
        scroll: '滚动(scroll)',
        language: '语言',
        languageDesc: '切换界面语言 (Switch interface language)',
        scrollData: '文件滚动高度数据',
        scrollDataDesc: '以下是存储的文件滚动高度数据：',
        undefined: '未定义',
        delete: '删除',
        changeSuccess: '更改成功',
        restartNotice: '更改成功,重启插件生效',
        noActiveView: '当前没有活动的 Markdown 视图',
        getFileError: '获取文件对象失败',
        retryLimit: '重试次数达到上限，停止重试',
        table_fileName: '文件名',
        table_scrollHeight: '滚动高度',
        table_actions: '操作',
        noDataAvailable: '没有数据可用',
        confirmClearTitle: '清除数据确认',
        confirmClearMessage: '确认删除此条数据？',
        confirmed: '确认',
        cancel: '取消',
        pageSize: '每页显示条目数',
        pageSizeDesc: '设置表格每页显示的条目数，默认10条',
        totalItems: '总条目数',
        prevPage: '上一页',
        nextPage: '下一页',
        table_lastAccessed: '最后访问时间',
        never: '从未',
        exportData: "导出数据",
        importData: "导入数据",
        noDataToExport: "没有可导出的数据",
        dataExported: "数据导出成功",
        dataImported: "已导入 {count} 条滚动位置记录",
        importError: "导入数据时出错。请检查文件格式。",
        dataManagement: "数据管理",
        enableAutoCleanup: "启用自动清理",
        enableAutoCleanupDesc: "启用自动清理，自动清理过期的数据",
        dataImportExport: "数据导入导出",
        dataImportExportDesc: "数据导入导出",
        cleanupDays: "数据清理天数",
        cleanupDaysDesc: "设置要清理的数据距今未曾访问的天数，默认30天",
        cleanupDaysNotice: "数据自动清理设置已更改，启动插件时生效",
        saveBookmarkCommand: "保存书签",
        selectBookmarkCommand: "选择书签",
        removeBookmarkCommand: "删除书签",
        bookmarkNameTitle: "保存位置书签",
        bookmarkNamePlaceholder: "输入书签名称",
        bookmarkSaved: "书签已保存：{name}",
        bookmarkListTitle: "选择位置书签",
        bookmarkListPlaceholder: "搜索书签名称",
        noBookmarks: "当前文件没有书签",
        bookmarkStale: "当前文件已发生变化，未执行书签跳转",
        bookmarkSaveFailed: "书签已写入内存，但保存到设置失败",
        bookmarkDeleteConfirmTitle: "确认删除书签",
        bookmarkDeleteConfirmMessage: "确认删除书签“{name}”（高度 {height}）？",
        bookmarkDeleted: "书签已删除：{name}",
        bookmarkDeleteFailed: "书签已从内存删除，但保存到设置失败",
        statusBarSaveBookmarkHint: "左键：保存书签",
        statusBarOpenBookmarkListHint: "右键：打开书签列表",
    },
    en: {
        currentHeight: 'Current Height',
        autoSave: 'Auto Save',
        autoSaveDesc: 'Set auto-save interval in seconds, default is 3 seconds, effective after restart',
        inputInterval: 'Enter interval (seconds)',
        retryCount: 'Retry Count',
        retryCountDesc: 'Set maximum retry count for retry strategy. Default is 30. ⚠ Change with caution!',
        inputRetryCount: 'Enter retry count',
        restoreInterval: 'Restore Retry Interval',
        restoreIntervalDesc: 'Delay between restore attempts in milliseconds. Default is 100.',
        inputRestoreInterval: 'Enter retry interval (milliseconds)',
        restoreDelay: 'Restore Delay',
        restoreDelayDesc: 'Wait before restoring a note position, in milliseconds. Default is 300.',
        inputRestoreDelay: 'Enter restore delay (milliseconds)',
        listenEvent: 'Listen Event',
        listenEventDesc: 'Set trigger event for saving scroll height, default is mouseover',
        mouseOver: 'Mouse Over (mouseover)',
        click: 'Click (click)',
        scroll: 'Scroll (scroll)',
        language: 'Language',
        languageDesc: 'Switch interface language (切换界面语言)',
        scrollData: 'File Scroll Height Data',
        scrollDataDesc: 'Below is the stored file scroll height data:',
        undefined: 'undefined',
        delete: 'Delete',
        changeSuccess: 'Changed successfully',
        restartNotice: 'Changed successfully, restart plugin to take effect',
        noActiveView: 'No active Markdown view',
        getFileError: 'Failed to get file object',
        retryLimit: 'Retry limit reached, stopping retries',
        table_fileName: 'File Name',
        table_scrollHeight: 'Scroll Height',
        table_actions: 'Actions',
        noDataAvailable: 'No data available',
        confirmClearTitle: 'Confirm Clear Data',
        confirmClearMessage: 'Are you sure you want to clear this data?',
        confirmed: 'Confirmed',
        cancel: 'Cancel',
        pageSize: 'Page Size',
        pageSizeDesc: 'Set the number of entries to display per page in the table, default is 10',
        totalItems: 'Total Items',
        prevPage: 'Previous Page',
        nextPage: 'Next Page',
        table_lastAccessed: 'Last Accessed',
        never: 'Never',
        exportData: "Export Data",
        importData: "Import Data",
        noDataToExport: "No data to export",
        dataExported: "Data exported successfully",
        dataImported: "Imported {count} scroll position records",
        importError: "Error importing data. Please check the file format.",
        dataManagement: "Data Management",
        enableAutoCleanup: "Enable Auto Cleanup",
        enableAutoCleanupDesc: "Enable auto cleanup, automatically clean up expired data",
        dataImportExport: "Data Import Export",
        dataImportExportDesc: "Data Import Export",
        cleanupDays: "Cleanup Days",
        cleanupDaysDesc: "Automatically remove data entries older than this many days (minimum 7 days)",
        cleanupDaysNotice: "Cleanup setting have been changed, take effect after restarting the plugin",
        saveBookmarkCommand: "Save Bookmark",
        selectBookmarkCommand: "Select Bookmark",
        removeBookmarkCommand: "Remove Bookmark",
        bookmarkNameTitle: "Save Position Bookmark",
        bookmarkNamePlaceholder: "Enter bookmark name",
        bookmarkSaved: "Bookmark saved: {name}",
        bookmarkListTitle: "Select Position Bookmark",
        bookmarkListPlaceholder: "Search bookmark names",
        noBookmarks: "No bookmarks for the current file",
        bookmarkStale: "The current file changed; bookmark jump was not applied",
        bookmarkSaveFailed: "Bookmark was added in memory, but saving settings failed",
        bookmarkDeleteConfirmTitle: "Confirm Bookmark Deletion",
        bookmarkDeleteConfirmMessage: "Delete bookmark \"{name}\" (height {height})?",
        bookmarkDeleted: "Bookmark deleted: {name}",
        bookmarkDeleteFailed: "Bookmark was removed in memory, but saving settings failed",
        statusBarSaveBookmarkHint: "Left click: Save bookmark",
        statusBarOpenBookmarkListHint: "Right click: Open bookmark list",
    }
}; 

