<template>
  <div class="space-y-3">
    <div class="panel-shell panel-shell-tight overflow-hidden">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="app-section-chip text-[11px] font-semibold uppercase tracking-[0.26em]">
                {{ badge }}
              </span>
              <h3 class="text-lg font-semibold app-text-strong">{{ title }}</h3>
            </div>
            <p class="mt-2 text-sm leading-6 app-text-muted">
              {{ description }}
            </p>
          </div>

          <div class="grid grid-cols-3 gap-2 xl:min-w-[360px]">
            <div class="app-surface-soft rounded-[18px] px-3 py-3">
              <p class="text-[11px] uppercase tracking-[0.22em] app-text-muted">总数</p>
              <p class="mt-1 text-xl font-semibold app-text-strong">{{ manager.stats.total }}</p>
            </div>
            <div class="app-surface-soft rounded-[18px] px-3 py-3">
              <p class="text-[11px] uppercase tracking-[0.22em] app-text-muted">启用</p>
              <p class="app-success mt-1 text-xl font-semibold">{{ manager.stats.normal }}</p>
            </div>
            <div class="app-surface-soft rounded-[18px] px-3 py-3">
              <p class="text-[11px] uppercase tracking-[0.22em] app-text-muted">禁用</p>
              <p class="app-warning mt-1 text-xl font-semibold">{{ manager.stats.disabled }}</p>
            </div>
          </div>
        </div>

        <div class="panel-embedded rounded-[22px] p-4">
          <div :class="filterRowClass">
            <div class="space-y-2">
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] app-text-muted">搜索</p>
              <n-input
                v-model:value="searchQuery"
                size="small"
                clearable
                placeholder="搜索邮箱或文件名..."
              />
            </div>
            <div class="space-y-2">
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] app-text-muted">错误码</p>
              <n-select
                v-model:value="manager.filters.errorCode"
                size="small"
                :options="errorCodeOptions"
              />
            </div>
            <div class="space-y-2">
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] app-text-muted">冷却状态</p>
              <n-select
                v-model:value="manager.filters.cooldown"
                size="small"
                :options="cooldownOptions"
              />
            </div>
            <div
              v-if="supportsPreviewFilter"
              class="space-y-2"
            >
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] app-text-muted">Preview</p>
              <n-select
                v-model:value="manager.filters.preview"
                size="small"
                :options="previewOptions"
              />
            </div>
            <div
              v-if="supportsTierFilter"
              class="space-y-2"
            >
              <p class="text-[11px] font-semibold uppercase tracking-[0.24em] app-text-muted">等级</p>
              <n-select
                v-model:value="manager.filters.tier"
                size="small"
                :options="tierOptions"
              />
            </div>
          </div>

          <div class="mt-4 flex flex-wrap gap-2">
            <n-button size="small" secondary :loading="manager.loading" @click="manager.load">
              <template #icon><app-icon name="refresh" /></template>
              刷新列表
            </n-button>
            <n-button
              size="small"
              secondary
              :disabled="!hasActiveFilters"
              @click="resetFilters"
            >
              <template #icon><app-icon name="reset" /></template>
              重置筛选
            </n-button>
            <n-button size="small" secondary @click="showUploadModal = true">
              <template #icon><app-icon name="upload" /></template>
              导入凭证
            </n-button>
            <n-button size="small" secondary @click="manager.downloadAll">
              <template #icon><app-icon name="download" /></template>
              导出全部
            </n-button>
            <n-button size="small" secondary @click="manager.refreshEmailsBatch">
              <template #icon><app-icon name="mail" /></template>
              刷新邮箱
            </n-button>
            <n-button size="small" secondary @click="manager.deduplicate">
              <template #icon><app-icon name="merge" /></template>
              凭证去重
            </n-button>
            <n-button
              v-if="supportsUsageTools"
              size="small"
              secondary
              @click="manager.scanCodexUsage('balance')"
            >
              <template #icon><app-icon name="wallet" /></template>
              一键查询余额
            </n-button>
            <n-button
              v-if="supportsUsageTools"
              size="small"
              secondary
              @click="manager.scanCodexUsage('status')"
            >
              <template #icon><app-icon name="pulse" /></template>
              批量查询状态
            </n-button>
            <n-button
              v-if="supportsUsageTools"
              size="small"
              type="error"
              ghost
              :disabled="manager.latestFailedUsageFiles.length === 0"
              @click="confirmDeleteLatestFailed"
            >
              <template #icon><app-icon name="trash" /></template>
              一键删除异常
            </n-button>
          </div>

          <div class="mt-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-[11px] font-semibold uppercase tracking-[0.24em] app-text-muted">状态</span>
              <span class="text-xs app-text-muted">共 {{ manager.stats.total }} 个凭证</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <n-button
                v-for="chip in statusChips"
                :key="chip.value"
                size="small"
                round
                :type="manager.filters.status === chip.value ? 'primary' : 'default'"
                :quaternary="manager.filters.status !== chip.value"
                @click="manager.filters.status = chip.value"
              >
                <template #icon>
                  <app-icon :name="resolveStatusChipIcon(chip.value)" />
                </template>
                {{ chip.label }} {{ chip.count }}
              </n-button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      :class="
        manager.selectedCount > 0
          ? 'panel-embedded panel-shell-tight selection-highlight'
          : 'panel-embedded panel-shell-tight'
      "
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div class="flex items-center gap-3">
          <n-checkbox
            :checked="manager.allSelectedOnPage"
            @update:checked="manager.toggleSelectAll"
          >
            全选当前页
          </n-checkbox>
          <span class="text-sm" :class="manager.selectedCount > 0 ? 'selection-text' : 'app-text-muted'">
            当前已选 {{ manager.selectedCount }} 个凭证
          </span>
        </div>

        <div class="flex flex-wrap gap-2">
          <n-button
            v-if="supportsProjectVerify"
            size="small"
            secondary
            :disabled="manager.selectedCount === 0"
            @click="confirmBatchVerify"
          >
            <template #icon><app-icon name="shield" /></template>
            批量检验
          </n-button>
          <n-button
            v-if="supportsPreviewFilter"
            size="small"
            secondary
            :disabled="manager.selectedCount === 0"
            @click="confirmBatchPreview"
          >
            <template #icon><app-icon name="sparkles" /></template>
            批量 Preview
          </n-button>
          <n-button size="small" secondary :disabled="manager.selectedCount === 0" @click="confirmBatch('enable')">
            <template #icon><app-icon name="check" /></template>
            批量启用
          </n-button>
          <n-button size="small" secondary :disabled="manager.selectedCount === 0" @click="confirmBatch('disable')">
            <template #icon><app-icon name="ban" /></template>
            批量禁用
          </n-button>
          <n-button size="small" type="error" ghost :disabled="manager.selectedCount === 0" @click="confirmBatch('delete')">
            <template #icon><app-icon name="trash" /></template>
            批量删除
          </n-button>
        </div>
      </div>
    </div>

    <div
      v-if="supportsUsageTools"
      class="panel-embedded panel-shell-tight"
    >
      <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div class="app-surface-soft rounded-2xl px-3 py-3">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">已处理</p>
          <p class="mt-1 text-xl font-semibold app-text-strong">
            {{ manager.usageScanSummary.processed }}/{{ manager.usageScanSummary.total }}
          </p>
        </div>
        <div class="app-surface-soft rounded-2xl px-3 py-3">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">成功</p>
          <p class="app-success mt-1 text-xl font-semibold">{{ manager.usageScanSummary.success }}</p>
        </div>
        <div class="app-surface-soft rounded-2xl px-3 py-3">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">失败</p>
          <p class="app-danger mt-1 text-xl font-semibold">{{ manager.usageScanSummary.failed }}</p>
        </div>
        <div class="app-surface-soft rounded-2xl px-3 py-3">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">异常集合</p>
          <p class="app-warning mt-1 text-xl font-semibold">{{ manager.usageScanSummary.failedSetSize }}</p>
        </div>
        <div class="app-surface-soft rounded-2xl px-3 py-3">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">并发</p>
          <p class="mt-1 text-xl font-semibold app-text-strong">{{ manager.usageScanSummary.concurrency }}</p>
        </div>
        <div class="app-surface-soft rounded-2xl px-3 py-3 md:col-span-2 xl:col-span-2">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">最近状态</p>
          <p class="mt-1 text-sm leading-6 app-text-strong">{{ manager.usageScanSummary.message }}</p>
        </div>
      </div>
    </div>

    <n-spin :show="manager.loading">
      <div class="space-y-3">
        <cred-card
          v-for="item in displayedItems"
          :key="item.filename"
          :summary="item"
          :mode="mode"
          :selected="manager.selected.includes(item.filename)"
          :now="now"
          :detail-open="false"
          :detail="undefined"
          :errors-open="false"
          :errors="undefined"
          :quota-open="Boolean(manager.quotaOpen[item.filename])"
          :quota="manager.quotas[item.filename]"
          :usage-open="Boolean(manager.usageOpen[item.filename])"
          :usage="manager.usage[item.filename] || item.usage_result || undefined"
          @select="manager.toggleSelection(item.filename, $event)"
          @download="manager.downloadOne(item.filename)"
          @email="manager.fetchEmail(item.filename)"
          @test="manager.runTest(item.filename)"
          @chat="openChat(item.filename)"
          @detail="openDetailModal(item.filename)"
          @errors="openErrorsModal(item.filename)"
          @quota="manager.openQuota(item.filename)"
          @usage-query="manager.queryUsage(item.filename)"
          @usage-toggle="manager.toggleUsage(item.filename)"
          @verify="manager.verifyProject(item.filename)"
          @preview="manager.enablePreview(item.filename)"
          @action="confirmAction(item.filename, $event)"
        />

        <n-empty
          v-if="!manager.loading && displayedItems.length === 0"
          description="当前筛选条件下没有凭证"
        />
      </div>
    </n-spin>

    <div class="surface-panel app-pagination-shell flex flex-col gap-3 rounded-3xl px-4 py-3 md:flex-row md:items-center md:justify-between">
      <n-pagination
        class="app-pagination"
        v-model:page="manager.page"
        v-model:page-size="manager.pageSize"
        :item-count="manager.total"
        :page-sizes="[20, 50, 100, 200, 500, 1000]"
        show-size-picker
      />
      <p class="text-sm app-text-muted">
        第 {{ manager.page }} / {{ manager.pageCount }} 页，共 {{ manager.total }} 条
      </p>
    </div>

    <chat-modal
      v-model:show="chat.show"
      :filename="chat.filename"
      :default-model="defaultModel"
      :on-send="(model, prompt) => manager.sendChat(chat.filename, model, prompt)"
    />
    <json-preview-modal
      v-model:show="previewModal.show"
      :title="previewModal.title"
      :description="previewModal.description"
      :payload="previewModal.payload"
    />
    <cred-upload-modal
      v-model:show="showUploadModal"
      :upload="upload"
    />
  </div>
