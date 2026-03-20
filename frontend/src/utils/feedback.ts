import { createDiscreteApi, darkTheme } from "naive-ui";

import { createNaiveThemeOverrides } from "@/theme/naive";

function resolveThemeMode() {
  if (typeof document === "undefined") {
    return "light" as const;
  }
  return document.body.classList.contains("theme-dark") ? ("dark" as const) : ("light" as const);
}

function createThemedDiscreteApi(isDark: boolean) {
  return createDiscreteApi(["message", "dialog", "notification"], {
    configProviderProps: {
      theme: isDark ? darkTheme : null,
      themeOverrides: createNaiveThemeOverrides(isDark),
    },
  });
}

const discreteCache = new Map<"light" | "dark", ReturnType<typeof createThemedDiscreteApi>>();

function getDiscreteApi() {
  const mode = resolveThemeMode();
  const cached = discreteCache.get(mode);
  if (cached) {
    return cached;
  }
  const created = createThemedDiscreteApi(mode === "dark");
  discreteCache.set(mode, created);
  return created;
}

function createApiProxy<T extends "message" | "dialog" | "notification">(
  key: T,
): ReturnType<typeof getDiscreteApi>[T] {
  return new Proxy({} as ReturnType<typeof getDiscreteApi>[T], {
    get(_target, prop) {
      const api = getDiscreteApi()[key] as unknown as Record<string | symbol, unknown>;
      const value = api[prop];
      if (typeof value === "function") {
        return (value as (...args: unknown[]) => unknown).bind(api);
      }
      return value;
    },
  });
}

const message = createApiProxy("message");
const dialog = createApiProxy("dialog");
const notification = createApiProxy("notification");

export { dialog, message, notification };
