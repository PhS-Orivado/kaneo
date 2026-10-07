import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncRules, SyncScope } from "./types";

export default async function previewSyncRules(
  scope: SyncScope,
  rules: SyncRules,
) {
  const response =
    scope.kind === "binding"
      ? await client["integration-sync"].integration[
          ":integrationId"
        ].preview.$post({
          param: { integrationId: scope.integrationId },
          json: { rules },
        })
      : await client["integration-sync"].project[":projectId"][
          ":provider"
        ].preview.$post({
          param: {
            projectId: scope.projectId,
            provider: scope.provider,
          },
          json: { rules },
        });
  if (!response.ok) throw new HttpError(response.status, await response.text());
  return response.json();
}
