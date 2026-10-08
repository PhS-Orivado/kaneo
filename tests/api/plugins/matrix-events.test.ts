import { describe, expect, it } from "vite-plus/test";
import { buildMatrixNoticeContent } from "../../../apps/api/src/plugins/matrix/events";

const data = {
  taskTitle: "Fix login flow",
  taskNumber: 12,
  projectName: "Kaneo",
  taskUrl: "https://kaneo.app/dashboard/workspace/w1/project/p1/task/t1",
  actorName: "Philipp",
  status: "in_progress",
  priority: "high",
};

describe("buildMatrixNoticeContent", () => {
  it("renders an html notice with a link to the task", () => {
    const { plain, html } = buildMatrixNoticeContent(
      "Task status changed",
      "Fix login flow moved from Todo to In Progress.",
      data,
    );

    expect(html).toContain("<strong>Task status changed</strong>");
    expect(html).toContain('<a href="' + data.taskUrl + '">');
    expect(html).toContain("#12 Fix login flow");
    expect(html).toContain("<strong>Project:</strong> Kaneo");
    expect(html).toContain("<strong>Status:</strong> In Progress");
    expect(html).toContain("<strong>Triggered by:</strong> Philipp");

    expect(plain).not.toContain("<");
    expect(plain).toContain("Task: #12 Fix login flow");
    expect(plain).toContain(data.taskUrl);
  });

  it("escapes html in task titles", () => {
    const { html, plain } = buildMatrixNoticeContent(
      "New task comment",
      "Looks <b>done</b> to me",
      { ...data, taskTitle: "<script>alert(1)</script>" },
    );

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(plain).toContain("<script>alert(1)</script>");
  });

  it("falls back to a plain task label when no task url is set", () => {
    const { html } = buildMatrixNoticeContent(
      "New task created",
      "A new task was added: Fix login flow",
      { ...data, taskUrl: null },
    );

    expect(html).not.toContain("<a ");
    expect(html).toContain("#12 Fix login flow");
  });

  it("uses a generic issue key when the task has no number", () => {
    const { plain } = buildMatrixNoticeContent(
      "Task deleted",
      "Fix login flow was deleted.",
      { ...data, taskNumber: null },
    );

    expect(plain).toContain("Task: Task update Fix login flow");
  });
});
