<template>
  <div
    class="cred-card panel-embedded overflow-hidden"
    :class="[
      selected ? 'cred-card--selected' : '',
      summary.disabled ? 'cred-card--disabled' : 'cred-card--active',
    ]"
  >
    <div class="cred-card__layout">
      <div class="cred-card__top" :class="{ 'cred-card__top--with-signals': hasSignals }">
        <div class="cred-card__identity">
          <div class="cred-card__check">
            <n-checkbox :checked="selected" @update:checked="emit('select', $event)" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="cred-card__headline">
              <h3 class="cred-card__title">
                {{ summary.user_email || summary.filename }}
              </h3>
              <status-pill :disabled="summary.disabled" />
              <tier-pill :tier="summary.tier" />
              <n-tag class="app-neutral-tag" size="small" round :bordered="false" type="default">
                {{ modeLabel }}
              </n-tag>
              <n-tag
                v-if="mode === 'geminicli' && summary.preview !== undefined"
                size="small"
                round
                :bordered="false"
                :type="summary.preview ? 'info' : 'default'"
              >
                {{ summary.preview ? "Preview" : "No Preview" }}
              </n-tag>
              <n-tag
                v-if="mode === 'codex' && usage?.status_code"
                size="small"
                round
                :bordered="false"
                type="info"
              >
                状态 {{ usage.status_code }}
              </n-tag>
              <n-tag
                v-if="mode === 'codex' && usage?.used_percent !== null && usage?.used_percent !== undefined"
                class="app-neutral-tag"
                size="small"
                round
                :bordered="false"
                type="default"
              >
                已用 {{ formatPercent(usage.used_percent) }}
              </n-tag>
              <n-tag
                v-if="mode === 'antigravity' && quota?.success"
                size="small"
                round
                :bordered="false"
                type="success"
              >
                额度已查
              </n-tag>
            </div>

            <p class="cred-card__filename" :title="summary.filename">
              {{ summary.filename }}
            </p>

            <div class="cred-card__meta">
              <span class="cred-card__meta-item">最近成功 {{ lastUsedText }}</span>
              <span class="cred-card__meta-item">
                {{ summary.user_email ? "邮箱已就绪" : "邮箱待抓取" }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="hasSignals" class="cred-card__signal-panel">
          <div v-if="summary.error_codes.length > 0" class="cred-card__signal-row cred-card__signal-row--error">
            <div class="cred-card__signal-chips">
              <n-tag
                v-for="code in visibleErrorCodes"
                :key="`error-${String(code)}`"
                size="small"
                round
                :bordered="false"
                type="error"
              >
                {{ code }}
              </n-tag>
              <n-tag
                v-if="overflowErrorCount > 0"
                class="app-neutral-tag"
                size="small"
                round
                :bordered="false"
                type="default"
              >
                +{{ overflowErrorCount }}
              </n-tag>
            </div>
          </div>

          <div v-if="activeCooldowns.length > 0" class="cred-card__signal-row cred-card__signal-row--cooldown">
            <div class="cred-card__signal-chips">
              <n-tag
                v-for="cooldown in visibleCooldowns"
                :key="cooldown.label"
                size="small"
                round
                :bordered="false"
                type="warning"
              >
                {{ cooldown.label }}
              </n-tag>
              <n-tag
                v-if="overflowCooldownCount > 0"
                class="app-neutral-tag"
                size="small"
                round
                :bordered="false"
                type="default"
              >
                +{{ overflowCooldownCount }}
              </n-tag>
            </div>
          </div>
        </div>
      </div>

      <div class="cred-card__actions" :style="actionGridStyle">
        <n-button
          v-for="button in actionButtons"
          :key="button.key"
          size="tiny"
          secondary
          class="cred-action-button"
          :class="[
            button.tone === 'accent' ? 'cred-action-button--accent' : '',
            button.tone === 'warning' ? 'cred-action-button--warning' : '',
            button.tone === 'danger' ? 'cred-action-button--danger' : '',
          ]"
          @click="handleActionClick(button.key)"
        >
          {{ button.label }}
        </n-button>
      </div>
    </div>

    <div v-if="quotaOpen" class="cred-card__expansion panel-embedded">
      <div class="panel-header">
        <div class="panel-title">额度信息</div>
      </div>
      <pre class="code-block whitespace-pre-wrap text-xs">{{ prettyJson(quota || { message: "暂无额度信息" }) }}</pre>
    </div>

    <div v-if="usageOpen && usage" class="cred-card__expansion panel-embedded">
      <div class="panel-header">
        <div class="panel-title">Codex Usage</div>
      </div>
      <div class="grid gap-3 md:grid-cols-2">
        <div class="surface-panel rounded-2xl p-4">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">状态</p>
          <p class="mt-2 text-xl font-semibold app-text-strong">{{ usage.status_code ?? "--" }}</p>
          <p class="mt-2 text-sm app-text-muted">已用比例：{{ formatPercent(usage.used_percent) }}</p>
          <p class="text-sm app-text-muted">重置时间：{{ usage.reset_text || "-" }}</p>
        </div>
        <div class="surface-panel rounded-2xl p-4">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">账户</p>
          <p class="mt-2 text-sm app-text-strong">{{ usage.email || "-" }}</p>
          <p class="text-sm app-text-muted">account_id：{{ usage.account_id || "-" }}</p>
          <p class="text-sm app-text-muted">plan：{{ usage.plan_type || "-" }}</p>
        </div>
      </div>
      <pre class="code-block mt-4 whitespace-pre-wrap text-xs">{{ prettyJson(usage.body || usage) }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NButton, NCheckbox, NTag } from "naive-ui";
