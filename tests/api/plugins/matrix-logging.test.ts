import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { handleTaskCreated } from "../../../apps/api/src/plugins/matrix/events";

const m = vi.hoisted(() => {
  class MatrixRequestError extends Error {
    constructor(
      readonly reason: string,
      readonly status?: number,
      readonly errcode?: string,
    ) {
      super(`Matrix request failed: ${reason}`);
    }
  }
  return {
    select: vi.fn(),
    send: vi.fn(),
    resolve: vi.fn(),
    create: vi.fn(),
    link: vi.fn(),
    MatrixRequestError,
  };
});
vi.mock("../../../apps/api/src/database", () => ({
  default: { select: m.select },
}));
vi.mock("../../../apps/api/src/plugins/matrix/client", () => ({
  MatrixRequestError: m.MatrixRequestError,
  safeMatrixError: (error: unknown) =>
    error instanceof m.MatrixRequestError ? error.message : "Matrix request failed",
  matrixRequest: vi.fn(),
  resolveRoomAlias: m.resolve,
  createMatrixRoom: m.create,
  linkSpaceChild: m.link,
  sendMatrixMessage: m.send,
  isMatrixRoomInUseError: (error: unknown) => error instanceof m.MatrixRequestError,
  serverNameFromHomeserverUrl: (url: string) => new URL(url).host,
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const event = {
  taskId: "task",
  projectId: "project",
  userId: "user",
  title: "Task",
  description: null,
  priority: null,
  status: "to-do",
  number: 1,
};
const token = `syt_${"x".repeat(40)}`;
describe("Matrix logging", () => {
  it("does not log secret-bearing invalid configuration", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await handleTaskCreated(event, {
      integrationId: "integration",
      projectId: "project",
      config: {
        homeserverUrl: "https://matrix.example.org",
        userId: "",
        accessToken: token,
      },
    });
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
    expect(JSON.stringify(log.mock.calls)).not.toContain("accessToken");
    expect(m.select).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });
  it("discards unknown errors with token-bearing causes", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    function chain(rows: unknown[]) {
      const value = {
        from: () => value,
        innerJoin: () => value,
        where: () => value,
        limit: async () => rows,
      };
      return value;
    }
    m.select
      .mockReturnValueOnce(
        chain([
          {
            title: "Task",
            number: 1,
            status: "to-do",
            priority: "low",
            projectName: "Project",
            workspaceId: "workspace",
            workspaceName: "Workspace",
            projectId: "project",
          },
        ]),
      )
      .mockReturnValueOnce(chain([{ name: "User" }]));
    m.resolve.mockResolvedValue("!space:example.org");
    m.link.mockResolvedValue(undefined);
    m.send.mockRejectedValue(
      new Error(`Failed https://matrix.example.org/_matrix/client/...${token}`, {
        cause: { token },
      }),
    );
    await handleTaskCreated(event, {
      integrationId: "integration",
      projectId: "project",
      config: {
        homeserverUrl: "https://matrix.example.org",
        userId: "@kaneo-bot:example.org",
        accessToken: token,
        events: { taskCreated: true },
      },
    });
    expect(m.send).toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(token);
    expect(JSON.stringify(log.mock.calls)).toContain("Matrix request failed");
  });
});
