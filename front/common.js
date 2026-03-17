// =====================================================================
// Gemini API Pool 控制面板公共JavaScript模块
// =====================================================================

// =====================================================================
// 全局状态管理
// =====================================================================
const AppState = {
    // 认证相关
    authToken: '',
    authInProgress: false,
    currentProjectId: '',

    // Antigravity认证
    antigravityAuthState: null,
    antigravityAuthInProgress: false,

    // Codex认证
    codexAuthState: null,
    codexAuthInProgress: false,

    // 凭证管理
    creds: createCredsManager('normal'),
    antigravityCreds: createCredsManager('antigravity'),
    codexCreds: createCredsManager('codex'),

    // 文件上传
    uploadFiles: createUploadManager('normal'),
    antigravityUploadFiles: createUploadManager('antigravity'),
    codexUploadFiles: createUploadManager('codex'),

    // 配置管理
    currentConfig: {},
    envLockedFields: new Set(),

    // 日志管理
    logWebSocket: null,
    allLogs: [],
    filteredLogs: [],
    currentLogFilter: 'all',

    // 使用统计
    usageStatsData: {},

    // 冷却倒计时
    cooldownTimerInterval: null
};

// =====================================================================
// 凭证管理器工厂
// =====================================================================
function createCredsManager(type) {
    const modeParam = type === 'antigravity' ? 'mode=antigravity' : type === 'codex' ? 'mode=codex' : 'mode=geminicli';

    return {
        type: type,
        data: {},
        filteredData: {},
        currentPage: 1,
        pageSize: 20,
        selectedFiles: new Set(),
        totalCount: 0,
        currentStatusFilter: 'all',
        currentErrorCodeFilter: 'all',
        currentCooldownFilter: 'all',
        currentPreviewFilter: 'all',
        statsData: { total: 0, normal: 0, disabled: 0 },
        usageResults: {},
        latestFailedFiles: [],
        scanRunning: false,
        scanSummary: {
            mode: '',
            processed: 0,
            total: 0,
            success: 0,
            failed: 0,
            failedSetSize: 0,
            concurrency: 0,
            message: '未执行查询'
        },
        scanMode: '',
        openUsageDetails: new Set(),

        // API端点
        getEndpoint: (action) => {
            const endpoints = {
                status: `./creds/status`,
                action: `./creds/action`,
                batchAction: `./creds/batch-action`,
                download: `./creds/download`,
                downloadAll: `./creds/download-all`,
                detail: `./creds/detail`,
                fetchEmail: `./creds/fetch-email`,
                refreshAllEmails: `./creds/refresh-all-emails`,
                deduplicate: `./creds/deduplicate-by-email`,
                verifyProject: `./creds/verify-project`,
                quota: `./creds/quota`,
                codexUsage: `./creds/codex-usage`,
                codexUsageBatch: `./creds/codex-usage/batch`
            };
            return endpoints[action] || '';
        },

        // 获取mode参数
        getModeParam: () => modeParam,

        // DOM元素ID前缀
        getElementId: (suffix) => {
            // 普通凭证的ID首字母小写,如 credsLoading
            // Antigravity的ID是 antigravity + 首字母大写,如 antigravityCredsLoading
            // Codex的ID是 codex + 首字母大写,如 codexCredsLoading
            if (type === 'antigravity') {
                return 'antigravity' + suffix.charAt(0).toUpperCase() + suffix.slice(1);
            }
            if (type === 'codex') {
                return 'codex' + suffix.charAt(0).toUpperCase() + suffix.slice(1);
            }
            return suffix.charAt(0).toLowerCase() + suffix.slice(1);
        },

        // 刷新凭证列表
        async refresh() {
            const loading = document.getElementById(this.getElementId('CredsLoading'));
            const list = document.getElementById(this.getElementId('CredsList'));

            try {
                loading.style.display = 'block';
                list.innerHTML = '';

                const offset = (this.currentPage - 1) * this.pageSize;
                const errorCodeFilter = this.currentErrorCodeFilter || 'all';
                const cooldownFilter = this.currentCooldownFilter || 'all';
                const previewFilter = this.currentPreviewFilter || 'all';
                const response = await authFetch(
                    `${this.getEndpoint('status')}?offset=${offset}&limit=${this.pageSize}&status_filter=${this.currentStatusFilter}&error_code_filter=${errorCodeFilter}&cooldown_filter=${cooldownFilter}&preview_filter=${previewFilter}&${this.getModeParam()}`
                );

                const data = await response.json();

                if (response.ok) {
                    this.data = {};
                    data.items.forEach(item => {
                        const persistedUsageResult = this.type === 'codex' ? (item.usage_result || null) : null;
                        const usageResult = this.type === 'codex'
                            ? (this.usageResults[item.filename] || persistedUsageResult)
                            : null;
                        if (this.type === 'codex' && persistedUsageResult && !this.usageResults[item.filename]) {
                            this.usageResults[item.filename] = { filename: item.filename, ...persistedUsageResult };
                        }
                        this.data[item.filename] = {
                            filename: item.filename,
                            status: {
                                disabled: item.disabled,
                                error_codes: item.error_codes || [],
                                last_success: item.last_success,
                            },
                            user_email: item.user_email,
                            model_cooldowns: item.model_cooldowns || {},
                            preview: item.preview,
                            usageResult
                        };
                    });

                    this.totalCount = data.total;
                    // 使用后端返回的全局统计数据
                    if (data.stats) {
                        this.statsData = data.stats;
                    } else {
                        // 兼容旧版本后端
                        this.calculateStats();
                    }
                    this.updateStatsDisplay();
                    this.filteredData = this.data;
                    this.renderList();
                    this.updatePagination();
                    if (this.type === 'codex') {
                        this.updateUsageSummaryDisplay();
                    }

                    let msg = `已加载 ${data.total} 个${type === 'antigravity' ? 'Antigravity' : type === 'codex' ? 'Codex' : ''}凭证文件`;
                    if (this.currentStatusFilter !== 'all') {
                        msg += ` (筛选: ${this.currentStatusFilter === 'enabled' ? '仅启用' : '仅禁用'})`;
                    }
                    showStatus(msg, 'success');
                } else {
                    showStatus(`加载失败: ${data.detail || data.error || '未知错误'}`, 'error');
                }
            } catch (error) {
                if (error.message !== 'AUTH_EXPIRED') showStatus(`网络错误: ${error.message}`, 'error');
            } finally {
                loading.style.display = 'none';
            }
        },

        // 计算统计数据（仅用于兼容旧版本后端）
        calculateStats() {
            this.statsData = { total: this.totalCount, normal: 0, disabled: 0 };
            Object.values(this.data).forEach(credInfo => {
                if (credInfo.status.disabled) {
                    this.statsData.disabled++;
                } else {
                    this.statsData.normal++;
                }
            });
        },

        // 更新统计显示
        updateStatsDisplay() {
            document.getElementById(this.getElementId('StatTotal')).textContent = this.statsData.total;
            document.getElementById(this.getElementId('StatNormal')).textContent = this.statsData.normal;
            document.getElementById(this.getElementId('StatDisabled')).textContent = this.statsData.disabled;
        },

        updateUsageSummaryDisplay() {
            if (this.type !== 'codex') return;
            const processedEl = document.getElementById('codexUsageProcessed');
            const successEl = document.getElementById('codexUsageSuccess');
            const failedEl = document.getElementById('codexUsageFailed');
            const failedSetEl = document.getElementById('codexUsageFailedSet');
            const concurrencyEl = document.getElementById('codexUsageConcurrency');
            const messageEl = document.getElementById('codexUsageSummaryText');
            const balanceBtn = document.getElementById('codexQueryAllBalanceBtn');
            const scanBtn = document.getElementById('codexBatchStatusBtn');
            const deleteBtn = document.getElementById('codexDeleteFailedBtn');

            if (processedEl) processedEl.textContent = `${this.scanSummary.processed}/${this.scanSummary.total}`;
            if (successEl) successEl.textContent = this.scanSummary.success;
            if (failedEl) failedEl.textContent = this.scanSummary.failed;
            if (failedSetEl) failedSetEl.textContent = this.scanSummary.failedSetSize;
            if (concurrencyEl) concurrencyEl.textContent = this.scanSummary.concurrency;
            if (messageEl) messageEl.textContent = this.scanSummary.message || '未执行查询';

            if (balanceBtn) balanceBtn.disabled = this.scanRunning;
            if (scanBtn) scanBtn.disabled = this.scanRunning;
            if (deleteBtn) deleteBtn.disabled = this.scanRunning || this.latestFailedFiles.length === 0;
        },

        storeUsageResult(result) {
            if (!result || !result.filename) return;
            this.usageResults[result.filename] = result;
            if (this.data[result.filename]) {
                this.data[result.filename].usageResult = result;
                this.filteredData[result.filename] = this.data[result.filename];
            }
        },

        applyUsageResults(results) {
            if (!Array.isArray(results)) return;
            results.forEach(result => this.storeUsageResult(result));
        },

        setScanSummary(summary = {}) {
            this.scanSummary = {
                mode: summary.mode || this.scanSummary.mode || '',
                processed: Number(summary.processed || 0),
                total: Number(summary.total || 0),
                success: Number(summary.success || 0),
                failed: Number(summary.failed || 0),
                failedSetSize: Number(summary.failedSetSize || 0),
                concurrency: Number(summary.concurrency || 0),
                message: summary.message || '未执行查询'
            };
            this.updateUsageSummaryDisplay();
        },

        async queryUsage(filename, options = {}) {
            if (this.type !== 'codex') return null;
            const silent = Boolean(options.silent);
            const shouldRender = options.render !== false;
            if (!silent) showStatus(`正在查询余额: ${filename}`, 'info');

            try {
                const response = await authFetch(`${this.getEndpoint('codexUsage')}/${encodeURIComponent(filename)}?${this.getModeParam()}`, {
                    method: 'GET'
                });
                const data = await response.json();
                this.storeUsageResult(data);
                if (response.status === 200) {
                    if (!silent) showStatus(`余额查询成功: ${filename}`, 'success');
                } else {
                    if (!silent) showStatus(`余额查询异常: ${filename} (HTTP ${data.status_code || response.status})`, 'error');
                }
                this.openUsageDetails.add(filename);
                if (shouldRender && this.data[filename]) this.renderList();
                this.updateUsageSummaryDisplay();
                return data;
            } catch (error) {
                if (error.message !== 'AUTH_EXPIRED' && !silent) {
                    showStatus(`余额查询失败: ${error.message}`, 'error');
                }
                throw error;
            }
        },

        async runUsageScan(scanMode = 'batch') {
            if (this.type !== 'codex') return null;
            if (this.scanRunning) {
                showStatus('Codex usage 查询正在进行中', 'info');
                return null;
            }

            const selectedFilenames = Array.from(this.selectedFiles || []).filter(Boolean);
            const useSelectedOnly = selectedFilenames.length > 0;
            const concurrencyLimit = 6;
            const targetLabel = useSelectedOnly ? `选中的 ${selectedFilenames.length} 个` : '全部凭证';
            const startMessage = scanMode === 'balance'
                ? `正在查询${targetLabel}余额，并发 ${concurrencyLimit}...`
                : `正在查询${targetLabel}状态，并发 ${concurrencyLimit}...`;

            this.scanRunning = true;
            this.scanMode = scanMode;
            this.setScanSummary({
                mode: scanMode,
                processed: 0,
                total: useSelectedOnly ? selectedFilenames.length : 0,
                success: 0,
                failed: 0,
                failedSetSize: this.latestFailedFiles.length,
                concurrency: 0,
                message: startMessage
            });

            try {
                const response = await authFetch(`${this.getEndpoint('codexUsageBatch')}?${this.getModeParam()}&all_pages=${useSelectedOnly ? 'false' : 'true'}`, {
                    method: 'POST',
                    body: JSON.stringify(useSelectedOnly ? { filenames: selectedFilenames } : {})
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.detail || data.error || '批量查询失败');
                }

                this.applyUsageResults(data.results || []);
                const currentFailedFiles = Array.isArray(data.failed_filenames) ? data.failed_filenames.slice() : [];
                if (scanMode === 'status') {
                    this.latestFailedFiles = currentFailedFiles;
                }
                this.setScanSummary({
                    mode: scanMode,
                    processed: data.processed || 0,
                    total: data.total || 0,
                    success: data.success_count || 0,
                    failed: data.failed_count || 0,
                    failedSetSize: this.latestFailedFiles.length,
                    concurrency: 0,
                    message: `${data.message || '查询完成'} (并发 ${data.concurrency_limit || concurrencyLimit})`
                });
                showStatus(
                    scanMode === 'balance'
                        ? (useSelectedOnly ? `选中余额查询完成 (${selectedFilenames.length} 个，并发 ${data.concurrency_limit || concurrencyLimit})` : `一键查询余额完成 (并发 ${data.concurrency_limit || concurrencyLimit})`)
                        : (useSelectedOnly ? `选中状态查询完成 (${selectedFilenames.length} 个，并发 ${data.concurrency_limit || concurrencyLimit})` : `批量查询状态完成 (并发 ${data.concurrency_limit || concurrencyLimit})`),
                    'success'
                );
                this.renderList();
                return data;
            } catch (error) {
                if (error.message !== 'AUTH_EXPIRED') {
                    showStatus(`Codex usage 查询失败: ${error.message}`, 'error');
                }
                this.setScanSummary({
                    mode: scanMode,
                    processed: 0,
                    total: useSelectedOnly ? selectedFilenames.length : 0,
                    success: 0,
                    failed: 0,
                    failedSetSize: this.latestFailedFiles.length,
                    concurrency: 0,
                    message: `查询失败: ${error.message}`
                });
                throw error;
            } finally {
                this.scanRunning = false;
                this.updateUsageSummaryDisplay();
            }
        },


        async deleteLatestFailedFiles() {
            if (this.type !== 'codex') return;
            const failedFiles = this.latestFailedFiles.slice();
            if (failedFiles.length === 0) {
                showStatus('当前没有可删除的异常凭证', 'info');
                return;
            }

            if (!confirm(`确定要删除最近一次状态扫描失败的 ${failedFiles.length} 个 Codex 凭证吗？\n注意：此操作不可恢复！`)) {
                return;
            }

            try {
                showStatus(`正在删除最近失败的 ${failedFiles.length} 个凭证...`, 'info');
                const response = await authFetch(`${this.getEndpoint('batchAction')}?${this.getModeParam()}`, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'delete', filenames: failedFiles })
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.detail || data.error || '删除失败');
                }

                const successCount = data.success_count || 0;
                const errorEntries = Array.isArray(data.errors) ? data.errors : [];
                const failedSet = new Set(
                    errorEntries
                        .map(item => typeof item === 'string' ? item.split(':')[0].trim() : '')
                        .filter(Boolean)
                );
                this.latestFailedFiles = failedFiles.filter(name => failedSet.has(name));
                failedFiles.forEach(name => {
                    if (!failedSet.has(name)) {
                        delete this.usageResults[name];
                        this.openUsageDetails.delete(name);
                    }
                });
                this.setScanSummary({
                    mode: this.scanMode || 'delete',
                    processed: this.scanSummary.processed,
                    total: this.scanSummary.total,
                    success: this.scanSummary.success,
                    failed: this.scanSummary.failed,
                    failedSetSize: this.latestFailedFiles.length,
                    message: `删除完成：成功 ${successCount}/${failedFiles.length}`
                });
                showStatus(`删除完成：成功 ${successCount}/${failedFiles.length}`, 'success');
                await this.refresh();
            } catch (error) {
                if (error.message !== 'AUTH_EXPIRED') {
                    showStatus(`删除异常凭证失败: ${error.message}`, 'error');
                }
                throw error;
            }
        },

        // 渲染凭证列表
        renderList() {
            const list = document.getElementById(this.getElementId('CredsList'));
            list.innerHTML = '';

            const entries = Object.entries(this.filteredData);

            if (entries.length === 0) {
                const isEmptyTotal = this.totalCount === 0;
                const icon = isEmptyTotal
                    ? `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#c7c7cc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`
                    : `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#c7c7cc" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
                const title = isEmptyTotal ? '暂无凭证文件' : '无匹配结果';
                const subtitle = isEmptyTotal ? '点击上方「添加凭证」按钮开始添加' : '当前筛选条件下暂无数据，请调整筛选条件';
                list.innerHTML = `
                    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;color:#86868b;">
                        <div style="width:80px;height:80px;border-radius:50%;background:#f5f5f7;display:flex;align-items:center;justify-content:center;margin-bottom:16px;">
                            ${icon}
                        </div>
                        <div style="font-size:16px;font-weight:600;color:#1d1d1f;margin-bottom:6px;">${title}</div>
                        <div style="font-size:13px;color:#86868b;">${subtitle}</div>
                    </div>`;
                document.getElementById(this.getElementId('PaginationContainer')).style.display = 'none';
                return;
            }

            entries.forEach(([, credInfo]) => {
                list.appendChild(createCredCard(credInfo, this));
            });

            document.getElementById(this.getElementId('PaginationContainer')).style.display =
                this.getTotalPages() > 1 ? 'flex' : 'none';
            this.updateBatchControls();
        },

        // 获取总页数
        getTotalPages() {
            return Math.ceil(this.totalCount / this.pageSize);
        },

        // 更新分页信息
        updatePagination() {
            const totalPages = this.getTotalPages();
            const startItem = (this.currentPage - 1) * this.pageSize + 1;
            const endItem = Math.min(this.currentPage * this.pageSize, this.totalCount);

            document.getElementById(this.getElementId('PaginationInfo')).textContent =
                `第 ${this.currentPage} 页，共 ${totalPages} 页 (显示 ${startItem}-${endItem}，共 ${this.totalCount} 项)`;

            document.getElementById(this.getElementId('PrevPageBtn')).disabled = this.currentPage <= 1;
            document.getElementById(this.getElementId('NextPageBtn')).disabled = this.currentPage >= totalPages;
        },

        // 切换页面
        changePage(direction) {
            const newPage = this.currentPage + direction;
            if (newPage >= 1 && newPage <= this.getTotalPages()) {
                this.currentPage = newPage;
                this.refresh();
            }
        },

        // 改变每页大小
        changePageSize() {
            this.pageSize = parseInt(document.getElementById(this.getElementId('PageSizeSelect')).value);
            this.currentPage = 1;
            this.refresh();
        },

        // 应用状态筛选
        applyStatusFilter() {
            this.currentStatusFilter = document.getElementById(this.getElementId('StatusFilter')).value;
            const errorCodeFilterEl = document.getElementById(this.getElementId('ErrorCodeFilter'));
            const cooldownFilterEl = document.getElementById(this.getElementId('CooldownFilter'));
            const previewFilterEl = document.getElementById(this.getElementId('PreviewFilter'));
            this.currentErrorCodeFilter = errorCodeFilterEl ? errorCodeFilterEl.value : 'all';
            this.currentCooldownFilter = cooldownFilterEl ? cooldownFilterEl.value : 'all';
            this.currentPreviewFilter = previewFilterEl ? previewFilterEl.value : 'all';
            this.currentPage = 1;
            this.refresh();
        },

        // 更新批量控件
        updateBatchControls() {
            const selectedCount = this.selectedFiles.size;
            document.getElementById(this.getElementId('SelectedCount')).textContent = `已选择 ${selectedCount} 项`;

            const batchBtns = ['Enable', 'Disable', 'Delete', 'Verify', 'Preview'].map(action =>
                document.getElementById(this.getElementId(`Batch${action}Btn`))
            );
            batchBtns.forEach(btn => btn && (btn.disabled = selectedCount === 0));

            const selectAllCheckbox = document.getElementById(this.getElementId('SelectAllCheckbox'));
            if (!selectAllCheckbox) return;

            const checkboxes = document.querySelectorAll(`.${this.getElementId('file-checkbox')}`);
            const currentPageSelectedCount = Array.from(checkboxes)
                .filter(cb => this.selectedFiles.has(cb.getAttribute('data-filename'))).length;

            if (currentPageSelectedCount === 0) {
                selectAllCheckbox.indeterminate = false;
                selectAllCheckbox.checked = false;
            } else if (currentPageSelectedCount === checkboxes.length) {
                selectAllCheckbox.indeterminate = false;
                selectAllCheckbox.checked = true;
            } else {
                selectAllCheckbox.indeterminate = true;
            }

            checkboxes.forEach(cb => {
                cb.checked = this.selectedFiles.has(cb.getAttribute('data-filename'));
            });
        },

        // 凭证操作
        async action(filename, action) {
            try {
                const response = await authFetch(`${this.getEndpoint('action')}?${this.getModeParam()}`, {
                    method: 'POST',
                    body: JSON.stringify({ filename, action })
                });

                const data = await response.json();

                if (response.ok) {
                    showStatus(data.message || `操作成功: ${action}`, 'success');
                    await this.refresh();
                } else {
                    showStatus(`操作失败: ${data.detail || data.error || '未知错误'}`, 'error');
                }
            } catch (error) {
                showStatus(`网络错误: ${error.message}`, 'error');
            }
        },

        // 批量操作
        async batchAction(action) {
            const selectedFiles = Array.from(this.selectedFiles);

            if (selectedFiles.length === 0) {
                showStatus('请先选择要操作的文件', 'error');
                return;
            }

            const actionNames = { enable: '启用', disable: '禁用', delete: '删除' };
            const confirmMsg = action === 'delete'
                ? `确定要删除选中的 ${selectedFiles.length} 个文件吗？\n注意：此操作不可恢复！`
                : `确定要${actionNames[action]}选中的 ${selectedFiles.length} 个文件吗？`;

            if (!confirm(confirmMsg)) return;

            try {
                showStatus(`正在执行批量${actionNames[action]}操作...`, 'info');

                const response = await authFetch(`${this.getEndpoint('batchAction')}?${this.getModeParam()}`, {
                    method: 'POST',
                    body: JSON.stringify({ action, filenames: selectedFiles })
                });

                const data = await response.json();

                if (response.ok) {
                    const successCount = data.success_count || data.succeeded;
                    showStatus(`批量操作完成：成功处理 ${successCount}/${selectedFiles.length} 个文件`, 'success');
                    this.selectedFiles.clear();
                    this.updateBatchControls();
                    await this.refresh();
                } else {
                    showStatus(`批量操作失败: ${data.detail || data.error || '未知错误'}`, 'error');
                }
            } catch (error) {
                showStatus(`批量操作网络错误: ${error.message}`, 'error');
            }
        }
    };
}

// =====================================================================
// 文件上传管理器工厂
// =====================================================================
function createUploadManager(type) {
    const modeParam = type === 'antigravity' ? 'mode=antigravity' : type === 'codex' ? 'mode=codex' : 'mode=geminicli';
    const endpoint = `./creds/upload?${modeParam}`;

    return {
        type: type,
        selectedFiles: [],

        getElementId: (suffix) => {
            // 普通上传的ID首字母小写,如 fileList
            // Antigravity的ID是 antigravity + 首字母大写,如 antigravityFileList
            // Codex的ID是 codex + 首字母大写,如 codexFileList
            if (type === 'antigravity') {
                return 'antigravity' + suffix.charAt(0).toUpperCase() + suffix.slice(1);
            }
            if (type === 'codex') {
                return 'codex' + suffix.charAt(0).toUpperCase() + suffix.slice(1);
            }
            return suffix.charAt(0).toLowerCase() + suffix.slice(1);
        },

        handleFileSelect(event) {
            this.addFiles(Array.from(event.target.files));
        },

        addFiles(files) {
            const MAX_FILES = 500;
            files.forEach(file => {
                if (this.selectedFiles.length >= MAX_FILES) {
                    showStatus(`最多只能选择 ${MAX_FILES} 个文件`, 'error');
                    return;
                }
                const isValid = file.type === 'application/json' || file.name.endsWith('.json') ||
                    file.type === 'application/zip' || file.name.endsWith('.zip');

                if (isValid) {
                    if (!this.selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
                        this.selectedFiles.push(file);
                    }
                } else {
                    showStatus(`文件 ${file.name} 格式不支持，只支持JSON和ZIP文件`, 'error');
                }
            });
            this.updateFileList();
        },

        updateFileList() {
            const list = document.getElementById(this.getElementId('FileList'));
            const section = document.getElementById(this.getElementId('FileListSection'));

            if (!list || !section) {
                console.warn('File list elements not found:', this.getElementId('FileList'));
                return;
            }

            if (this.selectedFiles.length === 0) {
                section.classList.add('hidden');
                return;
            }

            section.classList.remove('hidden');
            list.innerHTML = '';
            list.style.maxHeight = '240px';
            list.style.overflowY = 'auto';

            this.selectedFiles.forEach((file, index) => {
                const isZip = file.name.endsWith('.zip');
                const fileIcon = isZip ? '📦' : '📄';
                const fileType = isZip ? ' (ZIP压缩包)' : ' (JSON文件)';

                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.innerHTML = `
                    <div>
                        <span class="file-name">${fileIcon} ${file.name}</span>
                        <span class="file-size">(${formatFileSize(file.size)}${fileType})</span>
                    </div>
                    <button class="remove-btn" onclick="${type === 'antigravity' ? 'removeAntigravityFile' : type === 'codex' ? 'removeCodexFile' : 'removeFile'}(${index})">删除</button>
                `;
                list.appendChild(fileItem);
            });
        },

        removeFile(index) {
            this.selectedFiles.splice(index, 1);
            this.updateFileList();
        },

        clearFiles() {
            this.selectedFiles = [];
            this.updateFileList();
        },

        async upload() {
            if (this.selectedFiles.length === 0) {
                showStatus('请选择要上传的文件', 'error');
                return;
            }

            const progressSection = document.getElementById(this.getElementId('UploadProgressSection'));
            const progressFill = document.getElementById(this.getElementId('ProgressFill'));
            const progressText = document.getElementById(this.getElementId('ProgressText'));

            progressSection.classList.remove('hidden');

            const formData = new FormData();
            this.selectedFiles.forEach(file => formData.append('files', file));

            if (this.selectedFiles.some(f => f.name.endsWith('.zip'))) {
                showStatus('正在上传并解压ZIP文件...', 'info');
            }

            try {
                const xhr = new XMLHttpRequest();
                xhr.timeout = 300000; // 5分钟

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const percent = (event.loaded / event.total) * 100;
                        progressFill.style.width = percent + '%';
                        progressText.textContent = Math.round(percent) + '%';
                    }
                };

                xhr.onload = () => {
                    if (xhr.status === 200) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            showStatus(`成功上传 ${data.uploaded_count} 个${type === 'antigravity' ? 'Antigravity' : type === 'codex' ? 'Codex' : ''}文件`, 'success');
                            this.clearFiles();
                            progressSection.classList.add('hidden');
                            if (type === 'antigravity') {
                                AppState.antigravityCreds.refresh();
                            } else if (type === 'codex') {
                                AppState.codexCreds.refresh();
                            } else {
                                AppState.creds.refresh();
                            }
                        } catch (e) {
                            showStatus('上传失败: 服务器响应格式错误', 'error');
                        }
                    } else {
                        try {
                            const error = JSON.parse(xhr.responseText);
                            showStatus(`上传失败: ${error.detail || error.error || '未知错误'}`, 'error');
                        } catch (e) {
                            showStatus(`上传失败: HTTP ${xhr.status}`, 'error');
                        }
                    }
                };

                xhr.onerror = () => {
                    showStatus(`上传失败：连接中断 - 可能原因：文件过多(${this.selectedFiles.length}个)或网络不稳定。建议分批上传。`, 'error');
                    progressSection.classList.add('hidden');
                };

                xhr.ontimeout = () => {
                    showStatus('上传失败：请求超时 - 文件处理时间过长，请减少文件数量或检查网络连接', 'error');
                    progressSection.classList.add('hidden');
                };

                xhr.open('POST', endpoint);
                xhr.setRequestHeader('Authorization', `Bearer ${AppState.authToken}`);
                xhr.send(formData);
            } catch (error) {
                showStatus(`上传失败: ${error.message}`, 'error');
            }
        }
    };
}

// =====================================================================
// 工具函数
// =====================================================================
function showStatus(message, type = 'info') {
    const statusSection = document.getElementById('statusSection');
    if (statusSection) {
        // 清除之前的定时器
        if (window._statusTimeout) {
            clearTimeout(window._statusTimeout);
        }

        // 创建新的 toast
        statusSection.innerHTML = `<div class="status ${type}">${message}</div>`;
        const statusDiv = statusSection.querySelector('.status');

        // 强制重绘以触发动画
        statusDiv.offsetHeight;
        statusDiv.classList.add('show');

        // 3秒后淡出并移除
        window._statusTimeout = setTimeout(() => {
            statusDiv.classList.add('fade-out');
            setTimeout(() => {
                statusSection.innerHTML = '';
            }, 300); // 等待淡出动画完成
        }, 3000);
    } else {
        showMessageModal('提示', message, 'info');
    }
}

// 将文本中的链接转换为可点击的HTML链接
function linkifyText(text) {
    if (!text) return text;

    // 匹配 http://, https:// 和 www. 开头的链接，排除常见的标点符号
    const urlPattern = /(https?:\/\/[^\s"'<>()[\]{}]+)|(www\.[^\s"'<>()[\]{}]+)/gi;

    return text.replace(urlPattern, function(url) {
        let href = url;
        // 如果是 www. 开头，添加 https://
        if (url.startsWith('www.')) {
            href = 'https://' + url;
        }

        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="message-link" onclick="event.stopPropagation()" title="点击打开链接\n右键复制链接">${url}</a>`;
    });
}