import { computed } from "vue";

import type {
  CodexUsageResult,
  CredAction,
  CredMode,
  CredentialDetailResponse,
  CredentialErrorsResponse,
  CredentialQuotaResponse,
  CredentialSummary,
} from "@/api/types";
import StatusPill from "@/components/common/StatusPill.vue";
import TierPill from "@/components/common/TierPill.vue";
import { formatCooldown, formatPercent, formatTimestamp, prettyJson } from "@/utils/format";

const props = defineProps<{
  summary: CredentialSummary;
  mode: CredMode;
  selected: boolean;
  now: number;
  detailOpen: boolean;
  detail?: CredentialDetailResponse | null;
  errorsOpen: boolean;
  errors?: CredentialErrorsResponse | null;
  quotaOpen: boolean;
  quota?: CredentialQuotaResponse | null;
  usageOpen: boolean;
  usage?: CodexUsageResult | null;
}>();

const emit = defineEmits<{
  (event: "select", value: boolean): void;
  (event: "download"): void;
  (event: "email"): void;
  (event: "test"): void;
  (event: "chat"): void;
  (event: "detail"): void;
  (event: "errors"): void;
  (event: "quota"): void;
  (event: "usage-query"): void;
  (event: "usage-toggle"): void;
  (event: "verify"): void;
  (event: "preview"): void;
  (event: "action", value: CredAction): void;
}>();

type ActionButtonKey =
  | "detail"
  | "errors"
  | "download"
  | "email"
  | "test"
  | "chat"
  | "verify"
  | "preview"
  | "quota"
  | "usage-query"
  | "usage-toggle"
  | "toggle"
  | "delete";

interface ActionButtonConfig {
  key: ActionButtonKey;
  label: string;
  tone: "default" | "accent" | "warning" | "danger";
}

const activeCooldowns = computed(() =>
  Object.entries(props.summary.model_cooldowns || {})
    .filter(([, target]) => target > props.now)
    .map(([model, target]) => ({
      label: `${model.replace(/^gemini-/, "")}: ${formatCooldown(target - props.now)}`,
    })),
);

const visibleCooldowns = computed(() => activeCooldowns.value.slice(0, 3));
const overflowCooldownCount = computed(() => Math.max(activeCooldowns.value.length - 3, 0));
const visibleErrorCodes = computed(() => props.summary.error_codes.slice(0, 3));
const overflowErrorCount = computed(() => Math.max(props.summary.error_codes.length - 3, 0));
const hasSignals = computed(
  () => props.summary.error_codes.length > 0 || activeCooldowns.value.length > 0,
);

const modeLabel = computed(() => {
  if (props.mode === "codex") {
    return "Codex 凭证";
  }
  if (props.mode === "antigravity") {
    return "Antigravity 凭证";
  }
  return "GeminiCLI 凭证";
});

const lastUsedText = computed(() => formatTimestamp(props.summary.last_success));

