import { assertPublicDestination } from "../../utils/assert-public-destination";

const MATRIX_TIMEOUT_MS = 10_000;

export class MatrixApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MatrixApiError";
  }
}

export type MatrixClientOptions = {
  homeserverUrl: string;
  accessToken: string;
};

export type CreateMatrixRoomOptions = {
  name?: string;
  topic?: string;
  isSpace?: boolean;
  powerLevelContentOverride?: Record<string, unknown>;
};

export type MatrixClient = {
  homeserverUrl: string;
  homeserverName: string;
  whoami(): Promise<string>;
  resolveAlias(alias: string): Promise<string>;
  joinRoom(roomIdOrAlias: string): Promise<string>;
  createRoom(options: CreateMatrixRoomOptions): Promise<string>;
  sendStateEvent(
    roomId: string,
    eventType: string,
    stateKey: string,
    content: Record<string, unknown>,
  ): Promise<void>;
  sendNotice(roomId: string, plain: string, html: string): Promise<void>;
};

let transactionCounter = 0;

function nextTransactionId(): string {
  transactionCounter += 1;
  return "kaneo-" + Date.now().toString(36) + "-" + transactionCounter;
}

export async function createMatrixClient(
  options: MatrixClientOptions,
): Promise<MatrixClient> {
  await assertPublicDestination(options.homeserverUrl, "Matrix homeserver");

  const base = options.homeserverUrl.trim().replace(/\/+$/, "");
  const homeserverName = new URL(base).hostname;

  async function request(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MATRIX_TIMEOUT_MS);

    try {
      const response = await fetch(base + path, {
        method,
        headers: {
          Authorization: "Bearer " + options.accessToken,
          ...(body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as
        | Record<string, unknown>
        | null;

      if (!response.ok) {
        const errcode =
          payload && typeof payload.errcode === "string"
            ? payload.errcode
            : "UNKNOWN_ERROR";
        const message =
          payload && typeof payload.error === "string"
            ? payload.error
            : "Matrix request failed";
        throw new MatrixApiError(
          errcode + ": " + message,
          response.status,
        );
      }

      return payload ?? {};
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new MatrixApiError(
          "Matrix request timed out after " + MATRIX_TIMEOUT_MS + "ms",
          0,
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function requireRoomId(
    payload: Record<string, unknown>,
    fallback: string,
  ): Promise<string> {
    if (typeof payload.room_id !== "string") {
      throw new MatrixApiError(
        "Matrix response did not include a room id for " + fallback,
        0,
      );
    }
    return payload.room_id;
  }

  return {
    homeserverUrl: base,
    homeserverName,
    async whoami() {
      const payload = await request("GET", "/_matrix/client/v3/account/whoami");
      if (typeof payload.user_id !== "string") {
        throw new MatrixApiError(
          "Matrix whoami response did not include a user id",
          0,
        );
      }
      return payload.user_id;
    },
    async resolveAlias(alias: string) {
      const payload = await request(
        "GET",
        "/_matrix/client/v3/directory/room/" + encodeURIComponent(alias),
      );
      return requireRoomId(payload, alias);
    },
    async joinRoom(roomIdOrAlias: string) {
      const payload = await request(
        "POST",
        "/_matrix/client/v3/join/" + encodeURIComponent(roomIdOrAlias),
        {},
      );
      return requireRoomId(payload, roomIdOrAlias);
    },
    async createRoom(options: CreateMatrixRoomOptions) {
      const payload = await request(
        "POST",
        "/_matrix/client/v3/createRoom",
        {
          ...(options.name ? { name: options.name } : {}),
          ...(options.topic ? { topic: options.topic } : {}),
          ...(options.isSpace
            ? { creation_content: { type: "m.space" } }
            : {}),
          preset: "private_chat",
          ...(options.powerLevelContentOverride
            ? {
                power_level_content_override:
                  options.powerLevelContentOverride,
              }
            : {}),
        },
      );
      return requireRoomId(payload, options.name ?? "new room");
    },
    async sendStateEvent(
      roomId: string,
      eventType: string,
      stateKey: string,
      content: Record<string, unknown>,
    ) {
      await request(
        "PUT",
        "/_matrix/client/v3/rooms/" +
          encodeURIComponent(roomId) +
          "/state/" +
          encodeURIComponent(eventType) +
          "/" +
          encodeURIComponent(stateKey),
        content,
      );
    },
    async sendNotice(roomId: string, plain: string, html: string) {
      await request(
        "PUT",
        "/_matrix/client/v3/rooms/" +
          encodeURIComponent(roomId) +
          "/send/m.room.message/" +
          nextTransactionId(),
        {
          msgtype: "m.notice",
          body: plain,
          format: "org.matrix.custom.html",
          formatted_body: html,
        },
      );
    },
  };
}
