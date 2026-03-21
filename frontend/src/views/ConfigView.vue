<template>
  <app-layout>
    <n-spin :show="loading">
      <div class="space-y-4">
        <div class="panel-shell">
          <div class="panel-header">
            <div>
              <div class="panel-title">系统配置</div>
              <p class="panel-desc">按服务、端点、策略和保活分组维护系统参数。</p>
            </div>
            <div class="flex flex-wrap justify-end gap-2">
              <n-button secondary @click="applyMirrorUrls">镜像地址</n-button>
              <n-button secondary @click="applyOfficialUrls">官方地址</n-button>
              <n-button type="primary" :loading="saving" @click="handleSave">保存配置</n-button>
            </div>
          </div>

          <div class="app-contrast-panel mb-4 px-5 py-5">
            <p class="app-contrast-kicker">Config</p>
            <h3 class="mt-3 text-2xl font-semibold">按分组维护系统参数</h3>
            <p class="app-contrast-copy mt-2 text-sm leading-7">
              建议优先检查服务与密码，再确认代理端点，最后调整重试、兼容性和保活策略。
              如果某个字段由环境变量接管，界面会保持只读。
            </p>
          </div>

          <n-alert v-if="envLocked.size > 0" type="warning" class="mb-4">
            环境变量锁定字段：{{ Array.from(envLocked).join(", ") }}
          </n-alert>

          <div class="grid gap-4 xl:grid-cols-2">
            <div class="panel-embedded">
              <div class="panel-header">
                <div class="panel-title">服务与密码</div>
              </div>
              <p class="mb-4 text-sm app-text-muted">主机、端口、访问密码和凭证目录建议优先在这里确认。</p>
              <n-form label-placement="top">
                <n-grid cols="1 s:2" responsive="screen" x-gap="12">
                  <n-grid-item>
                    <n-form-item label="监听地址">
                      <n-input v-model:value="form.host" :disabled="isLocked('host')" />
                    </n-form-item>
                  </n-grid-item>
                  <n-grid-item>
                    <n-form-item label="监听端口">
                      <n-input-number v-model:value="form.port" class="w-full" :disabled="isLocked('port')" />
                    </n-form-item>
                  </n-grid-item>
                </n-grid>
                <n-form-item label="API 密码">
                  <n-input v-model:value="form.api_password" type="password" :disabled="isLocked('api_password')" />
                </n-form-item>
                <n-form-item label="面板密码">
                  <n-input v-model:value="form.panel_password" type="password" :disabled="isLocked('panel_password')" />
                </n-form-item>
                <n-form-item label="通用密码">
                  <n-input v-model:value="form.password" type="password" :disabled="isLocked('password')" />
                </n-form-item>
                <n-form-item label="凭证目录">
                  <n-input v-model:value="form.credentials_dir" :disabled="isLocked('credentials_dir')" />
                </n-form-item>
                <n-form-item label="代理">
                  <n-input v-model:value="form.proxy" :disabled="isLocked('proxy')" />
                </n-form-item>
              </n-form>
            </div>

            <div class="panel-embedded">
              <div class="panel-header">
                <div class="panel-title">接口端点</div>
              </div>
              <p class="mb-4 text-sm app-text-muted">镜像与官方地址切换都会作用于这一组未锁定字段。</p>
              <n-form label-placement="top">
                <n-form-item label="Code Assist 地址">
                  <n-input v-model:value="form.code_assist_endpoint" :disabled="isLocked('code_assist_endpoint')" />
                </n-form-item>
                <n-form-item label="OAuth 代理地址">
                  <n-input v-model:value="form.oauth_proxy_url" :disabled="isLocked('oauth_proxy_url')" />
                </n-form-item>
                <n-form-item label="Google APIs 代理地址">
                  <n-input v-model:value="form.googleapis_proxy_url" :disabled="isLocked('googleapis_proxy_url')" />
                </n-form-item>
                <n-form-item label="Resource Manager 地址">
                  <n-input v-model:value="form.resource_manager_api_url" :disabled="isLocked('resource_manager_api_url')" />
                </n-form-item>
                <n-form-item label="Service Usage 地址">
                  <n-input v-model:value="form.service_usage_api_url" :disabled="isLocked('service_usage_api_url')" />
                </n-form-item>
                <n-form-item label="Antigravity 地址">
                  <n-input v-model:value="form.antigravity_api_url" :disabled="isLocked('antigravity_api_url')" />
                </n-form-item>
              </n-form>
            </div>

            <div class="panel-embedded">
              <div class="panel-header">
                <div class="panel-title">策略开关</div>
              </div>
              <p class="mb-4 text-sm app-text-muted">涉及自动封禁、429 重试、兼容模式和前端回传策略。</p>
              <n-form label-placement="top">
                <n-form-item label="自动封禁">
                  <n-switch v-model:value="form.auto_ban_enabled" :disabled="isLocked('auto_ban_enabled')" />
                </n-form-item>
                <n-form-item label="自动封禁错误码">
                  <n-input v-model:value="form.auto_ban_error_codes" :disabled="isLocked('auto_ban_error_codes')" />
                </n-form-item>
                <n-form-item label="429 重试">
                  <n-switch v-model:value="form.retry_429_enabled" :disabled="isLocked('retry_429_enabled')" />
                </n-form-item>
                <n-form-item label="单轮调用次数">
                  <n-input-number v-model:value="form.calls_per_rotation" class="w-full" />
                </n-form-item>
                <n-grid cols="1 s:2" responsive="screen" x-gap="12">
                  <n-grid-item>
                    <n-form-item label="429 最大重试次数">
                      <n-input-number v-model:value="form.retry_429_max_retries" class="w-full" :disabled="isLocked('retry_429_max_retries')" />
                    </n-form-item>
                  </n-grid-item>
                  <n-grid-item>
                    <n-form-item label="429 重试间隔（秒）">
                      <n-input-number v-model:value="form.retry_429_interval" class="w-full" :step="0.1" :disabled="isLocked('retry_429_interval')" />
                    </n-form-item>
                  </n-grid-item>
                </n-grid>
                <n-form-item label="兼容模式">
                  <n-switch v-model:value="form.compatibility_mode_enabled" :disabled="isLocked('compatibility_mode_enabled')" />
                </n-form-item>
                <n-form-item label="向前端返回思维链">
                  <n-switch v-model:value="form.return_thoughts_to_frontend" :disabled="isLocked('return_thoughts_to_frontend')" />
                </n-form-item>
                <n-form-item label="Antigravity 流式转非流式">
                  <n-switch v-model:value="form.antigravity_stream2nostream" :disabled="isLocked('antigravity_stream2nostream')" />
                </n-form-item>
                <n-form-item label="抗截断最大重试次数">
                  <n-input-number v-model:value="form.anti_truncation_max_attempts" class="w-full" :disabled="isLocked('anti_truncation_max_attempts')" />
                </n-form-item>
              </n-form>
            </div>

            <div class="panel-embedded">
              <div class="panel-header">
                <div class="panel-title">保活</div>
              </div>
              <p class="mb-4 text-sm app-text-muted">保活 URL 与间隔改动后，服务端会尝试即时重启保活任务。</p>
              <n-form label-placement="top">
                <n-form-item label="保活地址">
                  <n-input v-model:value="form.keepalive_url" :disabled="isLocked('keepalive_url')" />
                </n-form-item>
                <n-form-item label="保活间隔（秒）">
                  <n-input-number v-model:value="form.keepalive_interval" class="w-full" :disabled="isLocked('keepalive_interval')" />
                </n-form-item>
              </n-form>
            </div>
          </div>

        </div>
      </div>
    </n-spin>
  </app-layout>