</template>

<script setup lang="ts">
import {
  NButton,
  NCheckbox,
  NEmpty,
  NInput,
  NPagination,
  NSelect,
  NSpin,
  type SelectOption,
} from "naive-ui";
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

import type { CredAction, CredMode } from "@/api/types";
import ChatModal from "@/components/chat/ChatModal.vue";
import AppIcon from "@/components/common/AppIcon.vue";
import JsonPreviewModal from "@/components/common/JsonPreviewModal.vue";
import CredCard from "@/components/credentials/CredCard.vue";
import CredUploadModal from "@/components/credentials/CredUploadModal.vue";
import { useCredManager } from "@/composables/useCredManager";
import { useFileUpload } from "@/composables/useFileUpload";
import { confirmDialog } from "@/utils/feedback";

const props = withDefaults(defineProps<{
  mode: CredMode;
  badge: string;
  title: string;
  description: string;
  defaultModel: string;
  supportsTierFilter?: boolean;
  supportsPreviewFilter?: boolean;
  supportsProjectVerify?: boolean;
  supportsUsageTools?: boolean;
  usageFailureLabel?: string;
}>(), {
  supportsTierFilter: false,
  supportsPreviewFilter: false,
  supportsProjectVerify: false,
  supportsUsageTools: false,
  usageFailureLabel: "异常凭证",
});

