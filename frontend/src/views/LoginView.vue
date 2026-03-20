<template>
  <div class="login-shell" :class="{ 'login-shell--dark': uiStore.isDark }">
    <div class="login-shell__glow login-shell__glow--left"></div>
    <div class="login-shell__glow login-shell__glow--right"></div>
    <div class="login-shell__grid">
      <section class="login-brand">
        <div class="login-brand__badge">su2api console</div>
        <h1 class="login-brand__title">统一代理控制台</h1>
        <p class="login-brand__description">
          在一套界面里管理 GeminiCLI、Antigravity 与 Codex 凭证，让授权、运维、日志和配置形成闭环。
        </p>

        <div class="login-brand__chips">
          <span class="login-chip">OpenAI Compatible</span>
          <span class="login-chip">Gemini Native</span>
          <span class="login-chip">Anthropic Compatible</span>
        </div>

        <div class="login-brand__matrix">
          <div class="login-brand__panel">
            <p class="login-brand__panel-label">01</p>
            <p class="login-brand__panel-title">统一凭证入口</p>
            <p class="login-brand__panel-desc">上传、校验、启停、批量处置都在同一条运维路径里完成。</p>
          </div>
          <div class="login-brand__panel">
            <p class="login-brand__panel-label">02</p>
            <p class="login-brand__panel-title">接口格式兼容</p>
            <p class="login-brand__panel-desc">下游可继续按 OpenAI、Gemini Native、Anthropic 风格接入。</p>
          </div>
          <div class="login-brand__panel">
            <p class="login-brand__panel-label">03</p>
            <p class="login-brand__panel-title">面向日常运维</p>
            <p class="login-brand__panel-desc">授权、日志和系统配置都围绕真实后端接口组织，不做空壳展示。</p>
          </div>
        </div>
      </section>

      <section class="login-panel">
        <div class="login-panel__header">
          <div class="min-w-0">
            <p class="login-panel__eyebrow">Panel Access</p>
            <h2 class="login-panel__title">登录控制台</h2>
            <p class="login-panel__description">使用面板密码进入新的管理前端。</p>
          </div>
          <theme-mode-switch compact :model-value="uiStore.theme" @update:model-value="uiStore.setTheme" />
        </div>

        <form class="login-form" @submit.prevent="handleSubmit">
          <label class="login-label" for="panel-password">面板密码</label>
          <div class="login-input-shell">
            <span class="login-input-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4.5" y="10.5" width="15" height="10" rx="2.5"></rect>
                <path d="M8 10.5V8a4 4 0 1 1 8 0v2.5"></path>
              </svg>
            </span>
            <input
              id="panel-password"
              v-model="password"
              class="login-input"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入 panel password"
              autocomplete="current-password"
            />
            <button type="button" class="login-input-toggle" @click="showPassword = !showPassword">
              {{ showPassword ? "隐藏" : "显示" }}
            </button>
          </div>

          <div class="login-form__meta">
            <p class="login-form__hint">
              {{ redirectHint || "登录后可继续进行凭证管理、OAuth 授权和系统配置。" }}
            </p>
          </div>

          <button type="submit" class="login-submit" :disabled="submitting">
            <span v-if="submitting">进入中...</span>
            <span v-else>进入控制台</span>
          </button>
        </form>

        <div class="login-panel__footer">
          <div class="login-note">
            <p class="login-note__label">访问提示</p>
            <p class="login-note__text">控制台密码只用于面板登录，下游 API 调用仍按服务端接口密码鉴权。</p>
          </div>
          <div class="login-note">
            <p class="login-note__label">当前模式</p>
            <p class="login-note__text">{{ uiStore.isDark ? "深色视图已启用" : "浅色视图已启用" }}</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AxiosError } from "axios";
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import ThemeModeSwitch from "@/components/common/ThemeModeSwitch.vue";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { message } from "@/utils/feedback";

const authStore = useAuthStore();
const uiStore = useUiStore();
const route = useRoute();
const router = useRouter();

const password = ref("");
const showPassword = ref(false);
const submitting = ref(false);

const redirectHint = computed(() => {
  const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "";
  if (!redirect || redirect === "/dashboard") {
    return "";
  }
  return `登录后将返回 ${redirect}`;
});

