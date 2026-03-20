<template>
  <app-layout>
    <section class="space-y-4">
      <div class="panel-shell">
        <div class="panel-header">
          <div class="panel-title">项目信息</div>
        </div>
        <div class="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <div class="app-contrast-panel px-6 py-6">
            <p class="app-contrast-kicker">About</p>
            <h3 class="mt-4 text-3xl font-semibold">su2api</h3>
            <p class="app-contrast-copy mt-3 text-sm leading-7">
              一个把 GeminiCLI、Antigravity 与 Codex 接口整理为统一代理与管理控制台的项目。
              适合集中维护 OAuth 凭证、执行批量运维，并把下游接入切换成更稳定的一套 API 入口。
            </p>
          </div>
          <div class="surface-panel rounded-[28px] p-5">
            <p class="text-xs uppercase tracking-[0.24em] app-text-muted">当前版本</p>
            <p class="mt-3 text-4xl font-semibold app-text-strong">{{ versionText }}</p>
            <p class="mt-2 text-sm app-text-muted">{{ versionHint }}</p>
          </div>
        </div>
      </div>

      <n-grid cols="1 s:1 m:2" responsive="screen" x-gap="16" y-gap="16">
        <n-grid-item>
          <div class="panel-shell h-full">
            <div class="panel-header">
              <div class="panel-title">功能特性</div>
            </div>
            <div class="grid gap-3">
              <div v-for="item in features" :key="item.title" class="surface-panel rounded-2xl px-4 py-4">
                <p class="text-sm font-semibold app-text-strong">{{ item.title }}</p>
                <p class="mt-2 text-sm leading-7 app-text-muted">{{ item.desc }}</p>
              </div>
            </div>
          </div>
        </n-grid-item>
        <n-grid-item>
          <div class="panel-shell h-full">
            <div class="panel-header">
              <div class="panel-title">使用提醒</div>
            </div>
            <div class="space-y-4 text-sm leading-7 app-text-muted">
              <p>本项目主要面向学习研究和自建代理场景，请自行评估凭证管理、代理和部署风险。</p>
              <p>如果需要更完整的接入说明，请到“使用文档”页查看 API 端点和认证方式。</p>
              <p>如果服务行为异常，建议按“凭证中心 → OAuth → 实时日志 → 系统配置”的顺序排查。</p>
            </div>
          </div>
        </n-grid-item>
      </n-grid>
    </section>
  </app-layout>
</template>

<script setup lang="ts">
import { AxiosError } from "axios";
import { NGrid, NGridItem } from "naive-ui";
import { onMounted, ref } from "vue";

import { getVersionInfo } from "@/api/version";
import AppLayout from "@/components/layout/AppLayout.vue";
import { message } from "@/utils/feedback";

const versionText = ref("读取中");
const versionHint = ref("等待版本信息");

const features = [
  { title: "多凭证统一管理", desc: "在一套控制台里维护 GeminiCLI、Antigravity 和 Codex 凭证。" },
  { title: "批量运维能力", desc: "支持批量启用、禁用、删除、检验、Preview 配置与状态扫描。" },
  { title: "日志与配置联动", desc: "可直接查看实时日志，并调整端点、密码、重试和保活参数。" },
  { title: "响应式控制台", desc: "桌面端强调信息密度，移动端强调清晰路径和触控可用性。" },
];

onMounted(async () => {
  try {
    const version = await getVersionInfo();
    versionText.value = version.version || "unknown";
    versionHint.value = version.message || version.date || "version.txt";
  } catch (error) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    message.error(axiosError.response?.data?.detail || "版本信息加载失败");
  }
});
</script>
