import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncScope } from "./types";

export default async function resumeSync(
  scope: SyncScope,
  linkId: string,
  token: string,
  source: "kaneo" | "provider",
) {
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
  return response.json();
}
