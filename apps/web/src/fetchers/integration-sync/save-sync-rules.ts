import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncRules, SyncScope } from "./types";

export default async function saveSyncRules(
  scope: SyncScope,
  rules: SyncRules,
  previewToken: string,
) {
  const response =
    scope.kind === "binding"
      ? await client["integration-sync"].integration[
          ":integrationId"
        ].$patch({
          param: { integrationId: scope.integrationId },
          json: { rules, previewToken },
        })
      : await client["integration-sync"].project[":projectId"][":provider"].$patch(
          {
            param: {
              projectId: scope.projectId,
              provider: scope.provider,
            },
            json: { rules, previewToken },
          },
        );
  if (!response.ok) throw new HttpError(response.status, await response.text());
  return response.json();
}
