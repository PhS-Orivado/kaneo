import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  ensureMatrixStructure,
  projectRoomAlias,
  projectSubspaceAlias,
  spaceOrderForProject,
  workspaceSpaceAlias,
} from "../../../apps/api/src/plugins/matrix/structure";

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
    resolve: vi.fn(),
    create: vi.fn(),
    link: vi.fn(),
    MatrixRequestError,
  };
});
vi.mock("../../../apps/api/src/plugins/matrix/client", () => ({
  MatrixRequestError: m.MatrixRequestError,
  safeMatrixError: (error: unknown) =>
    error instanceof m.MatrixRequestError ? error.message : "Matrix request failed",
  matrixRequest: vi.fn(),
  resolveRoomAlias: m.resolve,
  createMatrixRoom: m.create,
  linkSpaceChild: m.link,
  sendMatrixMessage: vi.fn(),
  isMatrixRoomInUseError: (error: unknown) =>
    error instanceof m.MatrixRequestError && error.errcode === "M_ROOM_IN_USE",
  serverNameFromHomeserverUrl: (url: string) => new URL(url).host,
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const config = {
  homeserverUrl: "https://matrix.example.org",
  userId: "@kaneo-bot:example.org",
  accessToken: "token",
};
const data = {
  workspaceId: "workspace",
  workspaceName: "Marketing",
  projectId: "project",
  projectName: "Website",
};
describe("Matrix structure", () => {
  it("derives deterministic aliases", () => {
    expect(workspaceSpaceAlias("ws1", "example.org")).toBe(
      "#kaneo-ws-ws1:example.org",
    );
    expect(projectSubspaceAlias("p1", "example.org")).toBe(
      "#kaneo-project-p1:example.org",
    );
    expect(projectRoomAlias("p1", "example.org")).toBe(
      "#kaneo-project-p1-updates:example.org",
    );
  });
  it("sanitizes space order values", () => {
    expect(spaceOrderForProject("Website Redesign!")).toBe("website-redesign");
    expect(spaceOrderForProject("   ")).toBe("project");
  });
  it("creates space, subspace, and room on first run", async () => {
    m.resolve.mockResolvedValue(null);
    m.create
      .mockResolvedValueOnce({ roomId: "!space:example.org" })
      .mockResolvedValueOnce({ roomId: "!subspace:example.org" })
      .mockResolvedValueOnce({ roomId: "!room:example.org" });
    m.link.mockResolvedValue(undefined);

    const structure = await ensureMatrixStructure(config, data);

    expect(structure.roomId).toBe("!room:example.org");
    expect(m.create).toHaveBeenCalledTimes(3);
    expect(m.create.mock.calls[0][2]).toMatchObject({
      name: "Kaneo · Marketing",
      aliasLocalpart: "kaneo-ws-workspace",
      isSpace: true,
    });
    expect(m.create.mock.calls[1][2]).toMatchObject({
      name: "Website",
      aliasLocalpart: "kaneo-project-project",
      isSpace: true,
    });
    expect(m.create.mock.calls[2][2]).toMatchObject({
      name: "Website — Updates",
      aliasLocalpart: "kaneo-project-project-updates",
    });
    expect(m.link).toHaveBeenNthCalledWith(
      1,
      "https://matrix.example.org",
      "token",
      "!space:example.org",
      "!subspace:example.org",
      { order: "website" },
    );
    expect(m.link).toHaveBeenNthCalledWith(
      2,
      "https://matrix.example.org",
      "token",
      "!subspace:example.org",
      "!room:example.org",
      { suggested: true },
    );
  });
  it("reuses existing rooms without creating duplicates", async () => {
    m.resolve.mockResolvedValue("!existing:example.org");
    m.link.mockResolvedValue(undefined);

    const structure = await ensureMatrixStructure(config, data);

    expect(structure.roomId).toBe("!existing:example.org");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.resolve).toHaveBeenCalledTimes(3);
  });
  it("resolves M_ROOM_IN_USE races by re-resolving the alias", async () => {
    m.resolve
      .mockResolvedValue("!stable:example.org")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("!raced:example.org");
    m.create.mockRejectedValueOnce(
      new m.MatrixRequestError("http", 400, "M_ROOM_IN_USE"),
    );
    m.link.mockResolvedValue(undefined);

    const structure = await ensureMatrixStructure(config, data);

    expect(structure.roomId).toBe("!stable:example.org");
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.resolve).toHaveBeenCalledTimes(3);
  });
  it("keeps delivering when hierarchy links fail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    m.resolve.mockResolvedValue("!existing:example.org");
    m.link.mockRejectedValue(new m.MatrixRequestError("http", 403));

    const structure = await ensureMatrixStructure(config, data);

    expect(structure.roomId).toBe("!existing:example.org");
    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("token");
  });
});
