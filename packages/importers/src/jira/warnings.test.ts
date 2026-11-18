import { describe, expect, it } from "vite-plus/test";
import { BOARD_UNAVAILABLE_WARNING, buildWarnings } from "./warnings.js";

describe("buildWarnings", () => {
  it("stays quiet when nothing was dropped", () => {
    expect(
      buildWarnings({
        externalLinks: 0,
        boardUnavailable: false,
      }),
    ).toEqual([]);
  });

  it("counts outside links in singular and plural", () => {
    expect(
      buildWarnings({
        externalLinks: 1,
        boardUnavailable: false,
      }),
    ).toEqual([
      "1 parent or issue link points to another project, so it was not imported.",
    ]);
    expect(
      buildWarnings({
        externalLinks: 2,
        boardUnavailable: true,
      }),
    ).toEqual([
      "2 parent or issue links point to other projects, so they were not imported.",
      BOARD_UNAVAILABLE_WARNING,
    ]);
  });
});