const actionButtons = computed<ActionButtonConfig[]>(() => {
  const buttons: ActionButtonConfig[] = [
    { key: "detail", label: props.detailOpen ? "内容" : "内容", tone: props.detailOpen ? "accent" : "default" },
    { key: "errors", label: props.errorsOpen ? "报错" : "报错", tone: props.errorsOpen ? "accent" : "default" },
    { key: "download", label: "下载", tone: "default" },
    { key: "email", label: "邮箱", tone: "default" },
    { key: "test", label: "测试", tone: "accent" },
    { key: "chat", label: "对话", tone: "accent" },
  ];

  if (props.mode !== "codex") {
    buttons.push({ key: "verify", label: "校验", tone: "default" });
  }

  if (props.mode === "geminicli") {
    buttons.push({ key: "preview", label: "Preview", tone: "accent" });
  }

  if (props.mode === "antigravity") {
    buttons.push({ key: "quota", label: "额度", tone: props.quotaOpen ? "accent" : "default" });
  }

  if (props.mode === "codex") {
    buttons.push({ key: "usage-query", label: "余额", tone: "accent" });
    if (props.usage) {
      buttons.push({
        key: "usage-toggle",
        label: "详情",
        tone: props.usageOpen ? "accent" : "default",
      });
    }
  }

  buttons.push({
    key: "toggle",
    label: props.summary.disabled ? "启用" : "禁用",
    tone: props.summary.disabled ? "accent" : "warning",
  });
  buttons.push({ key: "delete", label: "删除", tone: "danger" });

  return buttons;
});

const actionGridStyle = computed(() => ({
  "--action-count": String(actionButtons.value.length),
}));

function handleActionClick(key: ActionButtonKey) {
  switch (key) {
    case "detail":
      emit("detail");
      break;
    case "errors":
      emit("errors");
      break;
    case "download":
      emit("download");
      break;
    case "email":
      emit("email");
      break;
    case "test":
      emit("test");
      break;
    case "chat":
      emit("chat");
      break;
    case "quota":
      emit("quota");
      break;
    case "usage-query":
      emit("usage-query");
      break;
    case "usage-toggle":
      emit("usage-toggle");
      break;
    case "verify":
      emit("verify");
      break;
    case "preview":
      emit("preview");
      break;
    case "toggle":
      emit("action", props.summary.disabled ? "enable" : "disable");
      break;
    case "delete":
      emit("action", "delete");
      break;
    default:
      break;
  }
}
</script>

<style scoped>
.cred-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-radius: 24px;
  padding: 14px 14px 12px;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.cred-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(14, 165, 233, 0.96), rgba(59, 130, 246, 0.62));
  opacity: 0.9;
}

.cred-card--disabled::before {
  background: linear-gradient(180deg, rgba(251, 146, 60, 0.96), rgba(245, 158, 11, 0.62));
}

.cred-card--disabled {
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--soft-surface) 84%, rgba(245, 158, 11, 0.12) 16%),
      color-mix(in srgb, var(--soft-surface) 92%, rgba(245, 158, 11, 0.04) 8%)
    );
  border-color: color-mix(in srgb, var(--warning-accent) 42%, var(--panel-border) 58%);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--warning-accent) 18%, transparent),
    0 12px 24px rgba(15, 23, 42, 0.08);
}

body.theme-dark .cred-card--disabled {
  background: linear-gradient(
    135deg,
    rgba(44, 28, 15, 0.96),
    rgba(32, 26, 20, 0.94) 34%,
    color-mix(in srgb, var(--soft-surface) 84%, rgba(245, 158, 11, 0.18) 16%)
  );
  border-color: rgba(245, 158, 11, 0.34);
  box-shadow:
    inset 0 0 0 1px rgba(251, 191, 36, 0.14),
    0 14px 28px rgba(2, 6, 23, 0.18);
}

.cred-card--disabled::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    repeating-linear-gradient(
      -45deg,
      rgba(245, 158, 11, 0.08) 0,
      rgba(245, 158, 11, 0.08) 10px,
      rgba(255, 255, 255, 0) 10px,
      rgba(255, 255, 255, 0) 20px
    );
  opacity: 0.6;
  pointer-events: none;
}

body.theme-dark .cred-card--disabled::after {
  background:
    repeating-linear-gradient(
      -45deg,
      rgba(251, 191, 36, 0.08) 0,
      rgba(251, 191, 36, 0.08) 10px,
      rgba(255, 255, 255, 0) 10px,
      rgba(255, 255, 255, 0) 20px
    );
  opacity: 0.75;
}

.cred-card--disabled .cred-card__title {
  color: color-mix(in srgb, var(--strong-text) 88%, var(--warning-accent) 12%);
}

.cred-card--disabled .cred-card__filename,
.cred-card--disabled .cred-card__meta-item {
  color: color-mix(in srgb, var(--muted-text) 84%, var(--warning-accent) 16%);
}

.cred-card--disabled .cred-card__identity {
  padding-top: 14px;
}

