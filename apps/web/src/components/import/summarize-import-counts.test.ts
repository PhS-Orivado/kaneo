import { describe, expect, it } from "vite-plus/test";
import {
  summarizeImportCounts,
  sumImportCounts,
  TOTAL_COUNT_KEYS,
} from "@/components/import/summarize-import-counts";

const counts = {
  columns: 7,
  tasks: 412,
  labels: 0,
  comments: 1032,
  assignees: 30,
  relations: 4,
  sprints: 2,
  attachments: 5,
};

describe("summarizeImportCounts", () => {
  it("lists tasks, columns, labels, comments, sprints and attachments and omits zeros", () => {
    expect(summarizeImportCounts(counts)).toEqual([
      { key: "tasks", count: 412 },
      { key: "columns", count: 7 },
      { key: "comments", count: 1032 },
      { key: "sprints", count: 2 },
      { key: "attachments", count: 5 },
    ]);
  });

  it("follows the order of the keys it is given", () => {
    expect(
      summarizeImportCounts({ ...counts, labels: 3, attachments: 9 }, TOTAL_COUNT_KEYS),
    ).toEqual([
      { key: "tasks", count: 412 },
      { key: "comments", count: 1032 },
      { key: "labels", count: 3 },
      { key: "attachments", count: 9 },
    ]);
  });

  it("is empty when nothing was imported", () => {
    expect(
      summarizeImportCounts({
        ...counts,
        columns: 0,
        tasks: 0,
        comments: 0,
        sprints: 0,
        attachments: 0,
      }),
    ).toEqual([]);
  });
});

describe("sumImportCounts", () => {
  it("adds up completed projects only", () => {
    expect(
      sumImportCounts([
        { status: "completed", counts },
        { status: "completed", counts: { ...counts, tasks: 86, labels: 6 } },
        { status: "failed", counts: { ...counts, tasks: 1000 } },
        { status: "running", counts: { ...counts, tasks: 5 } },
      ]),
    ).toEqual({
      columns: 14,
      tasks: 498,
      labels: 6,
      comments: 2064,
      assignees: 60,
      relations: 8,
      sprints: 4,
      attachments: 10,
    });
  });
});
