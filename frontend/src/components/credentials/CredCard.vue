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
              <tier-pill v-if="showTierPill" :tier="summary.tier" />
              <n-tag size="small" round :bordered="false" type="default">
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
          :class="resolveActionButtonClass(button)"
          @click="handleActionClick(button.key)"
        >
          <template #icon>
            <app-icon :name="resolveActionButtonIcon(button.key)" />
          </template>
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
import AppIcon from "@/components/common/AppIcon.vue";
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
  if (props.mode === "claude") {
    return "Claude 凭证";
  }
  if (props.mode === "antigravity") {
    return "Antigravity 凭证";
  }
  return "GeminiCLI 凭证";
});

const showTierPill = computed(
  () => props.mode === "geminicli" || props.mode === "antigravity",
);

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

  if (props.mode !== "codex" && props.mode !== "claude") {
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

function resolveActionButtonClass(button: ActionButtonConfig) {
  const classes = [`cred-action-button--${button.key}`];

  if (button.key === "toggle") {
    classes.push(
      props.summary.disabled
        ? "cred-action-button--toggle-enable"
        : "cred-action-button--toggle-disable",
    );
  }

  if (button.key === "quota" && props.quotaOpen) {
    classes.push("cred-action-button--active");
  }

  if (button.key === "usage-toggle" && props.usageOpen) {
    classes.push("cred-action-button--active");
  }

  return classes;
}

function resolveActionButtonIcon(key: ActionButtonKey) {
  switch (key) {
    case "detail":
      return "file";
    case "errors":
      return "alert";
    case "download":
      return "download";
    case "email":
      return "mail";
    case "test":
      return "pulse";
    case "chat":
      return "chat";
    case "verify":
      return "shield";
    case "preview":
      return "sparkles";
    case "quota":
    case "usage-query":
      return "wallet";
    case "usage-toggle":
      return "eye";
    case "toggle":
      return props.summary.disabled ? "check" : "ban";
    case "delete":
      return "trash";
    default:
      return "grid";
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
  border-color: color-mix(in srgb, var(--field-border) 84%, var(--panel-border) 16%);
  background: color-mix(in srgb, var(--soft-surface) 94%, var(--field-bg-strong) 6%);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--panel-border) 68%, transparent),
    0 12px 24px rgba(15, 23, 42, 0.08);
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

body.theme-dark .cred-card {
  border-color: rgba(100, 116, 139, 0.34);
  background: color-mix(in srgb, var(--soft-surface) 96%, black 4%);
  box-shadow:
    inset 0 0 0 1px rgba(148, 163, 184, 0.12),
    0 16px 28px rgba(2, 6, 23, 0.24);
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
  background: linear-gradient(180deg, rgba(148, 163, 184, 0.9), rgba(148, 163, 184, 0.56));
  opacity: 0.82;
}

.cred-card--disabled {
  border-color: color-mix(in srgb, var(--panel-border) 88%, rgba(148, 163, 184, 0.22) 12%);
}

.cred-card--disabled::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(148, 163, 184, 0.16);
  pointer-events: none;
  z-index: 3;
}

body.theme-dark .cred-card--disabled::after {
  background: rgba(100, 116, 139, 0.22);
}

.cred-card--selected {
  border-color: color-mix(in srgb, var(--field-border-strong) 100%, transparent);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--field-border-strong) 34%, transparent),
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
  --n-text-color: var(--strong-text) !important;
  --n-text-color-hover: var(--strong-text) !important;
  --n-text-color-pressed: var(--strong-text) !important;
  --n-text-color-focus: var(--strong-text) !important;
  --n-border-radius: 14px !important;
  --n-border: 1px solid transparent !important;
  --n-border-hover: 1px solid transparent !important;
  --n-border-pressed: 1px solid transparent !important;
  --n-border-focus: 1px solid transparent !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 8px 16px rgba(15, 23, 42, 0.08);
}

body.theme-dark .cred-action-button {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 10px 18px rgba(2, 6, 23, 0.22);
}

