<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'refresh'">
      <path d="M20 5v5h-5" />
      <path d="M20 10a8 8 0 1 0 2.2 6" />
    </template>

    <template v-else-if="name === 'reset'">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </template>

    <template v-else-if="name === 'upload'">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 18v2h16v-2" />
    </template>

    <template v-else-if="name === 'download'">
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20v-2h16v2" />
    </template>

    <template v-else-if="name === 'mail'">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m4 7 8 6 8-6" />
    </template>

    <template v-else-if="name === 'merge'">
      <path d="M8 6v4a4 4 0 0 0 4 4h6" />
      <path d="m14 10 4 4-4 4" />
      <circle cx="8" cy="6" r="2" />
      <circle cx="8" cy="18" r="2" />
      <path d="M8 10v6" />
    </template>

    <template v-else-if="name === 'wallet'">
      <path d="M4 8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1H6a2 2 0 1 0 0 4h13v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
      <path d="M18 13h3" />
    </template>

    <template v-else-if="name === 'pulse'">
      <path d="M3 12h4l2.2-5 4.2 10 2.2-5H21" />
    </template>

    <template v-else-if="name === 'trash'">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </template>

    <template v-else-if="name === 'grid'">
      <rect x="4" y="4" width="6" height="6" rx="1.5" />
      <rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" />
      <rect x="14" y="14" width="6" height="6" rx="1.5" />
    </template>

    <template v-else-if="name === 'check'">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.3 2.3 4.7-4.8" />
    </template>

    <template v-else-if="name === 'ban'">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 8.5 7 7" />
    </template>

    <template v-else-if="name === 'shield'">
      <path d="M12 3 5 6v5c0 4.2 2.6 8 7 10 4.4-2 7-5.8 7-10V6Z" />
      <path d="m9.5 12 2 2 3.5-4" />
    </template>

    <template v-else-if="name === 'sparkles'">
      <path d="m12 3 1.4 3.6L17 8l-3.6 1.4L12 13l-1.4-3.6L7 8l3.6-1.4Z" />
      <path d="m19 13 .8 2.2L22 16l-2.2.8L19 19l-.8-2.2L16 16l2.2-.8Z" />
      <path d="m5 14 .9 2.1L8 17l-2.1.9L5 20l-.9-2.1L2 17l2.1-.9Z" />
    </template>

    <template v-else-if="name === 'file'">
      <path d="M8 3h7l4 4v14H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M15 3v5h5" />
      <path d="M10 13h6" />
      <path d="M10 17h6" />
    </template>

    <template v-else-if="name === 'alert'">
      <path d="M12 4 3.5 19h17Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </template>

    <template v-else-if="name === 'chat'">
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4 4v-4H7.5A2.5 2.5 0 0 1 5 12.5Z" />
    </template>

    <template v-else-if="name === 'eye'">
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </template>

    <template v-else-if="name === 'power'">
      <path d="M12 3v7" />
      <path d="M7.8 5.8a8 8 0 1 0 8.4 0" />
    </template>
  </svg>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    name: string;
    size?: number;
    strokeWidth?: number;
  }>(),
  {
    size: 14,
    strokeWidth: 1.9,
  },
);
</script>
