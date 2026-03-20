<template>
  <div class="space-y-3">
    <div class="panel-shell panel-shell-tight overflow-hidden">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="app-section-chip text-[11px] font-semibold uppercase tracking-[0.26em]">
                {{ modeMeta.badge }}
              </span>
              <h3 class="text-lg font-semibold app-text-strong">{{ modeMeta.title }}</h3>
            </div>
            <p class="mt-2 text-sm leading-6 app-text-muted">
              {{ modeMeta.description }}
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

        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
            <n-input
              v-model:value="searchQuery"
              clearable
              placeholder="搜索邮箱或文件名..."
              class="max-w-md"
            />
            <div class="app-surface-soft app-tier-chip-group flex flex-wrap gap-2 rounded-[20px] p-1">
              <n-button
                v-for="chip in tierChips"
                :key="chip.value"
                class="app-tier-chip"
                :class="{ 'app-tier-chip-active': manager.filters.tier === chip.value }"
                size="small"
                :type="manager.filters.tier === chip.value ? 'primary' : 'default'"
                :quaternary="manager.filters.tier !== chip.value"
                @click="manager.filters.tier = chip.value"
              >
                {{ chip.label }} {{ chip.count }}
              </n-button>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <n-button size="small" class="app-toolbar-button" secondary :loading="manager.loading" @click="manager.load">刷新列表</n-button>
            <n-button size="small" class="app-toolbar-button" secondary @click="showAdvancedFilters = !showAdvancedFilters">
              {{ showAdvancedFilters ? "收起筛选" : "更多筛选" }}
            </n-button>
            <n-button size="small" class="app-toolbar-button" secondary @click="showUploadPanel = !showUploadPanel">
              {{ showUploadPanel ? "收起导入" : "导入凭证" }}
            </n-button>
            <n-button size="small" class="app-toolbar-button" secondary @click="manager.downloadAll">导出全部</n-button>
            <n-button size="small" class="app-toolbar-button" secondary @click="manager.refreshEmailsBatch">刷新邮箱</n-button>
            <n-button size="small" class="app-toolbar-button" secondary @click="manager.deduplicate">凭证去重</n-button>
            <n-button
              v-if="mode === 'codex'"
              size="small"
              class="app-toolbar-button"
              secondary
              @click="manager.scanCodexUsage('balance')"
            >
              一键查询余额
            </n-button>
            <n-button
              v-if="mode === 'codex'"
              size="small"
              class="app-toolbar-button"
              secondary
              @click="manager.scanCodexUsage('status')"
            >
              批量查询状态
            </n-button>
            <n-button
              v-if="mode === 'codex'"
              size="small"
              class="app-toolbar-button-danger"
              type="error"
              ghost
              :disabled="manager.latestFailedUsageFiles.length === 0"
              @click="confirmDeleteLatestFailed"
            >
              一键删除异常
            </n-button>
          </div>
        </div>

        <div v-if="showAdvancedFilters" class="panel-embedded grid gap-2 rounded-[20px] p-3 md:grid-cols-2 xl:grid-cols-5">
          <n-select v-model:value="manager.filters.status" size="small" :options="statusOptions" />
          <n-select v-model:value="manager.filters.errorCode" size="small" :options="errorCodeOptions" />
          <n-select v-model:value="manager.filters.cooldown" size="small" :options="cooldownOptions" />
          <n-select v-model:value="manager.filters.tier" size="small" :options="tierOptions" />
          <n-select
            v-if="mode === 'geminicli'"
            v-model:value="manager.filters.preview"
            size="small"
            :options="previewOptions"
          />
        </div>
      </div>
    </div>

    <cred-upload v-if="showUploadPanel" :upload="upload" />

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
            v-if="mode !== 'codex'"
            class="app-toolbar-button"
            size="small"
            secondary
            :disabled="manager.selectedCount === 0"
            @click="confirmBatchVerify"
          >
            批量检验
          </n-button>
          <n-button
            v-if="mode === 'geminicli'"
            class="app-toolbar-button"
            size="small"
            secondary
            :disabled="manager.selectedCount === 0"
            @click="confirmBatchPreview"
          >
            批量 Preview
          </n-button>
          <n-button size="small" class="app-toolbar-button" secondary :disabled="manager.selectedCount === 0" @click="confirmBatch('enable')">
            批量启用
          </n-button>
          <n-button size="small" class="app-toolbar-button" secondary :disabled="manager.selectedCount === 0" @click="confirmBatch('disable')">
            批量禁用
          </n-button>
          <n-button size="small" class="app-toolbar-button-danger" type="error" ghost :disabled="manager.selectedCount === 0" @click="confirmBatch('delete')">
            批量删除
          </n-button>
        </div>
      </div>
    </div>

    <div
      v-if="mode === 'codex'"
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
import JsonPreviewModal from "@/components/common/JsonPreviewModal.vue";
import CredCard from "@/components/credentials/CredCard.vue";
import CredUpload from "@/components/credentials/CredUpload.vue";
import { useCredManager } from "@/composables/useCredManager";
import { useFileUpload } from "@/composables/useFileUpload";

