import { client } from "./client";
import type { GenericMessageResponse } from "./types";

export async function clearLogs() {
  const { data } = await client.post<GenericMessageResponse>("/logs/clear");
  return data;
}

export async function downloadLogs() {
  const { data } = await client.get<Blob>("/logs/download", {
    responseType: "blob",
  });
  return data;
}
