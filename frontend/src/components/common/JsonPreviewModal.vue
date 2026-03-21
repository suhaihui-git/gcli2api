<template>
  <n-modal
    :show="show"
    to="body"
    display-directive="show"
    :block-scroll="false"
    @update:show="emit('update:show', $event)"
  >
    <div class="app-modal-panel panel-shell preview-modal-shell">
      <div class="preview-modal-shell__header">
        <div class="preview-modal-shell__hero">
          <p class="preview-modal-shell__eyebrow">JSON Preview</p>
          <h3 class="preview-modal-shell__title">{{ title }}</h3>
          <p v-if="description" class="preview-modal-shell__desc">{{ description }}</p>
        </div>
        <button
          type="button"
          class="app-modal-close preview-modal-shell__close"
          @click="emit('update:show', false)"
        >
          关闭
        </button>
      </div>

      <div class="preview-modal-shell__content">
        <div class="panel-embedded preview-modal-shell__viewer">
          <div class="preview-modal-shell__viewer-head">
            <span class="preview-modal-shell__viewer-chip">结构化内容</span>
            <span class="preview-modal-shell__viewer-hint">支持滚动查看完整内容</span>
          </div>
          <pre class="code-block preview-modal-shell__code">{{ previewText }}</pre>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { NModal } from "naive-ui";
import { computed } from "vue";

import { prettyJson } from "@/utils/format";

const props = withDefaults(
  defineProps<{
    show: boolean;
    title: string;
    description?: string;
    payload?: unknown;
  }>(),
  {
    description: "",
    payload: undefined,
  },
);

const emit = defineEmits<{
  (event: "update:show", value: boolean): void;
}>();

function normalizePreviewPayload(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return normalizePreviewPayload(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizePreviewPayload(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizePreviewPayload(item)]),
    );
  }

  return value;
}

const previewText = computed(() => {
  if (props.payload === undefined || props.payload === null) {
    return "暂无内容";
  }
  const normalizedPayload = normalizePreviewPayload(props.payload);
  return typeof normalizedPayload === "string" ? normalizedPayload : prettyJson(normalizedPayload);
});
</script>

<style scoped>
.preview-modal-shell {
  width: min(860px, calc(100vw - 2rem));
}

.preview-modal-shell__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.preview-modal-shell__hero {
  min-width: 0;
  flex: 1;
}

.preview-modal-shell__eyebrow {
  margin: 0 0 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.preview-modal-shell__title {
  margin: 0;
  font-size: 1.25rem;
  line-height: 1.4;
  font-weight: 700;
  color: var(--strong-text);
  word-break: break-word;
}

.preview-modal-shell__desc {
  margin: 10px 0 0;
  max-width: 760px;
  font-size: 0.92rem;
  line-height: 1.75;
  color: var(--muted-text);
}

.preview-modal-shell__close {
  flex: 0 0 auto;
  min-width: 92px;
}

.preview-modal-shell__content {
  max-height: calc(100vh - 12rem);
  overflow: hidden;
}

.preview-modal-shell__viewer {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
}

.preview-modal-shell__viewer-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.preview-modal-shell__viewer-chip {
  display: inline-flex;
  align-items: center;
  padding: 0 12px;
  height: 30px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary-accent-soft) 100%, white 8%);
  border: 1px solid color-mix(in srgb, var(--primary-accent-border) 100%, transparent);
  color: var(--strong-text);
  font-size: 0.8rem;
  font-weight: 600;
}

.preview-modal-shell__viewer-hint {
  font-size: 0.8rem;
  color: var(--muted-text);
}

.preview-modal-shell__code {
  margin: 0;
  max-height: calc(100vh - 18rem);
  overflow: auto;
  border-radius: 20px;
  padding: 18px;
  background: color-mix(in srgb, var(--field-bg-strong) 96%, transparent);
  border: 1px solid color-mix(in srgb, var(--field-border) 100%, transparent);
  color: var(--strong-text);
  font-size: 0.88rem;
  line-height: 1.72;
  white-space: pre-wrap;
  word-break: break-word;
}

body.theme-dark .preview-modal-shell__code {
  background: color-mix(in srgb, var(--field-bg-strong) 94%, black 6%);
}

@media (max-width: 768px) {
  .preview-modal-shell {
    width: min(100vw - 1rem, 100%);
  }

  .preview-modal-shell__close {
    width: 100%;
  }

  .preview-modal-shell__content {
    max-height: calc(100vh - 14rem);
  }

  .preview-modal-shell__viewer {
    padding: 14px;
  }

  .preview-modal-shell__code {
    max-height: calc(100vh - 22rem);
    padding: 14px;
    font-size: 0.82rem;
  }
}
</style>
