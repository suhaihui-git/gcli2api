<template>
  <n-modal
    :show="show"
    to="body"
    display-directive="show"
    :block-scroll="false"
    @update:show="emit('update:show', $event)"
  >
    <div class="app-modal-panel panel-shell chat-modal-shell">
      <div class="chat-modal-shell__header">
        <div class="chat-modal-shell__hero">
          <p class="chat-modal-shell__eyebrow">Credential Chat</p>
          <h3 class="text-xl font-semibold app-text-strong">凭证对话测试</h3>
          <p class="mt-2 text-sm leading-7 app-text-muted">基于当前凭证直接发起一次请求，快速确认模型、鉴权和上游响应链路是否正常。</p>
        </div>
        <button
          type="button"
          class="app-modal-close chat-modal-shell__close"
          @click="emit('update:show', false)"
        >
          关闭
        </button>
      </div>

      <div class="chat-modal-shell__content">
        <div class="chat-modal-shell__meta-grid">
          <div class="chat-modal-shell__meta-card app-surface-soft">
            <p class="chat-modal-shell__meta-label">当前文件</p>
            <p class="chat-modal-shell__meta-value" :title="filename || '未选择凭证'">
              {{ filename || "未选择凭证" }}
            </p>
          </div>
          <div class="chat-modal-shell__meta-card app-surface-soft">
            <p class="chat-modal-shell__meta-label">建议模型</p>
            <p class="chat-modal-shell__meta-value">{{ defaultModel }}</p>
          </div>
          <div class="chat-modal-shell__meta-card app-surface-soft">
            <p class="chat-modal-shell__meta-label">当前状态</p>
            <p class="chat-modal-shell__meta-value">
              {{ sending ? "请求中" : responseText ? "已返回结果" : "等待发送" }}
            </p>
          </div>
        </div>

        <div class="chat-modal-shell__layout">
          <section class="panel-embedded chat-modal-shell__panel">
            <div class="panel-header">
              <div>
                <div class="panel-title">请求配置</div>
                <p class="panel-desc">确认文件、模型与提示词后再发起测试请求。</p>
              </div>
            </div>

            <div class="chat-modal-shell__field-grid">
              <div class="chat-modal-shell__field">
                <label class="chat-modal-shell__field-label" for="chat-filename">文件</label>
                <n-input id="chat-filename" :value="filename" disabled placeholder="请选择一条凭证" />
              </div>
              <div class="chat-modal-shell__field">
                <label class="chat-modal-shell__field-label" for="chat-model">模型</label>
                <n-input
                  id="chat-model"
                  v-model:value="model"
                  placeholder="gemini-2.5-flash / gpt-4.1"
                />
              </div>
            </div>

            <div class="chat-modal-shell__field">
              <label class="chat-modal-shell__field-label" for="chat-prompt">消息</label>
              <n-input
                id="chat-prompt"
                v-model:value="prompt"
                type="textarea"
                :autosize="{ minRows: 4, maxRows: 8 }"
                placeholder="输入测试消息"
              />
            </div>
          </section>

          <section class="panel-embedded chat-modal-shell__panel chat-modal-shell__response-panel">
            <div class="panel-header">
              <div>
                <div class="panel-title">返回结果</div>
                <p class="panel-desc">这里会显示最近一次测试返回的文本或错误信息。</p>
              </div>
            </div>
            <div class="chat-modal-shell__response-box">
              <pre
                v-if="responseText"
                class="code-block whitespace-pre-wrap text-sm"
              >{{ responseText }}</pre>
              <p v-else class="chat-modal-shell__response-placeholder">
                {{ sending ? "正在等待接口返回..." : "发送后会在这里展示响应内容。" }}
              </p>
            </div>
          </section>
        </div>

        <div class="chat-modal-shell__footer">
          <p class="text-sm app-text-muted">发送前请确认模型名称、凭证文件和提示词。</p>
          <div class="chat-modal-shell__footer-actions">
            <button type="button" class="app-modal-close chat-modal-shell__footer-close" @click="emit('update:show', false)">
              取消
            </button>
            <n-button
              class="min-w-[116px] w-full sm:w-auto"
              type="primary"
              :loading="sending"
              :disabled="!canSend"
              @click="handleSend"
            >
              发送
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { NButton, NInput, NModal } from "naive-ui";
import { computed, ref, watch } from "vue";

