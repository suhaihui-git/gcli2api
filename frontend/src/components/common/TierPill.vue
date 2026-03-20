<template>
  <n-tag :bordered="false" round :type="tagType" size="small">
    {{ tier.toUpperCase() }}
  </n-tag>
</template>

<script setup lang="ts">
import { NTag, type TagProps } from "naive-ui";
import { computed } from "vue";

const props = defineProps<{
  tier: "free" | "pro" | "ultra";
}>();

const tagType = computed<TagProps["type"]>(() => {
  if (props.tier === "ultra") {
    return "warning";
  }
  if (props.tier === "free") {
    return "default";
  }
  return "success";
});
</script>
