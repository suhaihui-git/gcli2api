<template>
  <app-layout>
    <div class="panel-shell panel-shell-tight">
      <segment-tabs v-model="activeTab" label="凭证模式" :items="tabItems">
        <section v-if="activeTab === 'geminicli'" role="tabpanel" aria-label="GeminiCLI">
          <cred-manager mode="geminicli" />
        </section>
        <section v-else-if="activeTab === 'antigravity'" role="tabpanel" aria-label="Antigravity">
          <cred-manager mode="antigravity" />
        </section>
        <section v-else role="tabpanel" aria-label="Codex">
          <cred-manager mode="codex" />
        </section>
      </segment-tabs>
    </div>
  </app-layout>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import SegmentTabs from "@/components/common/SegmentTabs.vue";
import CredManager from "@/components/credentials/CredManager.vue";
import AppLayout from "@/components/layout/AppLayout.vue";

const route = useRoute();
const router = useRouter();

const tabItems = [
  { label: "GeminiCLI", value: "geminicli" },
  { label: "Antigravity", value: "antigravity" },
  { label: "Codex", value: "codex" },
] as const;

type CredentialsTab = (typeof tabItems)[number]["value"];

function resolveTab(value: unknown): CredentialsTab {
  return tabItems.some((item) => item.value === value) ? (value as CredentialsTab) : "geminicli";
}

const activeTab = ref<CredentialsTab>(resolveTab(route.query.tab));

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