.cred-action-button--active {
  filter: saturate(1.08) brightness(1.02);
}

.cred-action-button--detail {
  --n-color: rgba(56, 189, 248, 0.16) !important;
  --n-color-hover: rgba(56, 189, 248, 0.22) !important;
  --n-color-pressed: rgba(56, 189, 248, 0.28) !important;
  --n-color-focus: rgba(56, 189, 248, 0.22) !important;
  --n-border: 1px solid rgba(56, 189, 248, 0.28) !important;
  --n-border-hover: 1px solid rgba(56, 189, 248, 0.42) !important;
}

.cred-action-button--errors {
  --n-color: rgba(251, 113, 133, 0.14) !important;
  --n-color-hover: rgba(251, 113, 133, 0.2) !important;
  --n-color-pressed: rgba(251, 113, 133, 0.26) !important;
  --n-color-focus: rgba(251, 113, 133, 0.2) !important;
  --n-border: 1px solid rgba(251, 113, 133, 0.3) !important;
  --n-border-hover: 1px solid rgba(251, 113, 133, 0.44) !important;
}

.cred-action-button--download {
  --n-color: rgba(99, 102, 241, 0.13) !important;
  --n-color-hover: rgba(99, 102, 241, 0.19) !important;
  --n-color-pressed: rgba(99, 102, 241, 0.26) !important;
  --n-color-focus: rgba(99, 102, 241, 0.19) !important;
  --n-border: 1px solid rgba(99, 102, 241, 0.26) !important;
  --n-border-hover: 1px solid rgba(99, 102, 241, 0.4) !important;
}

.cred-action-button--email {
  --n-color: rgba(16, 185, 129, 0.13) !important;
  --n-color-hover: rgba(16, 185, 129, 0.19) !important;
  --n-color-pressed: rgba(16, 185, 129, 0.25) !important;
  --n-color-focus: rgba(16, 185, 129, 0.19) !important;
  --n-border: 1px solid rgba(16, 185, 129, 0.26) !important;
  --n-border-hover: 1px solid rgba(16, 185, 129, 0.38) !important;
}

.cred-action-button--test {
  --n-color: rgba(14, 165, 233, 0.18) !important;
  --n-color-hover: rgba(14, 165, 233, 0.24) !important;
  --n-color-pressed: rgba(14, 165, 233, 0.31) !important;
  --n-color-focus: rgba(14, 165, 233, 0.24) !important;
  --n-border: 1px solid rgba(14, 165, 233, 0.3) !important;
  --n-border-hover: 1px solid rgba(14, 165, 233, 0.44) !important;
}

.cred-action-button--chat {
  --n-color: rgba(168, 85, 247, 0.16) !important;
  --n-color-hover: rgba(168, 85, 247, 0.22) !important;
  --n-color-pressed: rgba(168, 85, 247, 0.29) !important;
  --n-color-focus: rgba(168, 85, 247, 0.22) !important;
  --n-border: 1px solid rgba(168, 85, 247, 0.3) !important;
  --n-border-hover: 1px solid rgba(168, 85, 247, 0.44) !important;
}

.cred-action-button--verify {
  --n-color: rgba(245, 158, 11, 0.14) !important;
  --n-color-hover: rgba(245, 158, 11, 0.2) !important;
  --n-color-pressed: rgba(245, 158, 11, 0.27) !important;
  --n-color-focus: rgba(245, 158, 11, 0.2) !important;
  --n-border: 1px solid rgba(245, 158, 11, 0.28) !important;
  --n-border-hover: 1px solid rgba(245, 158, 11, 0.42) !important;
}

.cred-action-button--preview {
  --n-color: rgba(6, 182, 212, 0.15) !important;
  --n-color-hover: rgba(6, 182, 212, 0.22) !important;
  --n-color-pressed: rgba(6, 182, 212, 0.28) !important;
  --n-color-focus: rgba(6, 182, 212, 0.22) !important;
  --n-border: 1px solid rgba(6, 182, 212, 0.28) !important;
  --n-border-hover: 1px solid rgba(6, 182, 212, 0.42) !important;
}

