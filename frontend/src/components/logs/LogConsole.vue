<template>
  <div class="panel-shell">
    <div class="panel-header">
      <div class="panel-title">实时日志</div>
      <n-tag :bordered="false" round :type="socket.isConnected ? 'success' : 'warning'">
        {{ socket.isConnected ? "已连接" : "未连接" }}
      </n-tag>
    </div>

    <div class="space-y-4">
      <div class="grid gap-3 md:grid-cols-3">
        <div class="surface-panel rounded-2xl px-4 py-4">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">连接状态</p>
          <p class="mt-2 text-lg font-semibold app-text-strong">{{ socket.isConnected ? "在线" : "离线" }}</p>
        </div>
        <div class="surface-panel rounded-2xl px-4 py-4">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">显示行数</p>
          <p class="mt-2 text-lg font-semibold app-text-strong">{{ filteredLines.length }}</p>
        </div>
        <div class="surface-panel rounded-2xl px-4 py-4">
          <p class="text-xs uppercase tracking-[0.24em] app-text-muted">筛选级别</p>
          <p class="mt-2 text-lg font-semibold app-text-strong">{{ filter === "all" ? "全部" : filter }}</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <n-button class="w-full sm:w-auto" secondary @click="socket.connect">连接</n-button>
        <n-button class="w-full sm:w-auto" secondary @click="socket.disconnect">断开</n-button>
        <n-button class="w-full sm:w-auto" secondary @click="socket.clear">清空显示</n-button>
        <n-button class="w-full sm:w-auto" secondary @click="handleClearServer">清空服务器日志</n-button>
        <n-button class="w-full sm:w-auto" secondary @click="handleDownload">下载日志</n-button>
        <n-select
          v-model:value="filter"
          class="min-w-[180px] flex-1 sm:flex-none"
          :options="filterOptions"
        />
      </div>

      <n-log
        :rows="22"
        :log="filteredLines.join('\n') || '暂无日志'"
        language="log"
        trim
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { NButton, NLog, NSelect, NTag, type SelectOption } from "naive-ui";

import { clearLogs, downloadLogs } from "@/api/logs";
import { useWebSocket } from "@/composables/useWebSocket";
import { useAuthStore } from "@/stores/auth";
import { message } from "@/utils/feedback";
import { buildLogsWsUrl, getErrorMessage, saveBlob } from "@/utils/helpers";

const authStore = useAuthStore();
authStore.bootstrap();

const socket = reactive(useWebSocket(() => buildLogsWsUrl(authStore.token)));
const filter = ref("all");

const filterOptions: SelectOption[] = [
  { label: "全部级别", value: "all" },
  { label: "INFO", value: "INFO" },
  { label: "WARNING", value: "WARNING" },
  { label: "ERROR", value: "ERROR" },
  { label: "DEBUG", value: "DEBUG" },
];

const filteredLines = computed(() => {
  if (filter.value === "all") {
    return socket.lines;
  }
  return socket.lines.filter((line) => line.toUpperCase().includes(filter.value));
});

onMounted(() => {
  socket.connect();
});

async function handleClearServer() {
  try {
    const result = await clearLogs();
    message.success(result.message || "服务器日志已清空");
  } catch (error) {
    message.error(getErrorMessage(error));
  }
}

async function handleDownload() {
  try {
    const blob = await downloadLogs();
    saveBlob(blob, `su2api-logs-${Date.now()}.txt`);
    message.success("日志下载已开始");
  } catch (error) {
    message.error(getErrorMessage(error));
  }
}
</script>
