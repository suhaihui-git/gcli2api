import type { AxiosError } from "axios";

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function getErrorMessage(error: unknown, fallback = "请求失败") {
  const axiosError = error as AxiosError<{ detail?: string; error?: string; message?: string }>;
  return (
    axiosError.response?.data?.detail ||
    axiosError.response?.data?.error ||
    axiosError.response?.data?.message ||
    axiosError.message ||
    fallback
  );
}

export function buildLogsWsUrl(token: string) {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/logs/stream?token=${encodeURIComponent(token)}`;
}