.cred-action-button--quota {
  --n-color: rgba(34, 197, 94, 0.14) !important;
  --n-color-hover: rgba(34, 197, 94, 0.2) !important;
  --n-color-pressed: rgba(34, 197, 94, 0.26) !important;
  --n-color-focus: rgba(34, 197, 94, 0.2) !important;
  --n-border: 1px solid rgba(34, 197, 94, 0.28) !important;
  --n-border-hover: 1px solid rgba(34, 197, 94, 0.42) !important;
}

.cred-action-button--usage-query {
  --n-color: rgba(249, 115, 22, 0.15) !important;
  --n-color-hover: rgba(249, 115, 22, 0.21) !important;
  --n-color-pressed: rgba(249, 115, 22, 0.28) !important;
  --n-color-focus: rgba(249, 115, 22, 0.21) !important;
  --n-border: 1px solid rgba(249, 115, 22, 0.29) !important;
  --n-border-hover: 1px solid rgba(249, 115, 22, 0.42) !important;
}

.cred-action-button--usage-toggle {
  --n-color: rgba(59, 130, 246, 0.15) !important;
  --n-color-hover: rgba(59, 130, 246, 0.22) !important;
  --n-color-pressed: rgba(59, 130, 246, 0.28) !important;
  --n-color-focus: rgba(59, 130, 246, 0.22) !important;
  --n-border: 1px solid rgba(59, 130, 246, 0.29) !important;
  --n-border-hover: 1px solid rgba(59, 130, 246, 0.42) !important;
}

.cred-action-button--toggle-enable {
  --n-color: rgba(34, 197, 94, 0.18) !important;
  --n-color-hover: rgba(34, 197, 94, 0.25) !important;
  --n-color-pressed: rgba(34, 197, 94, 0.32) !important;
  --n-color-focus: rgba(34, 197, 94, 0.25) !important;
  --n-border: 1px solid rgba(34, 197, 94, 0.32) !important;
  --n-border-hover: 1px solid rgba(34, 197, 94, 0.46) !important;
}

.cred-action-button--toggle-disable {
  --n-color: rgba(245, 158, 11, 0.16) !important;
  --n-color-hover: rgba(245, 158, 11, 0.22) !important;
  --n-color-pressed: rgba(245, 158, 11, 0.3) !important;
  --n-color-focus: rgba(245, 158, 11, 0.22) !important;
  --n-border: 1px solid rgba(245, 158, 11, 0.3) !important;
  --n-border-hover: 1px solid rgba(245, 158, 11, 0.44) !important;
}

.cred-action-button--delete {
  --n-color: rgba(239, 68, 68, 0.15) !important;
  --n-color-hover: rgba(239, 68, 68, 0.22) !important;
  --n-color-pressed: rgba(239, 68, 68, 0.29) !important;
  --n-color-focus: rgba(239, 68, 68, 0.22) !important;
  --n-border: 1px solid rgba(239, 68, 68, 0.32) !important;
  --n-border-hover: 1px solid rgba(239, 68, 68, 0.46) !important;
}

body.theme-dark .cred-action-button--detail {
  --n-color: rgba(12, 74, 110, 0.84) !important;
  --n-color-hover: rgba(14, 116, 144, 0.92) !important;
  --n-color-pressed: rgba(8, 64, 92, 0.96) !important;
  --n-color-focus: rgba(14, 116, 144, 0.92) !important;
}

body.theme-dark .cred-action-button--errors {
  --n-color: rgba(136, 19, 55, 0.82) !important;
  --n-color-hover: rgba(159, 18, 57, 0.9) !important;
  --n-color-pressed: rgba(123, 18, 51, 0.94) !important;
  --n-color-focus: rgba(159, 18, 57, 0.9) !important;
}

body.theme-dark .cred-action-button--download {
  --n-color: rgba(49, 46, 129, 0.82) !important;
  --n-color-hover: rgba(67, 56, 202, 0.9) !important;
  --n-color-pressed: rgba(55, 48, 163, 0.94) !important;
  --n-color-focus: rgba(67, 56, 202, 0.9) !important;
}

