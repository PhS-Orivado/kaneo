import { afterEach, describe, expect, it } from "vite-plus/test";

const { resolveLimit, resolveWorkspaceLimits } = await import(
  "../../../apps/api/src/plan-limits/resolve-limits"
);

// Minimal drizzle-shaped stub for the single-row limit read:
// resolveLimit -> select({ value }).from().where().limit() (awaited)
function fakeDatabase(limitRow: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => limitRow,
        }),
      }),
    }),
  } as never;
}

const WORKSPACE = "workspace-1";

const ENV_KEYS = [
  "KANEO_MAX_USERS_PER_WORKSPACE",
  "KANEO_MAX_PROJECTS_PER_WORKSPACE",
  "KANEO_MAX_REPOSITORIES_PER_PROJECT",
  "KANEO_MAX_REPOSITORIES_PER_WORKSPACE",
  "KANEO_MAX_STORAGE_BYTES",
  "KANEO_MAX_INTEGRATIONS_PER_WORKSPACE",
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe("resolveLimit across plan dimensions", () => {
  const dimensions = [
    { dimension: "users", env: "KANEO_MAX_USERS_PER_WORKSPACE" },
    { dimension: "projects", env: "KANEO_MAX_PROJECTS_PER_WORKSPACE" },
    {
      dimension: "repositoriesPerProject",
      env: "KANEO_MAX_REPOSITORIES_PER_PROJECT",
    },
    {
      dimension: "repositories",
      env: "KANEO_MAX_REPOSITORIES_PER_WORKSPACE",
    },
    { dimension: "storage", env: "KANEO_MAX_STORAGE_BYTES" },
    { dimension: "integrations", env: "KANEO_MAX_INTEGRATIONS_PER_WORKSPACE" },
  ] as const;

  it.each(dimensions)(
    "returns the workspace override for %s when present",
    async ({ dimension }) => {
      const db = fakeDatabase([{ value: 7 }]);
      expect(await resolveLimit(WORKSPACE, dimension, db)).toBe(7);
    },
  );

  it.each(dimensions)(
    "falls back to the instance default for %s when no row exists",
    async ({ dimension, env }) => {
      process.env[env] = "12";
      const db = fakeDatabase([]);
      expect(await resolveLimit(WORKSPACE, dimension, db)).toBe(12);
    },
  );

  it.each(dimensions)(
    "is unlimited for %s without an override or default",
    async ({ dimension }) => {
      const db = fakeDatabase([]);
      expect(await resolveLimit(WORKSPACE, dimension, db)).toBeNull();
    },
  );

  it.each(dimensions)(
    "ignores a non-positive or malformed default for %s",
    async ({ dimension, env }) => {
      process.env[env] = "0";
      const db = fakeDatabase([]);
      expect(await resolveLimit(WORKSPACE, dimension, db)).toBeNull();

      process.env[env] = "not-a-number";
      expect(await resolveLimit(WORKSPACE, dimension, db)).toBeNull();
    },
  );

  it("keeps zero as a valid override", async () => {
    const db = fakeDatabase([{ value: 0 }]);
    expect(await resolveLimit(WORKSPACE, "projects", db)).toBe(0);
  });

  it("resolves every dimension at once from one row", async () => {
    const db = fakeDatabase([
      {
        workspaceId: WORKSPACE,
        maxUsers: 1,
        maxProjects: 3,
        maxRepositoriesPerProject: 2,
        maxRepositories: 6,
        storageBytes: 1_000_000_000,
        maxIntegrations: 3,
      },
    ]);

    expect(await resolveWorkspaceLimits(WORKSPACE, db)).toEqual({
      maxUsers: 1,
      maxProjects: 3,
      maxRepositoriesPerProject: 2,
      maxRepositories: 6,
      storageBytes: 1_000_000_000,
      maxIntegrations: 3,
    });
  });

  it("fills missing row values with instance defaults", async () => {
    process.env.KANEO_MAX_USERS_PER_WORKSPACE = "2";
    process.env.KANEO_MAX_STORAGE_BYTES = "500";
    const db = fakeDatabase([
      {
        workspaceId: WORKSPACE,
        maxUsers: null,
        maxProjects: null,
        maxRepositoriesPerProject: null,
        maxRepositories: null,
        storageBytes: null,
        maxIntegrations: null,
      },
    ]);

    const limits = await resolveWorkspaceLimits(WORKSPACE, db);
    expect(limits.maxUsers).toBe(2);
    expect(limits.storageBytes).toBe(500);
    expect(limits.maxProjects).toBeNull();
  });
});
