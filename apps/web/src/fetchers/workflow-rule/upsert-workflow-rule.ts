import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

async function upsertWorkflowRule(
  projectId: string,
  data: {
    integrationType: string;
    // RFC 0001 WP6: when set, the rule targets one repository binding
    // instead of every repository of that type in the project.
    integrationId?: string;
    eventType: string;
    columnId: string;
  },
) {
  const response = await client["workflow-rule"][":projectId"].$put({
    param: { projectId },
    json: data,
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default upsertWorkflowRule;
