import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  ensureMatrixStructure,
  projectGeneralRoomAlias,
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
    linkParent: vi.fn(),
    MatrixRequestError,
  };
});
vi.mock("../../../apps/api/src/plugins/matrix/client", () => ({
  MatrixRequestError: m.MatrixRequestError,
  safeMatrixError: (error: unknown) =>
    error instanceof m.MatrixRequestError
      ? error.message
      : "Matrix request failed",
  matrixRequest: vi.fn(),
  resolveRoomAlias: m.resolve,
  createMatrixRoom: m.create,
  isMatrixRoomInUseError: (error: unknown) =>
    error instanceof m.MatrixRequestError && error.errcode === "M_ROOM_IN_USE",
  serverNameFromHomeserverUrl: (url: string) => new URL(url).host,
  linkSpaceChild: m.link,
  linkSpaceParent: m.linkParent,
  sendMatrixMessage: vi.fn(),
  getMatrixWhoami: vi.fn(),
  joinMatrixRoom: vi.fn(),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const config = {
  homeserverUrl: "https://matrix.example.org",
  accessToken: "token",
};
const data = {
  workspaceId: "workspace",
  workspaceName: "Marketing",
  projectId: "project",
  projectName: "Website",
};
const roomPowerLevels = {
  invite: 0,
  users_default: 0,
  events_default: 0,
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
    expect(projectGeneralRoomAlias("p1", "example.org")).toBe(
      "#kaneo-project-p1-general:example.org",
    );
  });
  it("sanitizes space order values", () => {
    expect(spaceOrderForProject("Website Redesign!")).toBe("website-redesign");
    expect(spaceOrderForProject("   ")).toBe("project");
  });
  it("creates space, subspace, updates, and general rooms on first run", async () => {
    m.resolve.mockResolvedValue(null);
    m.create
      .mockResolvedValueOnce({ roomId: "!space:example.org" })
      .mockResolvedValueOnce({ roomId: "!subspace:example.org" })
      .mockResolvedValueOnce({ roomId: "!room:example.org" })
      .mockResolvedValueOnce({ roomId: "!general:example.org" });
    m.link.mockResolvedValue(undefined);
    m.linkParent.mockResolvedValue(undefined);

    const structure = await ensureMatrixStructure(config, data);

    expect(structure.spaceId).toBe("!space:example.org");
    expect(structure.roomId).toBe("!room:example.org");
    expect(structure.generalRoomId).toBe("!general:example.org");
    expect(m.create).toHaveBeenCalledTimes(4);
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
      powerLevelContentOverride: roomPowerLevels,
    });
    expect(m.create.mock.calls[3][2]).toMatchObject({
      name: "Website — General",
      aliasLocalpart: "kaneo-project-project-general",
      powerLevelContentOverride: roomPowerLevels,
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
      { suggested: true, order: "01" },
    );
    expect(m.link).toHaveBeenNthCalledWith(
      3,
      "https://matrix.example.org",
      "token",
      "!subspace:example.org",
      "!general:example.org",
      { order: "02" },
    );
    expect(m.linkParent).toHaveBeenNthCalledWith(
      1,
      "https://matrix.example.org",
      "token",
      "!subspace:example.org",
      "!space:example.org",
      { canonical: true },
    );
    expect(m.linkParent).toHaveBeenNthCalledWith(
      2,
      "https://matrix.example.org",
      "token",
      "!room:example.org",
      "!subspace:example.org",
      { canonical: true },
    );
    expect(m.linkParent).toHaveBeenNthCalledWith(
      3,
      "https://matrix.example.org",
      "token",
      "!general:example.org",
      "!subspace:example.org",
      { canonical: true },
    );
  });
  it("nests the workspace space under a resolved parent space alias", async () => {
    m.resolve
      .mockResolvedValueOnce("!parent:example.org")
      .mockResolvedValue("!existing:example.org");
    m.link.mockResolvedValue(undefined);
    m.linkParent.mockResolvedValue(undefined);

    await ensureMatrixStructure(
      { ...config, parentSpaceId: "#kaneo-parent:example.org" },
      data,
    );

    expect(m.resolve).toHaveBeenCalledWith(
      "https://matrix.example.org",
      "token",
      "#kaneo-parent:example.org",
    );
    expect(m.create).not.toHaveBeenCalled();
    expect(m.link).toHaveBeenCalledWith(
      "https://matrix.example.org",
      "token",
      "!parent:example.org",
      "!existing:example.org",
    );
    expect(m.linkParent).toHaveBeenCalledWith(
      "https://matrix.example.org",
      "token",
      "!existing:example.org",
      "!parent:example.org",
      { canonical: true },
    );
  });
  it("reuses existing rooms without creating duplicates", async () => {
    m.resolve.mockResolvedValue("!existing:example.org");
    m.link.mockResolvedValue(undefined);
    m.linkParent.mockResolvedValue(undefined);

    const structure = await ensureMatrixStructure(config, data);

    expect(structure.roomId).toBe("!existing:example.org");
    expect(structure.generalRoomId).toBe("!existing:example.org");
    expect(m.create).not.toHaveBeenCalled();
    expect(m.resolve).toHaveBeenCalledTimes(4);
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
    m.linkParent.mockResolvedValue(undefined);

    const structure = await ensureMatrixStructure(config, data);

    expect(structure.roomId).toBe("!stable:example.org");
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.resolve).toHaveBeenCalledTimes(5);
  });
  it("keeps delivering when hierarchy links fail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    m.resolve.mockResolvedValue("!existing:example.org");
    m.link.mockRejectedValue(new m.MatrixRequestError("http", 403));
    m.linkParent.mockRejectedValue(new m.MatrixRequestError("http", 403));

    const structure = await ensureMatrixStructure(config, data);

    expect(structure.roomId).toBe("!existing:example.org");
    expect(log).toHaveBeenCalledTimes(6);
    expect(JSON.stringify(log.mock.calls)).not.toContain("token");
  });
});
