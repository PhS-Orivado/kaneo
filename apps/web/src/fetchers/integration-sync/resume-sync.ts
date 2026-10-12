import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncScope } from "./types";

export default async function resumeSync(
  scope: SyncScope,
  linkId: string,
  token: string,
  source: "kaneo" | "provider",
) {
<<<<<<< HEAD
  const response = await client["integration-sync"].project[":projectId"][
    ":provider"
  ].links[":linkId"].resume.$post({
    param: { ...param, linkId },
    json: { token, source },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
=======
  const response =
    scope.kind === "binding"
      ? await client["integration-sync"].integration[":integrationId"].links[
          ":linkId"
        ].resume.$post({
          param: { integrationId: scope.integrationId, linkId },
          json: { token, source },
        })
      : await client["integration-sync"].project[":projectId"][
          ":provider"
        ].links[":linkId"].resume.$post({
          param: {
            projectId: scope.projectId,
            provider: scope.provider,
            linkId,
          },
          json: { token, source },
        });
  if (!response.ok) throw new HttpError(response.status, await response.text());
>>>>>>> 0d3149e38b9ca5b66b6f032dce0422cc354a3250
  return response.json();
}
