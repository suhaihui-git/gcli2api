export type CredMode = "geminicli" | "antigravity" | "codex";
export type StatusFilter = "all" | "enabled" | "disabled";
export type CooldownFilter = "all" | "in_cooldown" | "no_cooldown";
export type PreviewFilter = "all" | "preview" | "no_preview";
export type TierFilter = "all" | "free" | "pro" | "ultra";
export type CredAction = "enable" | "disable" | "delete";

export interface LoginResponse {
  token: string;
  message: string;
}

export interface VersionInfo {
  success: boolean;
  version: string;
  full_hash?: string;
  message?: string;
  date?: string;
}

export interface AuthStartResponse {
  auth_url: string;
  state: string;
  auto_project_detection?: boolean;
  detected_project_id?: string | null;
}

export interface AuthProject {
  name: string;
  project_id: string;
}

export interface AuthCallbackResponse {
  credentials?: Record<string, unknown>;
  file_path?: string;
  message?: string;
  error?: string;
  auto_detected_project?: boolean;
  requires_manual_project_id?: boolean;
  requires_project_selection?: boolean;
  available_projects?: AuthProject[];
}

export interface ConfigGetResponse {
  config: Record<string, unknown>;
  env_locked: string[];
}

export interface ConfigSaveResponse {
  message: string;
  saved_config?: Record<string, unknown>;
}

export interface CodexUsageResult {
  filename: string;
  status_code?: number | null;
  ok?: boolean;
  used_percent?: number | null;
  reset_text?: string;
  plan_type?: string | null;
  allowed?: boolean | null;
  limit_reached?: boolean | null;
  body?: unknown;
  body_text?: string | null;
  body_parsed?: boolean;
  account_id?: string | null;
  email?: string | null;
  updated_at?: number;
}

export interface CredentialSummary {
  filename: string;
  user_email: string | null;
  disabled: boolean;
  error_codes: Array<number | string>;
  last_success: number | null;
  backend_type: string;
  model_cooldowns: Record<string, number>;
  preview?: boolean;
  tier: "free" | "pro" | "ultra";
  usage_result?: CodexUsageResult | null;
}

export interface CredStats {
  total: number;
  normal: number;
  disabled: number;
}

export interface CredListResponse {
  items: CredentialSummary[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
  stats: CredStats;
}

export interface CredentialDetailResponse {
  filename: string;
  status: {
    disabled: boolean;
    error_codes: Array<number | string>;
    last_success?: number | null;
    user_email?: string | null;
  };
  content: Record<string, unknown>;
  backend_type: string;
  user_email?: string | null;
  model_cooldowns?: Record<string, number>;
  preview?: boolean;
  size?: number;
  modified_time?: number;
}

export interface CredentialErrorsResponse {
  error_codes?: Array<number | string>;
  error_messages?: Record<string, string>;
}

export interface CredentialQuotaResponse {
  success: boolean;
  filename: string;
  models?: Record<string, unknown>;
  error?: string;
}

export interface UploadResponse {
  uploaded_count: number;
  total_count: number;
  message: string;
  results: Array<{
    filename: string;
    status: "success" | "error";
    message: string;
  }>;
}

export interface GenericMessageResponse {
  message: string;
  [key: string]: unknown;
}

export interface BatchUsageResponse {
  success: boolean;
  results: CodexUsageResult[];
  processed: number;
  total: number;
  success_count: number;
  failed_count: number;
  failed_filenames: string[];
  concurrency_limit: number;
  message: string;
}

export interface ChatResponse {
  success: boolean;
  text?: string;
  error?: string;
}
