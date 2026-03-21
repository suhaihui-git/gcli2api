<template>
  <app-layout>
    <section class="space-y-4">
      <div class="panel-shell overflow-hidden">
        <div class="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div class="app-contrast-panel px-6 py-6">
            <p class="app-contrast-kicker">Console Snapshot</p>
            <h3 class="mt-4 text-3xl font-semibold">统一前端控制台</h3>
            <p class="app-contrast-copy mt-3 max-w-2xl text-sm leading-7">
              现在可以在一套响应式界面里完成凭证运维、OAuth 授权、日志排查和配置调整。
              桌面端强调信息密度，移动端则优先保证操作路径清晰、触控目标明确。
            </p>
          </div>
          <div class="surface-panel rounded-[28px] p-5">
            <p class="text-xs uppercase tracking-[0.24em] app-text-muted">当前版本</p>
            <p class="mt-3 text-4xl font-semibold app-text-strong">{{ versionText }}</p>
            <p class="mt-2 text-sm app-text-muted">{{ versionHint }}</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <router-link
                class="app-quick-link app-quick-link--primary"
                :to="{ name: 'credentials' }"
              >
                进入凭证中心
              </router-link>
              <router-link
                class="app-quick-link app-quick-link--secondary"
                :to="{ name: 'oauth' }"
              >
                发起 OAuth
              </router-link>
            </div>
          </div>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <stat-card label="GeminiCLI 凭证" :value="stats.geminicli.total" accent="Gem" :hint="statHint('geminicli')" />
        <stat-card label="Antigravity 凭证" :value="stats.antigravity.total" accent="Anti" :hint="statHint('antigravity')" />
        <stat-card label="Codex 凭证" :value="stats.codex.total" accent="Codex" :hint="statHint('codex')" />
        <stat-card label="Claude 凭证" :value="stats.claude.total" accent="Claude" :hint="statHint('claude')" />
        <stat-card label="总凭证数" :value="totalCredentials" accent="All" hint="四类凭证累计总量" />
      </div>

      <n-grid cols="1 s:1 m:2" responsive="screen" x-gap="16" y-gap="16">
        <n-grid-item>
          <div class="panel-shell min-h-[280px]">
            <div class="panel-header">
              <div class="panel-title">控制台概览</div>
            </div>
            <div class="space-y-4 text-sm leading-7 app-text-muted">
              <p>这里展示当前四类凭证的总览，你可以先判断哪一组需要优先处理。</p>
              <p>常见路径是先到凭证中心排查异常，再去 OAuth 补充新凭证，最后到日志页确认服务状态。</p>
              <p>如果需要调整端点、密码或重试策略，可以直接进入系统配置页处理。</p>
            </div>
          </div>
        </n-grid-item>
        <n-grid-item>
          <div class="panel-shell min-h-[280px]">
            <div class="panel-header">
              <div class="panel-title">推荐操作</div>
            </div>
            <n-space vertical size="large">
              <router-link class="app-quick-link app-quick-link--secondary" :to="{ name: 'credentials' }">
                打开凭证中心，检查四类凭证状态
              </router-link>
              <router-link class="app-quick-link app-quick-link--primary" :to="{ name: 'oauth' }">
                发起 OAuth 流程并导入新凭证
              </router-link>
              <router-link class="app-quick-link app-quick-link--warning" :to="{ name: 'logs' }">
                查看实时日志，确认服务状态
              </router-link>
              <router-link class="app-quick-link app-quick-link--success" :to="{ name: 'config' }">
                检查端点与保活配置
              </router-link>
            </n-space>
          </div>
        </n-grid-item>
      </n-grid>
    </section>
  </app-layout>
</template>

<script setup lang="ts">
import { AxiosError } from "axios";
import { NGrid, NGridItem, NSpace } from "naive-ui";
import { onMounted, reactive, ref } from "vue";

import { getCredentialStatus } from "@/api/credentials";
import type { CredMode, CredStats } from "@/api/types";
import { getVersionInfo } from "@/api/version";
import StatCard from "@/components/common/StatCard.vue";
import AppLayout from "@/components/layout/AppLayout.vue";
import { message } from "@/utils/feedback";

const versionText = ref("读取中");
const versionHint = ref("等待后端返回版本信息");

const stats = reactive<Record<CredMode, CredStats>>({
  geminicli: { total: 0, normal: 0, disabled: 0 },
  antigravity: { total: 0, normal: 0, disabled: 0 },
  codex: { total: 0, normal: 0, disabled: 0 },
  claude: { total: 0, normal: 0, disabled: 0 },
});

const totalCredentials = ref(0);

function statHint(mode: CredMode) {
  return `启用 ${stats[mode].normal} / 禁用 ${stats[mode].disabled}`;
}

onMounted(async () => {
  try {
    const [version, geminicli, antigravity, codex, claude] = await Promise.all([
      getVersionInfo(),
      getCredentialStatus("geminicli", { limit: 20 }),
      getCredentialStatus("antigravity", { limit: 20 }),
      getCredentialStatus("codex", { limit: 20 }),
      getCredentialStatus("claude", { limit: 20 }),
    ]);

    versionText.value = version.version || "unknown";
    versionHint.value = version.message || version.date || "version.txt";

    stats.geminicli = geminicli.stats;
    stats.antigravity = antigravity.stats;
    stats.codex = codex.stats;
    stats.claude = claude.stats;
    totalCredentials.value =
      geminicli.stats.total + antigravity.stats.total + codex.stats.total + claude.stats.total;
  } catch (error) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    message.error(axiosError.response?.data?.detail || "仪表盘数据加载失败");
  }
});
</script>