.cred-card--disabled .cred-card__layout::after {
  content: "已禁用";
  position: absolute;
  top: -16px;
  left: -34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 74px;
  height: 30px;
  padding: 0 14px 0 22px;
  border-radius: 16px 0 16px 0;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.94), rgba(251, 191, 36, 0.9));
  color: #fff7ed;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  box-shadow: 0 10px 22px rgba(245, 158, 11, 0.2);
  pointer-events: none;
  z-index: 2;
}

body.theme-dark .cred-card--disabled .cred-card__layout::after {
  background: linear-gradient(135deg, rgba(217, 119, 6, 0.96), rgba(245, 158, 11, 0.92));
  color: #fffbeb;
  box-shadow: 0 10px 22px rgba(120, 53, 15, 0.28);
}

.cred-card--disabled .cred-card__actions {
  filter: saturate(0.82);
}

.cred-card--disabled .cred-action-button:not(.cred-action-button--accent) {
  --n-color: color-mix(in srgb, var(--field-bg) 82%, rgba(245, 158, 11, 0.08) 18%) !important;
  --n-color-hover: color-mix(in srgb, var(--field-bg) 78%, rgba(245, 158, 11, 0.12) 22%) !important;
  --n-color-pressed: color-mix(in srgb, var(--field-bg) 88%, rgba(245, 158, 11, 0.12) 12%) !important;
  --n-color-focus: color-mix(in srgb, var(--field-bg) 78%, rgba(245, 158, 11, 0.12) 22%) !important;
  --n-border: 1px solid color-mix(in srgb, var(--warning-accent) 20%, var(--field-border) 80%) !important;
  --n-border-hover: 1px solid color-mix(in srgb, var(--warning-accent) 32%, var(--field-border) 68%) !important;
}

body.theme-dark .cred-card--disabled .cred-action-button:not(.cred-action-button--accent) {
  --n-color: rgba(49, 36, 23, 0.86) !important;
  --n-color-hover: rgba(67, 47, 27, 0.92) !important;
  --n-color-pressed: rgba(42, 31, 21, 0.94) !important;
  --n-color-focus: rgba(67, 47, 27, 0.92) !important;
  --n-border: 1px solid rgba(245, 158, 11, 0.16) !important;
  --n-border-hover: 1px solid rgba(245, 158, 11, 0.3) !important;
}

.cred-card--selected {
  border-color: color-mix(in srgb, var(--field-border-strong) 100%, transparent);
  box-shadow:
    0 18px 34px rgba(15, 23, 42, 0.12),
    inset 0 1px 0 color-mix(in srgb, var(--field-border-strong) 18%, transparent);
}

.cred-card__layout {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 10px;
}

.cred-card__top {
  display: grid;
  gap: 12px;
}

.cred-card__identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding-top: 6px;
}

.cred-card__check {
  align-self: flex-start;
  padding-top: 2px;
}

.cred-card__headline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.cred-card__title {
  min-width: 0;
  margin: 0;
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1.4;
  color: var(--strong-text);
  word-break: break-word;
}

.cred-card__filename {
  margin: 6px 0 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--muted-text);
  word-break: break-all;
}

.cred-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.cred-card__meta-item {
  font-size: 0.76rem;
  line-height: 1.4;
  color: var(--muted-text);
}

.cred-card__signal-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  min-width: 0;
}

.cred-card__signal-row {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
}

.cred-card__signal-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.cred-card__actions {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.cred-action-button {
  width: 100%;
  min-height: 30px;
  justify-content: center;
  font-weight: 600;
  font-size: 0.74rem;
  letter-spacing: 0.01em;
  --n-color: color-mix(in srgb, var(--soft-surface) 88%, white 16%) !important;
  --n-color-hover: color-mix(in srgb, var(--soft-surface) 82%, white 22%) !important;
  --n-color-pressed: color-mix(in srgb, var(--soft-surface) 92%, black 8%) !important;
  --n-color-focus: color-mix(in srgb, var(--soft-surface) 82%, white 22%) !important;
  --n-text-color: var(--strong-text) !important;
  --n-text-color-hover: var(--strong-text) !important;
  --n-text-color-pressed: var(--strong-text) !important;
  --n-text-color-focus: var(--strong-text) !important;
  --n-border: 1px solid color-mix(in srgb, var(--field-border) 100%, transparent) !important;
  --n-border-hover: 1px solid color-mix(in srgb, var(--field-border-strong) 100%, transparent) !important;
  --n-border-pressed: 1px solid color-mix(in srgb, var(--field-border-strong) 100%, transparent) !important;
  --n-border-focus: 1px solid color-mix(in srgb, var(--field-border-strong) 100%, transparent) !important;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--panel-border) 42%, transparent),
    0 8px 18px rgba(15, 23, 42, 0.08);
}

