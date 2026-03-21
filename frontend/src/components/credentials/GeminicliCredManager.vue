<template>
  <credential-workspace
    mode="geminicli"
    badge="GeminiCLI"
    title="GeminiCLI 凭证中心"
    description="围绕项目校验、Preview 与健康状态展开。"
    default-model="gemini-3-flash-preview"
    :supports-tier-filter="true"
    :supports-preview-filter="true"
    :supports-project-verify="true"
  />
</template>

<script setup lang="ts">
import CredentialWorkspace from "@/components/credentials/CredentialWorkspace.vue";
</script>
