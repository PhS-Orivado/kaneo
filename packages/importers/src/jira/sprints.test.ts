import { describe, expect, it } from "vite-plus/test";
import type { JiraSprint, JiraSprintPage } from "./api-types.js";
import type { JiraClient } from "./client.js";
import { mapSprint, mapSprintState, readBoardSprints } from "./sprints.js";

describe("mapSprintState", () => {
  it.each([
    ["active", "active"],
    ["ACTIVE", "active"],
    [" closed ", "closed"],
    ["completed", "closed"],
    ["future", "future"],
    [null, "future"],
    [undefined, "future"],
  ])("maps %j to %s", (state, expected) => {
    expect(mapSprintState(state)).toBe(expected);
  });
});

describe("mapSprint", () => {
  it("maps a sprint with all optional fields", () => {
    const sprint: JiraSprint = {
      id: 5,
      name: " Sprint 1 ",
      state: "active",
      goal: " Ship it ",
      startDate: "2026-01-05T09:00:00.000Z",
      endDate: "2026-01-19T17:00:00.000Z",
    };

    expect(mapSprint(sprint)).toEqual({
      key: "5",
      name: "Sprint 1",
      state: "active",
      goal: "Ship it",
      startDate: "2026-01-05T09:00:00.000Z",
      endDate: "2026-01-19T17:00:00.000Z",
      taskKeys: [],
    });
  });

  it("falls back to a generated name and drops empty fields", () => {
    expect(mapSprint({ id: 7, state: "weird" })).toEqual({
      key: "7",
      name: "Sprint 7",
      state: "future",
      taskKeys: [],
    });
  });
});

function stubClient(
  sprintPages: Record<number, JiraSprintPage>,
  issuePages: Record<number, Record<number, Array<{ id?: string }>>>,
): JiraClient {
  return {
    async boardSprints(_boardId: number, startAt: number) {
      return sprintPages[startAt] ?? null;
    },
    async sprintIssues(sprintId: number, startAt: number) {
      const pages = issuePages[sprintId] ?? {};
      const issues = pages[startAt] ?? [];
      const pageKeys = Object.keys(pages).map(Number);
      return {
        issues,
        maxResults: 2,
        isLast: pageKeys.every((key) => key <= startAt),
      };
    },
  } as unknown as JiraClient;
}

describe("readBoardSprints", () => {
  it("pages through sprints and their issues, mapping ids to sprint keys", async () => {
    const sprint = (id: number, state: string): JiraSprint => ({
      id,
      name: `Sprint ${id}`,
      state,
    });
    const client = stubClient(
      {
        0: {
          values: [sprint(5, "active"), sprint(6, "closed")],
          maxResults: 2,
          total: 3,
          isLast: false,
        },
        2: {
          values: [sprint(7, "future")],
          maxResults: 2,
          total: 3,
          isLast: true,
        },
      },
      {
        5: {
          0: [{ id: "101" }, { id: "102" }],
          2: [{ id: "103" }],
        },
        6: { 0: [{ id: "104" }] },
        7: { 0: [] },
      },
    );

    const result = await readBoardSprints(client, 42);

    expect(result.unavailable).toBe(false);
    expect(result.sprints.map(({ key, name, state }) => ({ key, name, state })))
      .toEqual([
        { key: "5", name: "Sprint 5", state: "active" },
        { key: "6", name: "Sprint 6", state: "closed" },
        { key: "7", name: "Sprint 7", state: "future" },
      ]);
    expect(result.sprints.map(({ taskKeys }) => taskKeys)).toEqual([
      ["101", "102", "103"],
      ["104"],
      [],
    ]);
    expect(result.taskSprintKeys).toEqual(
      new Map([
        ["101", "5"],
        ["102", "5"],
        ["103", "5"],
        ["104", "6"],
      ]),
    );
  });

  it("keeps an issue in the first sprint that lists it", async () => {
    const client = stubClient(
      {
        0: {
          values: [
            { id: 5, name: "Sprint 5", state: "closed" },
            { id: 6, name: "Sprint 6", state: "active" },
          ],
          maxResults: 2,
          total: 2,
          isLast: true,
        },
      },
      {
        5: { 0: [{ id: "101" }] },
        6: { 0: [{ id: "101" }] },
      },
    );

    const { taskSprintKeys } = await readBoardSprints(client, 1);

    expect(taskSprintKeys).toEqual(new Map([["101", "5"]]));
  });

  it("stops on an empty page and returns no sprints", async () => {
    const client = stubClient(
      { 0: { values: [], maxResults: 50, total: 0 } },
      {},
    );

    const result = await readBoardSprints(client, 9);

    expect(result.sprints).toEqual([]);
    expect(result.taskSprintKeys.size).toBe(0);
  });
});
