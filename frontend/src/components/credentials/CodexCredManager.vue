<template>
  <credential-workspace
    mode="codex"
    badge="Codex"
    title="Codex 凭证中心"
    description="聚焦余额、状态码与可用性，适合快速排障与调试。"
    default-model="gpt-4.1"
    :supports-usage-tools="true"
    usage-failure-label="Codex 凭证"
  />
</template>

<script setup lang="ts">
import CredentialWorkspace from "@/components/credentials/CredentialWorkspace.vue";
</script>
