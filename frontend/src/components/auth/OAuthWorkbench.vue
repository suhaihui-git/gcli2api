<template>
  <div class="panel-shell">
    <div class="panel-header">
      <div class="panel-title">{{ title }}</div>
    </div>
    <div class="space-y-4">
      <div class="grid gap-3 md:grid-cols-3">
        <div class="surface-panel rounded-2xl px-4 py-4">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">Step 1</p>
          <p class="mt-2 text-base font-semibold app-text-strong">生成授权链接</p>
          <p class="mt-2 text-sm app-text-muted">{{ stepOneDescription }}</p>
        </div>
        <div class="surface-panel rounded-2xl px-4 py-4">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">Step 2</p>
          <p class="mt-2 text-base font-semibold app-text-strong">完成浏览器授权</p>
          <p class="mt-2 text-sm app-text-muted">跳到授权页面后登录并确认 scope，然后回到控制台。</p>
        </div>
        <div class="surface-panel rounded-2xl px-4 py-4">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">Step 3</p>
          <p class="mt-2 text-base font-semibold app-text-strong">拉取回调结果</p>
          <p class="mt-2 text-sm app-text-muted">如果 localhost 回跳失败，可以直接粘贴完整回调 URL。</p>
        </div>
      </div>

      <n-form v-if="needsProjectId">
        <n-form-item label="项目 ID（可选）">
          <n-input
            v-model:value="projectId"
            placeholder="留空则让后端自动探测；若出现项目选择，再回来填写或选择"
          />
        </n-form-item>
      </n-form>

      <div class="flex flex-wrap gap-2">
        <n-button class="w-full sm:w-auto" type="primary" :loading="starting" @click="handleStart">获取认证链接</n-button>
        <n-button class="w-full sm:w-auto" secondary :loading="finishing" @click="handleFinish">拉取认证结果</n-button>
      </div>

      <n-alert v-if="authUrl" type="info" title="认证链接已生成">
        <div class="space-y-3">
          <a class="app-link break-all underline" :href="authUrl" target="_blank" rel="noreferrer">
            {{ authUrl }}
          </a>
          <div>
            <n-button class="w-full sm:w-auto" tag="a" :href="authUrl" target="_blank" type="primary">
              打开授权页面
            </n-button>
          </div>
        </div>
      </n-alert>

      <div class="panel-embedded">
        <div class="panel-header">
          <div class="panel-title">手动回调 URL</div>
        </div>
        <div class="space-y-3">
          <n-input
            v-model:value="callbackUrl"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            placeholder="如果浏览器跳回 localhost 回调地址失败，可把完整回调 URL 粘贴到这里"
          />
          <n-button class="w-full sm:w-auto" secondary :loading="callbackFinishing" @click="handleCallbackUrl">
            从回调 URL 完成认证
          </n-button>
        </div>
      </div>

      <div v-if="needsProjectId && availableProjects.length > 0" class="panel-embedded">
        <div class="panel-header">
          <div class="panel-title">候选项目</div>
        </div>
        <div class="space-y-3">
          <p class="text-sm app-text-muted">后端要求选择项目，请从列表中挑一个后再次点击“拉取认证结果”。</p>
          <n-select
            v-model:value="projectId"
            :options="availableProjects.map((item) => ({ label: `${item.name} (${item.project_id})`, value: item.project_id }))"
            placeholder="选择一个项目"
          />
        </div>
      </div>

      <div v-if="resultText" class="panel-embedded">
        <div class="panel-header">
          <div class="panel-title">最近结果</div>
        </div>
        <pre class="code-block whitespace-pre-wrap text-xs">{{ resultText }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { NAlert, NButton, NForm, NFormItem, NInput, NSelect } from "naive-ui";
import { computed, ref } from "vue";

import { finishAuth, finishAuthWithCallbackUrl, startAuth } from "@/api/auth";
import type { AuthCallbackResponse, AuthProject, CredMode } from "@/api/types";
import { message } from "@/utils/feedback";
import { getErrorMessage } from "@/utils/helpers";
import { prettyJson } from "@/utils/format";

const props = defineProps<{
  mode: CredMode;
  title: string;
}>();

const projectId = ref("");
const authUrl = ref("");
const callbackUrl = ref("");
const resultText = ref("");
const availableProjects = ref<AuthProject[]>([]);
const starting = ref(false);
const finishing = ref(false);
const callbackFinishing = ref(false);
const needsProjectId = computed(() => props.mode === "geminicli");
const stepOneDescription = computed(() =>
  needsProjectId.value
    ? "如已知项目 ID 可直接填写，否则让后端自动探测。"
    : "当前渠道不需要项目 ID，直接生成授权链接即可。",
);

function normalizedProjectId() {
  if (!needsProjectId.value) {
    return undefined;
  }
  return projectId.value.trim() || undefined;
}

async function handleStart() {
  starting.value = true;
  try {
    const result = await startAuth(props.mode, normalizedProjectId());
    authUrl.value = result.auth_url;
    availableProjects.value = [];
    resultText.value = prettyJson(result);
    message.success("认证链接已生成");
  } catch (error) {
    message.error(getErrorMessage(error));
  } finally {
    starting.value = false;
  }
}

async function handleFinish() {
  finishing.value = true;
  try {
    const result = await finishAuth(props.mode, normalizedProjectId());
    handleAuthResponse(result);
  } catch (error) {
    message.error(getErrorMessage(error));
  } finally {
    finishing.value = false;
  }
}

async function handleCallbackUrl() {
  if (!callbackUrl.value.trim()) {
    message.warning("请先粘贴回调 URL");
    return;
  }

  callbackFinishing.value = true;
  try {
    const result = await finishAuthWithCallbackUrl(
      props.mode,
      callbackUrl.value.trim(),
      normalizedProjectId(),
    );
    handleAuthResponse(result);
  } catch (error) {
    message.error(getErrorMessage(error));
  } finally {
    callbackFinishing.value = false;
  }
}

function handleAuthResponse(result: AuthCallbackResponse) {
  resultText.value = prettyJson(result);

  if (result.credentials) {
    availableProjects.value = [];
    message.success(result.message || "认证成功");
    return;
  }

  if (needsProjectId.value && result.requires_project_selection && result.available_projects) {
    availableProjects.value = result.available_projects;
    message.warning("请选择项目后再次拉取认证结果");
    return;
  }

  if (needsProjectId.value && result.requires_manual_project_id) {
    message.warning("后端需要手动项目 ID，请填写后重试");
    return;
  }

  message.error(result.error || "认证失败");
}
</script>
