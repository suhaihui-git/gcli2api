import { client } from "./client";
import type { VersionInfo } from "./types";

export async function getVersionInfo() {
  const { data } = await client.get<VersionInfo>("/version/info");
  return data;
}