</template>

<script setup lang="ts">
import { NAlert, NButton, NForm, NFormItem, NGrid, NGridItem, NInput, NInputNumber, NSpin, NSwitch } from "naive-ui";
import { onMounted, reactive, ref } from "vue";

import { getConfig, saveConfig } from "@/api/config";
import AppLayout from "@/components/layout/AppLayout.vue";
import { message } from "@/utils/feedback";
import { getErrorMessage } from "@/utils/helpers";

const loading = ref(false);
const saving = ref(false);
const envLocked = ref(new Set<string>());

const form = reactive({
  host: "0.0.0.0",
  port: 7861,
  api_password: "",
  panel_password: "",
  password: "",
  credentials_dir: "",
  proxy: "",
  code_assist_endpoint: "",
  oauth_proxy_url: "",
  googleapis_proxy_url: "",
  resource_manager_api_url: "",
  service_usage_api_url: "",
  antigravity_api_url: "",
  auto_ban_enabled: false,
  auto_ban_error_codes: "",
  retry_429_enabled: false,
  calls_per_rotation: 10,
  retry_429_max_retries: 20,
  retry_429_interval: 0.1,
  compatibility_mode_enabled: false,
  return_thoughts_to_frontend: true,
  antigravity_stream2nostream: false,
  anti_truncation_max_attempts: 3,
  keepalive_url: "",
  keepalive_interval: 60,
});

const mirrorUrls = {
  code_assist_endpoint: "https://gcli-api.sukaka.top/cloudcode-pa",
  oauth_proxy_url: "https://gcli-api.sukaka.top/oauth2",
  googleapis_proxy_url: "https://gcli-api.sukaka.top/googleapis",
  resource_manager_api_url: "https://gcli-api.sukaka.top/cloudresourcemanager",
  service_usage_api_url: "https://gcli-api.sukaka.top/serviceusage",
  antigravity_api_url: "https://gcli-api.sukaka.top/daily-cloudcode-pa",
};

