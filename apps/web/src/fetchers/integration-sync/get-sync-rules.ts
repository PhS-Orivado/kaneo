import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncScope } from "./types";

<<<<<<< HEAD
export default async function getSyncRules(param: SyncParams, after?: string) {
  const response = await client["integration-sync"].project[":projectId"][
    ":provider"
  ].$get({ param, query: after ? { after } : {} });
  if (!response.ok) throw await HttpError.fromResponse(response);
=======
export default async function getSyncRules(scope: SyncScope, after?: string) {
  const response =
    scope.kind === "binding"
      ? await client["integration-sync"].integration[":integrationId"].$get({
          param: { integrationId: scope.integrationId },
          query: after ? { after } : {},
        })
      : await client["integration-sync"].project[":projectId"][
          ":provider"
        ].$get({
          param: {
            projectId: scope.projectId,
            provider: scope.provider,
          },
          query: after ? { after } : {},
        });
  if (!response.ok) throw new HttpError(response.status, await response.text());
>>>>>>> 0d3149e38b9ca5b66b6f032dce0422cc354a3250
  return response.json();
}
