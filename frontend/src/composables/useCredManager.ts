import { computed, h, reactive, ref } from "vue";

import {
  batchCredentialAction,
  batchGetCodexUsage,
  chatWithCredential,
  configurePreview,
  deduplicateByEmail,
  downloadAllCredentials,
  downloadCredential,
  fetchCredentialEmail,
  getCodexUsage,
  getCredentialDetail,
  getCredentialErrors,
  getCredentialQuota,
  getCredentialStatus,
  refreshAllEmails,
  setCredentialAction,
  testCredential,
  verifyCredentialProject,
} from "@/api/credentials";
import type {
  CodexUsageResult,
  CredAction,
  CredMode,
  CredentialDetailResponse,
  CredentialErrorsResponse,
  CredentialQuotaResponse,
  GenericMessageResponse,
  CredentialSummary,
} from "@/api/types";
import { dialog, message } from "@/utils/feedback";
import { getErrorMessage, saveBlob } from "@/utils/helpers";

export function useCredManager(mode: CredMode) {
  const items = ref<CredentialSummary[]>([]);
  const loading = ref(false);
  const working = ref(false);
  const page = ref(1);
  const pageSize = ref(20);
  const total = ref(0);
  const selected = ref<string[]>([]);

  const stats = reactive({
    total: 0,
    normal: 0,
    disabled: 0,
  });

  const filters = reactive({
    status: "all",
    errorCode: "all",
    cooldown: "all",
    preview: "all",
    tier: "all",
  });

  const detailOpen = reactive<Record<string, boolean>>({});
  const details = reactive<Record<string, CredentialDetailResponse | null>>({});
  const errorsOpen = reactive<Record<string, boolean>>({});
  const errors = reactive<Record<string, CredentialErrorsResponse | null>>({});
  const quotaOpen = reactive<Record<string, boolean>>({});
  const quotas = reactive<Record<string, CredentialQuotaResponse | null>>({});
  const usageOpen = reactive<Record<string, boolean>>({});
  const usage = reactive<Record<string, CodexUsageResult | null>>({});
  const latestFailedUsageFiles = ref<string[]>([]);
  const usageScanSummary = reactive({
    mode: "",
    processed: 0,
    total: 0,
    success: 0,
    failed: 0,
    failedSetSize: 0,
    concurrency: 0,
    message: "未执行查询",
  });

  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
  const selectedCount = computed(() => selected.value.length);
  const allSelectedOnPage = computed(() => {
    if (items.value.length === 0) {
      return false;
    }
    return items.value.every((item) => selected.value.includes(item.filename));
  });

  const errorCodeOptions = computed(() => {
    const set = new Set<string>();
    items.value.forEach((item) => {
      item.error_codes.forEach((code) => set.add(String(code)));
    });
    return ["all", ...Array.from(set).sort((a, b) => Number(a) - Number(b))];
  });

  async function load() {
    loading.value = true;
    try {
      const data = await getCredentialStatus(mode, {
        offset: (page.value - 1) * pageSize.value,
        limit: pageSize.value,
        status_filter: filters.status,
        error_code_filter: filters.errorCode,
        cooldown_filter: filters.cooldown,
        preview_filter: mode === "geminicli" ? filters.preview : "all",
        tier_filter: mode === "geminicli" || mode === "antigravity" ? filters.tier : "all",
      });

      items.value = data.items;
      total.value = data.total;
      stats.total = data.stats.total;
      stats.normal = data.stats.normal;
      stats.disabled = data.stats.disabled;

      if (mode === "codex") {
        data.items.forEach((item) => {
          if (item.usage_result) {
            usage[item.filename] = item.usage_result;
          }
        });
      }

      selected.value = selected.value.filter((name) => items.value.some((item) => item.filename === name));
    } finally {
      loading.value = false;
    }
  }

  async function withRefresh(
    task: () => Promise<unknown>,
    successMessage?: string,
    options?: { refreshOnError?: boolean },
  ) {
    working.value = true;
    try {
      await task();
      if (successMessage) {
        message.success(successMessage);
      }
      await load();
    } catch (error) {
      if (options?.refreshOnError) {
        try {
          await load();
        } catch {
          // keep the original error as the primary signal
        }
      }
      message.error(getErrorMessage(error));
      throw error;
    } finally {
      working.value = false;
    }
  }

  function showSummaryDialog(
    title: string,
    summary: string,
    level: "success" | "info" | "warning" | "error" = "info",
  ) {
    dialog[level]({
      title,
      positiveText: "知道了",
      content: () =>
        h(
          "pre",
          {
            style:
              "white-space: pre-wrap; font-family: Cascadia Code, JetBrains Mono, Consolas, monospace; font-size: 12px; line-height: 1.6;",
          },
          summary,
        ),
    });
  }

  function setUsageSummary(summary: Partial<typeof usageScanSummary>) {
    usageScanSummary.mode = summary.mode ?? usageScanSummary.mode;
    usageScanSummary.processed = summary.processed ?? usageScanSummary.processed;
    usageScanSummary.total = summary.total ?? usageScanSummary.total;
    usageScanSummary.success = summary.success ?? usageScanSummary.success;
    usageScanSummary.failed = summary.failed ?? usageScanSummary.failed;
    usageScanSummary.failedSetSize = summary.failedSetSize ?? usageScanSummary.failedSetSize;
    usageScanSummary.concurrency = summary.concurrency ?? usageScanSummary.concurrency;
    usageScanSummary.message = summary.message ?? usageScanSummary.message;
  }

  function toggleSelection(filename: string, checked: boolean) {
    if (checked) {
      if (!selected.value.includes(filename)) {
        selected.value = [...selected.value, filename];
      }
      return;
    }
    selected.value = selected.value.filter((item) => item !== filename);
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      const merged = new Set([...selected.value, ...items.value.map((item) => item.filename)]);
      selected.value = Array.from(merged);
      return;
    }
    selected.value = selected.value.filter((filename) => !items.value.some((item) => item.filename === filename));
  }

  async function applyAction(filename: string, action: CredAction) {
    const labels: Record<CredAction, string> = {
      enable: "已启用凭证",
      disable: "已禁用凭证",
      delete: "已删除凭证",
    };
    await withRefresh(() => setCredentialAction(mode, filename, action), labels[action]);
  }

  async function applyBatchAction(action: CredAction) {
    if (selected.value.length === 0) {
      return;
    }
    const filenames = [...selected.value];
    const labels: Record<CredAction, string> = {
      enable: "批量启用完成",
      disable: "批量禁用完成",
      delete: "批量删除完成",
    };

    await withRefresh(async () => {
      await batchCredentialAction(mode, action, filenames);
      selected.value = [];
    }, labels[action]);
  }

  async function downloadOne(filename: string) {
    try {
      const result = await downloadCredential(mode, filename);
      const downloadName = result.filename || filename;
      saveBlob(result.blob, downloadName);
      message.success(`已下载 ${downloadName}`);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function downloadAll() {
    try {
      const blob = await downloadAllCredentials(mode);
      const filename =
        mode === "antigravity"
          ? "antigravity_credentials.zip"
          : mode === "codex"
            ? "codex_credentials.zip"
            : mode === "claude"
              ? "claude_credentials.zip"
            : "credentials.zip";
      saveBlob(blob, filename);
      message.success("已开始下载全部凭证");
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function openDetail(filename: string) {
    detailOpen[filename] = !detailOpen[filename];
    if (detailOpen[filename] && !details[filename]) {
      try {
        details[filename] = await getCredentialDetail(mode, filename);
      } catch (error) {
        detailOpen[filename] = false;
        message.error(getErrorMessage(error));
      }
    }
  }

  async function ensureDetail(filename: string) {
    if (!details[filename]) {
      details[filename] = await getCredentialDetail(mode, filename);
    }
    return details[filename];
  }

  async function openErrors(filename: string) {
    errorsOpen[filename] = !errorsOpen[filename];
    if (errorsOpen[filename] && !errors[filename]) {
      try {
        errors[filename] = await getCredentialErrors(mode, filename);
      } catch (error) {
        errorsOpen[filename] = false;
        message.error(getErrorMessage(error));
      }
    }
  }

  async function ensureErrors(filename: string) {
    if (!errors[filename]) {
      errors[filename] = await getCredentialErrors(mode, filename);
    }
    return errors[filename];
  }

  async function openQuota(filename: string) {
    quotaOpen[filename] = !quotaOpen[filename];
    if (quotaOpen[filename] && !quotas[filename]) {
      try {
        quotas[filename] = await getCredentialQuota(filename);
        if (quotas[filename]?.success === false) {
          message.warning(quotas[filename]?.error || "额度查询返回失败状态");
        }
      } catch (error) {
        quotaOpen[filename] = false;
        message.error(getErrorMessage(error));
      }
    }
  }

  async function queryUsage(filename: string) {
    try {
      usage[filename] = (await getCodexUsage(filename)) as CodexUsageResult;
      usageOpen[filename] = true;
      await load();
      if (usage[filename]?.ok) {
        message.success(`已刷新 ${filename} 的 Codex usage`);
      } else {
        message.warning(`已获取 ${filename} 的 Codex usage 状态`);
      }
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  function toggleUsage(filename: string) {
    usageOpen[filename] = !usageOpen[filename];
  }

  async function queryUsageBatch(selectedOnly: boolean) {
    try {
      const result = await batchGetCodexUsage(selectedOnly ? selected.value : undefined);
      result.results.forEach((item) => {
        usage[item.filename] = item;
      });
      await load();
      message.success(result.message);
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function scanCodexUsage(scanMode: "balance" | "status") {
    if (mode !== "codex") {
      return;
    }

    const selectedOnly = selected.value.length > 0;
    const targetCount = selectedOnly ? selected.value.length : items.value.length || total.value;

    setUsageSummary({
      mode: scanMode,
      processed: 0,
      total: targetCount,
      success: 0,
      failed: 0,
      failedSetSize: latestFailedUsageFiles.value.length,
      concurrency: 0,
      message:
        scanMode === "balance"
          ? `正在查询${selectedOnly ? "已选" : "全部"}凭证余额...`
          : `正在扫描${selectedOnly ? "已选" : "全部"}凭证状态...`,
    });

    try {
      const result = await batchGetCodexUsage(selectedOnly ? selected.value : undefined);
      result.results.forEach((item) => {
        usage[item.filename] = item;
      });

      if (scanMode === "status") {
        latestFailedUsageFiles.value = [...result.failed_filenames];
      }

      setUsageSummary({
        mode: scanMode,
        processed: result.processed,
        total: result.total,
        success: result.success_count,
        failed: result.failed_count,
        failedSetSize: latestFailedUsageFiles.value.length,
        concurrency: result.concurrency_limit,
        message: result.message,
      });

      await load();
      message.success(
        scanMode === "balance"
          ? `余额查询完成：成功 ${result.success_count}，失败 ${result.failed_count}`
          : `状态扫描完成：成功 ${result.success_count}，失败 ${result.failed_count}`,
      );
    } catch (error) {
      setUsageSummary({
        mode: scanMode,
        message: `扫描失败：${getErrorMessage(error)}`,
      });
      message.error(getErrorMessage(error));
    }
  }

  async function deleteLatestFailedFiles() {
    if (mode !== "codex") {
      return;
    }
    if (latestFailedUsageFiles.value.length === 0) {
      message.warning("当前没有可删除的异常凭证");
      return;
    }

    await withRefresh(async () => {
      await batchCredentialAction("codex", "delete", [...latestFailedUsageFiles.value]);
      latestFailedUsageFiles.value = [];
      setUsageSummary({
        failed: 0,
        failedSetSize: 0,
        message: "最近一次异常凭证已删除",
      });
    }, "异常凭证删除完成");
  }

  async function fetchEmail(filename: string) {
    working.value = true;
    try {
      const result = await fetchCredentialEmail(mode, filename) as GenericMessageResponse & {
        user_email?: string | null;
      };
      if (result.user_email) {
        message.success(result.message || "邮箱刷新完成");
      } else {
        message.warning(result.message || "未能获取邮箱");
      }
      await load();
    } catch (error) {
      message.error(getErrorMessage(error));
      throw error;
    } finally {
      working.value = false;
    }
  }

  async function refreshEmailsBatch() {
    await withRefresh(() => refreshAllEmails(mode), "批量刷新邮箱完成");
  }

  async function deduplicate() {
    await withRefresh(() => deduplicateByEmail(mode), "邮箱去重完成");
  }

  async function verifyProject(filename: string) {
    if (mode === "codex" || mode === "claude") {
      return;
    }
    delete errors[filename];
    try {
      await withRefresh(
        () => verifyCredentialProject(mode, filename),
        "项目检验完成",
        { refreshOnError: true },
      );
    } catch {
      // keep UI responsive for button actions; error toast already shown above
    }
  }

  async function batchVerifyProject() {
    if (mode === "codex" || mode === "claude") {
      return;
    }
    if (selected.value.length === 0) {
      message.warning("请先选择要检验的凭证");
      return;
    }

    const filenames = [...selected.value];
    const results = await Promise.all(
      filenames.map(async (filename) => {
        try {
          const result = await verifyCredentialProject(mode, filename) as GenericMessageResponse & {
            success?: boolean;
            project_id?: string;
          };
          return {
            success: Boolean(result.success),
            filename,
            projectId: result.project_id || "-",
            message: result.message || "完成",
          };
        } catch (error) {
          return {
            success: false,
            filename,
            message: getErrorMessage(error),
          };
        }
      }),
    );

    await load();

    const successCount = results.filter((item) => item.success).length;
    const failCount = results.length - successCount;
    const summary = [
      `成功: ${successCount}`,
      `失败: ${failCount}`,
      `总计: ${results.length}`,
      "",
      ...results.map((item) =>
        item.success
          ? `✅ ${item.filename}: ${item.projectId}`
          : `❌ ${item.filename}: ${item.message}`,
      ),
    ].join("\n");

    if (failCount === 0) {
      message.success(`批量检验成功：${successCount}/${results.length}`);
      showSummaryDialog("批量检验完成", summary, "success");
    } else if (successCount === 0) {
      message.error(`批量检验失败：${failCount}/${results.length}`);
      showSummaryDialog("批量检验完成", summary, "error");
    } else {
      message.warning(`批量检验完成：成功 ${successCount}，失败 ${failCount}`);
      showSummaryDialog("批量检验完成", summary, "warning");
    }
  }

  async function enablePreview(filename: string) {
    if (mode !== "geminicli") {
      return;
    }
    await withRefresh(() => configurePreview(filename), "Preview 配置完成");
  }

  async function batchConfigurePreview() {
    if (mode !== "geminicli") {
      return;
    }
    if (selected.value.length === 0) {
      message.warning("请先选择要配置 Preview 的凭证");
      return;
    }

    const filenames = [...selected.value];
    const results = await Promise.all(
      filenames.map(async (filename) => {
        try {
          const result = await configurePreview(filename) as GenericMessageResponse & {
            success?: boolean;
            step?: string;
            error?: string;
          };
          return {
            success: Boolean(result.success),
            filename,
            message: result.message || "配置完成",
            step: result.step || "",
            error: String(result.error || ""),
          };
        } catch (error) {
          return {
            success: false,
            filename,
            message: getErrorMessage(error),
            step: "",
            error: "",
          };
        }
      }),
    );

    await load();

    const successCount = results.filter((item) => item.success).length;
    const failCount = results.length - successCount;
    const summary = [
      `成功: ${successCount}`,
      `失败: ${failCount}`,
      `总计: ${results.length}`,
      "",
      ...results.map((item) =>
        item.success
          ? `✅ ${item.filename}: ${item.message}`
          : `❌ ${item.filename}: ${item.step ? `${item.message} (${item.step})` : item.message}`,
      ),
    ].join("\n");

    if (failCount === 0) {
      message.success(`批量 Preview 配置成功：${successCount}/${results.length}`);
      showSummaryDialog("批量配置 Preview 完成", summary, "success");
    } else if (successCount === 0) {
      message.error(`批量 Preview 配置失败：${failCount}/${results.length}`);
      showSummaryDialog("批量配置 Preview 完成", summary, "error");
    } else {
      message.warning(`批量 Preview 配置完成：成功 ${successCount}，失败 ${failCount}`);
      showSummaryDialog("批量配置 Preview 完成", summary, "warning");
    }
  }

  async function runTest(filename: string) {
    try {
      const result = await testCredential(mode, filename) as GenericMessageResponse & {
        success?: boolean;
        status_code?: number;
        error?: string;
      };
      if (result.success) {
        message.success(result.message || "测试完成");
      } else {
        message.warning(result.error || result.message || "测试返回失败状态");
      }
      await load();
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  }

  async function sendChat(filename: string, model: string, input: string) {
    return chatWithCredential(mode, filename, model, input);
  }

  function resetFilters() {
    filters.status = "all";
    filters.errorCode = "all";
    filters.cooldown = "all";
    filters.preview = "all";
    filters.tier = "all";
  }

  return {
    items,
    loading,
    working,
    page,
    pageSize,
    total,
    pageCount,
    stats,
    filters,
    selected,
    selectedCount,
    allSelectedOnPage,
    latestFailedUsageFiles,
    usageScanSummary,
    errorCodeOptions,
    detailOpen,
    details,
    errorsOpen,
    errors,
    quotaOpen,
    quotas,
    usageOpen,
    usage,
    load,
    toggleSelection,
    toggleSelectAll,
    applyAction,
    applyBatchAction,
    downloadOne,
    downloadAll,
    openDetail,
    ensureDetail,
    openErrors,
    ensureErrors,
    openQuota,
    queryUsage,
    toggleUsage,
    queryUsageBatch,
    scanCodexUsage,
    deleteLatestFailedFiles,
    fetchEmail,
    refreshEmailsBatch,
    deduplicate,
    verifyProject,
    batchVerifyProject,
    enablePreview,
    batchConfigurePreview,
    runTest,
    sendChat,
    resetFilters,
  };
}
