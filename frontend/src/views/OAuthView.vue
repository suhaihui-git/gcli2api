<template>
  <app-layout>
    <segment-tabs v-model="activeTab" label="OAuth 模式" :items="tabItems">
      <section v-if="activeTab === 'geminicli'" role="tabpanel" aria-label="GeminiCLI OAuth">
        <OAuthWorkbench mode="geminicli" title="GeminiCLI OAuth" />
      </section>
      <section v-else-if="activeTab === 'antigravity'" role="tabpanel" aria-label="Antigravity OAuth">
        <OAuthWorkbench mode="antigravity" title="Antigravity OAuth" />
      </section>
      <section v-else-if="activeTab === 'codex'" role="tabpanel" aria-label="Codex OAuth">
        <OAuthWorkbench mode="codex" title="Codex OAuth" />
      </section>
      <section v-else role="tabpanel" aria-label="Claude OAuth">
        <OAuthWorkbench mode="claude" title="Claude OAuth" />
      </section>
    </segment-tabs>
  </app-layout>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import SegmentTabs from "@/components/common/SegmentTabs.vue";
import OAuthWorkbench from "@/components/auth/OAuthWorkbench.vue";
import AppLayout from "@/components/layout/AppLayout.vue";

const route = useRoute();
const router = useRouter();

const tabItems = [
  { label: "GeminiCLI", value: "geminicli" },
  { label: "Antigravity", value: "antigravity" },
  { label: "Codex", value: "codex" },
  { label: "Claude", value: "claude" },
] as const;

type OAuthTab = (typeof tabItems)[number]["value"];

function resolveTab(value: unknown): OAuthTab {
  return tabItems.some((item) => item.value === value) ? (value as OAuthTab) : "geminicli";
}

const activeTab = ref<OAuthTab>(resolveTab(route.query.tab));

watch(
  () => route.query.tab,
  (value) => {
    const next = resolveTab(value);
    if (activeTab.value !== next) {
      activeTab.value = next;
    }
  },
);

watch(activeTab, (value) => {
  if (route.query.tab === value) {
    return;
  }
  void router.replace({
    query: {
      ...route.query,
      tab: value,
    },
  });
});
</script>
