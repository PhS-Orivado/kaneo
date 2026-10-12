import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncScope } from "./types";

export default async function reviewSyncResume(
  scope: SyncScope,
  linkId: string,
  signal?: AbortSignal,
) {
  const response = await client["integration-sync"].project[":projectId"][
    ":provider"
  ].links[":linkId"].review.$get(
    { param: { ...param, linkId } },
    { init: { signal } },
  );
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