const mode = props.mode;
const manager = reactive(useCredManager(props.mode));
const upload = reactive(useFileUpload(props.mode, manager.load));
const now = ref(Math.floor(Date.now() / 1000));
const searchQuery = ref("");
const showUploadModal = ref(false);
const chat = reactive({
  show: false,
  filename: "",
});
const previewModal = reactive<{
  show: boolean;
  title: string;
  description: string;
  payload: unknown;
}>({
  show: false,
  title: "",
  description: "",
  payload: undefined,
});

const cooldownOptions: SelectOption[] = [
  { label: "全部冷却", value: "all" },
  { label: "冷却中", value: "in_cooldown" },
  { label: "未冷却", value: "no_cooldown" },
];

const previewOptions: SelectOption[] = [
  { label: "全部 Preview", value: "all" },
  { label: "可用", value: "preview" },
  { label: "不可用", value: "no_preview" },
];

const errorCodeOptions = computed<SelectOption[]>(() =>
  manager.errorCodeOptions.map((code: string) => ({
    label: code === "all" ? "全部错误码" : code,
    value: code,
  })),
);

const statusChips = computed(() => [
  { label: "全部", value: "all", count: manager.stats.total },
  { label: "启用", value: "enabled", count: manager.stats.normal },
  { label: "禁用", value: "disabled", count: manager.stats.disabled },
]);