// 显示增强的消息模态框（支持链接高亮）
function showMessageModal(title, message, type = 'info') {
    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'message-modal-overlay';
    modal.innerHTML = `
        <div class="message-modal ${type}">
            <div class="message-modal-header">
                <h3>${title}</h3>
                <button class="message-modal-close" onclick="this.closest('.message-modal-overlay').remove()">&times;</button>
            </div>
            <div class="message-modal-body">
                ${linkifyText(message).replace(/\n/g, '<br>')}
            </div>
            <div class="message-modal-footer">
                <button class="message-modal-btn" onclick="this.closest('.message-modal-overlay').remove()">关闭</button>
            </div>
        </div>
    `;

    // 添加到页面
    document.body.appendChild(modal);

    // 点击遮罩层关闭
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // ESC 键关闭
    const escHandler = function(e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AppState.authToken}`
    };
}

async function authFetch(url, options = {}) {
    if (!options.headers) options.headers = getAuthHeaders();
    const response = await fetch(url, options);
    if (response.status === 401) {
        localStorage.removeItem('gemini_api_pool_auth_token');
        AppState.authToken = '';
        document.getElementById('loginSection').classList.remove('hidden');
        document.getElementById('mainSection').classList.add('hidden');
        showStatus('登录已过期，请重新登录', 'error');
        throw new Error('AUTH_EXPIRED');
    }
    return response;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return Math.round(bytes / (1024 * 1024)) + ' MB';
}

function formatCooldownTime(remainingSeconds) {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function formatDateTime(value) {
    if (value === null || value === undefined || value === '') return '-';
    const timestamp = Number(value);
    if (Number.isNaN(timestamp)) return escapeHtml(String(value));
    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) return '-';
    const pad = num => String(num).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatCodexUsagePercent(usedPercent) {
    if (usedPercent === null || usedPercent === undefined || Number.isNaN(Number(usedPercent))) {
        return '-';
    }
    return `${Math.max(0, Math.min(100, Number(usedPercent))).toFixed(1)}%`;
}

function getCodexUsageBadgeStyle(statusCode) {
    if (Number(statusCode) === 200) {
        return 'background: rgba(52, 199, 89, 0.14); color: #1e7e34; border: 1px solid rgba(52, 199, 89, 0.24);';
    }
    if (statusCode === null || statusCode === undefined || statusCode === '') {
        return 'background: rgba(142, 142, 147, 0.12); color: var(--text-secondary); border: 1px solid rgba(142, 142, 147, 0.2);';
    }
    return 'background: rgba(255, 59, 48, 0.12); color: #d70015; border: 1px solid rgba(215, 0, 21, 0.22);';
}

function buildCodexUsageDetailsHtml(usageResult) {
    if (!usageResult) {
        return `
            <div style="text-align: center; padding: 16px; color: var(--text-secondary, #86868b);">
                暂无余额查询结果
            </div>
        `;
    }

    const statusCode = usageResult.status_code ?? '--';
    const statusStyle = getCodexUsageBadgeStyle(usageResult.status_code);
    const planType = usageResult.plan_type ?? '-';
    const allowed = usageResult.allowed === null || usageResult.allowed === undefined ? '-' : String(usageResult.allowed);
    const limitReached = usageResult.limit_reached === null || usageResult.limit_reached === undefined ? '-' : String(usageResult.limit_reached);
    const usedPercent = formatCodexUsagePercent(usageResult.used_percent);
    const resetText = usageResult.reset_text || '-';
    const email = usageResult.email || '-';
    const accountId = usageResult.account_id || '-';
    const updatedAt = usageResult.updated_at ? formatDateTime(usageResult.updated_at) : '-';
    const rawBody = usageResult.body_parsed
        ? JSON.stringify(usageResult.body || {}, null, 2)
        : (usageResult.body_text || '');

    return `
        <div class="quota-header">Codex 余额 / 状态</div>
        <div class="quota-grid">
            <div class="quota-model-item">
                <div class="quota-model-name">状态码</div>
                <div class="quota-meta" style="margin-top: 8px; justify-content: flex-start;">
                    <span style="padding: 3px 10px; border-radius: 999px; font-weight: 700; ${statusStyle}">${escapeHtml(String(statusCode))}</span>
                </div>
            </div>
            <div class="quota-model-item">
                <div class="quota-model-name">已用比例</div>
                <div style="margin-top: 8px; font-size: 18px; font-weight: 700; color: var(--text-primary);">${escapeHtml(usedPercent)}</div>
                <div class="quota-meta" style="margin-top: 8px;"><span>重置时间</span><span>${escapeHtml(resetText)}</span></div>
            </div>
            <div class="quota-model-item">
                <div class="quota-model-name">套餐 / 允许状态</div>
                <div class="quota-meta" style="margin-top: 8px;"><span>plan_type</span><span>${escapeHtml(String(planType))}</span></div>
                <div class="quota-meta" style="margin-top: 6px;"><span>allowed</span><span>${escapeHtml(allowed)}</span></div>
                <div class="quota-meta" style="margin-top: 6px;"><span>limit_reached</span><span>${escapeHtml(limitReached)}</span></div>
            </div>
            <div class="quota-model-item">
                <div class="quota-model-name">账户信息</div>
                <div class="quota-meta" style="margin-top: 8px;"><span>email</span><span title="${escapeHtml(String(email))}">${escapeHtml(String(email))}</span></div>
                <div class="quota-meta" style="margin-top: 6px;"><span>account_id</span><span title="${escapeHtml(String(accountId))}">${escapeHtml(String(accountId))}</span></div>
                <div class="quota-meta" style="margin-top: 6px;"><span>更新时间</span><span>${escapeHtml(updatedAt)}</span></div>
            </div>
        </div>
        <div style="margin-top: 10px; font-size: 11px; color: var(--text-secondary);">仅 HTTP 200 视为成功，429 会保留在异常集合中。</div>
        <div class="cred-content" style="margin-top: 10px;">${escapeHtml(rawBody)}</div>
    `;
}

function toggleCodexUsageDetailsInline(pathId) {
    const usageDetails = document.getElementById('usage-' + pathId);
    if (!usageDetails) return;
    const isShowing = usageDetails.style.display === 'block';
    const contentDiv = usageDetails.querySelector('.cred-quota-content');
    const filename = contentDiv ? contentDiv.getAttribute('data-filename') : '';

    if (isShowing) {
        usageDetails.style.display = 'none';
        if (filename) AppState.codexCreds.openUsageDetails.delete(filename);
        return;
    }

    const usageResult = filename ? AppState.codexCreds.usageResults[filename] : null;
    if (contentDiv) {
        contentDiv.innerHTML = buildCodexUsageDetailsHtml(usageResult);
    }
    usageDetails.style.display = 'block';
    if (filename) AppState.codexCreds.openUsageDetails.add(filename);
}

// =====================================================================
// 凭证卡片创建（通用）
// =====================================================================
function createCredCard(credInfo, manager) {
    const div = document.createElement('div');
    const { status, filename } = credInfo;
    const managerType = manager.type;
    const usageResult = managerType === 'codex' ? (credInfo.usageResult || manager.usageResults[filename] || null) : null;
    const hasUsageResult = Boolean(usageResult);

    // 卡片样式
    div.className = status.disabled ? 'cred-card disabled' : 'cred-card';

    // 状态徽章
    let statusBadges = '';
    statusBadges += status.disabled
        ? '<span class="status-badge disabled">已禁用</span>'
        : '<span class="status-badge enabled">已启用</span>';

    if (status.error_codes && status.error_codes.length > 0) {
        const errorCodeCounter = {};
        status.error_codes.forEach(code => {
            const key = String(code).trim();
            if (!key) return;
            errorCodeCounter[key] = (errorCodeCounter[key] || 0) + 1;
        });

        const sortedErrorCodes = Object.keys(errorCodeCounter).sort((a, b) => {
            const na = Number(a);
            const nb = Number(b);
            if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b);
            return na - nb;
        });

        const getErrorCodeLevel = (code) => {
            const num = Number(code);
            if (Number.isNaN(num)) return 'unknown';
            if (num >= 500 || num === 400 || num === 403) return 'high';
            if (num === 429 || num === 401 || num === 404) return 'medium';
            return 'low';
        };

        const maxVisibleCodes = 4;
        const visibleCodes = sortedErrorCodes.slice(0, maxVisibleCodes);
        const hiddenCount = sortedErrorCodes.length - visibleCodes.length;

        let errorCodesHtml = '<span class="error-codes" title="错误码: ' + sortedErrorCodes.join(', ') + '">';
        visibleCodes.forEach(code => {
            const count = errorCodeCounter[code];
            const level = getErrorCodeLevel(code);
            const countSuffix = count > 1 ? `×${count}` : '';
            errorCodesHtml += `<span class="error-code-chip ${level}">${code}${countSuffix}</span>`;
        });
        if (hiddenCount > 0) {
            errorCodesHtml += `<span class="error-code-chip more">+${hiddenCount}</span>`;
        }
        errorCodesHtml += '</span>';

        statusBadges += errorCodesHtml;

        const autoBan = status.error_codes.filter(c => Number(c) === 400 || Number(c) === 403);
        if (autoBan.length > 0 && status.disabled) {
            statusBadges += '<span class="status-badge" style="background-color: #e74c3c; color: white;">AUTO_BAN</span>';
        }
    } else {
        statusBadges += '<span class="status-badge" style="background-color: #28a745; color: white;">无错误</span>';
    }

    if (managerType === 'codex' && usageResult) {
        const usageBadgeStyle = getCodexUsageBadgeStyle(usageResult.status_code);
        statusBadges += `<span class="status-badge" style="${usageBadgeStyle}" title="最近一次余额查询状态">Usage ${escapeHtml(String(usageResult.status_code ?? '--'))}</span>`;
        if (usageResult.used_percent !== null && usageResult.used_percent !== undefined && !Number.isNaN(Number(usageResult.used_percent))) {
            statusBadges += `<span class="status-badge" style="background-color: rgba(0, 122, 255, 0.12); color: #0055cc; border: 1px solid rgba(0, 85, 204, 0.18);">已用 ${escapeHtml(formatCodexUsagePercent(usageResult.used_percent))}</span>`;
        }
    }

    // Preview状态显示 (仅对geminicli模式显示)
    if (managerType !== 'antigravity' && managerType !== 'codex' && credInfo.preview !== undefined) {
        if (credInfo.preview) {
            statusBadges += '<span class="status-badge" style="background-color: #9c27b0; color: white;" title="该凭证支持Preview模型">Preview</span>';
        } else {
            statusBadges += '<span class="status-badge" style="background-color: #607d8b; color: white;" title="该凭证不支持Preview模型">Preview</span>';
        }
    }

    // 模型级冷却状态
    if (credInfo.model_cooldowns && Object.keys(credInfo.model_cooldowns).length > 0) {
        const currentTime = Date.now() / 1000;
        const activeCooldowns = Object.entries(credInfo.model_cooldowns)
            .filter(([, until]) => until > currentTime)
            .map(([model, until]) => {
                const remaining = Math.max(0, Math.floor(until - currentTime));
                const shortModel = model.replace('gemini-', '').replace('-exp', '')
                    .replace('2.0-', '2-').replace('1.5-', '1.5-');
                return {
                    model: shortModel,
                    time: formatCooldownTime(remaining).replace(/s$/, '').replace(/ /g, ''),
                    fullModel: model
                };
            });

        if (activeCooldowns.length > 0) {
            activeCooldowns.slice(0, 2).forEach(item => {
                statusBadges += `<span class="cooldown-badge" style="background-color: #17a2b8;" title="模型: ${item.fullModel}">${item.model}: ${item.time}</span>`;
            });
            if (activeCooldowns.length > 2) {
                const remaining = activeCooldowns.length - 2;
                const remainingModels = activeCooldowns.slice(2).map(i => `${i.fullModel}: ${i.time}`).join('\n');
                statusBadges += `<span class="cooldown-badge" style="background-color: #17a2b8;" title="其他模型:\n${remainingModels}">+${remaining}</span>`;
            }
        }
    }

    // 路径ID
    const typePrefix = managerType === 'antigravity' ? 'ag_' : managerType === 'codex' ? 'cx_' : '';
    const pathId = typePrefix + btoa(encodeURIComponent(filename)).replace(/[+/=]/g, '_');
    const fnPrefix = managerType === 'antigravity' ? 'Antigravity' : managerType === 'codex' ? 'Codex' : '';

    // 操作按钮
    const actionButtons = `
        ${status.disabled
            ? `<button class="cred-btn enable" data-filename="${filename}" data-action="enable">启用</button>`
            : `<button class="cred-btn disable" data-filename="${filename}" data-action="disable">禁用</button>`
        }
        <button class="cred-btn" onclick="toggle${fnPrefix}CredDetails('${pathId}')">查看内容</button>
        <button class="cred-btn" onclick="download${fnPrefix}Cred('${filename}')">下载</button>
        <button class="cred-btn" onclick="fetch${fnPrefix}UserEmail('${filename}')">邮箱</button>
        ${managerType === 'antigravity' ? `<button class="cred-btn quota" onclick="toggleAntigravityQuotaDetails('${pathId}')" title="查看该凭证的额度信息">额度</button>` : ''}
        ${managerType === 'codex' ? `<button class="cred-btn quota" onclick="queryCodexUsage('${filename}')" title="查询该凭证的余额和状态">查询余额</button>` : ''}
        ${managerType === 'codex' ? `<button class="cred-btn quota" onclick="toggleCodexUsageDetailsInline('${pathId}')" ${hasUsageResult ? '' : 'disabled'} title="查看最近一次余额查询结果">查看余额</button>` : ''}
        ${managerType === 'normal' ? `<button class="cred-btn preview" onclick="configurePreviewChannel('${filename}')" title="配置Preview通道，启用实验性功能">预览</button>` : ''}
        ${managerType !== 'codex' ? `<button class="cred-btn verify" onclick="verify${fnPrefix}ProjectId('${filename}')" title="重新获取Project ID，可恢复403错误">检验</button>` : ''}
        <button class="cred-btn test" onclick="test${fnPrefix}Credential('${filename}')" title="测试凭证是否可用">测试</button>
        <button class="cred-btn chat" onclick="showChatModal('${filename}', '${managerType}')" title="使用该凭证进行对话">对话</button>
        <button class="cred-btn error-view" onclick="toggle${fnPrefix}ErrorDetails('${pathId}')" title="查看该凭证的详细报错信息">报错</button>
        <button class="cred-btn delete" data-filename="${filename}" data-action="delete">删除</button>
    `;

    // 邮箱信息
    const emailInfo = credInfo.user_email
        ? `<div class="cred-email" style="font-size: 12px; color: #666; margin-top: 2px;">${credInfo.user_email}</div>`
        : '<div class="cred-email" style="font-size: 12px; color: #999; margin-top: 2px; font-style: italic;">未获取邮箱</div>';

    const checkboxClass = manager.getElementId('file-checkbox');

    div.innerHTML = `
        <div class="cred-header">
            <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" class="${checkboxClass}" data-filename="${filename}" onchange="toggle${fnPrefix}FileSelection('${filename}')">
                <div>
                    <div class="cred-filename">${filename}</div>
                    ${emailInfo}
                </div>
            </div>
            <div class="cred-status">${statusBadges}</div>
        </div>
        <div class="cred-actions">${actionButtons}</div>
        <div class="cred-details" id="details-${pathId}">
            <div class="cred-content" data-filename="${filename}" data-loaded="false"></div>
        </div>
        <div class="cred-details" id="errors-${pathId}">
            <div class="cred-content" data-filename="${filename}" data-loaded="false"></div>
        </div>
        ${managerType === 'antigravity' ? `
        <div class="cred-quota-details" id="quota-${pathId}" style="display: none;">
            <div class="cred-quota-content" data-filename="${filename}" data-loaded="false">
            </div>
        </div>
        ` : ''}
        ${managerType === 'codex' ? `
        <div class="cred-quota-details" id="usage-${pathId}" style="display: ${manager.openUsageDetails.has(filename) ? 'block' : 'none'};">
            <div class="cred-quota-content" data-filename="${filename}" data-loaded="${hasUsageResult ? 'true' : 'false'}">
                ${manager.openUsageDetails.has(filename) ? buildCodexUsageDetailsHtml(usageResult) : ''}
            </div>
        </div>
        ` : ''}
    `;

    // 添加事件监听
    div.querySelectorAll('[data-filename][data-action]').forEach(button => {
        button.addEventListener('click', function () {
            const fn = this.getAttribute('data-filename');
            const action = this.getAttribute('data-action');
            if (action === 'delete') {
                const typeLabel = managerType === 'antigravity' ? ' Antigravity ' : managerType === 'codex' ? ' Codex ' : '';
                if (confirm(`确定要删除${typeLabel}凭证文件吗？\n${fn}`)) {
                    manager.action(fn, action);
                }
            } else {
                manager.action(fn, action);
            }
        });
    });

    return div;
}

// =====================================================================
// 凭证详情切换
// =====================================================================
async function toggleCredDetails(pathId) {
    await toggleCredDetailsCommon(pathId, AppState.creds);
}

async function toggleAntigravityCredDetails(pathId) {
    await toggleCredDetailsCommon(pathId, AppState.antigravityCreds);
}

async function toggleCodexCredDetails(pathId) {
    await toggleCredDetailsCommon(pathId, AppState.codexCreds);
}

async function toggleCredDetailsCommon(pathId, manager) {
    const details = document.getElementById('details-' + pathId);
    if (!details) return;

    const isShowing = details.classList.toggle('show');

    if (isShowing) {
        const contentDiv = details.querySelector('.cred-content');
        const filename = contentDiv.getAttribute('data-filename');
        const loaded = contentDiv.getAttribute('data-loaded');

        if (loaded === 'false' && filename) {
            contentDiv.textContent = '正在加载文件内容...';

            try {
                const modeParam = manager.type === 'antigravity' ? 'mode=antigravity' : manager.type === 'codex' ? 'mode=codex' : 'mode=geminicli';
                const endpoint = `./creds/detail/${encodeURIComponent(filename)}?${modeParam}`;

                const response = await authFetch(endpoint);

                const data = await response.json();
                if (response.ok && data.content) {
                    contentDiv.textContent = JSON.stringify(data.content, null, 2);
                    contentDiv.setAttribute('data-loaded', 'true');
                } else {
                    contentDiv.textContent = '无法加载文件内容: ' + (data.error || data.detail || '未知错误');
                }
            } catch (error) {
                if (error.message === 'AUTH_EXPIRED') return;
                contentDiv.textContent = '加载文件内容失败: ' + error.message;
            }
        }
    }
}

// =====================================================================
// 登录相关函数
// =====================================================================
async function login() {
    const password = document.getElementById('loginPassword').value;

    if (!password) {
        showStatus('请输入密码', 'error');
        return;
    }

    try {
        const response = await fetch('./auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (response.ok) {
            AppState.authToken = data.token;
            localStorage.setItem('gemini_api_pool_auth_token', AppState.authToken);
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('mainSection').classList.remove('hidden');
            showStatus('登录成功', 'success');
            // 显示面板后初始化滑块
            requestAnimationFrame(() => initTabSlider());
        } else {
            showStatus(`登录失败: ${data.detail || data.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    }
}

