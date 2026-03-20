<template>
  <div class="page-shell px-4 py-4 md:px-6 md:py-6">
    <div class="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[1600px] gap-4">
      <aside class="glass-panel sticky top-6 hidden h-[calc(100vh-3rem)] w-[296px] shrink-0 rounded-[28px] p-4 lg:flex lg:flex-col">
        <div class="app-contrast-panel mb-6 p-5">
          <p class="app-contrast-kicker">su2api</p>
          <h1 class="mt-3 text-2xl font-semibold">控制面板</h1>
          <p class="app-contrast-copy mt-2 text-sm">
            统一管理 GeminiCLI、Antigravity 与 Codex 凭证。
          </p>
        </div>

        <nav class="flex-1 space-y-2">
          <router-link
            v-for="item in navItems"
            :key="item.name"
            :to="{ name: item.name }"
            class="app-nav-link flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition"
            :class="
              route.name === item.name
                ? 'app-nav-link-active'
                : ''
            "
          >
            <span>{{ item.label }}</span>
            <span class="text-xs opacity-70">{{ item.hint }}</span>
          </router-link>
        </nav>

        <div class="surface-panel mt-4 rounded-2xl p-4 text-sm app-text-muted">
          <theme-mode-switch
            :model-value="uiStore.theme"
            label="显示模式"
            description="切换清透浅色或专注暗色。"
            @update:model-value="uiStore.setTheme"
          />
          <n-button class="mt-5 app-shell-button" block secondary strong @click="handleLogout">
            退出登录
          </n-button>
        </div>
      </aside>

      <div class="mobile-nav-spacer min-w-0 flex-1 lg:pb-0">
        <header class="glass-panel sticky top-3 z-30 flex items-center justify-between rounded-[22px] px-3 py-2.5 lg:hidden">
          <div class="min-w-0">
            <p class="app-link text-xs uppercase tracking-[0.28em]">su2api</p>
            <h2 class="truncate text-lg font-semibold app-text-strong">{{ currentNav.label }}</h2>
          </div>
          <n-button class="app-shell-button" secondary strong circle @click="showMobileNav = true">菜单</n-button>
        </header>

        <section class="page-intro page-intro--compact glass-panel mt-3 rounded-[24px] px-4 py-3">
          <div class="min-w-0">
            <p class="app-hero-kicker">{{ currentNav.hint }}</p>
            <h2 class="mt-1.5 text-lg font-semibold md:text-[1.5rem]">{{ currentNav.label }}</h2>
            <p class="app-hero-copy mt-1.5 max-w-3xl text-[13px] leading-6 md:text-sm">
              {{ currentNav.description }}
            </p>
          </div>
        </section>

        <main class="mt-3">
          <slot />
        </main>
      </div>
    </div>

    <n-drawer v-model:show="showMobileNav" placement="left" width="86vw">
      <n-drawer-content closable title="导航">
        <div class="space-y-4">
          <div class="app-contrast-panel px-5 py-5">
            <p class="app-contrast-kicker">su2api</p>
            <h2 class="mt-3 text-2xl font-semibold">{{ currentNav.label }}</h2>
            <p class="app-contrast-copy mt-2 text-sm">{{ currentNav.description }}</p>
          </div>

          <nav class="space-y-2">
            <router-link
              v-for="item in navItems"
              :key="item.name"
              :to="{ name: item.name }"
              class="app-nav-link surface-panel block rounded-2xl px-4 py-4 transition"
              :class="route.name === item.name ? 'app-nav-link-active' : 'app-text-strong'"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{{ item.label }}</span>
                <span class="text-xs opacity-70">{{ item.hint }}</span>
              </div>
              <p class="mt-1 text-xs opacity-75">{{ item.description }}</p>
            </router-link>
          </nav>

          <div class="surface-panel rounded-2xl p-4">
            <theme-mode-switch
              :model-value="uiStore.theme"
              label="显示模式"
              description="切换当前控制台主题。"
              @update:model-value="uiStore.setTheme"
            />
            <n-button class="mt-5 app-shell-button" block secondary strong @click="handleLogout">
              退出登录
            </n-button>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>

    <nav class="glass-panel fixed inset-x-3 bottom-3 z-30 rounded-[24px] px-2 py-2 lg:hidden">
      <div class="grid grid-cols-5 gap-1">
        <router-link
          v-for="item in bottomNavItems"
          :key="`bottom-${item.name}`"
          :to="{ name: item.name }"
          class="app-nav-link flex min-h-[56px] flex-col items-center justify-center rounded-2xl px-1 text-center transition"
          :class="
            route.name === item.name
              ? 'app-nav-link-active'
              : 'app-text-muted'
          "
        >
          <span class="text-[10px] uppercase tracking-[0.18em] opacity-70">{{ item.hint }}</span>
          <span class="mt-1 text-[11px] font-medium">{{ item.label }}</span>
        </router-link>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { NButton, NDrawer, NDrawerContent } from "naive-ui";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "@/stores/auth";
import ThemeModeSwitch from "@/components/common/ThemeModeSwitch.vue";
import { useUiStore } from "@/stores/ui";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const uiStore = useUiStore();
const showMobileNav = ref(false);

const navItems = [
  { name: "dashboard", label: "概览", hint: "01", description: "查看版本、凭证总览与常用操作入口。" },
  { name: "credentials", label: "凭证中心", hint: "02", description: "筛选、上传、测试并批量管理三类凭证。" },
  { name: "oauth", label: "OAuth", hint: "03", description: "发起授权并处理回调，快速导入新凭证。" },
  { name: "logs", label: "实时日志", hint: "04", description: "观察服务运行状态，下载或清空日志。" },
  { name: "config", label: "系统配置", hint: "05", description: "维护端点、密码、重试与保活参数。" },
  { name: "docs", label: "使用文档", hint: "06", description: "查看面向下游用户的 API 端点、认证和调用示例。" },
  { name: "about", label: "项目信息", hint: "07", description: "查看项目定位、功能特性和风险提示。" },
] as const;

const bottomNavItems = computed(() => navItems.slice(0, 5));

const currentNav = computed(() =>
  navItems.find((item) => item.name === route.name) || navItems[0],
);

watch(
  () => route.fullPath,
  () => {
    showMobileNav.value = false;
  },
);

function handleLogout() {
  authStore.logout();
  void router.push({ name: "login" });
}
</script>
