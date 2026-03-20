<template>
  <div class="segment-tabs">
    <div class="segment-tabs__track" role="tablist" :aria-label="label">
      <button
        v-for="item in items"
        :key="item.value"
        type="button"
        role="tab"
        class="segment-tabs__button"
        :class="{ 'segment-tabs__button--active': item.value === modelValue }"
        :aria-selected="item.value === modelValue"
        @click="emit('update:modelValue', item.value)"
      >
        <span class="segment-tabs__label">{{ item.label }}</span>
        <span v-if="item.hint" class="segment-tabs__hint">{{ item.hint }}</span>
      </button>
    </div>
    <div class="segment-tabs__body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label?: string;
  modelValue: string;
  items: ReadonlyArray<{
    label: string;
    value: string;
    hint?: string;
  }>;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
}>();
</script>

<style scoped>
.segment-tabs {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.segment-tabs__track {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));
  gap: 5px;
  padding: 5px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--panel-border) 90%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--soft-surface) 92%, white 8%),
      color-mix(in srgb, var(--soft-surface) 98%, black 2%)
    );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--panel-border) 52%, transparent),
    0 18px 32px rgba(15, 23, 42, 0.08);
}

.segment-tabs__button {
  appearance: none;
  border: 0;
  min-height: 44px;
  padding: 0 14px;
  border-radius: 16px;
  background: transparent;
  color: var(--muted-text);
  font-size: 0.94rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.segment-tabs__button:hover {
  color: var(--strong-text);
  background: color-mix(in srgb, var(--field-bg) 84%, transparent);
}

.segment-tabs__button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-text) 75%, transparent);
  outline-offset: 2px;
}

.segment-tabs__button--active {
  color: var(--strong-text);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--field-bg-strong) 96%, white 4%),
      color-mix(in srgb, var(--field-bg) 88%, transparent)
    );
  box-shadow:
    0 14px 28px rgba(15, 23, 42, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.36);
}

.segment-tabs__hint {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.72;
}

.segment-tabs__body {
  min-width: 0;
}

@media (max-width: 640px) {
  .segment-tabs {
    gap: 12px;
  }

  .segment-tabs__track {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .segment-tabs__button {
    min-height: 40px;
    padding: 0 10px;
    font-size: 0.88rem;
  }
}
</style>
