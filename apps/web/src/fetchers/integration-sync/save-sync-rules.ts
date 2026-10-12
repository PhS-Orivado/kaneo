import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncRules, SyncScope } from "./types";

export default async function saveSyncRules(
  scope: SyncScope,
  rules: SyncRules,
  previewToken: string,
) {
<<<<<<< HEAD
  const response = await client["integration-sync"].project[":projectId"][
    ":provider"
  ].$patch({ param, json: { rules, previewToken } });
  if (!response.ok) throw await HttpError.fromResponse(response);
=======
  const response =
    scope.kind === "binding"
      ? await client["integration-sync"].integration[":integrationId"].$patch({
          param: { integrationId: scope.integrationId },
          json: { rules, previewToken },
        })
      : await client["integration-sync"].project[":projectId"][
          ":provider"
        ].$patch({
          param: {
            projectId: scope.projectId,
            provider: scope.provider,
          },
          json: { rules, previewToken },
        });
  if (!response.ok) throw new HttpError(response.status, await response.text());
>>>>>>> 0d3149e38b9ca5b66b6f032dce0422cc354a3250
  return response.json();
}
