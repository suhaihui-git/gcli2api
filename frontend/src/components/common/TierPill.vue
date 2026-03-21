<template>
  <span class="tier-pill" :class="`tier-pill--${tier}`">
    <span class="tier-pill__mark" aria-hidden="true">{{ marker }}</span>
    <span class="tier-pill__label">{{ tier.toUpperCase() }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  tier: "free" | "pro" | "ultra";
}>();

const marker = computed(() => {
  if (props.tier === "ultra") {
    return "U";
  }
  if (props.tier === "pro") {
    return "P";
  }
  return "F";
});
</script>

<style scoped>
.tier-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 24px;
  padding: 0 10px 0 7px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 8px 16px rgba(15, 23, 42, 0.08);
}

.tier-pill__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  font-size: 0.58rem;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.tier-pill__label {
  display: inline-flex;
  align-items: center;
}

.tier-pill--free {
  background:
    linear-gradient(135deg, rgba(241, 245, 249, 0.96), rgba(226, 232, 240, 0.9));
  border-color: rgba(148, 163, 184, 0.32);
  color: #475569;
}

.tier-pill--free .tier-pill__mark {
  background: rgba(255, 255, 255, 0.92);
  color: #64748b;
  border: 1px solid rgba(148, 163, 184, 0.28);
}

.tier-pill--pro {
  background:
    linear-gradient(135deg, rgba(6, 182, 212, 0.22), rgba(14, 165, 233, 0.16)),
    linear-gradient(135deg, rgba(236, 254, 255, 0.96), rgba(224, 242, 254, 0.92));
  border-color: rgba(14, 165, 233, 0.3);
  color: #0369a1;
}

.tier-pill--pro .tier-pill__mark {
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.9), rgba(6, 182, 212, 0.82));
  color: #f8fafc;
  box-shadow: 0 6px 12px rgba(14, 165, 233, 0.24);
}

.tier-pill--ultra {
  background:
    linear-gradient(135deg, rgba(244, 114, 182, 0.18), rgba(249, 115, 22, 0.22)),
    linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(168, 85, 247, 0.88));
  border-color: rgba(168, 85, 247, 0.34);
  color: #fff7ed;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    0 10px 20px rgba(99, 102, 241, 0.18);
}

.tier-pill--ultra .tier-pill__mark {
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.22);
}

body.theme-dark .tier-pill {
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.06),
    0 10px 18px rgba(2, 6, 23, 0.2);
}

body.theme-dark .tier-pill--free {
  background:
    linear-gradient(135deg, rgba(51, 65, 85, 0.96), rgba(30, 41, 59, 0.92));
  border-color: rgba(100, 116, 139, 0.38);
  color: #cbd5e1;
}

body.theme-dark .tier-pill--free .tier-pill__mark {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  border-color: rgba(148, 163, 184, 0.24);
}

body.theme-dark .tier-pill--pro {
  background:
    linear-gradient(135deg, rgba(8, 145, 178, 0.3), rgba(2, 132, 199, 0.22)),
    linear-gradient(135deg, rgba(14, 116, 144, 0.78), rgba(3, 105, 161, 0.72));
  border-color: rgba(34, 211, 238, 0.3);
  color: #ecfeff;
}

body.theme-dark .tier-pill--pro .tier-pill__mark {
  background: rgba(255, 255, 255, 0.12);
  color: #f0f9ff;
}

body.theme-dark .tier-pill--ultra {
  background:
    linear-gradient(135deg, rgba(249, 115, 22, 0.28), rgba(236, 72, 153, 0.28)),
    linear-gradient(135deg, rgba(79, 70, 229, 0.84), rgba(168, 85, 247, 0.82));
  border-color: rgba(244, 114, 182, 0.3);
  color: #fff7ed;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 12px 22px rgba(76, 29, 149, 0.26);
}

body.theme-dark .tier-pill--ultra .tier-pill__mark {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
}
</style>