async function autoLogin() {
    const savedToken = localStorage.getItem('gemini_api_pool_auth_token');
    if (!savedToken) return false;

    AppState.authToken = savedToken;

    try {
        const response = await fetch('./config/get', {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AppState.authToken}`
            }
        });

        if (response.ok) {
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('mainSection').classList.remove('hidden');
            showStatus('自动登录成功', 'success');
            // 显示面板后初始化滑块
            requestAnimationFrame(() => initTabSlider());
            return true;
        } else if (response.status === 401) {
            localStorage.removeItem('gemini_api_pool_auth_token');
            AppState.authToken = '';
            return false;
        }
        return false;
    } catch (error) {
        return false;
    }
}

function logout() {
    localStorage.removeItem('gemini_api_pool_auth_token');
    AppState.authToken = '';
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('mainSection').classList.add('hidden');
    showStatus('已退出登录', 'info');
    const passwordInput = document.getElementById('loginPassword');
    if (passwordInput) passwordInput.value = '';
}

function handlePasswordEnter(event) {
    if (event.key === 'Enter') login();
}

// =====================================================================
// 标签页切换
// =====================================================================

// 更新滑块位置
function updateTabSlider(targetTab, animate = true) {
    const slider = document.querySelector('.tab-slider');
    const tabs = document.querySelector('.tabs');
    if (!slider || !tabs || !targetTab) return;

    // 获取按钮位置和容器宽度
    const tabLeft = targetTab.offsetLeft;
    const tabWidth = targetTab.offsetWidth;
    const tabsWidth = tabs.scrollWidth;

    // 使用 left 和 right 同时控制，确保动画同步
    const rightValue = tabsWidth - tabLeft - tabWidth;

    if (animate) {
        slider.style.left = `${tabLeft}px`;
        slider.style.right = `${rightValue}px`;
    } else {
        // 首次加载时不使用动画
        slider.style.transition = 'none';
        slider.style.left = `${tabLeft}px`;
        slider.style.right = `${rightValue}px`;
        // 强制重绘后恢复过渡
        slider.offsetHeight;
        slider.style.transition = '';
    }
}

// 初始化滑块位置
function initTabSlider() {
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        updateTabSlider(activeTab, false);
    }
}

// 页面加载和窗口大小变化时初始化滑块
document.addEventListener('DOMContentLoaded', initTabSlider);
window.addEventListener('resize', () => {
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) updateTabSlider(activeTab, false);
});

function switchTab(tabName) {
    // 获取当前活动的内容区域
    const currentContent = document.querySelector('.tab-content.active');
    const targetContent = document.getElementById(tabName + 'Tab');

    // 如果点击的是当前标签页，不做任何操作
    if (currentContent === targetContent) return;

    // 找到目标标签按钮（始终使用选择器定位隐藏的tab按钮）
    const targetTab = document.querySelector(`.tab[onclick*="'${tabName}'"]`);

    // 移除所有标签页的active状态
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));

    // 添加当前点击标签的active状态
    if (targetTab) {
        targetTab.classList.add('active');
        // 更新滑块位置（带动画）
        updateTabSlider(targetTab, true);
    }

    // 淡出当前内容
    if (currentContent) {
        // 设置淡出过渡
        currentContent.style.transition = 'opacity 0.18s ease-out, transform 0.18s ease-out';
        currentContent.style.opacity = '0';
        currentContent.style.transform = 'translateX(-12px)';

        setTimeout(() => {
            currentContent.classList.remove('active');
            currentContent.style.transition = '';
            currentContent.style.opacity = '';
            currentContent.style.transform = '';

            // 淡入新内容
            if (targetContent) {
                // 先设置初始状态（在添加 active 类之前）
                targetContent.style.opacity = '0';
                targetContent.style.transform = 'translateX(12px)';
                targetContent.style.transition = 'none'; // 暂时禁用过渡

                // 添加 active 类使元素可见
                targetContent.classList.add('active');

                // 使用双重 requestAnimationFrame 确保浏览器完成重绘
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        // 启用过渡并应用最终状态
                        targetContent.style.transition = 'opacity 0.25s ease-out, transform 0.25s ease-out';
                        targetContent.style.opacity = '1';
                        targetContent.style.transform = 'translateX(0)';

                        // 清理内联样式并执行数据加载
                        setTimeout(() => {
                            targetContent.style.transition = '';
                            targetContent.style.opacity = '';
                            targetContent.style.transform = '';

                            // 动画完成后触发数据加载
                            triggerTabDataLoad(tabName);
                        }, 260);
                    });
                });
            }
        }, 180);
    } else {
        // 如果没有当前内容（首次加载），直接显示目标内容
        if (targetContent) {
            targetContent.classList.add('active');
            // 直接触发数据加载
            triggerTabDataLoad(tabName);
        }
    }
}

// 标签页数据加载（从动画中分离出来）
function triggerTabDataLoad(tabName) {
    if (tabName === 'manage') AppState.creds.refresh();
    if (tabName === 'antigravity-manage') AppState.antigravityCreds.refresh();
    if (tabName === 'codex-manage') AppState.codexCreds.refresh();
    if (tabName === 'config') loadConfig();
    if (tabName === 'logs') connectWebSocket();
}


// =====================================================================
// OAuth认证相关函数
// =====================================================================
async function startAuth() {
    const projectId = document.getElementById('projectId').value.trim();
    AppState.currentProjectId = projectId || null;

    const btn = document.getElementById('getAuthBtn');
    btn.disabled = true;
    btn.textContent = '正在获取认证链接...';

    try {
        const requestBody = projectId ? { project_id: projectId } : {};
        showStatus(projectId ? '使用指定的项目ID生成认证链接...' : '将尝试自动检测项目ID，正在生成认证链接...', 'info');

        const response = await fetch('./auth/start', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('authUrl').href = data.auth_url;
            document.getElementById('authUrl').textContent = data.auth_url;
            document.getElementById('authUrlSection').classList.remove('hidden');

            const msg = data.auto_project_detection
                ? '认证链接已生成（将在认证完成后自动检测项目ID），请点击链接完成授权'
                : `认证链接已生成（项目ID: ${data.detected_project_id}），请点击链接完成授权`;
            showStatus(msg, 'info');
            AppState.authInProgress = true;
        } else {
            showStatus(`错误: ${data.error || '获取认证链接失败'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '获取认证链接';
    }
}

async function getCredentials() {
    if (!AppState.authInProgress) {
        showStatus('请先获取认证链接并完成授权', 'error');
        return;
    }

    const btn = document.getElementById('getCredsBtn');
    btn.disabled = true;
    btn.textContent = '等待OAuth回调中...';

    try {
        showStatus('正在等待OAuth回调，这可能需要一些时间...', 'info');

        const requestBody = AppState.currentProjectId ? { project_id: AppState.currentProjectId } : {};

        const response = await fetch('./auth/callback', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('credentialsContent').textContent = JSON.stringify(data.credentials, null, 2);

            const msg = data.auto_detected_project
                ? `✅ 认证成功！项目ID已自动检测为: ${data.credentials.project_id}，文件已保存到: ${data.file_path}`
                : `✅ 认证成功！文件已保存到: ${data.file_path}`;
            showStatus(msg, 'success');

            document.getElementById('credentialsSection').classList.remove('hidden');
            AppState.authInProgress = false;
        } else if (data.requires_project_selection && data.available_projects) {
            let projectOptions = "请选择一个项目：\n\n";
            data.available_projects.forEach((project, index) => {
                projectOptions += `${index + 1}. ${project.name} (${project.project_id})\n`;
            });
            projectOptions += `\n请输入序号 (1-${data.available_projects.length}):`;

            const selection = prompt(projectOptions);
            const projectIndex = parseInt(selection) - 1;

            if (projectIndex >= 0 && projectIndex < data.available_projects.length) {
                AppState.currentProjectId = data.available_projects[projectIndex].project_id;
                btn.textContent = '重新尝试获取认证文件';
                showStatus(`使用选择的项目重新尝试...`, 'info');
                setTimeout(() => getCredentials(), 1000);
                return;
            } else {
                showStatus('无效的选择，请重新开始认证', 'error');
            }
        } else if (data.requires_manual_project_id) {
            const userProjectId = prompt('无法自动检测项目ID，请手动输入您的Google Cloud项目ID:');
            if (userProjectId && userProjectId.trim()) {
                AppState.currentProjectId = userProjectId.trim();
                btn.textContent = '重新尝试获取认证文件';
                showStatus('使用手动输入的项目ID重新尝试...', 'info');
                setTimeout(() => getCredentials(), 1000);
                return;
            } else {
                showStatus('需要项目ID才能完成认证，请重新开始并输入正确的项目ID', 'error');
            }
        } else {
            showStatus(`❌ 错误: ${data.error || '获取认证文件失败'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '获取认证文件';
    }
}

// =====================================================================
// Antigravity 认证相关函数
// =====================================================================
async function startAntigravityAuth() {
    const btn = document.getElementById('getAntigravityAuthBtn');
    btn.disabled = true;
    btn.textContent = '生成认证链接中...';

    try {
        showStatus('正在生成 Antigravity 认证链接...', 'info');

        const response = await fetch('./auth/start', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ mode: 'antigravity' })
        });

        const data = await response.json();

        if (response.ok) {
            AppState.antigravityAuthState = data.state;
            AppState.antigravityAuthInProgress = true;

            const authUrlLink = document.getElementById('antigravityAuthUrl');
            authUrlLink.href = data.auth_url;
            authUrlLink.textContent = data.auth_url;
            document.getElementById('antigravityAuthUrlSection').classList.remove('hidden');

            showStatus('✅ Antigravity 认证链接已生成！请点击链接完成授权', 'success');
        } else {
            showStatus(`❌ 错误: ${data.error || '生成认证链接失败'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '获取 Antigravity 认证链接';
    }
}

async function getAntigravityCredentials() {
    if (!AppState.antigravityAuthInProgress) {
        showStatus('请先获取 Antigravity 认证链接并完成授权', 'error');
        return;
    }

    const btn = document.getElementById('getAntigravityCredsBtn');
    btn.disabled = true;
    btn.textContent = '等待OAuth回调中...';

    try {
        showStatus('正在等待 Antigravity OAuth回调...', 'info');

        const response = await fetch('./auth/callback', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ mode: 'antigravity' })
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('antigravityCredsContent').textContent = JSON.stringify(data.credentials, null, 2);
            document.getElementById('antigravityCredsSection').classList.remove('hidden');
            AppState.antigravityAuthInProgress = false;
            showStatus(`✅ Antigravity 认证成功！文件已保存到: ${data.file_path}`, 'success');
        } else {
            showStatus(`❌ 错误: ${data.error || '获取认证文件失败'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '获取 Antigravity 凭证';
    }
}

function downloadAntigravityCredentials() {
    const content = document.getElementById('antigravityCredsContent').textContent;
    const blob = new Blob([content], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `antigravity-credential-${Date.now()}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// =====================================================================
// 回调URL处理
// =====================================================================
function toggleProjectIdSection() {
    const section = document.getElementById('projectIdSection');
    const icon = document.getElementById('projectIdToggleIcon');

    if (section.style.display === 'none') {
        section.style.display = 'block';
        icon.style.transform = 'rotate(90deg)';
        icon.textContent = '▼';
    } else {
        section.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
        icon.textContent = '▶';
    }
}

function toggleCallbackUrlSection() {
    const section = document.getElementById('callbackUrlSection');
    const icon = document.getElementById('callbackUrlToggleIcon');

    if (section.style.display === 'none') {
        section.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
        icon.textContent = '▲';
    } else {
        section.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
        icon.textContent = '▼';
    }
}

function toggleAntigravityCallbackUrlSection() {
    const section = document.getElementById('antigravityCallbackUrlSection');
    const icon = document.getElementById('antigravityCallbackUrlToggleIcon');

    if (section.style.display === 'none') {
        section.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
        icon.textContent = '▲';
    } else {
        section.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
        icon.textContent = '▼';
    }
}

async function processCallbackUrl() {
    const callbackUrl = document.getElementById('callbackUrlInput').value.trim();

    if (!callbackUrl) {
        showStatus('请输入回调URL', 'error');
        return;
    }

    if (!callbackUrl.startsWith('http://') && !callbackUrl.startsWith('https://')) {
        showStatus('请输入有效的URL（以http://或https://开头）', 'error');
        return;
    }

    if (!callbackUrl.includes('code=') || !callbackUrl.includes('state=')) {
        showStatus('❌ 这不是有效的回调URL！请确保：\n1. 已完成Google OAuth授权\n2. 复制的是浏览器地址栏的完整URL\n3. URL包含code和state参数', 'error');
        return;
    }

    showStatus('正在从回调URL获取凭证...', 'info');

    try {
        const projectId = document.getElementById('projectId')?.value.trim() || null;

        const response = await fetch('./auth/callback-url', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ callback_url: callbackUrl, project_id: projectId })
        });

        const result = await response.json();

        if (result.credentials) {
            showStatus(result.message || '从回调URL获取凭证成功！', 'success');
            document.getElementById('credentialsContent').innerHTML = '<pre>' + JSON.stringify(result.credentials, null, 2) + '</pre>';
            document.getElementById('credentialsSection').classList.remove('hidden');
        } else if (result.requires_manual_project_id) {
            showStatus('需要手动指定项目ID，请在高级选项中填入Google Cloud项目ID后重试', 'error');
        } else if (result.requires_project_selection) {
            let msg = '<br><strong>可用项目：</strong><br>';
            result.available_projects.forEach(p => {
                msg += `• ${p.name} (ID: ${p.project_id})<br>`;
            });
            showStatus('检测到多个项目，请在高级选项中指定项目ID：' + msg, 'error');
        } else {
            showStatus(result.error || '从回调URL获取凭证失败', 'error');
        }

        document.getElementById('callbackUrlInput').value = '';
    } catch (error) {
        showStatus(`从回调URL获取凭证失败: ${error.message}`, 'error');
    }
}

async function processAntigravityCallbackUrl() {
    const callbackUrl = document.getElementById('antigravityCallbackUrlInput').value.trim();

    if (!callbackUrl) {
        showStatus('请输入回调URL', 'error');
        return;
    }

    if (!callbackUrl.startsWith('http://') && !callbackUrl.startsWith('https://')) {
        showStatus('请输入有效的URL（以http://或https://开头）', 'error');
        return;
    }

    if (!callbackUrl.includes('code=') || !callbackUrl.includes('state=')) {
        showStatus('❌ 这不是有效的回调URL！请确保包含code和state参数', 'error');
        return;
    }

    showStatus('正在从回调URL获取 Antigravity 凭证...', 'info');

    try {
        const response = await fetch('./auth/callback-url', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ callback_url: callbackUrl, mode: 'antigravity' })
        });

        const result = await response.json();

        if (result.credentials) {
            showStatus(result.message || '从回调URL获取 Antigravity 凭证成功！', 'success');
            document.getElementById('antigravityCredsContent').textContent = JSON.stringify(result.credentials, null, 2);
            document.getElementById('antigravityCredsSection').classList.remove('hidden');
        } else {
            showStatus(result.error || '从回调URL获取 Antigravity 凭证失败', 'error');
        }

        document.getElementById('antigravityCallbackUrlInput').value = '';
    } catch (error) {
        showStatus(`从回调URL获取 Antigravity 凭证失败: ${error.message}`, 'error');
    }
}


// =====================================================================
// Codex OAuth认证（OpenAI PKCE流程）
// =====================================================================

async function startCodexAuth() {
    const btn = document.getElementById('getCodexAuthBtn');
    btn.disabled = true;
    btn.textContent = '生成认证链接中...';

    try {
        showStatus('正在生成 Codex 认证链接...', 'info');

        const response = await fetch('./auth/start', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ mode: 'codex' })
        });

        const data = await response.json();

        if (response.ok) {
            AppState.codexAuthState = data.state;
            AppState.codexAuthInProgress = true;

            const authUrlLink = document.getElementById('codexAuthUrl');
            authUrlLink.href = data.auth_url;
            authUrlLink.textContent = data.auth_url;
            document.getElementById('codexAuthUrlSection').classList.remove('hidden');

            showStatus('Codex 认证链接已生成！请点击链接完成OpenAI授权', 'success');
        } else {
            showStatus(`错误: ${data.error || '生成认证链接失败'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '获取Codex认证链接';
    }
}


async function getCodexCredentials() {
    if (!AppState.codexAuthInProgress) {
        showStatus('请先获取 Codex 认证链接并完成授权', 'error');
        return;
    }

    const btn = document.getElementById('getCodexCredsBtn');
    btn.disabled = true;
    btn.textContent = '等待OAuth回调中...';

    try {
        showStatus('正在等待 Codex OAuth回调...', 'info');

        const response = await fetch('./auth/callback', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ mode: 'codex' })
        });

        const data = await response.json();

        if (response.ok) {
            document.getElementById('codexCredsContent').textContent = JSON.stringify(data.credentials, null, 2);
            document.getElementById('codexCredsSection').classList.remove('hidden');
            AppState.codexAuthInProgress = false;
            showStatus(`Codex 认证成功！文件已保存到: ${data.file_path}`, 'success');
        } else {
            showStatus(`错误: ${data.error || '获取认证文件失败'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '获取Codex凭证';
    }
}


async function processCodexCallbackUrl() {
    const callbackUrl = document.getElementById('codexCallbackUrlInput').value.trim();

    if (!callbackUrl) {
        showStatus('请输入回调URL', 'error');
        return;
    }

    if (!callbackUrl.startsWith('http://') && !callbackUrl.startsWith('https://')) {
        showStatus('请输入有效的URL（以http://或https://开头）', 'error');
        return;
    }

    if (!callbackUrl.includes('code=') || !callbackUrl.includes('state=')) {
        showStatus('这不是有效的回调URL！请确保包含code和state参数', 'error');
        return;
    }

    showStatus('正在从回调URL获取 Codex 凭证...', 'info');

    try {
        const response = await fetch('./auth/callback-url', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ callback_url: callbackUrl, mode: 'codex' })
        });

        const result = await response.json();

        if (result.credentials) {
            showStatus(result.message || '从回调URL获取 Codex 凭证成功！', 'success');
            document.getElementById('codexCredsContent').textContent = JSON.stringify(result.credentials, null, 2);
            document.getElementById('codexCredsSection').classList.remove('hidden');
        } else {
            showStatus(result.error || '从回调URL获取 Codex 凭证失败', 'error');
        }

        document.getElementById('codexCallbackUrlInput').value = '';
    } catch (error) {
        showStatus(`从回调URL获取 Codex 凭证失败: ${error.message}`, 'error');
    }
}