const props = defineProps<{
  mode: CredMode;
}>();

const mode = props.mode;
const manager = reactive(useCredManager(mode));
const upload = reactive(useFileUpload(mode, manager.load));
const now = ref(Math.floor(Date.now() / 1000));
const searchQuery = ref("");
const showAdvancedFilters = ref(false);
const showUploadPanel = ref(false);
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

const statusOptions: SelectOption[] = [
  { label: "全部状态", value: "all" },
  { label: "仅启用", value: "enabled" },
  { label: "仅禁用", value: "disabled" },
];

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

const tierOptions: SelectOption[] = [
  { label: "全部 Tier", value: "all" },
  { label: "FREE", value: "free" },
  { label: "PRO", value: "pro" },
  { label: "ULTRA", value: "ultra" },
];

const errorCodeOptions = computed<SelectOption[]>(() =>
  manager.errorCodeOptions.map((code: string) => ({
    label: code === "all" ? "全部错误码" : code,
    value: code,
  })),
);

const defaultModel = computed(() => {
  if (mode === "codex") {
    return "gpt-4.1";
  }
  if (mode === "antigravity") {
    return "gemini-2.5-flash";
  }
  return "gemini-3-flash-preview";
});

const modeMeta = computed(() => {
  if (mode === "codex") {
    return {
      badge: "Codex",
      title: "Codex 凭证中心",
      description: "聚焦余额、状态码与可用性，适合快速排障与调试。",
    };
  }
  if (mode === "antigravity") {
    return {
      badge: "Antigravity",
      title: "Antigravity 凭证中心",
      description: "集中处理额度、项目校验与批量导入。",
    };
  }
  return {
    badge: "GeminiCLI",
    title: "GeminiCLI 凭证中心",
    description: "围绕项目校验、Preview 与健康状态展开。",
  };
});

const tierChips = computed(() => {
  const counts = {
    all: manager.stats.total,
    pro: manager.items.filter((item) => item.tier === "pro").length,
    ultra: manager.items.filter((item) => item.tier === "ultra").length,
    free: manager.items.filter((item) => item.tier === "free").length,
  };
  return [
    { label: "全部", value: "all", count: counts.all },
    { label: "PRO", value: "pro", count: counts.pro },
    { label: "ULTRA", value: "ultra", count: counts.ultra },
    { label: "FREE", value: "free", count: counts.free },
  ] as const;
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
  if (!window.confirm(`确定要${label} ${filename} 吗？`)) {
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
  if (!window.confirm(`确定要批量${label}选中的 ${manager.selectedCount} 个凭证吗？`)) {
    return;
  }
  try {
    await manager.applyBatchAction(action);
  } catch {}
}

async function confirmBatchVerify() {
  if (!window.confirm(`确定要批量检验选中的 ${manager.selectedCount} 个凭证吗？`)) {
    return;
  }
  await manager.batchVerifyProject();
}

async function confirmBatchPreview() {
  if (!window.confirm(`确定要为选中的 ${manager.selectedCount} 个凭证批量配置 Preview 通道吗？`)) {
    return;
  }
  await manager.batchConfigurePreview();
}

async function confirmDeleteLatestFailed() {
  if (!window.confirm(`确定要删除最近一次状态扫描失败的 ${manager.latestFailedUsageFiles.length} 个 Codex 凭证吗？`)) {
    return;
  }
  await manager.deleteLatestFailedFiles();
}
</script>
