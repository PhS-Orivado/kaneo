import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import deleteTaskAttribute, {
  TaskAttributeDeleteBlockedError,
} from "./delete-task-attribute";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@kaneo/libs", () => ({
  client: { taskAttribute: { ":id": { $delete: request } } },
}));

const attribute = {
  id: "attribute-1",
  workspaceId: "workspace-1",
  name: "Bug",
  description: null,
  icon: "bug",
  iconColor: "red",
  textColor: "white",
  position: 0,
  isDefault: false,
  createdAt: "2026-10-09T08:00:00Z",
  updatedAt: "2026-10-09T08:00:00Z",
};

beforeEach(() => {
  request.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("deleteTaskAttribute", () => {
  it("deletes without the force flag by default", async () => {
    request.mockResolvedValueOnce(Response.json(attribute));
    await expect(deleteTaskAttribute({ id: attribute.id })).resolves.toEqual(
      attribute,
    );
    expect(request).toHaveBeenCalledWith({ param: { id: attribute.id } });
  });

  it("passes force=true when requested", async () => {
    request.mockResolvedValueOnce(Response.json(attribute));
    await expect(
      deleteTaskAttribute({ id: attribute.id, force: true }),
    ).resolves.toEqual(attribute);
    expect(request).toHaveBeenCalledWith({
      param: { id: attribute.id },
      query: { force: "true" },
    });
  });

  it("surfaces a blocked deletion with the reference count", async () => {
    request.mockResolvedValueOnce(
      Response.json(
        {
          message: "Task attribute is still referenced by 3 task(s)",
          referenceCount: 3,
        },
        { status: 409 },
      ),
    );
    const deletion = deleteTaskAttribute({ id: attribute.id });
    await expect(deletion).rejects.toBeInstanceOf(
      TaskAttributeDeleteBlockedError,
    );
    await expect(deletion).rejects.toMatchObject({
      status: 409,
      referenceCount: 3,
    });
  });

  it("falls back to a plain HTTP error for non-JSON conflict bodies", async () => {
    request.mockResolvedValueOnce(new Response("conflict", { status: 409 }));
    await expect(deleteTaskAttribute({ id: attribute.id })).rejects.toMatchObject({
      status: 409,
      name: "HttpError",
    });
  });

  it("does not swallow other failures", async () => {
    request.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    await expect(deleteTaskAttribute({ id: attribute.id })).rejects.toMatchObject({
      status: 403,
    });
  });
});
