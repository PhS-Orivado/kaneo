import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncScope } from "./types";

export default async function reviewSyncResume(
  scope: SyncScope,
  linkId: string,
  signal?: AbortSignal,
) {
  const response =
    scope.kind === "binding"
      ? await client["integration-sync"].integration[
          ":integrationId"
        ].links[":linkId"].review.$get(
          {
            param: { integrationId: scope.integrationId, linkId },
          },
          { init: { signal } },
        )
      : await client["integration-sync"].project[":projectId"][":provider"].links[
          ":linkId"
        ].review.$get(
          {
            param: {
              projectId: scope.projectId,
              provider: scope.provider,
              linkId,
            },
          },
          { init: { signal } },
        );
  if (!response.ok) throw new HttpError(response.status, await response.text());
  return response.json();
}
