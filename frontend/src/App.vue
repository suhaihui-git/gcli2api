<template>
  <n-config-provider
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <n-loading-bar-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-message-provider>
            <router-view />
          </n-message-provider>
        </n-notification-provider>
      </n-dialog-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import {
  NConfigProvider,
  NDialogProvider,
  NLoadingBarProvider,
  NMessageProvider,
  NNotificationProvider,
  darkTheme,
  dateZhCN,
  zhCN,
} from "naive-ui";
import { computed, watchEffect } from "vue";

import { createNaiveThemeOverrides } from "@/theme/naive";
import { useUiStore } from "@/stores/ui";

const uiStore = useUiStore();

const theme = computed(() => (uiStore.isDark ? darkTheme : null));
const themeOverrides = computed(() => createNaiveThemeOverrides(uiStore.isDark));

watchEffect(() => {
  document.body.classList.toggle("theme-dark", uiStore.isDark);
});
</script>