body.theme-dark .cred-action-button--email {
  --n-color: rgba(6, 95, 70, 0.82) !important;
  --n-color-hover: rgba(5, 150, 105, 0.9) !important;
  --n-color-pressed: rgba(4, 120, 87, 0.94) !important;
  --n-color-focus: rgba(5, 150, 105, 0.9) !important;
}

body.theme-dark .cred-action-button--test {
  --n-color: rgba(3, 105, 161, 0.84) !important;
  --n-color-hover: rgba(2, 132, 199, 0.92) !important;
  --n-color-pressed: rgba(7, 89, 133, 0.96) !important;
  --n-color-focus: rgba(2, 132, 199, 0.92) !important;
}

body.theme-dark .cred-action-button--chat {
  --n-color: rgba(91, 33, 182, 0.84) !important;
  --n-color-hover: rgba(109, 40, 217, 0.92) !important;
  --n-color-pressed: rgba(76, 29, 149, 0.96) !important;
  --n-color-focus: rgba(109, 40, 217, 0.92) !important;
}

body.theme-dark .cred-action-button--verify {
  --n-color: rgba(146, 64, 14, 0.84) !important;
  --n-color-hover: rgba(180, 83, 9, 0.92) !important;
  --n-color-pressed: rgba(124, 45, 18, 0.96) !important;
  --n-color-focus: rgba(180, 83, 9, 0.92) !important;
}

body.theme-dark .cred-action-button--preview {
  --n-color: rgba(14, 116, 144, 0.84) !important;
  --n-color-hover: rgba(8, 145, 178, 0.92) !important;
  --n-color-pressed: rgba(21, 94, 117, 0.96) !important;
  --n-color-focus: rgba(8, 145, 178, 0.92) !important;
}

body.theme-dark .cred-action-button--quota {
  --n-color: rgba(22, 101, 52, 0.84) !important;
  --n-color-hover: rgba(21, 128, 61, 0.92) !important;
  --n-color-pressed: rgba(20, 83, 45, 0.96) !important;
  --n-color-focus: rgba(21, 128, 61, 0.92) !important;
}

body.theme-dark .cred-action-button--usage-query {
  --n-color: rgba(154, 52, 18, 0.84) !important;
  --n-color-hover: rgba(194, 65, 12, 0.92) !important;
  --n-color-pressed: rgba(124, 45, 18, 0.96) !important;
  --n-color-focus: rgba(194, 65, 12, 0.92) !important;
}

body.theme-dark .cred-action-button--usage-toggle {
  --n-color: rgba(30, 64, 175, 0.84) !important;
  --n-color-hover: rgba(37, 99, 235, 0.92) !important;
  --n-color-pressed: rgba(30, 58, 138, 0.96) !important;
  --n-color-focus: rgba(37, 99, 235, 0.92) !important;
}

body.theme-dark .cred-action-button--toggle-enable {
  --n-color: rgba(21, 128, 61, 0.86) !important;
  --n-color-hover: rgba(22, 163, 74, 0.94) !important;
  --n-color-pressed: rgba(20, 83, 45, 0.96) !important;
  --n-color-focus: rgba(22, 163, 74, 0.94) !important;
}

body.theme-dark .cred-action-button--toggle-disable {
  --n-color: rgba(161, 98, 7, 0.86) !important;
  --n-color-hover: rgba(202, 138, 4, 0.94) !important;
  --n-color-pressed: rgba(120, 53, 15, 0.96) !important;
  --n-color-focus: rgba(202, 138, 4, 0.94) !important;
}

body.theme-dark .cred-action-button--delete {
  --n-color: rgba(153, 27, 27, 0.86) !important;
  --n-color-hover: rgba(220, 38, 38, 0.94) !important;
  --n-color-pressed: rgba(127, 29, 29, 0.96) !important;
  --n-color-focus: rgba(220, 38, 38, 0.94) !important;
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
