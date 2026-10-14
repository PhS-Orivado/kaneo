import type { ImportedAttachment, ImportSource } from "@kaneo/importers";
import { describe, expect, it, vi } from "vite-plus/test";
import type { StorageBackendStatus } from "../../storage/backend-status";
import type { OpenedImportSource } from "../source/open-import-source";
import {
  appendAttachmentsToDescription,
  attachmentsUnavailableWarning,
  importLimitWarning,
  planImportAttachments,
  writeImportAttachments,
} from "./write-import-attachments";

const attachment: ImportedAttachment = {
  key: "7",
  filename: "spec.pdf",
  contentUrl: "https://acme.atlassian.net/secure/attachment/7/spec.pdf",
};

describe("planImportAttachments", () => {
  it("pairs each planned task with the attachments of its source issue", () => {
    expect(
      planImportAttachments(
        [
          { key: "10", id: "task-10", description: "First" },
          { key: "11", id: "task-11", description: "Second" },
        ],
        [
          {
            key: "10",
            attachments: [attachment, { ...attachment, key: "8" }],
          },
          { key: "11", attachments: [] },
          { key: "12", attachments: [attachment] },
        ],
      ),
    ).toEqual([
      {
        taskId: "task-10",
        description: "First",
        attachments: [attachment, { ...attachment, key: "8" }],
      },
    ]);
  });
});

describe("appendAttachmentsToDescription", () => {
  it("appends a link list below the description", () => {
    expect(
      appendAttachmentsToDescription("Fix login", [
        "[spec.pdf](https://kaneo.example.com/api/asset/1)",
      ]),
    ).toBe(
      "Fix login\n\n**Attachments**\n\n- [spec.pdf](https://kaneo.example.com/api/asset/1)",
    );
  });

  it("keeps an empty description usable", () => {
    expect(appendAttachmentsToDescription("", ["[a](u)"])).toBe(
      "\n\n**Attachments**\n\n- [a](u)",
    );
  });
});

describe("attachmentsUnavailableWarning", () => {
  it("reports the storage backend message", () => {
    const status: StorageBackendStatus = {
      available: false,
      bucket: "kaneo-assets",
      stage: "no-access",
      message: "Kaneo cannot access the S3 bucket.",
    };

    expect(attachmentsUnavailableWarning(1, status)).toBe(
      "1 attachment was not imported: Kaneo cannot access the S3 bucket.",
    );
    expect(attachmentsUnavailableWarning(3, null)).toBe(
      "3 attachments were not imported: S3 uploads are not configured.",
    );
  });
});

describe("importLimitWarning", () => {
  it("names the limit in singular and plural", () => {
    expect(importLimitWarning(1, 10 * 1024 * 1024)).toBe(
      "1 attachment exceeds the 10MB upload limit and was not imported.",
    );
    expect(importLimitWarning(2, 10 * 1024 * 1024)).toBe(
      "2 attachments exceed the 10MB upload limit and were not imported.",
    );
  });
});

function openedWith(source: Partial<ImportSource>): OpenedImportSource {
  return {
    sourceId: "jira",
    sourceName: "Jira",
    describe: (error: unknown) => ({
      status: 502,
      message: String(error),
    }),
    resetFailure: () => undefined,
    source: source as ImportSource,
  };
}

describe("writeImportAttachments", () => {
  it("skips the copy with a warning when the storage backend is unavailable", async () => {
    const download = vi.fn();
    const result = await writeImportAttachments({
      opened: openedWith({ downloadAttachment: download }),
      workspaceId: "w1",
      projectId: "p1",
      userId: "u1",
      tasks: [
        { taskId: "t1", description: "", attachments: [attachment] },
      ],
      signal: new AbortController().signal,
      status: null,
    });

    expect(result).toEqual({
      imported: 0,
      warnings: [
        "1 attachment was not imported: S3 uploads are not configured.",
      ],
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("does nothing when the source cannot download attachments", async () => {
    const result = await writeImportAttachments({
      opened: openedWith({}),
      workspaceId: "w1",
      projectId: "p1",
      userId: "u1",
      tasks: [{ taskId: "t1", description: "", attachments: [attachment] }],
      signal: new AbortController().signal,
      status: {
        available: true,
        bucket: "b",
        stage: "ok",
        message: "ok",
      },
    });

    expect(result).toEqual({ imported: 0, warnings: [] });
  });
});