:global(body.theme-dark) .cred-card .cred-action-button {
  --n-color: rgba(38, 52, 74, 0.96) !important;
  --n-color-hover: rgba(56, 73, 98, 0.98) !important;
  --n-color-pressed: rgba(32, 46, 67, 0.98) !important;
  --n-color-focus: rgba(56, 73, 98, 0.98) !important;
  --n-border: 1px solid rgba(96, 165, 250, 0.18) !important;
  --n-border-hover: 1px solid rgba(96, 165, 250, 0.42) !important;
  --n-border-pressed: 1px solid rgba(96, 165, 250, 0.42) !important;
  --n-border-focus: 1px solid rgba(96, 165, 250, 0.42) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 10px 20px rgba(2, 6, 23, 0.2);
}

.cred-action-button--accent {
  --n-color: color-mix(in srgb, var(--primary-accent-soft) 100%, white 4%) !important;
  --n-color-hover: color-mix(in srgb, var(--primary-accent-soft) 100%, white 10%) !important;
  --n-color-pressed: color-mix(in srgb, var(--primary-accent-soft) 100%, black 8%) !important;
  --n-color-focus: color-mix(in srgb, var(--primary-accent-soft) 100%, white 10%) !important;
  --n-text-color: var(--strong-text) !important;
  --n-text-color-hover: var(--strong-text) !important;
  --n-text-color-pressed: var(--strong-text) !important;
  --n-text-color-focus: var(--strong-text) !important;
  --n-border: 1px solid var(--primary-accent-border) !important;
  --n-border-hover: 1px solid color-mix(in srgb, var(--primary-accent-border) 100%, white 10%) !important;
  --n-border-pressed: 1px solid color-mix(in srgb, var(--primary-accent-border) 100%, black 10%) !important;
  --n-border-focus: 1px solid color-mix(in srgb, var(--primary-accent-border) 100%, white 10%) !important;
}

.cred-action-button--warning {
  --n-color: rgba(245, 158, 11, 0.12) !important;
  --n-color-hover: rgba(245, 158, 11, 0.18) !important;
  --n-color-pressed: rgba(245, 158, 11, 0.24) !important;
  --n-color-focus: rgba(245, 158, 11, 0.18) !important;
  --n-text-color: #f59e0b !important;
  --n-text-color-hover: #fbbf24 !important;
  --n-text-color-pressed: #fbbf24 !important;
  --n-text-color-focus: #fbbf24 !important;
  --n-border: 1px solid rgba(245, 158, 11, 0.32) !important;
  --n-border-hover: 1px solid rgba(251, 191, 36, 0.46) !important;
  --n-border-pressed: 1px solid rgba(251, 191, 36, 0.56) !important;
  --n-border-focus: 1px solid rgba(251, 191, 36, 0.46) !important;
}

.cred-action-button--danger {
  --n-color: rgba(244, 63, 94, 0.08) !important;
  --n-color-hover: rgba(244, 63, 94, 0.14) !important;
  --n-color-pressed: rgba(244, 63, 94, 0.2) !important;
  --n-color-focus: rgba(244, 63, 94, 0.14) !important;
  --n-text-color: #fb7185 !important;
  --n-text-color-hover: #ffe4e6 !important;
  --n-text-color-pressed: #ffe4e6 !important;
  --n-text-color-focus: #ffe4e6 !important;
  --n-border: 1px solid rgba(244, 63, 94, 0.34) !important;
  --n-border-hover: 1px solid rgba(251, 113, 133, 0.5) !important;
  --n-border-pressed: 1px solid rgba(251, 113, 133, 0.58) !important;
  --n-border-focus: 1px solid rgba(251, 113, 133, 0.5) !important;
}

.cred-card__expansion {
  margin-top: 2px;
}

@media (min-width: 900px) {
  .cred-card__top--with-signals {
    grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.95fr);
  }

  .cred-card__actions {
    grid-template-columns: repeat(var(--action-count), minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .cred-card {
    padding: 12px 12px 10px;
    border-radius: 20px;
  }

  .cred-card__identity {
    gap: 10px;
    align-items: flex-start;
  }

  .cred-card__title {
    font-size: 0.92rem;
  }

  .cred-card__actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