function toggleCodexCallbackUrlSection() {
    const section = document.getElementById('codexCallbackUrlSectionInner');
    const icon = document.getElementById('codexCallbackUrlToggleIcon');
    if (section.style.display === 'none') {
        section.style.display = 'block';
        icon.innerHTML = '&#9650;';
    } else {
        section.style.display = 'none';
        icon.innerHTML = '&#9660;';
    }
}

// =====================================================================
// 全局兼容函数（供HTML调用）
// =====================================================================
// 普通凭证管理
function refreshCredsStatus() { AppState.creds.refresh(); }
function applyStatusFilter() { AppState.creds.applyStatusFilter(); }
function changePage(direction) { AppState.creds.changePage(direction); }
function changePageSize() { AppState.creds.changePageSize(); }
function toggleFileSelection(filename) {
    if (AppState.creds.selectedFiles.has(filename)) {
        AppState.creds.selectedFiles.delete(filename);
    } else {
        AppState.creds.selectedFiles.add(filename);
    }
    AppState.creds.updateBatchControls();
}
function toggleSelectAll() {
    const checkbox = document.getElementById('selectAllCheckbox');
    const checkboxes = document.querySelectorAll('.file-checkbox');

    if (checkbox.checked) {
        checkboxes.forEach(cb => AppState.creds.selectedFiles.add(cb.getAttribute('data-filename')));
    } else {
        AppState.creds.selectedFiles.clear();
    }
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
    AppState.creds.updateBatchControls();
}
function batchAction(action) { AppState.creds.batchAction(action); }
function downloadCred(filename) {
    fetch(`./creds/download/${filename}`, { headers: { 'Authorization': `Bearer ${AppState.authToken}` } })
        .then(r => r.ok ? r.blob() : Promise.reject())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(url);
            showStatus(`已下载文件: ${filename}`, 'success');
        })
        .catch(() => showStatus(`下载失败: ${filename}`, 'error'));
}
async function downloadAllCreds() {
    try {
        const response = await fetch('./creds/download-all', {
            headers: { 'Authorization': `Bearer ${AppState.authToken}` }
        });
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'credentials.zip';
            a.click();
            window.URL.revokeObjectURL(url);
            showStatus('已下载所有凭证文件', 'success');
        }
    } catch (error) {
        showStatus(`打包下载失败: ${error.message}`, 'error');
    }
}