const defaultModel = computed(() => props.defaultModel);
const supportsTierFilter = computed(() => props.supportsTierFilter);
const supportsPreviewFilter = computed(() => props.supportsPreviewFilter);
const supportsProjectVerify = computed(() => props.supportsProjectVerify);
const supportsUsageTools = computed(() => props.supportsUsageTools);
const filterRowClass = computed(() => {
  if (supportsPreviewFilter.value && supportsTierFilter.value) {
    return "grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.04fr)_minmax(180px,0.82fr)_minmax(160px,0.76fr)_minmax(150px,0.7fr)_minmax(150px,0.7fr)]";
  }
  if (supportsPreviewFilter.value || supportsTierFilter.value) {
    return "grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(230px,1.08fr)_minmax(185px,0.86fr)_minmax(160px,0.78fr)_minmax(155px,0.72fr)]";
  }
  return "grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.12fr)_minmax(190px,0.88fr)_minmax(170px,0.8fr)]";
});

const tierOptions: SelectOption[] = [
  { label: "全部等级", value: "all" },
  { label: "PRO", value: "pro" },
  { label: "ULTRA", value: "ultra" },
  { label: "FREE", value: "free" },
];

const hasActiveFilters = computed(() => {
  if (searchQuery.value.trim()) {
    return true;
  }
  if (manager.filters.status !== "all") {
    return true;
  }
  if (manager.filters.errorCode !== "all") {
    return true;
  }
  if (manager.filters.cooldown !== "all") {
    return true;
  }
  if (supportsPreviewFilter.value && manager.filters.preview !== "all") {
    return true;
  }
  if (supportsTierFilter.value && manager.filters.tier !== "all") {
    return true;
  }
  return false;
});

const displayedItems = computed(() => {
  const keyword = searchQuery.value.trim().toLowerCase();
  if (!keyword) {
    return manager.items;
  }
  return manager.items.filter((item) => {
    return (
      item.filename.toLowerCase().includes(keyword) ||
      (item.user_email || "").toLowerCase().includes(keyword)
    );
  });
});

