import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

async function updateTaskSprint(taskId: string, sprintId: string | null) {
  const response = await client.sprint.task[":taskId"].$put({
    param: { taskId },
    json: { sprintId },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default updateTaskSprint;
