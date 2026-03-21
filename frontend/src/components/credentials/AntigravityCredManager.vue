<template>
  <credential-workspace
    mode="antigravity"
    badge="Antigravity"
    title="Antigravity 凭证中心"
    description="集中处理额度、项目校验与批量导入。"
    default-model="gemini-2.5-flash"
    :supports-tier-filter="true"
    :supports-project-verify="true"
  />
</template>

<script setup lang="ts">
import CredentialWorkspace from "@/components/credentials/CredentialWorkspace.vue";
</script>
