<template>
  <div class="panel-shell overflow-hidden">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-xs uppercase tracking-[0.24em] app-text-muted">{{ label }}</p>
        <p class="mt-3 text-3xl font-semibold app-text-strong">{{ value }}</p>
        <p v-if="hint" class="mt-2 text-sm app-text-muted">{{ hint }}</p>
      </div>
      <div class="app-accent-badge text-xs font-medium">
        {{ accent }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  hint?: string;
  accent: string;
}>();
</script>
