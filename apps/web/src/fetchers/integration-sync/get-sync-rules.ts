import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncScope } from "./types";

export default async function getSyncRules(scope: SyncScope, after?: string) {
  const response =
    scope.kind === "binding"
      ? await client["integration-sync"].integration[
          ":integrationId"
        ].$get({
          param: { integrationId: scope.integrationId },
          query: after ? { after } : {},
        })
      : await client["integration-sync"].project[":projectId"][":provider"].$get(
          {
            param: {
              projectId: scope.projectId,
              provider: scope.provider,
            },
            query: after ? { after } : {},
          },
        );
  if (!response.ok) throw new HttpError(response.status, await response.text());
  return response.json();
}