const officialUrls = {
  code_assist_endpoint: "https://cloudcode-pa.googleapis.com",
  oauth_proxy_url: "https://oauth2.googleapis.com",
  googleapis_proxy_url: "https://www.googleapis.com",
  resource_manager_api_url: "https://cloudresourcemanager.googleapis.com",
  service_usage_api_url: "https://serviceusage.googleapis.com",
  antigravity_api_url: "https://daily-cloudcode-pa.sandbox.googleapis.com",
};

onMounted(() => {
  void loadConfig();
});

function isLocked(key: string) {
  return envLocked.value.has(key);
}

async function loadConfig() {
  loading.value = true;
  try {
    const result = await getConfig();
    const config = result.config as Record<string, unknown>;
    envLocked.value = new Set(result.env_locked || []);

    form.host = String(config.host || "0.0.0.0");
    form.port = Number(config.port || 7861);
    form.api_password = String(config.api_password || "");
    form.panel_password = String(config.panel_password || "");
    form.password = String(config.password || "");
    form.credentials_dir = String(config.credentials_dir || "");
    form.proxy = String(config.proxy || "");
    form.code_assist_endpoint = String(config.code_assist_endpoint || "");
    form.oauth_proxy_url = String(config.oauth_proxy_url || "");
    form.googleapis_proxy_url = String(config.googleapis_proxy_url || "");
    form.resource_manager_api_url = String(config.resource_manager_api_url || "");
    form.service_usage_api_url = String(config.service_usage_api_url || "");
    form.antigravity_api_url = String(config.antigravity_api_url || "");
    form.auto_ban_enabled = Boolean(config.auto_ban_enabled);
    form.auto_ban_error_codes = Array.isArray(config.auto_ban_error_codes)
      ? config.auto_ban_error_codes.join(",")
      : String(config.auto_ban_error_codes || "");
    form.retry_429_enabled = Boolean(config.retry_429_enabled);
    form.calls_per_rotation = Number(config.calls_per_rotation || 10);
    form.retry_429_max_retries = Number(config.retry_429_max_retries || 20);
    form.retry_429_interval = Number(config.retry_429_interval || 0.1);
    form.compatibility_mode_enabled = Boolean(config.compatibility_mode_enabled);
    form.return_thoughts_to_frontend = config.return_thoughts_to_frontend !== false;
    form.antigravity_stream2nostream = Boolean(config.antigravity_stream2nostream);
    form.anti_truncation_max_attempts = Number(config.anti_truncation_max_attempts || 3);
    form.keepalive_url = String(config.keepalive_url || "");
    form.keepalive_interval = Number(config.keepalive_interval || 60);
  } catch (error) {
    message.error(getErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

function applyMirrorUrls() {
  for (const [key, value] of Object.entries(mirrorUrls)) {
    if (!isLocked(key)) {
      Reflect.set(form, key, value);
    }
  }
  message.success("已切换为镜像地址，请记得保存");
}

function applyOfficialUrls() {
  for (const [key, value] of Object.entries(officialUrls)) {
    if (!isLocked(key)) {
      Reflect.set(form, key, value);
    }
  }
  message.success("已切换为官方地址，请记得保存");
}

async function handleSave() {
  saving.value = true;
  try {
    await saveConfig({
      host: form.host,
      port: Number(form.port),
      api_password: form.api_password,
      panel_password: form.panel_password,
      password: form.password,
      credentials_dir: form.credentials_dir,
      proxy: form.proxy,
      code_assist_endpoint: form.code_assist_endpoint,
      oauth_proxy_url: form.oauth_proxy_url,
      googleapis_proxy_url: form.googleapis_proxy_url,
      resource_manager_api_url: form.resource_manager_api_url,
      service_usage_api_url: form.service_usage_api_url,
      antigravity_api_url: form.antigravity_api_url,
      auto_ban_enabled: form.auto_ban_enabled,
      auto_ban_error_codes: form.auto_ban_error_codes
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => !Number.isNaN(item)),
      retry_429_enabled: form.retry_429_enabled,
      calls_per_rotation: Number(form.calls_per_rotation),
      retry_429_max_retries: Number(form.retry_429_max_retries),
      retry_429_interval: Number(form.retry_429_interval),
      compatibility_mode_enabled: form.compatibility_mode_enabled,
      return_thoughts_to_frontend: form.return_thoughts_to_frontend,
      antigravity_stream2nostream: form.antigravity_stream2nostream,
      anti_truncation_max_attempts: Number(form.anti_truncation_max_attempts),
      keepalive_url: form.keepalive_url,
      keepalive_interval: Number(form.keepalive_interval),
    });
    message.success("配置保存成功");
    await loadConfig();
  } catch (error) {
    message.error(getErrorMessage(error));
  } finally {
    saving.value = false;
  }
}
</script>