import { message } from "@/utils/feedback";
import { getErrorMessage } from "@/utils/helpers";

const props = defineProps<{
  show: boolean;
  filename: string;
  defaultModel: string;
  onSend: (model: string, prompt: string) => Promise<{ success: boolean; text?: string; error?: string }>;
}>();

const emit = defineEmits<{
  (event: "update:show", value: boolean): void;
}>();

const model = ref("");
const prompt = ref("你好，请回复一句连接测试成功。");
const responseText = ref("");
const sending = ref(false);
const canSend = computed(() => Boolean(props.filename.trim() && model.value.trim() && prompt.value.trim()));

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      model.value = props.defaultModel;
      prompt.value = "你好，请回复一句连接测试成功。";
      responseText.value = "";
      sending.value = false;
    }
  },
  { immediate: true },
);

async function handleSend() {
  if (!props.filename.trim()) {
    message.warning("请先选择一条凭证");
    return;
  }
  if (!model.value.trim()) {
    message.warning("请输入模型名称");
    return;
  }
  if (!prompt.value.trim()) {
    message.warning("请输入测试消息");
    return;
  }

  sending.value = true;
  try {
    const result = await props.onSend(model.value.trim(), prompt.value.trim());
    if (result.success) {
      responseText.value = result.text || "(空响应)";
      message.success("对话完成");
      return;
    }

    responseText.value = result.error || "请求失败";
    message.error(result.error || "请求失败");
  } catch (error) {
    responseText.value = getErrorMessage(error);
    message.error(responseText.value);
  } finally {
    sending.value = false;
  }
}
</script>

<style scoped>
.chat-modal-shell {
  width: min(920px, calc(100vw - 1.5rem));
  display: flex;
  flex-direction: column;
}

.chat-modal-shell__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.chat-modal-shell__hero {
  min-width: 0;
  max-width: 720px;
}

.chat-modal-shell__close {
  flex: 0 0 auto;
  min-width: 92px;
}

.chat-modal-shell__eyebrow {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent-text);
}

.chat-modal-shell__content {
  display: grid;
  gap: 16px;
  min-height: 0;
}

.chat-modal-shell__meta-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.chat-modal-shell__meta-card {
  border-radius: 22px;
  padding: 14px 16px;
}

.chat-modal-shell__meta-label,
.chat-modal-shell__field-label {
  margin: 0;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-text);
}

.chat-modal-shell__meta-value {
  margin: 8px 0 0;
  font-size: 0.95rem;
  line-height: 1.7;
  font-weight: 600;
  color: var(--strong-text);
  word-break: break-all;
}

.chat-modal-shell__layout {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 0.96fr) minmax(0, 1.04fr);
  align-items: stretch;
}

.chat-modal-shell__panel {
  min-width: 0;
}

.chat-modal-shell__field-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.chat-modal-shell__field {
  display: grid;
  gap: 8px;
}

.chat-modal-shell__response-panel {
  display: flex;
  flex-direction: column;
}

.chat-modal-shell__response-box {
  min-height: 260px;
  max-height: 320px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--panel-border) 78%, transparent);
  background: color-mix(in srgb, var(--field-bg) 76%, transparent);
  padding: 16px;
  overflow-y: auto;
}

.chat-modal-shell__response-placeholder {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.8;
  color: var(--muted-text);
}

.chat-modal-shell__footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chat-modal-shell__footer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.chat-modal-shell__footer-close {
  min-width: 96px;
}

@media (max-width: 900px) {
  .chat-modal-shell__meta-grid,
  .chat-modal-shell__layout {
    grid-template-columns: 1fr;
  }

  .chat-modal-shell__response-box {
    min-height: 220px;
    max-height: 260px;
  }
}

@media (max-width: 640px) {
  .chat-modal-shell {
    width: min(100vw - 1rem, 100%);
  }

  .chat-modal-shell__close {
    width: 100%;
  }

  .chat-modal-shell__meta-grid,
  .chat-modal-shell__field-grid {
    grid-template-columns: 1fr;
  }

  .chat-modal-shell__footer {
    align-items: stretch;
  }

  .chat-modal-shell__footer-actions {
    width: 100%;
    justify-content: stretch;
  }

  .chat-modal-shell__footer-close {
    width: 100%;
  }

  .chat-modal-shell__footer {
    align-items: stretch;
  }
}
</style>
