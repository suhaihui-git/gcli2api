import { defineStore } from "pinia";
import { computed, ref } from "vue";

const THEME_KEY = "gcli2api.panel.theme";

export const useUiStore = defineStore("ui", () => {
  const theme = ref<"light" | "dark">(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");

  const isDark = computed(() => theme.value === "dark");

  function setTheme(nextTheme: "light" | "dark") {
    theme.value = nextTheme;
    localStorage.setItem(THEME_KEY, theme.value);
  }

  function toggleTheme() {
    setTheme(isDark.value ? "light" : "dark");
  }

  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
  };
});