async function handleSubmit() {
  if (submitting.value) {
    return;
  }
  if (!password.value.trim()) {
    message.warning("请输入密码");
    return;
  }

  submitting.value = true;
  try {
    await authStore.login(password.value.trim());
    message.success("登录成功");
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/dashboard";
    await router.push(redirect);
  } catch (error) {
    const axiosError = error as AxiosError<{ detail?: string }>;
    message.error(axiosError.response?.data?.detail || "登录失败");
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.login-shell {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px 18px;
  overflow: hidden;
  --login-glow-left: radial-gradient(circle, rgba(14, 165, 233, 0.14), transparent 70%);
  --login-glow-right: radial-gradient(circle, rgba(45, 212, 191, 0.1), transparent 68%);
  --login-brand-border: color-mix(in srgb, var(--primary-accent-border) 68%, transparent);
  --login-brand-bg:
    radial-gradient(circle at 88% 18%, rgba(125, 211, 252, 0.18), transparent 28%),
    radial-gradient(circle at 14% 78%, rgba(14, 165, 233, 0.08), transparent 24%),
    linear-gradient(145deg, #f9fcff 0%, #edf5fb 54%, #dceaf5 100%);
  --login-brand-shadow:
    0 28px 80px rgba(15, 23, 42, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  --login-brand-text: var(--strong-text);
  --login-brand-muted: color-mix(in srgb, var(--muted-text) 92%, transparent);
  --login-grid-line: rgba(14, 165, 233, 0.08);
  --login-brand-orb-primary: rgba(56, 189, 248, 0.16);
  --login-brand-orb-secondary: rgba(45, 212, 191, 0.12);
  --login-badge-bg: color-mix(in srgb, var(--field-bg-strong) 96%, transparent);
  --login-badge-border: color-mix(in srgb, var(--primary-accent-border) 82%, transparent);
  --login-badge-text: var(--accent-text);
  --login-chip-bg: color-mix(in srgb, var(--primary-accent-soft) 52%, white 48%);
  --login-chip-border: color-mix(in srgb, var(--primary-accent-border) 56%, transparent);
  --login-chip-text: var(--strong-text);
  --login-brand-panel-bg: rgba(255, 255, 255, 0.46);
  --login-brand-panel-border: color-mix(in srgb, var(--panel-border) 86%, transparent);
  --login-brand-panel-label: var(--accent-text);
  --login-brand-panel-title: var(--strong-text);
  --login-brand-panel-desc: var(--muted-text);
}

.login-shell--dark {
  --login-glow-left: radial-gradient(circle, rgba(14, 165, 233, 0.24), transparent 70%);
  --login-glow-right: radial-gradient(circle, rgba(20, 184, 166, 0.2), transparent 68%);
  --login-brand-border: rgba(125, 211, 252, 0.18);
  --login-brand-bg:
    radial-gradient(circle at 88% 18%, rgba(45, 212, 191, 0.16), transparent 28%),
    radial-gradient(circle at 16% 82%, rgba(14, 165, 233, 0.14), transparent 24%),
    linear-gradient(145deg, #07131e 0%, #0d2231 54%, #14384d 100%);
  --login-brand-shadow:
    0 28px 80px rgba(2, 6, 23, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  --login-brand-text: #f8fafc;
  --login-brand-muted: rgba(226, 232, 240, 0.8);
  --login-grid-line: rgba(125, 211, 252, 0.09);
  --login-brand-orb-primary: rgba(56, 189, 248, 0.22);
  --login-brand-orb-secondary: rgba(45, 212, 191, 0.16);
  --login-badge-bg: rgba(255, 255, 255, 0.08);
  --login-badge-border: rgba(125, 211, 252, 0.22);
  --login-badge-text: rgba(186, 230, 253, 0.88);
  --login-chip-bg: rgba(255, 255, 255, 0.08);
  --login-chip-border: rgba(255, 255, 255, 0.08);
  --login-chip-text: rgba(240, 249, 255, 0.86);
  --login-brand-panel-bg: rgba(8, 20, 31, 0.56);
  --login-brand-panel-border: rgba(125, 211, 252, 0.12);
  --login-brand-panel-label: rgba(125, 211, 252, 0.78);
  --login-brand-panel-title: #f8fafc;
  --login-brand-panel-desc: rgba(226, 232, 240, 0.76);
}

.login-shell__glow {
  position: absolute;
  width: 320px;
  height: 320px;
  border-radius: 999px;
  filter: blur(30px);
  opacity: 0.5;
  pointer-events: none;
}

.login-shell__glow--left {
  left: -80px;
  bottom: 10%;
  background: var(--login-glow-left);
}

.login-shell__glow--right {
  right: -60px;
  top: 6%;
  background: var(--login-glow-right);
}

.login-shell__grid {
  position: relative;
  z-index: 1;
  width: min(1120px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(360px, 430px);
  gap: 24px;
  align-items: stretch;
}

.login-brand {
  position: relative;
  overflow: hidden;
  isolation: isolate;
  min-height: 560px;
  border-radius: 36px;
  padding: 36px;
  border: 1px solid var(--login-brand-border);
  background: var(--login-brand-bg);
  box-shadow: var(--login-brand-shadow);
  color: var(--login-brand-text);
}

.login-brand::before,
.login-brand::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.login-brand::before {
  background:
    linear-gradient(var(--login-grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--login-grid-line) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(circle at center, rgba(0, 0, 0, 0.85), transparent 85%);
  opacity: 0.48;
}

.login-brand::after {
  background:
    radial-gradient(circle at 18% 24%, var(--login-brand-orb-primary), transparent 24%),
    radial-gradient(circle at 82% 78%, var(--login-brand-orb-secondary), transparent 26%);
}

.login-brand__badge {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--login-badge-border);
  background: var(--login-badge-bg);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--login-badge-text);
}

.login-brand__title {
  position: relative;
  z-index: 1;
  margin: 22px 0 0;
  max-width: 9ch;
  font-size: clamp(2.6rem, 6vw, 4.8rem);
  line-height: 0.94;
  font-weight: 800;
  letter-spacing: -0.04em;
}

.login-brand__description {
  position: relative;
  z-index: 1;
  max-width: 540px;
  margin: 20px 0 0;
  font-size: 1rem;
  line-height: 1.9;
  color: var(--login-brand-muted);
}

.login-brand__chips {
  position: relative;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}

.login-chip {
  display: inline-flex;
  align-items: center;
  min-height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: var(--login-chip-bg);
  border: 1px solid var(--login-chip-border);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--login-chip-text);
}

.login-brand__matrix {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 14px;
  margin-top: 30px;
}

.login-brand__panel {
  border-radius: 24px;
  border: 1px solid var(--login-brand-panel-border);
  background: var(--login-brand-panel-bg);
  padding: 18px 18px 16px;
  backdrop-filter: blur(16px);
}

.login-brand__panel-label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--login-brand-panel-label);
}

.login-brand__panel-title {
  margin: 10px 0 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--login-brand-panel-title);
}

.login-brand__panel-desc {
  margin: 8px 0 0;
  font-size: 0.9rem;
  line-height: 1.8;
  color: var(--login-brand-panel-desc);
}

.login-panel {
  min-height: 560px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  border-radius: 32px;
  padding: 28px;
  backdrop-filter: blur(24px);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--panel-bg) 96%, white 4%),
      color-mix(in srgb, var(--panel-bg) 88%, transparent)
    );
  border: 1px solid color-mix(in srgb, var(--panel-border) 82%, transparent);
  box-shadow: var(--panel-shadow);
}

