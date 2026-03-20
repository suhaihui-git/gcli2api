<template>
  <n-tag :bordered="false" round :type="tagType" size="small">
    {{ label }}
  </n-tag>
</template>

<script setup lang="ts">
import { NTag, type TagProps } from "naive-ui";
import { computed } from "vue";

const props = defineProps<{
  disabled: boolean;
}>();

const tagType = computed<TagProps["type"]>(() => (props.disabled ? "warning" : "success"));
const label = computed(() => (props.disabled ? "已禁用" : "已启用"));
</script>