// Antigravity凭证管理
function refreshAntigravityCredsList() { AppState.antigravityCreds.refresh(); }
function applyAntigravityStatusFilter() { AppState.antigravityCreds.applyStatusFilter(); }
function changeAntigravityPage(direction) { AppState.antigravityCreds.changePage(direction); }
function changeAntigravityPageSize() { AppState.antigravityCreds.changePageSize(); }
function toggleAntigravityFileSelection(filename) {
    if (AppState.antigravityCreds.selectedFiles.has(filename)) {
        AppState.antigravityCreds.selectedFiles.delete(filename);
    } else {
        AppState.antigravityCreds.selectedFiles.add(filename);
    }
    AppState.antigravityCreds.updateBatchControls();
}
function toggleSelectAllAntigravity() {
    const checkbox = document.getElementById('selectAllAntigravityCheckbox');
    const checkboxes = document.querySelectorAll('.antigravityFile-checkbox');

    if (checkbox.checked) {
        checkboxes.forEach(cb => AppState.antigravityCreds.selectedFiles.add(cb.getAttribute('data-filename')));
    } else {
        AppState.antigravityCreds.selectedFiles.clear();
    }
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
    AppState.antigravityCreds.updateBatchControls();
}
function batchAntigravityAction(action) { AppState.antigravityCreds.batchAction(action); }
function downloadAntigravityCred(filename) {
    fetch(`./creds/download/${filename}?mode=antigravity`, { headers: getAuthHeaders() })
        .then(r => r.ok ? r.blob() : Promise.reject())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(url);
            showStatus(`✅ 已下载: ${filename}`, 'success');
        })
        .catch(() => showStatus(`下载失败: ${filename}`, 'error'));
}
function deleteAntigravityCred(filename) {
    if (confirm(`确定要删除 ${filename} 吗？`)) {
        AppState.antigravityCreds.action(filename, 'delete');
    }
}
async function downloadAllAntigravityCreds() {
    try {
        const response = await fetch('./creds/download-all?mode=antigravity', { headers: getAuthHeaders() });
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `antigravity_credentials_${Date.now()}.zip`;
            a.click();
            window.URL.revokeObjectURL(url);
            showStatus('✅ 所有Antigravity凭证已打包下载', 'success');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    }
}

// 文件上传
function handleFileSelect(event) { AppState.uploadFiles.handleFileSelect(event); }
function removeFile(index) { AppState.uploadFiles.removeFile(index); }
function clearFiles() { AppState.uploadFiles.clearFiles(); }
function uploadFiles() { AppState.uploadFiles.upload(); }

function handleAntigravityFileSelect(event) { AppState.antigravityUploadFiles.handleFileSelect(event); }
function handleAntigravityFileDrop(event) {
    event.preventDefault();
    event.currentTarget.style.borderColor = '#007bff';
    event.currentTarget.style.backgroundColor = '#f8f9fa';
    AppState.antigravityUploadFiles.addFiles(Array.from(event.dataTransfer.files));
}
function removeAntigravityFile(index) { AppState.antigravityUploadFiles.removeFile(index); }
function clearAntigravityFiles() { AppState.antigravityUploadFiles.clearFiles(); }
function uploadAntigravityFiles() { AppState.antigravityUploadFiles.upload(); }

// Codex凭证管理
function refreshCodexCredsList() { AppState.codexCreds.refresh(); }
function applyCodexStatusFilter() { AppState.codexCreds.applyStatusFilter(); }
function changeCodexPage(direction) { AppState.codexCreds.changePage(direction); }
function changeCodexPageSize() { AppState.codexCreds.changePageSize(); }
async function queryCodexUsage(filename) { return AppState.codexCreds.queryUsage(filename); }
async function queryAllCodexBalances() { return AppState.codexCreds.runUsageScan('balance'); }
async function batchQueryCodexUsageStatus() { return AppState.codexCreds.runUsageScan('status'); }
async function deleteLatestFailedCodexCreds() { return AppState.codexCreds.deleteLatestFailedFiles(); }
function toggleCodexFileSelection(filename) {
    if (AppState.codexCreds.selectedFiles.has(filename)) {
        AppState.codexCreds.selectedFiles.delete(filename);
    } else {
        AppState.codexCreds.selectedFiles.add(filename);
    }
    AppState.codexCreds.updateBatchControls();
}
function toggleSelectAllCodex() {
    const checkbox = document.getElementById('selectAllCodexCheckbox');
    const checkboxes = document.querySelectorAll('.codexFile-checkbox');

    if (checkbox.checked) {
        checkboxes.forEach(cb => AppState.codexCreds.selectedFiles.add(cb.getAttribute('data-filename')));
    } else {
        AppState.codexCreds.selectedFiles.clear();
    }
    checkboxes.forEach(cb => cb.checked = checkbox.checked);
    AppState.codexCreds.updateBatchControls();
}
function batchCodexAction(action) { AppState.codexCreds.batchAction(action); }
function downloadCodexCred(filename) {
    fetch(`./creds/download/${filename}?mode=codex`, { headers: getAuthHeaders() })
        .then(r => r.ok ? r.blob() : Promise.reject())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(url);
            showStatus(`已下载: ${filename}`, 'success');
        })
        .catch(() => showStatus(`下载失败: ${filename}`, 'error'));
}
function deleteCodexCred(filename) {
    if (confirm(`确定要删除 ${filename} 吗？`)) {
        AppState.codexCreds.action(filename, 'delete');
    }
}
async function downloadAllCodexCreds() {
    try {
        const response = await fetch('./creds/download-all?mode=codex', { headers: getAuthHeaders() });
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `codex_credentials_${Date.now()}.zip`;
            a.click();
            window.URL.revokeObjectURL(url);
            showStatus('所有Codex凭证已打包下载', 'success');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    }
}

// Codex文件上传
function handleCodexFileSelect(event) { AppState.codexUploadFiles.handleFileSelect(event); }
function handleCodexFileDrop(event) {
    event.preventDefault();
    event.currentTarget.style.borderColor = '#007bff';
    event.currentTarget.style.backgroundColor = '#f8f9fa';
    AppState.codexUploadFiles.addFiles(Array.from(event.dataTransfer.files));
}
function removeCodexFile(index) { AppState.codexUploadFiles.removeFile(index); }
function clearCodexFiles() { AppState.codexUploadFiles.clearFiles(); }
function uploadCodexFiles() { AppState.codexUploadFiles.upload(); }

// 邮箱相关
// 辅助函数：根据文件名更新卡片中的邮箱显示
function updateEmailDisplay(filename, email, managerType = 'normal') {
    // 查找对应的凭证卡片
    const containerId = managerType === 'antigravity' ? 'antigravityCredsList' : managerType === 'codex' ? 'codexCredsList' : 'credsList';
    const container = document.getElementById(containerId);
    if (!container) return false;

    // 通过 data-filename 找到对应的复选框，再找到其父卡片
    const checkbox = container.querySelector(`input[data-filename="${filename}"]`);
    if (!checkbox) return false;

    // 找到对应的 cred-card 元素
    const card = checkbox.closest('.cred-card');
    if (!card) return false;

    // 找到邮箱显示元素
    const emailDiv = card.querySelector('.cred-email');
    if (emailDiv) {
        emailDiv.textContent = email;
        emailDiv.style.color = '#666';
        emailDiv.style.fontStyle = 'normal';
        return true;
    }
    return false;
}