let timer: number | undefined;

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Math.floor(Date.now() / 1000);
  }, 1000);
});

onBeforeUnmount(() => {
  if (timer) {
    window.clearInterval(timer);
  }
});

watch(
  [
    () => manager.filters.status,
    () => manager.filters.errorCode,
    () => manager.filters.cooldown,
    () => manager.filters.preview,
    () => manager.filters.tier,
  ],
  async () => {
    if (manager.page !== 1) {
      manager.page = 1;
      return;
    }
    await manager.load();
  },
);

watch(
  [
    () => manager.page,
    () => manager.pageSize,
  ],
  async () => {
    await manager.load();
  },
  { immediate: true },
);

function resetFilters() {
  searchQuery.value = "";
  manager.resetFilters();
}

function resolveStatusChipIcon(value: string) {
  if (value === "enabled") {
    return "check";
  }
  if (value === "disabled") {
    return "ban";
  }
  return "grid";
}

function openChat(filename: string) {
  chat.filename = filename;
  chat.show = true;
}

async function openDetailModal(filename: string) {
  try {
    const detail = await manager.ensureDetail(filename);
    previewModal.title = `凭证内容 · ${filename}`;
    previewModal.description = "展示当前凭证保存的原始内容。";
    previewModal.payload = detail?.content || detail || { message: "暂无凭证内容" };
    previewModal.show = true;
  } catch {
    // already notified
  }
}

async function openErrorsModal(filename: string) {
  try {
    const errors = await manager.ensureErrors(filename);
    previewModal.title = `错误详情 · ${filename}`;
    previewModal.description = "展示当前凭证记录的错误码和错误信息。";
    previewModal.payload = errors || { message: "暂无错误明细" };
    previewModal.show = true;
  } catch {
    // already notified
  }
}

async function confirmAction(filename: string, action: CredAction) {
  const label = action === "enable" ? "启用" : action === "disable" ? "禁用" : "删除";
  const confirmed = await confirmDialog({
    title: `${label}凭证`,
    content: `确定要${label} ${filename} 吗？`,
    positiveText: label,
    type: action === "delete" ? "error" : "warning",
  });
  if (!confirmed) {
    return;
  }
  try {
    await manager.applyAction(filename, action);
  } catch {
    // already notified
  }
}

async function confirmBatch(action: CredAction) {
  const label = action === "enable" ? "启用" : action === "disable" ? "禁用" : "删除";
  const confirmed = await confirmDialog({
    title: `批量${label}凭证`,
    content: `确定要批量${label}选中的 ${manager.selectedCount} 个凭证吗？`,
    positiveText: `批量${label}`,
    type: action === "delete" ? "error" : "warning",
  });
  if (!confirmed) {
    return;
  }
  try {
    await manager.applyBatchAction(action);
  } catch {}
}

async function confirmBatchVerify() {
  const confirmed = await confirmDialog({
    title: "批量检验凭证",
    content: `确定要批量检验选中的 ${manager.selectedCount} 个凭证吗？`,
    positiveText: "开始检验",
    type: "warning",
  });
  if (!confirmed) {
    return;
  }
  await manager.batchVerifyProject();
}

async function confirmBatchPreview() {
  const confirmed = await confirmDialog({
    title: "批量配置 Preview",
    content: `确定要为选中的 ${manager.selectedCount} 个凭证批量配置 Preview 通道吗？`,
    positiveText: "开始配置",
    type: "warning",
  });
  if (!confirmed) {
    return;
  }
  await manager.batchConfigurePreview();
}

async function confirmDeleteLatestFailed() {
  const confirmed = await confirmDialog({
    title: "删除异常凭证",
    content: `确定要删除最近一次状态扫描失败的 ${manager.latestFailedUsageFiles.length} 个 ${props.usageFailureLabel}吗？`,
    positiveText: "立即删除",
    type: "error",
  });
  if (!confirmed) {
    return;
  }
  await manager.deleteLatestFailedFiles();
}
</script>
