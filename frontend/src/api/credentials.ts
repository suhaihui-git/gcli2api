import { client } from "./client";
import type {
  BatchUsageResponse,
  ChatResponse,
  CredAction,
  CredListResponse,
  CredMode,
  CredentialDetailResponse,
  CredentialErrorsResponse,
  CredentialQuotaResponse,
  GenericMessageResponse,
  UploadResponse,
} from "./types";
import { useAuthStore } from "@/stores/auth";

interface ListOptions {
  offset?: number;
  limit?: number;
  status_filter?: string;
  error_code_filter?: string;
  cooldown_filter?: string;
  preview_filter?: string;
  tier_filter?: string;
}

interface DownloadCredentialResult {
  blob: Blob;
  filename: string | null;
}

function modeQuery(mode: CredMode) {
  return { mode };
}

function assertNotPanelAuthFailure(status: number, data: unknown) {
  const payload = data as { detail?: string } | undefined;
  if (status === 401 && payload?.detail === "密码错误") {
    useAuthStore().logout();
    throw new Error("密码错误");
  }
}

function parseContentDispositionFilename(contentDisposition?: string): string | null {
  if (!contentDisposition) {
    return null;
  }

  const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = contentDisposition.match(/filename\s*=\s*"?([^\";]+)"?/i);
  return plainMatch?.[1] ?? null;
}

export async function getCredentialStatus(mode: CredMode, options: ListOptions = {}) {
  const { data } = await client.get<CredListResponse>("/creds/status", {
    params: {
      offset: options.offset ?? 0,
      limit: options.limit ?? 20,
      status_filter: options.status_filter ?? "all",
      error_code_filter: options.error_code_filter ?? "all",
      cooldown_filter: options.cooldown_filter ?? "all",
      preview_filter: options.preview_filter ?? "all",
      tier_filter: options.tier_filter ?? "all",
      ...modeQuery(mode),
    },
  });
  return data;
}

export async function getCredentialDetail(mode: CredMode, filename: string) {
  const { data } = await client.get<CredentialDetailResponse>(
    `/creds/detail/${encodeURIComponent(filename)}`,
    { params: modeQuery(mode) },
  );
  return data;
}

export async function getCredentialErrors(mode: CredMode, filename: string) {
  const { data } = await client.get<CredentialErrorsResponse>(
    `/creds/errors/${encodeURIComponent(filename)}`,
    { params: modeQuery(mode) },
  );
  return data;
}

export async function getCredentialQuota(filename: string) {
  const response = await client.get<CredentialQuotaResponse>(
    `/creds/quota/${encodeURIComponent(filename)}`,
    {
      params: modeQuery("antigravity"),
      validateStatus: (status) => status < 500,
    },
  );
  assertNotPanelAuthFailure(response.status, response.data);
  return response.data;
}

export async function setCredentialAction(mode: CredMode, filename: string, action: CredAction) {
  const { data } = await client.post<GenericMessageResponse>(
    "/creds/action",
    { filename, action },
    { params: modeQuery(mode) },
  );
  return data;
}

export async function batchCredentialAction(mode: CredMode, action: CredAction, filenames: string[]) {
  const { data } = await client.post<GenericMessageResponse>(
    "/creds/batch-action",
    { action, filenames },
    { params: modeQuery(mode) },
  );
  return data;
}

export async function uploadCredentials(mode: CredMode, files: File[], onProgress?: (percent: number) => void) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  const { data } = await client.post<UploadResponse>("/creds/upload", formData, {
    params: modeQuery(mode),
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (event.total && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return data;
}

export async function downloadCredential(mode: CredMode, filename: string): Promise<DownloadCredentialResult> {
  const response = await client.get<Blob>(`/creds/download/${encodeURIComponent(filename)}`, {
    params: modeQuery(mode),
    responseType: "blob",
  });
  return {
    blob: response.data,
    filename: parseContentDispositionFilename(response.headers["content-disposition"]),
  };
}

export async function downloadAllCredentials(mode: CredMode) {
  const { data } = await client.get<Blob>("/creds/download-all", {
    params: modeQuery(mode),
    responseType: "blob",
  });
  return data;
}

export async function fetchCredentialEmail(mode: CredMode, filename: string) {
  const response = await client.post<GenericMessageResponse>(
    `/creds/fetch-email/${encodeURIComponent(filename)}`,
    undefined,
    {
      params: modeQuery(mode),
      validateStatus: (status) => status < 500,
    },
  );
  assertNotPanelAuthFailure(response.status, response.data);
  return response.data;
}

export async function refreshAllEmails(mode: CredMode) {
  const { data } = await client.post<GenericMessageResponse>(
    "/creds/refresh-all-emails",
    undefined,
    { params: modeQuery(mode) },
  );
  return data;
}

export async function deduplicateByEmail(mode: CredMode) {
  const { data } = await client.post<GenericMessageResponse>(
    "/creds/deduplicate-by-email",
    undefined,
    { params: modeQuery(mode) },
  );
  return data;
}

export async function verifyCredentialProject(mode: "geminicli" | "antigravity", filename: string) {
  const { data } = await client.post<GenericMessageResponse>(
    `/creds/verify-project/${encodeURIComponent(filename)}`,
    undefined,
    { params: modeQuery(mode) },
  );
  return data;
}

export async function configurePreview(filename: string) {
  const { data } = await client.post<GenericMessageResponse>(
    `/creds/configure-preview/${encodeURIComponent(filename)}`,
    undefined,
    { params: modeQuery("geminicli") },
  );
  return data;
}

export async function testCredential(mode: CredMode, filename: string) {
  const response = await client.post<GenericMessageResponse>(
    `/creds/test/${encodeURIComponent(filename)}`,
    undefined,
    {
      params: modeQuery(mode),
      validateStatus: (status) => status < 500,
    },
  );
  assertNotPanelAuthFailure(response.status, response.data);
  return response.data;
}

export async function chatWithCredential(mode: CredMode, filename: string, model: string, message: string) {
  const { data } = await client.post<ChatResponse>(
    `/creds/chat/${encodeURIComponent(filename)}`,
    { model, message },
    { params: modeQuery(mode) },
  );
  return data;
}

export async function getCodexUsage(filename: string) {
  const response = await client.get(`/creds/codex-usage/${encodeURIComponent(filename)}`, {
    params: modeQuery("codex"),
    validateStatus: (status) => status < 500,
  });
  assertNotPanelAuthFailure(response.status, response.data);
  return response.data;
}

export async function batchGetCodexUsage(filenames?: string[]) {
  const { data } = await client.post<BatchUsageResponse>(
    "/creds/codex-usage/batch",
    { filenames },
    {
      params: {
        ...modeQuery("codex"),
        all_pages: filenames && filenames.length > 0 ? "false" : "true",
      },
    },
  );
  return data;
}
