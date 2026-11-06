import { describe, expect, it } from "vite-plus/test";
import { getStageStates } from "@/components/import/import-run-stage-list";

describe("getStageStates", () => {
  it("marks the current stage and everything before it as reached", () => {
    expect(getStageStates("reading")).toEqual({
      reading: "current",
      sprints: "pending",
      users: "pending",
      tasks: "pending",
    });
    expect(getStageStates("users")).toEqual({
      reading: "done",
      sprints: "done",
      users: "current",
      tasks: "pending",
    });
  });

  it("marks every stage done once the import completed", () => {
    expect(getStageStates("done")).toEqual({
      reading: "done",
      sprints: "done",
      users: "done",
      tasks: "done",
    });
  });

  it("treats an unknown or missing stage as fully read", () => {
    expect(getStageStates("unknown")).toEqual({
      reading: "done",
      sprints: "done",
      users: "done",
      tasks: "done",
    });
  });
});
