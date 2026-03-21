<template>
  <credential-workspace
    mode="claude"
    badge="Claude"
    title="Claude 凭证中心"
    description="集中管理 Anthropic OAuth 凭证，支持原生消息与 OpenAI 兼容调试。"
    default-model="claude-sonnet-4-5"
  />
</template>

<script setup lang="ts">
import CredentialWorkspace from "@/components/credentials/CredentialWorkspace.vue";
</script>
