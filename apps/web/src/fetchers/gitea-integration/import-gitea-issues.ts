import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

export type ImportGiteaIssuesRequest = InferRequestType<
  const response = await client["gitea-integration"]["import-issues"].$post({
    json: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default importGiteaIssues;
