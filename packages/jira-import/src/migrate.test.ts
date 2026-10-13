import { describe, expect, it } from "vite-plus/test";
import type { AdfDoc } from "./adf.js";
import type { KaneoClient } from "./kaneo.js";
import { MAX_ATTACHMENT_BYTES, migrate } from "./migrate.js";
import type { JiraClient, JiraFieldMetadata, JiraIssue } from "./jira.js";

type Call = { method: string; args: unknown[] };

const FIELD_METADATA: JiraFieldMetadata[] = [
  {
    id: "customfield_10010",
    name: "Story Points",
    custom: true,
    schema: { type: "number", custom: "com.atlassian.jira:floatfield" },
  },
  {
    id: "customfield_10020",
    name: "Severity",
    custom: true,
    schema: { type: "option", custom: "com.atlassian.jira:select" },
  },
  {
    id: "customfield_10030",
    name: "Sprint",
    custom: true,
    schema: { custom: "com.pyxis.greenhopper.jira:gh-sprint-field" },
  },
];

function adfParagraph(text: string): AdfDoc {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  } as AdfDoc;
}

function adfWithImage(mediaId: string): AdfDoc {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Screenshot below:" }],
      },
      {
        type: "mediaSingle",
        content: [{ type: "media", attrs: { id: mediaId, type: "file" } }],
      },
    ],
  } as AdfDoc;
}

function issueFixture(
  key: string,
  overrides: Record<string, unknown>,
): JiraIssue {
  return {
    key,
    fields: {
      summary: `Summary ${key}`,
      description: adfParagraph(`Body of ${key}`),
      status: { name: "To Do", statusCategory: { key: "new" } },
      priority: { name: "Medium" },
      issuetype: { name: "Task" },
      labels: [],
      created: "2026-01-01T10:00:00.000Z",
      updated: "2026-02-01T10:00:00.000Z",
      reporter: { displayName: "Jane Doe" },
      assignee: null,
      attachment: [],
      comment: { comments: [], total: 0 },
      worklog: { worklogs: [], total: 0 },
      issuelinks: [],
      subtasks: [],
      watches: { watchCount: 2 },
      votes: { votes: 1 },
      ...overrides,
    },
  };
}

function fakeKaneo(calls: Call[]) {
  let taskCounter = 0;
  let columnCounter = 0;
  let fieldCounter = 0;
  const record = (method: string, ...args: unknown[]) => {
    calls.push({ method, args });
  };

  return {
    async listProjects() {
      record("listProjects");
      return [{ id: "p_existing", name: "Existing", slug: "SUP" }];
    },
    async listMembers() {
      record("listMembers");
      return [{ id: "ku_1", name: "Sam", email: "Sam@Example.com" }];
    },
    async createProject(input: unknown) {
      record("createProject", input);
      return { id: "p_new", name: "Imported", slug: "SUP" };
    },
    async listColumns() {
      record("listColumns");
      return [
        { id: "c_default_1", name: "To Do", slug: "to-do" },
        { id: "c_default_2", name: "Done", slug: "done" },
      ];
    },
    async deleteColumn(id: string) {
      record("deleteColumn", id);
      return {};
    },
    async createColumn(_projectId: string, input: unknown) {
      record("createColumn", input);
      columnCounter++;
      return { id: `c_${columnCounter}`, name: "x", slug: "x" };
    },
    async createTask(_projectId: string, input: unknown) {
      record("createTask", input);
      taskCounter++;
      return { id: `t_${taskCounter}`, title: "t", number: taskCounter };
    },
    async createLabel(input: unknown) {
      record("createLabel", input);
      return { id: "l_1", name: "l", color: "#000000" };
    },
    async createTaskRelation(input: unknown) {
      record("createTaskRelation", input);
      return {};
    },
    async createComment(
      taskId: string,
      content: string,
      externalUserName?: string,
      externalSource?: string,
    ) {
      record(
        "createComment",
        taskId,
        content,
        externalUserName,
        externalSource,
      );
      return {};
    },
    async createCustomField(input: unknown) {
      record("createCustomField", input);
      fieldCounter++;
      return { id: `cf_${fieldCounter}`, name: "f", type: "number" };
    },
    async setCustomFieldValue(input: unknown) {
      record("setCustomFieldValue", input);
      return {};
    },
    async createTimeEntry(input: unknown) {
      record("createTimeEntry", input);
      return { id: "te_1" };
    },
    async stageTaskAsset(_projectId: string, input: unknown) {
      record("stageTaskAsset", input);
      return {
        key: "obj-key-1",
        uploadUrl: "https://storage.example/upload",
        headers: { "Content-Type": "image/png" },
      };
    },
    async uploadAssetBytes(
      url: string,
      headers: Record<string, string>,
      bytes: ArrayBuffer,
    ) {
      record("uploadAssetBytes", url, headers, bytes.byteLength);
    },
    async finalizeStagedTaskAsset(_projectId: string, input: unknown) {
      record("finalizeStagedTaskAsset", input);
      return { id: "asset_1", url: "https://kaneo.local/asset/asset_1" };
    },
  } as unknown as KaneoClient;
}