.login-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.login-panel__eyebrow {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted-text);
}

.login-panel__title {
  margin: 12px 0 0;
  font-size: 2rem;
  line-height: 1;
  font-weight: 700;
  color: var(--strong-text);
}

.login-panel__description {
  margin: 12px 0 0;
  font-size: 0.95rem;
  line-height: 1.8;
  color: var(--muted-text);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--strong-text);
}

.login-input-shell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 64px;
  padding: 0 14px 0 16px;
  border-radius: 22px;
  background: color-mix(in srgb, var(--field-bg-strong) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--field-border) 100%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--panel-border) 28%, transparent),
    0 14px 28px rgba(15, 23, 42, 0.06);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    background-color 0.18s ease;
}

.login-input-shell:focus-within {
  border-color: color-mix(in srgb, var(--field-border-strong) 100%, transparent);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--primary-accent-soft) 100%, transparent),
    0 18px 32px rgba(15, 23, 42, 0.08);
}

.login-input-icon {
  display: inline-flex;
  width: 20px;
  height: 20px;
  color: var(--accent-text);
  flex: none;
}

.login-input-icon svg {
  width: 100%;
  height: 100%;
}

.login-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--strong-text);
  font: inherit;
  font-size: 1rem;
}

.login-input::placeholder {
  color: var(--muted-text);
}

.login-input-toggle {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--muted-text);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  min-width: 44px;
  flex: none;
}

.login-input-toggle:hover {
  color: var(--strong-text);
}

.login-form__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.login-form__hint {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.7;
  color: var(--muted-text);
}

.login-submit {
  appearance: none;
  min-height: 58px;
  border: 0;
  border-radius: 22px;
  background: linear-gradient(135deg, var(--primary-accent), var(--primary-accent-hover));
  color: #eff6ff;
  font: inherit;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow:
    0 18px 36px color-mix(in srgb, var(--primary-accent-soft) 100%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.24);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    filter 0.18s ease;
}

.login-submit:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: saturate(1.08);
}

.login-submit:disabled {
  cursor: default;
  opacity: 0.76;
}

.login-panel__footer {
  display: grid;
  gap: 12px;
}

.login-note {
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--panel-border) 84%, transparent);
  background: color-mix(in srgb, var(--soft-surface) 92%, white 8%);
  padding: 14px 16px;
}

.login-note__label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-text);
}

.login-note__text {
  margin: 8px 0 0;
  font-size: 0.88rem;
  line-height: 1.75;
  color: var(--strong-text);
}

@media (max-width: 1024px) {
  .login-shell__grid {
    grid-template-columns: 1fr;
  }

  .login-brand,
  .login-panel {
    min-height: auto;
  }
}

@media (max-width: 640px) {
  .login-shell {
    padding: 18px 14px;
  }

  .login-brand,
  .login-panel {
    border-radius: 26px;
    padding: 22px 18px;
  }

  .login-brand__title {
    font-size: clamp(2.2rem, 13vw, 3.4rem);
  }

  .login-panel__header {
    flex-direction: column;
    align-items: stretch;
  }

  .login-input-shell {
    min-height: 58px;
  }

  .login-submit {
    min-height: 54px;
  }
}
</style>
