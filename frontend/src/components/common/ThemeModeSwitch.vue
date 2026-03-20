<template>
  <div
    class="theme-mode"
    :class="{
      'theme-mode--compact': compact,
      'theme-mode--inverted': inverted,
    }"
  >
    <div v-if="!compact && (label || description)" class="theme-mode__copy">
      <p v-if="label" class="theme-mode__label">{{ label }}</p>
      <p v-if="description" class="theme-mode__description">{{ description }}</p>
    </div>

    <div class="theme-mode__track" role="group" :aria-label="label || '主题模式'">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="theme-mode__option"
        :class="{ 'theme-mode__option--active': modelValue === option.value }"
        :aria-pressed="modelValue === option.value"
        @click="emit('update:modelValue', option.value)"
      >
        <span class="theme-mode__title">{{ option.label }}</span>
        <span v-if="!compact" class="theme-mode__hint">{{ option.hint }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: "light" | "dark";
    compact?: boolean;
    label?: string;
    description?: string;
    inverted?: boolean;
  }>(),
  {
    compact: false,
    label: "",
    description: "",
    inverted: false,
  },
);

const emit = defineEmits<{
  (event: "update:modelValue", value: "light" | "dark"): void;
}>();

const options = [
  { value: "light", label: "浅色", hint: "清透" },
  { value: "dark", label: "深色", hint: "专注" },
] as const;
</script>

<style scoped>
.theme-mode {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.theme-mode__copy {
  min-width: 0;
}

.theme-mode__label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-text);
}

.theme-mode__description {
  margin: 4px 0 0;
  font-size: 0.84rem;
  line-height: 1.6;
  color: var(--muted-text);
}

.theme-mode__track {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 6px;
  border-radius: 22px;
  border: 1px solid color-mix(in srgb, var(--panel-border) 88%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--field-bg-strong) 94%, transparent),
      color-mix(in srgb, var(--field-bg) 88%, transparent)
    );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--panel-border) 44%, transparent),
    0 12px 28px rgba(15, 23, 42, 0.08);
}

.theme-mode__option {
  appearance: none;
  border: 0;
  min-height: 50px;
  padding: 0 14px;
  border-radius: 16px;
  background: transparent;
  color: var(--muted-text);
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 3px;
  font: inherit;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.theme-mode__option:hover {
  color: var(--strong-text);
  background: color-mix(in srgb, var(--field-bg) 72%, transparent);
}

.theme-mode__option:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-text) 72%, transparent);
  outline-offset: 2px;
}

.theme-mode__option--active {
  color: var(--strong-text);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-accent-soft) 62%, white 38%),
      color-mix(in srgb, var(--field-bg-strong) 88%, transparent)
    );
  box-shadow:
    0 10px 20px color-mix(in srgb, var(--primary-accent-soft) 92%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.theme-mode__title {
  font-size: 0.92rem;
  font-weight: 700;
  line-height: 1;
}

.theme-mode__hint {
  font-size: 0.72rem;
  line-height: 1;
  color: inherit;
  opacity: 0.78;
}

.theme-mode--compact {
  gap: 0;
}

.theme-mode--compact .theme-mode__track {
  padding: 4px;
  border-radius: 18px;
  min-width: 108px;
}

.theme-mode--compact .theme-mode__option {
  min-height: 36px;
  padding: 0 12px;
  gap: 0;
}

.theme-mode--compact .theme-mode__title {
  font-size: 0.8rem;
}

.theme-mode--inverted .theme-mode__label,
.theme-mode--inverted .theme-mode__description {
  color: var(--hero-muted);
}

.theme-mode--inverted .theme-mode__track {
  border-color: color-mix(in srgb, var(--hero-border) 100%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--hero-chip-bg) 68%, white 10%),
      color-mix(in srgb, var(--hero-chip-bg) 92%, transparent)
    );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--hero-border) 86%, transparent),
    0 16px 30px rgba(2, 6, 23, 0.16);
}

.theme-mode--inverted .theme-mode__option {
  color: var(--hero-muted);
}

.theme-mode--inverted .theme-mode__option:hover {
  color: var(--hero-text);
  background: color-mix(in srgb, var(--hero-chip-bg) 84%, white 10%);
}

.theme-mode--inverted .theme-mode__option--active {
  color: var(--hero-text);
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-accent-soft) 76%, white 24%),
      color-mix(in srgb, var(--hero-chip-bg) 76%, white 8%)
    );
  box-shadow:
    0 10px 22px color-mix(in srgb, var(--primary-accent-soft) 88%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.24);
}
</style>