function fakeJira(
  issuesByProject: Record<string, JiraIssue[]>,
  calls?: Call[],
) {
  return {
    baseUrl: "https://acme.atlassian.net",
    async listFields() {
      return FIELD_METADATA;
    },
    async searchIssues(jql: string) {
      calls?.push({ method: "searchIssues", args: [jql] });
      for (const [projectKey, issues] of Object.entries(issuesByProject)) {
        if (jql.includes(projectKey)) return issues;
      }
      return [];
    },
    async listComments() {
      return [];
    },
    async listWorklogs() {
      return [];
    },
    async downloadAttachment(url: string) {
      calls?.push({ method: "downloadAttachment", args: [url] });
      return {
        bytes: new TextEncoder().encode("png-bytes").buffer as ArrayBuffer,
        contentType: "image/png",
      };
    },
  } as unknown as JiraClient;
}

const ATTACHMENT = {
  id: "att-1",
  filename: "screenshot.png",
  mimeType: "image/png",
  content: "https://acme.atlassian.net/secure/attachment/att-1",
  size: 9,
};

function buildIssues(): JiraIssue[] {
  return [
    issueFixture("SUP-1", {
      description: adfWithImage("att-1"),
      status: { name: "To Do", statusCategory: { key: "new" } },
      priority: { name: "High" },
      issuetype: { name: "Bug" },
      labels: ["customer"],
      assignee: { displayName: "Sam Example", emailAddress: "sam@example.com" },
      attachment: [ATTACHMENT],
      comment: {
        comments: [
          {
            id: "c1",
            author: { displayName: "Jane Doe" },
            body: adfParagraph("First!"),
            created: "2026-01-02T10:00:00.000Z",
          },
        ],
        total: 1,
      },
      worklog: {
        worklogs: [
          {
            id: "w1",
            author: { displayName: "Jane Doe" },
            started: "2026-01-03T09:00:00.000Z",
            timeSpentSeconds: 1800,
          },
        ],
        total: 1,
      },
      issuelinks: [
        {
          id: "link-1",
          type: { name: "Relates" },
          outwardIssue: { key: "SUP-2" },
        },
      ],
      customfield_10010: 5,
      duedate: "2026-06-01",
    }),
    issueFixture("SUP-2", {
      status: { name: "Done", statusCategory: { key: "done" } },
      issuetype: { name: "Subtask", subtask: true },
      parent: { key: "SUP-1" },
      customfield_10010: 3,
      customfield_10020: { value: "Critical" },
    }),
  ];
}

const TARGETS = [{ key: "SUP", name: "Support" }];

function options(
  calls: Call[],
  issues: JiraIssue[],
  overrides: Record<string, unknown> = {},
) {
  return {
    jira: fakeJira({ SUP: issues }, calls),
    kaneo: fakeKaneo(calls),
    workspaceId: "ws_1",
    targets: TARGETS,
    filterJql: "",
    dryRun: false,
    skipComments: false,
    skipAttachments: false,
    ...overrides,
  } as const;
}