async function fetchUserEmail(filename) {
    try {
        showStatus('正在获取用户邮箱...', 'info');
        const response = await fetch(`./creds/fetch-email/${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok && data.user_email) {
            showStatus(`成功获取邮箱: ${data.user_email}`, 'success');
            // 直接更新卡片中的邮箱显示，不刷新整个列表
            updateEmailDisplay(filename, data.user_email, 'normal');
        } else {
            showStatus(data.message || '无法获取用户邮箱', 'error');
        }
    } catch (error) {
        showStatus(`获取邮箱失败: ${error.message}`, 'error');
    }
}

async function fetchAntigravityUserEmail(filename) {
    try {
        showStatus('正在获取用户邮箱...', 'info');
        const response = await fetch(`./creds/fetch-email/${encodeURIComponent(filename)}?mode=antigravity`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok && data.user_email) {
            showStatus(`成功获取邮箱: ${data.user_email}`, 'success');
            // 直接更新卡片中的邮箱显示，不刷新整个列表
            updateEmailDisplay(filename, data.user_email, 'antigravity');
        } else {
            showStatus(data.message || '无法获取用户邮箱', 'error');
        }
    } catch (error) {
        showStatus(`获取邮箱失败: ${error.message}`, 'error');
    }
}

async function fetchCodexUserEmail(filename) {
    try {
        showStatus('正在获取用户邮箱...', 'info');
        const response = await fetch(`./creds/fetch-email/${encodeURIComponent(filename)}?mode=codex`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok && data.user_email) {
            showStatus(`成功获取邮箱: ${data.user_email}`, 'success');
            updateEmailDisplay(filename, data.user_email, 'codex');
        } else {
            showStatus(data.message || '无法获取用户邮箱', 'error');
        }
    } catch (error) {
        showStatus(`获取邮箱失败: ${error.message}`, 'error');
    }
}

async function verifyProjectId(filename) {
    try {
        // 显示加载状态
        showStatus('🔍 正在检验Project ID，请稍候...', 'info');

        const response = await fetch(`./creds/verify-project/${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (response.ok && data.success) {
            // 成功时显示绿色成功消息和Project ID
            const successMsg = `✅ 检验成功！\n文件: ${filename}\nProject ID: ${data.project_id}\n\n${data.message}`;
            showStatus(successMsg.replace(/\n/g, '<br>'), 'success');

            // 弹出成功提示
            showMessageModal('检验成功', `✅ 检验成功！\n\n文件: ${filename}\nProject ID: ${data.project_id}\n\n${data.message}`, 'success');

            await AppState.creds.refresh();
        } else {
            // 失败时显示红色错误消息
            const errorMsg = data.message || '检验失败';
            showStatus(`❌ ${errorMsg}`, 'error');
            showMessageModal('检验失败', `❌ 检验失败\n\n${errorMsg}`, 'error');
        }
    } catch (error) {
        const errorMsg = `检验失败: ${error.message}`;
        showStatus(`❌ ${errorMsg}`, 'error');
        showMessageModal('检验失败', `❌ ${errorMsg}`, 'error');
    }
}

async function verifyAntigravityProjectId(filename) {
    try {
        // 显示加载状态
        showStatus('🔍 正在检验Antigravity Project ID，请稍候...', 'info');

        const response = await fetch(`./creds/verify-project/${encodeURIComponent(filename)}?mode=antigravity`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();

        if (response.ok && data.success) {
            // 成功时显示绿色成功消息和Project ID
            const successMsg = `✅ 检验成功！\n文件: ${filename}\nProject ID: ${data.project_id}\n\n${data.message}`;
            showStatus(successMsg.replace(/\n/g, '<br>'), 'success');

            // 弹出成功提示
            showMessageModal('检验成功', `✅ Antigravity检验成功！\n\n文件: ${filename}\nProject ID: ${data.project_id}\n\n${data.message}`, 'success');

            await AppState.antigravityCreds.refresh();
        } else {
            // 失败时显示红色错误消息
            const errorMsg = data.message || '检验失败';
            showStatus(`❌ ${errorMsg}`, 'error');
            showMessageModal('检验失败', `❌ 检验失败\n\n${errorMsg}`, 'error');
        }
    } catch (error) {
        const errorMsg = `检验失败: ${error.message}`;
        showStatus(`❌ ${errorMsg}`, 'error');
        showMessageModal('检验失败', `❌ ${errorMsg}`, 'error');
    }
}

function showChatModal(filename, managerType) {
    const isAntigravity = managerType === 'antigravity';
    const isCodex = managerType === 'codex';
    const modeParam = isAntigravity ? '?mode=antigravity' : isCodex ? '?mode=codex' : '?mode=geminicli';
    const models = isCodex
        ? ['gpt-5.4', 'gpt-5.4(high)', 'gpt-5.4(xhigh)', 'gpt-5.2-codex', 'gpt-5.2(high)', 'gpt-5.2(xhigh)', 'gpt-5.1-codex', 'gpt-5-codex', 'gpt-5.3-codex', 'o4-mini', 'o3', 'gpt-4.1', 'codex-mini-latest']
        : isAntigravity
        ? ['claude-opus-4-6-thinking', 'gemini-3-flash', 'gemini-3.1-pro-preview']
        : ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-pro-preview'];

    const modal = document.createElement('div');
    modal.className = 'message-modal-overlay';
    modal.innerHTML = `
        <div class="message-modal" style="max-width:600px;width:90%;">
            <div class="message-modal-header">
                <h3>凭证对话 - ${filename}</h3>
                <button class="message-modal-close" onclick="this.closest('.message-modal-overlay').remove()">&times;</button>
            </div>
            <div class="message-modal-body" style="padding:16px 20px;">
                <div style="margin-bottom:12px;">
                    <label style="display:block;font-size:13px;font-weight:500;margin-bottom:6px;color:var(--text-secondary);">模型</label>
                    <select id="chatModelSelect" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text-primary);font-size:14px;">
                        ${models.map(m => `<option value="${m}">${m}</option>`).join('')}
                    </select>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;font-size:13px;font-weight:500;margin-bottom:6px;color:var(--text-secondary);">消息内容</label>
                    <textarea id="chatMessageInput" rows="4" placeholder="输入消息内容..." style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text-primary);font-size:14px;resize:vertical;font-family:inherit;box-sizing:border-box;"></textarea>
                </div>
                <div id="chatResultArea" style="display:none;margin-top:12px;">
                    <label style="display:block;font-size:13px;font-weight:500;margin-bottom:6px;color:var(--text-secondary);">响应结果</label>
                    <div id="chatResultContent" style="padding:12px;border-radius:8px;background:var(--bg-secondary, #f5f5f7);color:var(--text-primary);font-size:13px;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;border:1px solid var(--border);"></div>
                </div>
            </div>
            <div class="message-modal-footer" style="display:flex;gap:8px;justify-content:flex-end;">
                <button class="message-modal-btn" style="background:var(--text-tertiary);" onclick="this.closest('.message-modal-overlay').remove()">关闭</button>
                <button class="message-modal-btn" id="chatSendBtn" onclick="sendChatMessage('${filename}', '${modeParam}')">发送</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    const escHandler = e => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);
    document.getElementById('chatMessageInput').focus();
}

async function sendChatMessage(filename, modeParam) {
    const model = document.getElementById('chatModelSelect').value;
    const message = document.getElementById('chatMessageInput').value.trim();
    const sendBtn = document.getElementById('chatSendBtn');
    const resultArea = document.getElementById('chatResultArea');
    const resultContent = document.getElementById('chatResultContent');

    if (!message) {
        showStatus('请输入消息内容', 'error');
        return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = '发送中...';
    resultArea.style.display = 'block';
    resultContent.textContent = '正在等待响应...';

    try {
        const response = await fetch(`./creds/chat/${encodeURIComponent(filename)}${modeParam}`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ model, message })
        });

        const data = await response.json();

        if (data.success) {
            resultContent.textContent = data.text || '(空响应)';
        } else {
            resultContent.textContent = `错误 (${response.status}): ${data.error || data.detail || '未知错误'}`;
        }
    } catch (error) {
        resultContent.textContent = `请求失败: ${error.message}`;
    } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = '发送';
    }
}

async function testCredential(filename) {
    try {
        // 显示加载状态
        showStatus('🧪 正在测试凭证，请稍候...', 'info');

        const response = await fetch(`./creds/test/${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        // 解析JSON响应
        const data = await response.json();

        if (response.status === 200 || response.status === 429) {
            // 凭证可用
            const successMsg = `✅ 测试成功！\n文件: ${filename}\n状态: ${data.message || '凭证可用'} (${data.status_code || 200})`;
            showStatus('✅ 测试成功！', 'success');
            showMessageModal('测试成功', successMsg, 'success');
            await AppState.creds.refresh();
        }
        else {
            // 其他错误 - 显示完整错误信息
            let errorDetails = `❌ 测试失败\n文件: ${filename}\n`;

            // 如果有完整的错误响应，添加到详情中
            if (data.error) {
                try {
                    // 尝试格式化JSON错误
                    const errorObj = JSON.parse(data.error);
                    errorDetails += `\n错误详情:\n${JSON.stringify(errorObj, null, 2)}`;
                } catch {
                    // 如果不是JSON，直接显示文本
                    errorDetails += `\n错误详情:\n${data.error}`;
                }
            } else {
                errorDetails += `错误码: ${data.status_code || response.status}`;
            }

            showStatus(`❌ 测试失败 - ${data.message || '错误码: ' + (data.status_code || response.status)}`, 'error');
            showMessageModal('测试失败', errorDetails, 'error');
        }
    } catch (error) {
        const errorMsg = `测试失败: ${error.message}`;
        showStatus(`❌ ${errorMsg}`, 'error');
        showMessageModal('测试失败', `❌ ${errorMsg}`, 'error');
    }
}

async function testAntigravityCredential(filename) {
    try {
        // 显示加载状态
        showStatus('🧪 正在测试Antigravity凭证，请稍候...', 'info');

        const response = await fetch(`./creds/test/${encodeURIComponent(filename)}?mode=antigravity`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        // 解析JSON响应
        const data = await response.json();

        if (response.status === 200 || response.status === 429) {
            // 凭证可用
            const successMsg = `✅ 测试成功！\n文件: ${filename}\n状态: ${data.message || 'Antigravity凭证可用'} (${data.status_code || 200})`;
            showStatus('✅ 测试成功！', 'success');
            showMessageModal('测试成功', successMsg, 'success');
            await AppState.antigravityCreds.refresh();
        }
        else {
            // 其他错误 - 显示完整错误信息
            let errorDetails = `❌ 测试失败\n文件: ${filename}\n`;

            // 如果有完整的错误响应，添加到详情中
            if (data.error) {
                try {
                    // 尝试格式化JSON错误
                    const errorObj = JSON.parse(data.error);
                    errorDetails += `\n错误详情:\n${JSON.stringify(errorObj, null, 2)}`;
                } catch {
                    // 如果不是JSON，直接显示文本
                    errorDetails += `\n错误详情:\n${data.error}`;
                }
            } else {
                errorDetails += `错误码: ${data.status_code || response.status}`;
            }

            showStatus(`❌ 测试失败 - ${data.message || '错误码: ' + (data.status_code || response.status)}`, 'error');
            showMessageModal('测试失败', errorDetails, 'error');
        }
    } catch (error) {
        const errorMsg = `测试失败: ${error.message}`;
        showStatus(`❌ ${errorMsg}`, 'error');
        showMessageModal('测试失败', `❌ ${errorMsg}`, 'error');
    }
}

async function testCodexCredential(filename) {
    try {
        showStatus('正在测试Codex凭证，请稍候...', 'info');

        const response = await fetch(`./creds/test/${encodeURIComponent(filename)}?mode=codex`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (response.status === 200 || response.status === 429) {
            const successMsg = `测试成功！\n文件: ${filename}\n状态: ${data.message || 'Codex凭证可用'} (${data.status_code || 200})`;
            showStatus('测试成功！', 'success');
            showMessageModal('测试成功', successMsg, 'success');
            await AppState.codexCreds.refresh();
        }
        else {
            let errorDetails = `测试失败\n文件: ${filename}\n`;

            if (data.error) {
                try {
                    const errorObj = JSON.parse(data.error);
                    errorDetails += `\n错误详情:\n${JSON.stringify(errorObj, null, 2)}`;
                } catch {
                    errorDetails += `\n错误详情:\n${data.error}`;
                }
            } else {
                errorDetails += `错误码: ${data.status_code || response.status}`;
            }

            showStatus(`测试失败 - ${data.message || '错误码: ' + (data.status_code || response.status)}`, 'error');
            showMessageModal('测试失败', errorDetails, 'error');
        }
    } catch (error) {
        const errorMsg = `测试失败: ${error.message}`;
        showStatus(`${errorMsg}`, 'error');
        showMessageModal('测试失败', `${errorMsg}`, 'error');
    }
}

async function configurePreviewChannel(filename) {
    try {
        // 显示加载状态
        showStatus('🔧 正在配置Preview通道，请稍候...', 'info');

        const response = await fetch(`./creds/configure-preview/${encodeURIComponent(filename)}`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // 配置成功
            const successMsg = `✅ 配置成功！\n文件: ${filename}\n状态: ${data.message}`;
            showStatus(successMsg.replace(/\n/g, '<br>'), 'success');
            showMessageModal('Preview通道配置成功', `✅ Preview通道配置成功！\n\n文件: ${filename}\n\n${data.message}\n\nSetting ID: ${data.setting_id || 'N/A'}\nBinding ID: ${data.binding_id || 'N/A'}`, 'success');

            // 刷新凭证列表
            await AppState.creds.refresh();
        } else {
            // 配置失败
            const errorMsg = data.message || '配置失败';
            const errorDetail = data.error || '';
            const step = data.step || '';

            let alertMsg = `❌ Preview通道配置失败\n\n文件: ${filename}\n\n${errorMsg}`;
            if (step) {
                alertMsg += `\n失败步骤: ${step}`;
            }
            if (errorDetail) {
                alertMsg += `\n\n错误详情: ${errorDetail}`;
            }

            showStatus(`❌ ${errorMsg}`, 'error');
            showMessageModal('Preview通道配置失败', alertMsg, 'error');
        }
    } catch (error) {
        const errorMsg = `配置Preview通道失败: ${error.message}`;
        showStatus(`❌ ${errorMsg}`, 'error');
        showMessageModal('配置Preview通道失败', `❌ ${errorMsg}`, 'error');
    }
}

async function toggleAntigravityQuotaDetails(pathId) {
    const quotaDetails = document.getElementById('quota-' + pathId);
    if (!quotaDetails) return;

    // 切换显示状态
    const isShowing = quotaDetails.style.display === 'block';

    if (isShowing) {
        // 收起
        quotaDetails.style.display = 'none';
    } else {
        // 展开
        quotaDetails.style.display = 'block';

        const contentDiv = quotaDetails.querySelector('.cred-quota-content');
        const filename = contentDiv.getAttribute('data-filename');

        // 每次展开都重新加载数据
        if (filename) {
            contentDiv.innerHTML = '<div style="text-align: center; padding: 16px; color: var(--text-secondary, #86868b);">正在加载额度信息...</div>';

            try {
                const response = await fetch(`./creds/quota/${encodeURIComponent(filename)}?mode=antigravity`, {
                    method: 'GET',
                    headers: getAuthHeaders()
                });
                const data = await response.json();

                if (response.ok && data.success) {
                    // 成功时渲染美化的额度信息
                    const models = data.models || {};

                    if (Object.keys(models).length === 0) {
                        contentDiv.innerHTML = `
                            <div style="text-align: center; padding: 16px; color: var(--text-secondary, #86868b);">
                                暂无额度信息
                            </div>
                        `;
                    } else {
                        let quotaHTML = '<div class="quota-header">额度信息</div><div class="quota-grid">';

                        for (const [modelName, quotaData] of Object.entries(models)) {
                            const remainingFraction = quotaData.remaining || 0;
                            const resetTime = quotaData.resetTime || '';

                            const usedPercentage = Math.round((1 - remainingFraction) * 100);
                            const remainingPercentage = Math.round(remainingFraction * 100);

                            let barColor = '#34c759';
                            if (usedPercentage >= 90) barColor = '#ff3b30';
                            else if (usedPercentage >= 70) barColor = '#ff9500';
                            else if (usedPercentage >= 50) barColor = '#007aff';

                            quotaHTML += `
                                <div class="quota-model-item">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div class="quota-model-name" title="${modelName}">${modelName}</div>
                                        <span class="quota-remaining" style="color: ${barColor}; font-size: 13px;">${remainingPercentage}%</span>
                                    </div>
                                    <div class="quota-bar-bg">
                                        <div class="quota-bar-fill" style="width: ${usedPercentage}%; background-color: ${barColor};"></div>
                                    </div>
                                    <div class="quota-meta">
                                        <span>已使用 ${usedPercentage}%</span>
                                        ${resetTime ? '<span>重置: ' + resetTime + '</span>' : ''}
                                    </div>
                                </div>
                            `;
                        }

                        quotaHTML += '</div>';
                        contentDiv.innerHTML = quotaHTML;
                    }

                    showStatus('成功加载额度信息', 'success');
                } else {
                    // 失败时显示错误
                    const errorMsg = data.error || '获取额度信息失败';
                    contentDiv.innerHTML = `
                        <div style="text-align: center; padding: 16px; color: #dc3545;">
                            <div style="font-weight: 600; margin-bottom: 4px;">获取额度信息失败</div>
                            <div style="font-size: 13px; color: #666;">${errorMsg}</div>
                        </div>
                    `;
                    showStatus(`获取额度信息失败: ${errorMsg}`, 'error');
                }
            } catch (error) {
                contentDiv.innerHTML = `
                    <div style="text-align: center; padding: 16px; color: #dc3545;">
                        <div style="font-weight: 600; margin-bottom: 4px;">网络错误</div>
                        <div style="font-size: 13px; color: #666;">${error.message}</div>
                    </div>
                `;
                showStatus(`获取额度信息失败: ${error.message}`, 'error');
            }
        }
    }
}

// =====================================================================
// 查看报错详情
// =====================================================================
async function toggleErrorDetails(pathId) {
    await toggleErrorDetailsCommon(pathId, AppState.creds);
}

async function toggleAntigravityErrorDetails(pathId) {
    await toggleErrorDetailsCommon(pathId, AppState.antigravityCreds);
}

async function toggleCodexErrorDetails(pathId) {
    await toggleErrorDetailsCommon(pathId, AppState.codexCreds);
}

async function toggleErrorDetailsCommon(pathId, manager) {
    const errorDetails = document.getElementById('errors-' + pathId);
    if (!errorDetails) return;

    // 切换显示状态
    const isShowing = errorDetails.classList.toggle('show');

    if (isShowing) {
        const contentDiv = errorDetails.querySelector('.cred-content');
        const filename = contentDiv.getAttribute('data-filename');

        // 每次展开都重新加载数据
        if (filename) {
            contentDiv.innerHTML = '<div style="text-align: center; padding: 16px; color: #666;">正在加载报错信息...</div>';

            try {
                const modeParam = manager.type === 'antigravity' ? 'mode=antigravity' : manager.type === 'codex' ? 'mode=codex' : 'mode=geminicli';
                const response = await fetch(`./creds/errors/${encodeURIComponent(filename)}?${modeParam}`, {
                    method: 'GET',
                    headers: getAuthHeaders()
                });
                const data = await response.json();

                if (response.ok) {
                    const errorCodes = data.error_codes || [];
                    const errorMessages = data.error_messages || {};

                    if (errorCodes.length === 0) {
                        contentDiv.innerHTML = `
                            <div style="text-align: center; padding: 16px; color: #28a745;">
                                <div style="font-weight: 600;">无报错记录</div>
                                <div style="font-size: 12px; color: #666; margin-top: 4px;">该凭证运行正常</div>
                            </div>
                        `;
                    } else {
                        let errorHTML = '';

                        // 遍历所有错误码，从 errorMessages 对象中获取对应消息
                        errorCodes.forEach((errorCode) => {
                            const messageStr = errorMessages[errorCode] || '无详细信息';

                            // 提取核心错误消息和详细信息
                            let displayMsg = messageStr;
                            let detailsHtml = '';

                            try {
                                // 尝试解析 JSON 格式的 message
                                const parsedMsg = JSON.parse(messageStr);
                                if (parsedMsg.error) {
                                    // 显示核心错误信息
                                    if (parsedMsg.error.message) {
                                        displayMsg = parsedMsg.error.message;
                                    }

                                    // 如果有 details 字段，也显示出来
                                    if (parsedMsg.error.details && Array.isArray(parsedMsg.error.details)) {
                                        detailsHtml = '<div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ddd;">';
                                        detailsHtml += '<div style="font-size: 12px; color: #666; margin-bottom: 5px;">详细信息:</div>';

                                        parsedMsg.error.details.forEach((detail, idx) => {
                                            detailsHtml += '<div style="font-size: 12px; margin-left: 10px; margin-bottom: 5px;">';

                                            // 显示 @type
                                            if (detail['@type']) {
                                                const highlightedType = highlightHttpLinks(escapeHtml(detail['@type']));
                                                detailsHtml += `<div style="color: #007bff;">类型: ${highlightedType}</div>`;
                                            }

                                            // 显示 reason
                                            if (detail.reason) {
                                                detailsHtml += `<div style="color: #dc3545;">原因: ${escapeHtml(detail.reason)}</div>`;
                                            }

                                            // 显示 metadata（如 quotaResetTimeStamp）
                                            if (detail.metadata) {
                                                detailsHtml += '<div style="margin-left: 10px; margin-top: 3px;">';
                                                for (const [key, value] of Object.entries(detail.metadata)) {
                                                    const highlightedValue = highlightHttpLinks(escapeHtml(String(value)));
                                                    detailsHtml += `<div style="font-family: monospace; color: #333;">${escapeHtml(key)}: ${highlightedValue}</div>`;
                                                }
                                                detailsHtml += '</div>';
                                            }

                                            detailsHtml += '</div>';
                                        });

                                        detailsHtml += '</div>';
                                    }

                                    // 如果有 status 字段，也显示
                                    if (parsedMsg.error.status) {
                                        if (!detailsHtml) {
                                            detailsHtml = '<div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ddd;">';
                                        }
                                        detailsHtml += `<div style="font-size: 12px; color: #666;">状态: ${escapeHtml(parsedMsg.error.status)}</div>`;
                                        if (!parsedMsg.error.details) {
                                            detailsHtml += '</div>';
                                        }
                                    }
                                }
                            } catch (e) {
                                // 如果不是 JSON 格式，直接使用原始消息
                            }

                            // 对消息中的HTTP链接进行高亮处理
                            const highlightedMsg = highlightHttpLinks(escapeHtml(displayMsg));

                            errorHTML += `
                                <div style="padding: 12px; margin-bottom: 10px; border-left: 3px solid #dc3545; background-color: #f8f9fa;">
                                    <div style="font-weight: bold; color: #dc3545; margin-bottom: 8px;">错误码: ${errorCode}</div>
                                    <div style="line-height: 1.6; color: #333; white-space: pre-wrap; word-break: break-word;">
                                        ${highlightedMsg}
                                    </div>
                                    ${detailsHtml}
                                </div>
                            `;
                        });

                        contentDiv.innerHTML = errorHTML;
                    }

                    showStatus('成功加载报错信息', 'success');
                } else {
                    // 失败时显示错误
                    const errorMsg = data.detail || data.error || '获取报错信息失败';
                    contentDiv.innerHTML = `
                        <div style="text-align: center; padding: 16px; color: #dc3545;">
                            <div style="font-weight: 600;">加载失败</div>
                            <div style="font-size: 12px; margin-top: 4px;">${errorMsg}</div>
                        </div>
                    `;
                    showStatus(`获取报错信息失败: ${errorMsg}`, 'error');
                }
            } catch (error) {
                contentDiv.innerHTML = `
                    <div style="text-align: center; padding: 16px; color: #dc3545;">
                        <div style="font-weight: 600;">网络错误</div>
                        <div style="font-size: 12px; margin-top: 4px;">${error.message}</div>
                    </div>
                `;
                showStatus(`获取报错信息失败: ${error.message}`, 'error');
            }
        }
    }
}

// HTML转义函数
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 高亮HTTP链接函数
function highlightHttpLinks(text) {
    // 匹配 http:// 或 https:// 开头的URL
    const urlRegex = /(https?:\/\/[^\s<>"]+)/gi;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" style="color: #007bff; text-decoration: underline; word-break: break-all;" title="点击打开: ${url}">${url}</a>`;
    });
}

async function batchVerifyProjectIds() {
    const selectedFiles = Array.from(AppState.creds.selectedFiles);
    if (selectedFiles.length === 0) {
        showStatus('❌ 请先选择要检验的凭证', 'error');
        showMessageModal('提示', '请先选择要检验的凭证', 'error');
        return;
    }

    if (!confirm(`确定要批量检验 ${selectedFiles.length} 个凭证的Project ID吗？\n\n将并行检验以加快速度。`)) {
        return;
    }

    showStatus(`🔍 正在并行检验 ${selectedFiles.length} 个凭证，请稍候...`, 'info');

    // 并行执行所有检验请求
    const promises = selectedFiles.map(async (filename) => {
        try {
            const response = await fetch(`./creds/verify-project/${encodeURIComponent(filename)}`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const data = await response.json();

            if (response.ok && data.success) {
                return { success: true, filename, projectId: data.project_id, message: data.message };
            } else {
                return { success: false, filename, error: data.message || '失败' };
            }
        } catch (error) {
            return { success: false, filename, error: error.message };
        }
    });

    // 等待所有请求完成
    const results = await Promise.all(promises);

    // 统计结果
    let successCount = 0;
    let failCount = 0;
    const resultMessages = [];

    results.forEach(result => {
        if (result.success) {
            successCount++;
            resultMessages.push(`✅ ${result.filename}: ${result.projectId}`);
        } else {
            failCount++;
            resultMessages.push(`❌ ${result.filename}: ${result.error}`);
        }
    });

    await AppState.creds.refresh();

    const summary = `批量检验完成！\n\n成功: ${successCount} 个\n失败: ${failCount} 个\n总计: ${selectedFiles.length} 个\n\n详细结果:\n${resultMessages.join('\n')}`;

    if (failCount === 0) {
        showStatus(`✅ 全部检验成功！成功检验 ${successCount}/${selectedFiles.length} 个凭证`, 'success');
        showMessageModal('批量检验完成', summary, 'success');
    } else if (successCount === 0) {
        showStatus(`❌ 全部检验失败！失败 ${failCount}/${selectedFiles.length} 个凭证`, 'error');
        showMessageModal('批量检验完成', summary, 'error');
    } else {
        showStatus(`⚠️ 批量检验完成：成功 ${successCount}/${selectedFiles.length} 个，失败 ${failCount} 个`, 'info');
        showMessageModal('批量检验完成', summary, 'info');
    }

    console.log(summary);
}

async function batchVerifyAntigravityProjectIds() {
    const selectedFiles = Array.from(AppState.antigravityCreds.selectedFiles);
    if (selectedFiles.length === 0) {
        showStatus('❌ 请先选择要检验的Antigravity凭证', 'error');
        showMessageModal('提示', '请先选择要检验的Antigravity凭证', 'error');
        return;
    }

    if (!confirm(`确定要批量检验 ${selectedFiles.length} 个Antigravity凭证的Project ID吗？\n\n将并行检验以加快速度。`)) {
        return;
    }

    showStatus(`🔍 正在并行检验 ${selectedFiles.length} 个Antigravity凭证，请稍候...`, 'info');

    // 并行执行所有检验请求
    const promises = selectedFiles.map(async (filename) => {
        try {
            const response = await fetch(`./creds/verify-project/${encodeURIComponent(filename)}?mode=antigravity`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const data = await response.json();

            if (response.ok && data.success) {
                return { success: true, filename, projectId: data.project_id, message: data.message };
            } else {
                return { success: false, filename, error: data.message || '失败' };
            }
        } catch (error) {
            return { success: false, filename, error: error.message };
        }
    });

    // 等待所有请求完成
    const results = await Promise.all(promises);

    // 统计结果
    let successCount = 0;
    let failCount = 0;
    const resultMessages = [];

    results.forEach(result => {
        if (result.success) {
            successCount++;
            resultMessages.push(`✅ ${result.filename}: ${result.projectId}`);
        } else {
            failCount++;
            resultMessages.push(`❌ ${result.filename}: ${result.error}`);
        }
    });

    await AppState.antigravityCreds.refresh();

    const summary = `Antigravity批量检验完成！\n\n成功: ${successCount} 个\n失败: ${failCount} 个\n总计: ${selectedFiles.length} 个\n\n详细结果:\n${resultMessages.join('\n')}`;

    if (failCount === 0) {
        showStatus(`✅ 全部检验成功！成功检验 ${successCount}/${selectedFiles.length} 个Antigravity凭证`, 'success');
        showMessageModal('Antigravity批量检验完成', summary, 'success');
    } else if (successCount === 0) {
        showStatus(`❌ 全部检验失败！失败 ${failCount}/${selectedFiles.length} 个Antigravity凭证`, 'error');
        showMessageModal('Antigravity批量检验完成', summary, 'error');
    } else {
        showStatus(`⚠️ 批量检验完成：成功 ${successCount}/${selectedFiles.length} 个，失败 ${failCount} 个`, 'info');
        showMessageModal('Antigravity批量检验完成', summary, 'info');
    }

    console.log(summary);
}

async function batchConfigurePreview() {
    const selectedFiles = Array.from(AppState.creds.selectedFiles);
    if (selectedFiles.length === 0) {
        showStatus('❌ 请先选择要配置Preview的凭证', 'error');
        showMessageModal('提示', '请先选择要配置Preview的凭证', 'error');
        return;
    }

    if (!confirm(`确定要为 ${selectedFiles.length} 个凭证批量设置Preview通道吗？\n\n将并行配置以加快速度。`)) {
        return;
    }

    showStatus(`🔧 正在为 ${selectedFiles.length} 个凭证配置Preview通道，请稍候...`, 'info');

    // 并行执行所有配置请求
    const promises = selectedFiles.map(async (filename) => {
        try {
            const response = await fetch(`./creds/configure-preview/${encodeURIComponent(filename)}`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
            const data = await response.json();

            if (response.ok && data.success) {
                return {
                    success: true,
                    filename,
                    message: data.message,
                    setting_id: data.setting_id,
                    binding_id: data.binding_id
                };
            } else {
                return {
                    success: false,
                    filename,
                    error: data.message || '配置失败',
                    step: data.step,
                    errorDetail: data.error
                };
            }
        } catch (error) {
            return { success: false, filename, error: error.message };
        }
    });

    // 等待所有请求完成
    const results = await Promise.all(promises);

    // 统计结果
    let successCount = 0;
    let failCount = 0;
    const resultMessages = [];

    results.forEach(result => {
        if (result.success) {
            successCount++;
            resultMessages.push(`✅ ${result.filename}: ${result.message || '配置成功'}`);
        } else {
            failCount++;
            const errorMsg = result.step ? `${result.error} (步骤: ${result.step})` : result.error;
            resultMessages.push(`❌ ${result.filename}: ${errorMsg}`);
        }
    });

    await AppState.creds.refresh();

    const summary = `批量配置Preview通道完成！\n\n成功: ${successCount} 个\n失败: ${failCount} 个\n总计: ${selectedFiles.length} 个\n\n详细结果:\n${resultMessages.join('\n')}`;

    if (failCount === 0) {
        showStatus(`✅ 全部配置成功！成功配置 ${successCount}/${selectedFiles.length} 个凭证的Preview通道`, 'success');
        showMessageModal('批量配置Preview通道完成', summary, 'success');
    } else if (successCount === 0) {
        showStatus(`❌ 全部配置失败！失败 ${failCount}/${selectedFiles.length} 个凭证`, 'error');
        showMessageModal('批量配置Preview通道完成', summary, 'error');
    } else {
        showStatus(`⚠️ 批量配置完成：成功 ${successCount}/${selectedFiles.length} 个，失败 ${failCount} 个`, 'info');
        showMessageModal('批量配置Preview通道完成', summary, 'info');
    }

    console.log(summary);
}


async function refreshAllEmails() {
    if (!confirm('确定要刷新所有凭证的用户邮箱吗？这可能需要一些时间。')) return;

    try {
        showStatus('正在刷新所有用户邮箱...', 'info');
        const response = await fetch('./creds/refresh-all-emails', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok) {
            showStatus(`邮箱刷新完成：成功获取 ${data.success_count}/${data.total_count} 个邮箱地址`, 'success');
            await AppState.creds.refresh();
        } else {
            showStatus(data.message || '邮箱刷新失败', 'error');
        }
    } catch (error) {
        showStatus(`邮箱刷新网络错误: ${error.message}`, 'error');
    }
}

async function refreshAllAntigravityEmails() {
    if (!confirm('确定要刷新所有Antigravity凭证的用户邮箱吗？这可能需要一些时间。')) return;

    try {
        showStatus('正在刷新所有用户邮箱...', 'info');
        const response = await fetch('./creds/refresh-all-emails?mode=antigravity', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok) {
            showStatus(`邮箱刷新完成：成功获取 ${data.success_count}/${data.total_count} 个邮箱地址`, 'success');
            await AppState.antigravityCreds.refresh();
        } else {
            showStatus(data.message || '邮箱刷新失败', 'error');
        }
    } catch (error) {
        showStatus(`邮箱刷新网络错误: ${error.message}`, 'error');
    }
}

async function deduplicateByEmail() {
    if (!confirm('确定要对凭证进行凭证一键去重吗？\n\n相同邮箱的凭证只保留一个，其他将被删除。\n此操作不可撤销！')) return;

    try {
        showStatus('正在进行凭证一键去重...', 'info');
        const response = await fetch('./creds/deduplicate-by-email', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok) {
            const msg = `去重完成：删除 ${data.deleted_count} 个重复凭证，保留 ${data.kept_count} 个凭证（${data.unique_emails_count} 个唯一邮箱）`;
            showStatus(msg, 'success');
            await AppState.creds.refresh();
            
            // 显示详细信息
            if (data.duplicate_groups && data.duplicate_groups.length > 0) {
                let details = '去重详情：\n\n';
                data.duplicate_groups.forEach(group => {
                    details += `邮箱: ${group.email}\n保留: ${group.kept_file}\n删除: ${group.deleted_files.join(', ')}\n\n`;
                });
                console.log(details);
            }
        } else {
            showStatus(data.message || '去重失败', 'error');
        }
    } catch (error) {
        showStatus(`去重网络错误: ${error.message}`, 'error');
    }
}

async function deduplicateAntigravityByEmail() {
    if (!confirm('确定要对Antigravity凭证进行凭证一键去重吗？\n\n相同邮箱的凭证只保留一个，其他将被删除。\n此操作不可撤销！')) return;

    try {
        showStatus('正在进行凭证一键去重...', 'info');
        const response = await fetch('./creds/deduplicate-by-email?mode=antigravity', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok) {
            const msg = `去重完成：删除 ${data.deleted_count} 个重复凭证，保留 ${data.kept_count} 个凭证（${data.unique_emails_count} 个唯一邮箱）`;
            showStatus(msg, 'success');
            await AppState.antigravityCreds.refresh();
            
            // 显示详细信息
            if (data.duplicate_groups && data.duplicate_groups.length > 0) {
                let details = '去重详情：\n\n';
                data.duplicate_groups.forEach(group => {
                    details += `邮箱: ${group.email}\n保留: ${group.kept_file}\n删除: ${group.deleted_files.join(', ')}\n\n`;
                });
                console.log(details);
            }
        } else {
            showStatus(data.message || '去重失败', 'error');
        }
    } catch (error) {
        showStatus(`去重网络错误: ${error.message}`, 'error');
    }
}

async function refreshAllCodexEmails() {
    if (!confirm('确定要刷新所有Codex凭证的用户邮箱吗？这可能需要一些时间。')) return;

    try {
        showStatus('正在刷新所有用户邮箱...', 'info');
        const response = await fetch('./creds/refresh-all-emails?mode=codex', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok) {
            showStatus(`邮箱刷新完成：成功获取 ${data.success_count}/${data.total_count} 个邮箱地址`, 'success');
            await AppState.codexCreds.refresh();
        } else {
            showStatus(data.message || '邮箱刷新失败', 'error');
        }
    } catch (error) {
        showStatus(`邮箱刷新网络错误: ${error.message}`, 'error');
    }
}

async function deduplicateCodexByEmail() {
    if (!confirm('确定要对Codex凭证进行凭证一键去重吗？\n\n相同邮箱的凭证只保留一个，其他将被删除。\n此操作不可撤销！')) return;

    try {
        showStatus('正在进行凭证一键去重...', 'info');
        const response = await fetch('./creds/deduplicate-by-email?mode=codex', {
            method: 'POST',
            headers: getAuthHeaders()
        });
        const data = await response.json();
        if (response.ok) {
            const msg = `去重完成：删除 ${data.deleted_count} 个重复凭证，保留 ${data.kept_count} 个凭证（${data.unique_emails_count} 个唯一邮箱）`;
            showStatus(msg, 'success');
            await AppState.codexCreds.refresh();

            if (data.duplicate_groups && data.duplicate_groups.length > 0) {
                let details = '去重详情：\n\n';
                data.duplicate_groups.forEach(group => {
                    details += `邮箱: ${group.email}\n保留: ${group.kept_file}\n删除: ${group.deleted_files.join(', ')}\n\n`;
                });
                console.log(details);
            }
        } else {
            showStatus(data.message || '去重失败', 'error');
        }
    } catch (error) {
        showStatus(`去重网络错误: ${error.message}`, 'error');
    }
}

// =====================================================================
// WebSocket日志相关
// =====================================================================
function connectWebSocket() {
    if (AppState.logWebSocket && AppState.logWebSocket.readyState === WebSocket.OPEN) {
        showStatus('WebSocket已经连接', 'info');
        return;
    }

    try {
        const wsPath = new URL('./logs/stream', window.location.href).href;
        const wsUrl = wsPath.replace(/^http/, 'ws');

        // 添加 token 认证参数
        const wsUrlWithAuth = `${wsUrl}?token=${encodeURIComponent(AppState.authToken)}`;

        document.getElementById('connectionStatusText').textContent = '连接中...';
        document.getElementById('logConnectionStatus').className = 'status info';

        AppState.logWebSocket = new WebSocket(wsUrlWithAuth);

        AppState.logWebSocket.onopen = () => {
            document.getElementById('connectionStatusText').textContent = '已连接';
            document.getElementById('logConnectionStatus').className = 'status success';
            showStatus('日志流连接成功', 'success');
            clearLogsDisplay();
        };

        AppState.logWebSocket.onmessage = (event) => {
            const logLine = event.data;
            if (logLine.trim()) {
                AppState.allLogs.push(logLine);
                if (AppState.allLogs.length > 1000) {
                    AppState.allLogs = AppState.allLogs.slice(-1000);
                }
                filterLogs();
                if (document.getElementById('autoScroll').checked) {
                    const logContainer = document.getElementById('logContainer');
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
            }
        };

        AppState.logWebSocket.onclose = () => {
            document.getElementById('connectionStatusText').textContent = '连接断开';
            document.getElementById('logConnectionStatus').className = 'status error';
            showStatus('日志流连接断开', 'info');
        };

        AppState.logWebSocket.onerror = (error) => {
            document.getElementById('connectionStatusText').textContent = '连接错误';
            document.getElementById('logConnectionStatus').className = 'status error';
            showStatus('日志流连接错误: ' + error, 'error');
        };
    } catch (error) {
        showStatus('创建WebSocket连接失败: ' + error.message, 'error');
        document.getElementById('connectionStatusText').textContent = '连接失败';
        document.getElementById('logConnectionStatus').className = 'status error';
    }
}

function disconnectWebSocket() {
    if (AppState.logWebSocket) {
        AppState.logWebSocket.close();
        AppState.logWebSocket = null;
        document.getElementById('connectionStatusText').textContent = '未连接';
        document.getElementById('logConnectionStatus').className = 'status info';
        showStatus('日志流连接已断开', 'info');
    }
}

function clearLogsDisplay() {
    AppState.allLogs = [];
    AppState.filteredLogs = [];
    document.getElementById('logContent').textContent = '日志已清空，等待新日志...';
}

async function downloadLogs() {
    try {
        const response = await fetch('./logs/download', { headers: getAuthHeaders() });

        if (response.ok) {
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'gemini_api_pool_logs.txt';
            if (contentDisposition) {
                const match = contentDisposition.match(/filename=(.+)/);
                if (match) filename = match[1];
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            window.URL.revokeObjectURL(url);

            showStatus(`日志文件下载成功: ${filename}`, 'success');
        } else {
            const data = await response.json();
            showStatus(`下载日志失败: ${data.detail || data.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        showStatus(`下载日志时网络错误: ${error.message}`, 'error');
    }
}

async function clearLogs() {
    try {
        const response = await fetch('./logs/clear', {
            method: 'POST',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (response.ok) {
            clearLogsDisplay();
            showStatus(data.message, 'success');
        } else {
            showStatus(`清空日志失败: ${data.detail || data.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        clearLogsDisplay();
        showStatus(`清空日志时网络错误: ${error.message}`, 'error');
    }
}

function filterLogs() {
    const filter = document.getElementById('logLevelFilter').value;
    AppState.currentLogFilter = filter;

    if (filter === 'all') {
        AppState.filteredLogs = [...AppState.allLogs];
    } else {
        AppState.filteredLogs = AppState.allLogs.filter(log => log.toUpperCase().includes(filter));
    }

    displayLogs();
}

function displayLogs() {
    const logContent = document.getElementById('logContent');
    if (AppState.filteredLogs.length === 0) {
        logContent.textContent = AppState.currentLogFilter === 'all' ?
            '暂无日志...' : `暂无${AppState.currentLogFilter}级别的日志...`;
    } else {
        logContent.textContent = AppState.filteredLogs.join('\n');
    }
}

// =====================================================================
// 环境变量凭证管理
// =====================================================================
async function checkEnvCredsStatus() {
    const loading = document.getElementById('envStatusLoading');
    const content = document.getElementById('envStatusContent');

    try {
        loading.style.display = 'block';
        content.classList.add('hidden');

        const response = await fetch('./auth/env-creds-status', { headers: getAuthHeaders() });
        const data = await response.json();

        if (response.ok) {
            const envVarsList = document.getElementById('envVarsList');
            envVarsList.textContent = Object.keys(data.available_env_vars).length > 0
                ? Object.keys(data.available_env_vars).join(', ')
                : '未找到GCLI_CREDS_*环境变量';

            const autoLoadStatus = document.getElementById('autoLoadStatus');
            autoLoadStatus.textContent = data.auto_load_enabled ? '✅ 已启用' : '❌ 未启用';
            autoLoadStatus.style.color = data.auto_load_enabled ? '#28a745' : '#dc3545';

            document.getElementById('envFilesCount').textContent = `${data.existing_env_files_count} 个文件`;

            const envFilesList = document.getElementById('envFilesList');
            envFilesList.textContent = data.existing_env_files.length > 0
                ? data.existing_env_files.join(', ')
                : '无';

            content.classList.remove('hidden');
            showStatus('环境变量状态检查完成', 'success');
        } else {
            showStatus(`获取环境变量状态失败: ${data.detail || data.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    } finally {
        loading.style.display = 'none';
    }
}

async function loadEnvCredentials() {
    try {
        showStatus('正在从环境变量导入凭证...', 'info');

        const response = await fetch('./auth/load-env-creds', {
            method: 'POST',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (response.ok) {
            if (data.loaded_count > 0) {
                showStatus(`✅ 成功导入 ${data.loaded_count}/${data.total_count} 个凭证文件`, 'success');
                setTimeout(() => checkEnvCredsStatus(), 1000);
            } else {
                showStatus(`⚠️ ${data.message}`, 'info');
            }
        } else {
            showStatus(`导入失败: ${data.detail || data.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    }
}

async function clearEnvCredentials() {
    if (!confirm('确定要清除所有从环境变量导入的凭证文件吗？\n这将删除所有文件名以 "env-" 开头的认证文件。')) {
        return;
    }

    try {
        showStatus('正在清除环境变量凭证文件...', 'info');

        const response = await fetch('./auth/env-creds', {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (response.ok) {
            showStatus(`✅ 成功删除 ${data.deleted_count} 个环境变量凭证文件`, 'success');
            setTimeout(() => checkEnvCredsStatus(), 1000);
        } else {
            showStatus(`清除失败: ${data.detail || data.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    }
}

// =====================================================================
// 配置管理
// =====================================================================
async function loadConfig() {
    const loading = document.getElementById('configLoading');
    const form = document.getElementById('configForm');

    try {
        loading.style.display = 'block';
        form.classList.add('hidden');

        const response = await fetch('./config/get', { headers: getAuthHeaders() });
        const data = await response.json();

        if (response.ok) {
            AppState.currentConfig = data.config;
            AppState.envLockedFields = new Set(data.env_locked || []);

            populateConfigForm();
            form.classList.remove('hidden');
            showStatus('配置加载成功', 'success');
        } else {
            showStatus(`加载配置失败: ${data.detail || data.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    } finally {
        loading.style.display = 'none';
    }
}

function populateConfigForm() {
    const c = AppState.currentConfig;

    setConfigField('host', c.host || '0.0.0.0');
    setConfigField('port', c.port || 7861);
    setConfigField('configApiPassword', c.api_password || '');
    setConfigField('configPanelPassword', c.panel_password || '');
    setConfigField('configPassword', c.password || 'pwd');
    setConfigField('credentialsDir', c.credentials_dir || '');
    setConfigField('proxy', c.proxy || '');
    setConfigField('codeAssistEndpoint', c.code_assist_endpoint || '');
    setConfigField('oauthProxyUrl', c.oauth_proxy_url || '');
    setConfigField('googleapisProxyUrl', c.googleapis_proxy_url || '');
    setConfigField('resourceManagerApiUrl', c.resource_manager_api_url || '');
    setConfigField('serviceUsageApiUrl', c.service_usage_api_url || '');
    setConfigField('antigravityApiUrl', c.antigravity_api_url || '');

    document.getElementById('autoBanEnabled').checked = Boolean(c.auto_ban_enabled);
    setConfigField('autoBanErrorCodes', (c.auto_ban_error_codes || []).join(','));
    setConfigField('callsPerRotation', c.calls_per_rotation || 10);

    document.getElementById('retry429Enabled').checked = Boolean(c.retry_429_enabled);
    setConfigField('retry429MaxRetries', c.retry_429_max_retries || 20);
    setConfigField('retry429Interval', c.retry_429_interval || 0.1);

    document.getElementById('compatibilityModeEnabled').checked = Boolean(c.compatibility_mode_enabled);
    document.getElementById('returnThoughtsToFrontend').checked = Boolean(c.return_thoughts_to_frontend !== false);
    document.getElementById('antigravityStream2nostream').checked = Boolean(c.antigravity_stream2nostream !== false);

    setConfigField('antiTruncationMaxAttempts', c.anti_truncation_max_attempts || 3);

    setConfigField('keepaliveUrl', c.keepalive_url || '');
    setConfigField('keepaliveInterval', c.keepalive_interval || 60);
}

function setConfigField(fieldId, value) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.value = value;
        const configKey = fieldId.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (AppState.envLockedFields.has(configKey)) {
            field.disabled = true;
            field.classList.add('env-locked');
        } else {
            field.disabled = false;
            field.classList.remove('env-locked');
        }
    }
}

async function saveConfig() {
    try {
        const getValue = (id, def = '') => document.getElementById(id)?.value.trim() || def;
        const getInt = (id, def = 0) => parseInt(document.getElementById(id)?.value) || def;
        const getFloat = (id, def = 0.0) => parseFloat(document.getElementById(id)?.value) || def;
        const getChecked = (id, def = false) => document.getElementById(id)?.checked || def;

        const config = {
            host: getValue('host', '0.0.0.0'),
            port: getInt('port', 7861),
            api_password: getValue('configApiPassword'),
            panel_password: getValue('configPanelPassword'),
            password: getValue('configPassword', 'pwd'),
            code_assist_endpoint: getValue('codeAssistEndpoint'),
            credentials_dir: getValue('credentialsDir'),
            proxy: getValue('proxy'),
            oauth_proxy_url: getValue('oauthProxyUrl'),
            googleapis_proxy_url: getValue('googleapisProxyUrl'),
            resource_manager_api_url: getValue('resourceManagerApiUrl'),
            service_usage_api_url: getValue('serviceUsageApiUrl'),
            antigravity_api_url: getValue('antigravityApiUrl'),
            auto_ban_enabled: getChecked('autoBanEnabled'),
            auto_ban_error_codes: getValue('autoBanErrorCodes').split(',')
                .map(c => parseInt(c.trim())).filter(c => !isNaN(c)),
            calls_per_rotation: getInt('callsPerRotation', 10),
            retry_429_enabled: getChecked('retry429Enabled'),
            retry_429_max_retries: getInt('retry429MaxRetries', 20),
            retry_429_interval: getFloat('retry429Interval', 0.1),
            compatibility_mode_enabled: getChecked('compatibilityModeEnabled'),
            return_thoughts_to_frontend: getChecked('returnThoughtsToFrontend'),
            antigravity_stream2nostream: getChecked('antigravityStream2nostream'),
            anti_truncation_max_attempts: getInt('antiTruncationMaxAttempts', 3),
            keepalive_url: getValue('keepaliveUrl'),
            keepalive_interval: getInt('keepaliveInterval', 60)
        };

        const response = await fetch('./config/save', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ config })
        });

        const data = await response.json();

        if (response.ok) {
            let message = '配置保存成功';

            if (data.hot_updated && data.hot_updated.length > 0) {
                message += `，以下配置已立即生效: ${data.hot_updated.join(', ')}`;
            }

            if (data.restart_required && data.restart_required.length > 0) {
                message += `\n⚠️ 重启提醒: ${data.restart_notice}`;
                showStatus(message, 'info');
            } else {
                showStatus(message, 'success');
            }

            setTimeout(() => loadConfig(), 1000);
        } else {
            showStatus(`保存配置失败: ${data.detail || data.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    }
}

// 镜像网址配置
const mirrorUrls = {
    codeAssistEndpoint: 'https://gcli-api.sukaka.top/cloudcode-pa',
    oauthProxyUrl: 'https://gcli-api.sukaka.top/oauth2',
    googleapisProxyUrl: 'https://gcli-api.sukaka.top/googleapis',
    resourceManagerApiUrl: 'https://gcli-api.sukaka.top/cloudresourcemanager',
    serviceUsageApiUrl: 'https://gcli-api.sukaka.top/serviceusage',
    antigravityApiUrl: 'https://gcli-api.sukaka.top/daily-cloudcode-pa'
};

const officialUrls = {
    codeAssistEndpoint: 'https://cloudcode-pa.googleapis.com',
    oauthProxyUrl: 'https://oauth2.googleapis.com',
    googleapisProxyUrl: 'https://www.googleapis.com',
    resourceManagerApiUrl: 'https://cloudresourcemanager.googleapis.com',
    serviceUsageApiUrl: 'https://serviceusage.googleapis.com',
    antigravityApiUrl: 'https://daily-cloudcode-pa.sandbox.googleapis.com'
};

function useMirrorUrls() {
    if (confirm('确定要将所有端点配置为镜像网址吗？')) {
        for (const [fieldId, url] of Object.entries(mirrorUrls)) {
            const field = document.getElementById(fieldId);
            if (field && !field.disabled) field.value = url;
        }
        showStatus('✅ 已切换到镜像网址配置，记得点击"保存配置"按钮保存设置', 'success');
    }
}

function restoreOfficialUrls() {
    if (confirm('确定要将所有端点配置为官方地址吗？')) {
        for (const [fieldId, url] of Object.entries(officialUrls)) {
            const field = document.getElementById(fieldId);
            if (field && !field.disabled) field.value = url;
        }
        showStatus('✅ 已切换到官方端点配置，记得点击"保存配置"按钮保存设置', 'success');
    }
}

// =====================================================================
// 使用统计
// =====================================================================
async function refreshUsageStats() {
    const loading = document.getElementById('usageLoading');
    const list = document.getElementById('usageList');

    try {
        loading.style.display = 'block';
        list.innerHTML = '';

        const [statsResponse, aggregatedResponse] = await Promise.all([
            fetch('./usage/stats', { headers: getAuthHeaders() }),
            fetch('./usage/aggregated', { headers: getAuthHeaders() })
        ]);

        if (statsResponse.status === 401 || aggregatedResponse.status === 401) {
            showStatus('认证失败，请重新登录', 'error');
            setTimeout(() => location.reload(), 1500);
            return;
        }

        const statsData = await statsResponse.json();
        const aggregatedData = await aggregatedResponse.json();

        if (statsResponse.ok && aggregatedResponse.ok) {
            AppState.usageStatsData = statsData.success ? statsData.data : statsData;

            const aggData = aggregatedData.success ? aggregatedData.data : aggregatedData;
            document.getElementById('totalApiCalls').textContent = aggData.total_calls_24h || 0;
            document.getElementById('totalFiles').textContent = aggData.total_files || 0;
            document.getElementById('avgCallsPerFile').textContent = (aggData.avg_calls_per_file || 0).toFixed(1);

            renderUsageList();

            showStatus(`已加载 ${aggData.total_files || Object.keys(AppState.usageStatsData).length} 个文件的使用统计`, 'success');
        } else {
            const errorMsg = statsData.detail || aggregatedData.detail || '加载使用统计失败';
            showStatus(`错误: ${errorMsg}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    } finally {
        loading.style.display = 'none';
    }
}

function renderUsageList() {
    const list = document.getElementById('usageList');
    list.innerHTML = '';

    if (Object.keys(AppState.usageStatsData).length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #666;">暂无使用统计数据</p>';
        return;
    }

    for (const [filename, stats] of Object.entries(AppState.usageStatsData)) {
        const card = document.createElement('div');
        card.className = 'usage-card';

        const calls24h = stats.calls_24h || 0;

        card.innerHTML = `
            <div class="usage-header">
                <div class="usage-filename">${filename}</div>
            </div>
            <div class="usage-info">
                <div class="usage-info-item" style="grid-column: 1 / -1;">
                    <span class="usage-info-label">24小时内调用次数</span>
                    <span class="usage-info-value" style="font-size: 24px; font-weight: bold; color: #007bff;">${calls24h}</span>
                </div>
            </div>
            <div class="usage-actions">
                <button class="usage-btn reset" onclick="resetSingleUsageStats('${filename}')">重置统计</button>
            </div>
        `;

        list.appendChild(card);
    }
}

async function resetSingleUsageStats(filename) {
    if (!confirm(`确定要重置 ${filename} 的使用统计吗？`)) return;

    try {
        const response = await fetch('./usage/reset', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ filename })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showStatus(data.message, 'success');
            await refreshUsageStats();
        } else {
            showStatus(`重置失败: ${data.message || data.detail || data.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    }
}

async function resetAllUsageStats() {
    if (!confirm('确定要重置所有文件的使用统计吗？此操作不可恢复！')) return;

    try {
        const response = await fetch('./usage/reset', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({})
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showStatus(data.message, 'success');
            await refreshUsageStats();
        } else {
            showStatus(`重置失败: ${data.message || data.detail || data.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        showStatus(`网络错误: ${error.message}`, 'error');
    }
}

// =====================================================================
// 冷却倒计时自动更新
// =====================================================================
function startCooldownTimer() {
    if (AppState.cooldownTimerInterval) {
        clearInterval(AppState.cooldownTimerInterval);
    }

    AppState.cooldownTimerInterval = setInterval(() => {
        updateCooldownDisplays();
    }, 1000);
}

function stopCooldownTimer() {
    if (AppState.cooldownTimerInterval) {
        clearInterval(AppState.cooldownTimerInterval);
        AppState.cooldownTimerInterval = null;
    }
}

function updateCooldownDisplays() {
    let needsRefresh = false;

    // 检查模型级冷却是否过期
    for (const credInfo of Object.values(AppState.creds.data)) {
        if (credInfo.model_cooldowns && Object.keys(credInfo.model_cooldowns).length > 0) {
            const currentTime = Date.now() / 1000;
            const hasExpiredCooldowns = Object.entries(credInfo.model_cooldowns).some(([, until]) => until <= currentTime);

            if (hasExpiredCooldowns) {
                needsRefresh = true;
                break;
            }
        }
    }

    if (needsRefresh) {
        AppState.creds.renderList();
        return;
    }

    // 更新模型级冷却的显示
    document.querySelectorAll('.cooldown-badge').forEach(badge => {
        const card = badge.closest('.cred-card');
        const filenameEl = card?.querySelector('.cred-filename');
        if (!filenameEl) return;

        const filename = filenameEl.textContent;
        const credInfo = Object.values(AppState.creds.data).find(c => c.filename === filename);

        if (credInfo && credInfo.model_cooldowns) {
            const currentTime = Date.now() / 1000;
            const titleMatch = badge.getAttribute('title')?.match(/模型: (.+)/);
            if (titleMatch) {
                const model = titleMatch[1];
                const cooldownUntil = credInfo.model_cooldowns[model];
                if (cooldownUntil) {
                    const remaining = Math.max(0, Math.floor(cooldownUntil - currentTime));
                    if (remaining > 0) {
                        const shortModel = model.replace('gemini-', '').replace('-exp', '')
                            .replace('2.0-', '2-').replace('1.5-', '1.5-');
                        const timeDisplay = formatCooldownTime(remaining).replace(/s$/, '').replace(/ /g, '');
                        badge.innerHTML = `🔧 ${shortModel}: ${timeDisplay}`;
                    }
                }
            }
        }
    });
}

// =====================================================================
// 版本信息管理
// =====================================================================

// 获取并显示版本信息（不检查更新）
async function fetchAndDisplayVersion() {
    try {
        const response = await fetch('./version/info');
        const data = await response.json();

        const versionText = document.getElementById('versionText');

        if (data.success) {
            // 只显示版本号
            versionText.textContent = `v${data.version}`;
            versionText.title = `完整版本: ${data.full_hash}\n提交信息: ${data.message}\n提交时间: ${data.date}`;
            versionText.style.cursor = 'help';
        } else {
            versionText.textContent = '未知版本';
            versionText.title = data.error || '无法获取版本信息';
        }
    } catch (error) {
        console.error('获取版本信息失败:', error);
        const versionText = document.getElementById('versionText');
        if (versionText) {
            versionText.textContent = '版本信息获取失败';
        }
    }
}



// =====================================================================
// 页面初始化
// =====================================================================
window.onload = async function () {
    const autoLoginSuccess = await autoLogin();

    if (!autoLoginSuccess) {
        showStatus('请输入密码登录', 'info');
    } else {
        // 登录成功后获取版本信息
        await fetchAndDisplayVersion();
    }

    startCooldownTimer();

    const antigravityAuthBtn = document.getElementById('getAntigravityAuthBtn');
    if (antigravityAuthBtn) {
        antigravityAuthBtn.addEventListener('click', startAntigravityAuth);
    }

    const codexAuthBtn = document.getElementById('getCodexAuthBtn');
    if (codexAuthBtn) {
        codexAuthBtn.addEventListener('click', startCodexAuth);
    }
};

// 拖拽功能 - 初始化
document.addEventListener('DOMContentLoaded', function () {
    const uploadArea = document.getElementById('uploadArea');

    if (uploadArea) {
        uploadArea.addEventListener('dragover', (event) => {
            event.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', (event) => {
            event.preventDefault();
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (event) => {
            event.preventDefault();
            uploadArea.classList.remove('dragover');
            AppState.uploadFiles.addFiles(Array.from(event.dataTransfer.files));
        });
    }
});
