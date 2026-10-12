import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncScope } from "./types";

export default async function reviewSyncResume(
  scope: SyncScope,
  linkId: string,
  signal?: AbortSignal,
) {
<<<<<<< HEAD
  const response = await client["integration-sync"].project[":projectId"][
    ":provider"
  ].links[":linkId"].review.$get(
    { param: { ...param, linkId } },
    { init: { signal } },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
=======
  const response =
    scope.kind === "binding"
      ? await client["integration-sync"].integration[":integrationId"].links[
          ":linkId"
        ].review.$get(
          {
            param: { integrationId: scope.integrationId, linkId },
          },
          { init: { signal } },
        )
      : await client["integration-sync"].project[":projectId"][
          ":provider"
        ].links[":linkId"].review.$get(
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
>>>>>>> 0d3149e38b9ca5b66b6f032dce0422cc354a3250
  return response.json();
}