describe("migrate", () => {
  it("dry run reads Jira only and writes nothing to Kaneo", async () => {
    const calls: Call[] = [];
    const reports = await migrate(
      options(calls, buildIssues(), { dryRun: true }),
    );

    const report = reports[0]!;
    expect(report.failed).toBe(false);
    expect(report.kaneoProjectId).toBeNull();
    expect(report.columns).toBe(2);
    expect(report.sourceCounts.issues).toBe(2);
    expect(report.sourceCounts.comments).toBe(1);
    expect(report.sourceCounts.attachments).toBe(1);
    expect(report.sourceCounts.worklogs).toBe(1);

    const methods = calls.map((call) => call.method);
    expect(methods).toContain("searchIssues");
    expect(methods).not.toContain("createProject");
    expect(methods).not.toContain("createTask");
  });

  it("creates the project, columns and tasks", async () => {
    const calls: Call[] = [];
    const reports = await migrate(options(calls, buildIssues()));

    const report = reports[0]!;
    expect(report.failed).toBe(false);
    expect(report.kaneoProjectId).toBe("p_new");
    expect(report.tasks).toBe(2);
    expect(report.taskIds["SUP-1"]).toBe("t_1");
    expect(report.taskIds["SUP-2"]).toBe("t_2");

    // Default columns are replaced by one column per Jira status.
    const createProject = calls.find((call) => call.method === "createProject");
    expect(createProject?.args[0]).toMatchObject({
      name: "Support",
      icon: "Layout",
    });

    const columns = calls.filter((call) => call.method === "createColumn");
    expect(
      columns.map((call) => (call.args[0] as { name: string }).name),
    ).toEqual(["To Do", "Done"]);
    const doneColumn = columns[1]?.args[0] as { isFinal?: boolean } | undefined;
    expect(doneColumn?.isFinal).toBe(true);

    const statuses = calls
      .filter((call) => call.method === "createTask")
      .map((call) => (call.args[0] as { status: string }).status);
    expect(statuses).toEqual(["to-do", "done"]);
  });

  it("uploads attachments and embeds them in the description", async () => {
    const calls: Call[] = [];
    const reports = await migrate(options(calls, buildIssues()));

    const firstTask = calls.find(
      (call) =>
        call.method === "createTask" &&
        (call.args[0] as { title: string }).title.includes("SUP-1"),
    );
    const input = firstTask?.args[0] as {
      description: string;
      draftAssetIds?: string[];
    };

    expect(input.description).toContain("Screenshot below:");
    expect(input.description).toContain(
      "![screenshot.png](https://kaneo.local/asset/asset_1)",
    );
    expect(input.description).toContain("Imported from Jira");
    expect(input.description).toContain("Jane Doe");
    expect(input.draftAssetIds).toEqual(["asset_1"]);

    expect(reports[0]?.attachments.uploaded).toBe(1);
    expect(calls.some((call) => call.method === "uploadAssetBytes")).toBe(true);
  });

  it("moves oversized attachments to the appendix ledger", async () => {
    const calls: Call[] = [];
    const issues = buildIssues();
    const oversized = issues[0]?.fields.attachment?.[0] as
      | { size: number }
      | undefined;
    if (oversized) {
      oversized.size = MAX_ATTACHMENT_BYTES + 1;
    }

    const reports = await migrate(options(calls, issues));
    const report = reports[0]!;

    expect(report.attachments.skipped).toBe(1);
    expect(report.attachments.uploaded).toBe(0);
    expect(calls.some((call) => call.method === "downloadAttachment")).toBe(
      false,
    );

    const firstTask = calls.find(
      (call) =>
        call.method === "createTask" &&
        (call.args[0] as { title: string }).title.includes("SUP-1"),
    );
    const input = firstTask?.args[0] as { description?: string };
    expect(input.description).toContain("screenshot.png");
    expect(input.description).toContain("Attachments not transferred");
  });

  it("creates comments with attribution and worklogs as time entries", async () => {
    const calls: Call[] = [];
    await migrate(options(calls, buildIssues()));

    const comment = calls.find((call) => call.method === "createComment");
    expect(comment?.args[1]).toContain("First!");
    expect(comment?.args[1]).toContain(
      "Originally commented by Jane Doe on 2026-01-02",
    );
    expect(comment?.args[2]).toBe("Jane Doe");
    expect(comment?.args[3]).toBe("jira");

    const timeEntry = calls.find((call) => call.method === "createTimeEntry");
    expect(timeEntry?.args[0]).toMatchObject({
      startTime: "2026-01-03T09:00:00.000Z",
      endTime: "2026-01-03T09:30:00.000Z",
    });
  });

  it("maps fitting custom fields to Kaneo custom fields", async () => {
    const calls: Call[] = [];
    await migrate(options(calls, buildIssues()));

    const fields = calls
      .filter((call) => call.method === "createCustomField")
      .map((call) => call.args[0]);
    expect(fields).toContainEqual({
      projectId: "p_new",
      name: "Story Points",
      type: "number",
    });
    expect(fields).toContainEqual({
      projectId: "p_new",
      name: "Severity",
      type: "dropdown",
      options: ["Critical"],
    });

    // The Sprint field is skipped; it is handled by labels and the appendix.
    expect(
      fields.some((field) => (field as { name: string }).name === "Sprint"),
    ).toBe(false);

    const firstTask = calls.find(
      (call) =>
        call.method === "createTask" &&
        (call.args[0] as { title: string }).title.includes("SUP-1"),
    );
    const input = firstTask?.args[0] as { customFields?: unknown[] };
    const customFields = input.customFields;
    expect(customFields).toEqual([{ fieldId: "cf_1", value: "5" }]);
  });

  it("applies labels, assignees, priorities and dates", async () => {
    const calls: Call[] = [];
    await migrate(options(calls, buildIssues()));

    const firstTask = calls.find(
      (call) =>
        call.method === "createTask" &&
        (call.args[0] as { title: string }).title.includes("SUP-1"),
    );
    const input = firstTask?.args[0] as Record<string, unknown>;

    expect(input.title).toBe("[SUP-1] Summary SUP-1");
    expect(input.priority).toBe("high");
    expect(input.userId).toBe("ku_1");
    expect(input.startDate).toBe("2026-01-01T10:00:00.000Z");
    expect(input.dueDate).toBe("2026-06-01T23:59:59.000Z");

    const labelNames = calls
      .filter((call) => call.method === "createLabel")
      .map((call) => (call.args[0] as { name: string }).name);
    expect(labelNames).toContain("customer");
    expect(labelNames).toContain("type:bug");
  });

  it("creates relations after all tasks exist", async () => {
    const calls: Call[] = [];
    const reports = await migrate(options(calls, buildIssues()));

    const relations = calls
      .filter((call) => call.method === "createTaskRelation")
      .map((call) => call.args[0]);

    // SUP-2 is a subtask of SUP-1 and they are also linked as related.
    expect(relations).toContainEqual({
      sourceTaskId: "t_1",
      targetTaskId: "t_2",
      relationType: "subtask",
    });
    expect(relations).toContainEqual({
      sourceTaskId: "t_1",
      targetTaskId: "t_2",
      relationType: "related",
    });
    expect(reports[0]?.relations).toBe(2);
  });

  it("skips issues recorded as already imported and still links to them", async () => {
    const calls: Call[] = [];
    const reports = await migrate(
      options(calls, buildIssues(), {
        importedTasks: { "SUP-1": "t_existing" },
      }),
    );

    const report = reports[0]!;
    expect(report.skippedIssues).toBe(1);
    expect(report.tasks).toBe(1);
    expect(report.taskIds["SUP-1"]).toBe("t_existing");

    const relations = calls
      .filter((call) => call.method === "createTaskRelation")
      .map((call) => call.args[0]);
    expect(relations).toContainEqual({
      sourceTaskId: "t_existing",
      targetTaskId: "t_1",
      relationType: "subtask",
    });
  });

  it("isolates project failures", async () => {
    const calls: Call[] = [];
    const brokenJira = {
      baseUrl: "https://acme.atlassian.net",
      async listFields() {
        return FIELD_METADATA;
      },
      async searchIssues(jql: string) {
        if (jql.includes("BROKEN")) {
          throw new Error("Jira exploded");
        }
        return buildIssues();
      },
      async listComments() {
        return [];
      },
      async listWorklogs() {
        return [];
      },
      async downloadAttachment() {
        throw new Error("unreachable");
      },
    } as unknown as JiraClient;

    const reports = await migrate({
      jira: brokenJira,
      kaneo: fakeKaneo(calls),
      workspaceId: "ws_1",
      targets: [
        { key: "SUP", name: "Support" },
        { key: "BROKEN", name: "Broken" },
      ],
      filterJql: "",
      dryRun: false,
      skipComments: false,
      skipAttachments: false,
    });

    expect(reports[0]?.failed).toBe(false);
    expect(reports[1]?.failed).toBe(true);
    expect(reports[1]?.error).toContain("Jira exploded");
  });

  it("honours the skip flags", async () => {
    const calls: Call[] = [];
    const reports = await migrate(
      options(calls, buildIssues(), {
        skipComments: true,
        skipAttachments: true,
      }),
    );

    expect(calls.some((call) => call.method === "createComment")).toBe(false);
    expect(calls.some((call) => call.method === "stageTaskAsset")).toBe(false);
    expect(reports[0]?.attachments.skipped).toBe(1);
  });
});
