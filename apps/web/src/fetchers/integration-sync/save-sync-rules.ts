import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncRules, SyncScope } from "./types";

export default async function saveSyncRules(
  scope: SyncScope,
  rules: SyncRules,
  previewToken: string,
) {
  const response = await client["integration-sync"].project[":projectId"][
    ":provider"
  ].$patch({ param, json: { rules, previewToken } });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
