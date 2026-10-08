import { describe, expect, it } from "vite-plus/test";
import {
  PLAN_LIMITS,
  TRIAL_LIMITS,
  planLimitsFor,
} from "../../../apps/api/src/billing/plans";

describe("plan catalog", () => {
  it("defines every dimension for each plan", () => {
    for (const plan of ["personal", "team"] as const) {
      const limits = planLimitsFor(plan);

      expect(limits).toBe(PLAN_LIMITS[plan]);
      expect(Object.keys(limits).sort()).toEqual([
        "maxIntegrations",
        "maxProjects",
        "maxRepositories",
        "maxRepositoriesPerProject",
        "maxUsers",
        "storageBytes",
      ]);
    }
  });

  it("caps the personal plan on every dimension", () => {
    expect(PLAN_LIMITS.personal).toEqual({
      maxUsers: 1,
      maxProjects: 3,
      maxRepositoriesPerProject: 2,
      maxRepositories: 6,
      storageBytes: 1_000_000_000,
      maxIntegrations: 3,
    });
  });

  it("leaves seat and volume dimensions unlimited on the team plan", () => {
    const team = PLAN_LIMITS.team;
    expect(team.maxUsers).toBeNull();
    expect(team.maxProjects).toBeNull();
    expect(team.maxRepositories).toBeNull();
    expect(team.maxRepositoriesPerProject).toBe(10);
    expect(team.storageBytes).toBe(10_000_000_000);
    expect(team.maxIntegrations).toBe(25);
  });

  it("grants trials the team plan limits", () => {
    expect(TRIAL_LIMITS).toBe(PLAN_LIMITS.team);
  });

  it("keeps personal plan limits within the team plan limits", () => {
    const personal = PLAN_LIMITS.personal;
    const team = PLAN_LIMITS.team;

    // Every dimension the team plan caps, the personal plan caps tighter.
    expect(personal.maxUsers).toBeLessThan(team.maxUsers ?? Infinity);
    expect(personal.maxProjects).toBeLessThan(team.maxProjects ?? Infinity);
    expect(personal.maxRepositories).toBeLessThan(
      team.maxRepositories ?? Infinity,
    );
    expect(personal.maxRepositoriesPerProject).toBeLessThan(
      team.maxRepositoriesPerProject ?? Infinity,
    );
    expect(personal.storageBytes).toBeLessThan(team.storageBytes ?? Infinity);
    expect(personal.maxIntegrations).toBeLessThan(
      team.maxIntegrations ?? Infinity,
    );
  });
});
