import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { SyncScope } from "./types";

export default async function resumeSync(
  scope: SyncScope,
  linkId: string,
  token: string,
  source: "kaneo" | "provider",
) {
  const response = await client["integration-sync"].project[":projectId"][
    ":provider"
  ].links[":linkId"].resume.$post({
    param: { ...param, linkId },
    json: { token, source },
  });
  if (!response.ok) throw await HttpError.fromResponse(response);
  return response.json();
}
}
