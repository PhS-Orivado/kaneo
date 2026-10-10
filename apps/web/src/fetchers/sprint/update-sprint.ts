import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";
import type Sprint from "@/types/sprint";

async function updateSprint(
  id: string,
  data: {
    name?: string;
    goal?: string | null;
    startDate?: string;
    endDate?: string | null;
  },
) {
  const response = await client.sprint[":id"].$put({
    param: { id },
    json: data,
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return (await response.json()) as Sprint;
}

export default updateSprint;
