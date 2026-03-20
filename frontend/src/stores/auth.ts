import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { login as loginApi } from "@/api/auth";

const AUTH_TOKEN_KEY = "gcli2api.panel.token";

export const useAuthStore = defineStore("auth", () => {
  const token = ref("");
  const initialized = ref(false);

  const isAuthenticated = computed(() => Boolean(token.value));

  function bootstrap() {
    if (initialized.value) {
      return;
    }

    token.value = localStorage.getItem(AUTH_TOKEN_KEY) || "";
    initialized.value = true;
  }

  async function login(password: string) {
    const result = await loginApi(password);
    token.value = result.token;
    initialized.value = true;
    localStorage.setItem(AUTH_TOKEN_KEY, result.token);
  }

  function logout() {
    token.value = "";
    initialized.value = true;
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }

  return { token, initialized, isAuthenticated, bootstrap, login, logout };
});
