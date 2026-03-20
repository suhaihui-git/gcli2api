import { client } from "./client";
import type { ConfigGetResponse, ConfigSaveResponse } from "./types";

export async function getConfig() {
  const { data } = await client.get<ConfigGetResponse>("/config/get");
  return data;
}

export async function saveConfig(config: Record<string, unknown>) {
  const { data } = await client.post<ConfigSaveResponse>("/config/save", { config });
  return data;
}
