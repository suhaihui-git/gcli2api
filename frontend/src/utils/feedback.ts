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

interface ConfirmDialogOptions {
  title: string;
  content: string;
  positiveText?: string;
  negativeText?: string;
  type?: "warning" | "error" | "info" | "success";
}

function confirmDialog(options: ConfirmDialogOptions) {
  return new Promise<boolean>((resolve) => {
    let settled = false;

    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    const variant = options.type ?? "warning";
    const api = dialog[variant] as (config: Record<string, unknown>) => unknown;

    api({
      title: options.title,
      content: options.content,
      positiveText: options.positiveText ?? "确认",
      negativeText: options.negativeText ?? "取消",
      maskClosable: false,
      closeOnEsc: false,
      onPositiveClick: () => finish(true),
      onNegativeClick: () => finish(false),
      onClose: () => finish(false),
    });
  });
}

export { confirmDialog, dialog, message, notification };
