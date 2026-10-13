import { createId } from "@paralleldrive/cuid2";
import * as Sentry from "@sentry/node";
import { withoutOutboundTelemetry } from "../../utils/sensitive-outbound";

type Failure = "timeout" | "http" | "network" | "response" | "matrix";

// Never attach the original error or response body: they can include the
// credential-bearing Authorization header or untrusted homeserver payloads.
export class MatrixRequestError extends Error {
  constructor(
    readonly reason: Failure,
    readonly status?: number,
    readonly errcode?: string,
  ) {
    super(
      `Matrix request failed: ${reason}${status ? ` (HTTP ${status})` : ""}${
        errcode ? ` (${errcode})` : ""
      }`,
    );
  }
}

export function safeMatrixError(error: unknown): string {
  return error instanceof MatrixRequestError
    ? error.message
    : "Matrix request failed";
}

const MATRIX_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 65_536;

async function readMatrixJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new MatrixRequestError("response");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new MatrixRequestError("response");
  }
}

// The access token travels in the Authorization header only, never in the URL.
export async function matrixRequest(
  homeserverUrl: string,
  accessToken: string,
  path: string,
  init: {
    method?: "GET" | "POST" | "PUT";
    body?: unknown;
  } = {},
): Promise<unknown> {
  Sentry.addBreadcrumb({
    category: "integration",
    level: "info",
    data: { integration: "matrix" },
  });

  const method = init.method ?? "GET";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MATRIX_TIMEOUT_MS);
  try {
    controller.signal.throwIfAborted();
    const response = await withoutOutboundTelemetry(() =>
      fetch(`${homeserverUrl}/_matrix/client/v3/${path}`, {
        method,
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(init.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      }),
    );

    if (!response.ok) {
      // Read the errcode for control flow, never for logging payloads.
      let errcode: string | undefined;
      try {
        const body = (await readMatrixJson(response)) as {
          errcode?: string;
        } | null;
        errcode =
          body && typeof body === "object" && typeof body.errcode === "string"
            ? body.errcode
            : undefined;
      } catch {
        errcode = undefined;
      }
      throw new MatrixRequestError("http", response.status, errcode);
    }

    return await readMatrixJson(response);
  } catch (error) {
    if (error instanceof MatrixRequestError) throw error;
    if (controller.signal.aborted) throw new MatrixRequestError("timeout");
    throw new MatrixRequestError("network");
  } finally {
    clearTimeout(timer);
  }
}

export type MatrixRoom = {
  roomId: string;
};

export async function resolveRoomAlias(
  homeserverUrl: string,
  accessToken: string,
  roomAlias: string,
): Promise<string | null> {
  const result = (await matrixRequest(
    homeserverUrl,
    accessToken,
    `directory/room/${encodeURIComponent(roomAlias)}`,
  )) as { room_id?: string } | null;

  if (
    !result ||
    typeof result !== "object" ||
    typeof result.room_id !== "string"
  ) {
    return null;
  }

  return result.room_id;
}

export function isMatrixRoomInUseError(error: unknown): boolean {
  return (
    error instanceof MatrixRequestError &&
    error.errcode === "M_ROOM_IN_USE" &&
    error.status === 400
  );
}

export async function createMatrixRoom(
  homeserverUrl: string,
  accessToken: string,
  options: {
    name: string;
    aliasLocalpart?: string;
    isSpace?: boolean;
    inviteUsers?: string[];
    powerLevelContentOverride?: Record<string, unknown>;
  },
): Promise<MatrixRoom> {
  const body: Record<string, unknown> = {
    name: options.name,
    preset: "private_chat",
    visibility: "private",
  };

  if (options.isSpace) {
    body.creation_content = { type: "m.space" };
  }

  if (options.aliasLocalpart) {
    body.room_alias_name = options.aliasLocalpart;
  }

  if (options.inviteUsers && options.inviteUsers.length > 0) {
    body.invite = options.inviteUsers;
  }

  if (options.powerLevelContentOverride) {
    body.power_level_content_override = options.powerLevelContentOverride;
  }

  const result = (await matrixRequest(
    homeserverUrl,
    accessToken,
    "createRoom",
    {
      method: "POST",
      body,
    },
  )) as { room_id?: string } | null;

  if (
    !result ||
    typeof result !== "object" ||
    typeof result.room_id !== "string"
  ) {
    throw new MatrixRequestError("response");
  }

  return {
    roomId: result.room_id,
  };
}

// Resolves the bot's own user ID. Homeservers reject the call for invalid
// tokens, so it doubles as the connect-time credential check.
export async function getMatrixWhoami(
  homeserverUrl: string,
  accessToken: string,
): Promise<string> {
  const result = (await matrixRequest(
    homeserverUrl,
    accessToken,
    "account/whoami",
  )) as { user_id?: string } | null;

  if (
    !result ||
    typeof result !== "object" ||
    typeof result.user_id !== "string"
  ) {
    throw new MatrixRequestError("response");
  }

  return result.user_id;
}

// Joins a room by ID or alias; the homeserver resolves aliases itself, but
// resolving first keeps the stored target stable and independent of later
// alias changes.
export async function joinMatrixRoom(
  homeserverUrl: string,
  accessToken: string,
  roomIdOrAlias: string,
): Promise<string> {
  const result = (await matrixRequest(
    homeserverUrl,
    accessToken,
    `join/${encodeURIComponent(roomIdOrAlias)}`,
    {
      method: "POST",
      body: {},
    },
  )) as { room_id?: string } | null;

  if (
    !result ||
    typeof result !== "object" ||
    typeof result.room_id !== "string"
  ) {
    throw new MatrixRequestError("response");
  }

  return result.room_id;
}

export function serverNameFromHomeserverUrl(homeserverUrl: string): string {
  try {
    return new URL(homeserverUrl).host;
  } catch {
    return homeserverUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
}

export async function linkSpaceChild(
  homeserverUrl: string,
  accessToken: string,
  spaceId: string,
  childId: string,
  options: { suggested?: boolean; order?: string } = {},
): Promise<void> {
  await matrixRequest(
    homeserverUrl,
    accessToken,
    `rooms/${encodeURIComponent(spaceId)}/state/m.space.child/${encodeURIComponent(childId)}`,
    {
      method: "PUT",
      body: {
        via: [serverNameFromHomeserverUrl(homeserverUrl)],
        suggested: options.suggested ?? false,
        ...(options.order !== undefined ? { order: options.order } : {}),
      },
    },
  );
}

// Child -> parent backlink; clients that only read m.space.parent use it to
// place the child inside its space.
export async function linkSpaceParent(
  homeserverUrl: string,
  accessToken: string,
  childId: string,
  parentId: string,
  options: { canonical?: boolean } = {},
): Promise<void> {
  await matrixRequest(
    homeserverUrl,
    accessToken,
    `rooms/${encodeURIComponent(childId)}/state/m.space.parent/${encodeURIComponent(parentId)}`,
    {
      method: "PUT",
      body: {
        via: [serverNameFromHomeserverUrl(homeserverUrl)],
        canonical: options.canonical ?? true,
      },
    },
  );
}

export async function sendMatrixMessage(
  homeserverUrl: string,
  accessToken: string,
  roomId: string,
  formattedBody: string,
  plainBody: string,
): Promise<void> {
  const txnId = createId();
  await matrixRequest(
    homeserverUrl,
    accessToken,
    `rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txnId}`,
    {
      method: "PUT",
      body: {
        msgtype: "m.notice",
        body: plainBody,
        format: "org.matrix.custom.html",
        formatted_body: formattedBody,
      },
    },
  );
}
