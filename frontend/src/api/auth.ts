import { client } from "./client";
import type { AuthCallbackResponse, AuthStartResponse, CredMode, LoginResponse } from "./types";

export async function login(password: string) {
  const { data } = await client.post<LoginResponse>("/auth/login", { password });
  return data;
}

export async function startAuth(mode: CredMode, projectId?: string) {
  const payload = projectId ? { mode, project_id: projectId } : { mode };
  const { data } = await client.post<AuthStartResponse>("/auth/start", payload);
  return data;
}

export async function finishAuth(mode: CredMode, projectId?: string) {
  const payload = projectId ? { mode, project_id: projectId } : { mode };
  const { data } = await client.post<AuthCallbackResponse>("/auth/callback", payload);
  return data;
}

export async function finishAuthWithCallbackUrl(mode: CredMode, callbackUrl: string, projectId?: string) {
  const payload = projectId
    ? { mode, callback_url: callbackUrl, project_id: projectId }
    : { mode, callback_url: callbackUrl };
  const { data } = await client.post<AuthCallbackResponse>("/auth/callback-url", payload);
  return data;
}
