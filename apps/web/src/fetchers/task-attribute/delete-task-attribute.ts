import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type DeleteTaskAttributeRequest = InferRequestType<
  (typeof client)["taskAttribute"][":id"]["$delete"]
>["param"] & { force?: boolean };

// RFC 0002: the API answers HTTP 409 with a reference count when tasks still
// use the attribute and the caller did not opt into force=true. The settings
// dialog needs the count, so it is carried on a dedicated error type.
export class TaskAttributeDeleteBlockedError extends HttpError {
  referenceCount: number;

  constructor(message: string, referenceCount: number) {
    super(409, message);
    this.name = "TaskAttributeDeleteBlockedError";
    this.referenceCount = referenceCount;
  }
}

async function deleteTaskAttribute({ id, force }: DeleteTaskAttributeRequest) {
  const response = await client.taskAttribute[":id"].$delete({
    param: { id },
    ...(force ? { query: { force: "true" as const } } : {}),
  });

  if (response.status === 409) {
    const text = await response.text();
    try {
      const body = JSON.parse(text) as {
        message?: unknown;
        referenceCount?: unknown;
      };
      if (typeof body.referenceCount === "number") {
        throw new TaskAttributeDeleteBlockedError(
          typeof body.message === "string" ? body.message : text,
          body.referenceCount,
        );
      }
    } catch (error) {
      if (error instanceof TaskAttributeDeleteBlockedError) {
        throw error;
      }
      // Not a JSON body; fall through to the generic error below.
    }
    throw new HttpError(409, text);
  }

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data = await response.json();
  return data;
}

export default deleteTaskAttribute;
