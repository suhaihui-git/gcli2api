export function formatTimestamp(input?: number | null) {
  if (!input) {
    return "暂无记录";
  }

  const date = new Date(input * 1000);
  if (Number.isNaN(date.getTime())) {
    return "时间格式错误";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes)) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatCooldown(targetSeconds: number) {
  const seconds = Math.max(0, Math.floor(targetSeconds));
  const day = Math.floor(seconds / 86400);
  const hour = Math.floor((seconds % 86400) / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  const second = seconds % 60;
  const parts = [
    day ? `${day}天` : "",
    hour ? `${hour}小时` : "",
    minute ? `${minute}分` : "",
    second || (day === 0 && hour === 0 && minute === 0) ? `${second}秒` : "",
  ].filter(Boolean);

  return parts.join(" ");
}

export function formatPercent(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return `${Number(value).toFixed(1)}%`;
}

export function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}
