import { describe, expect, it } from "vite-plus/test";
import {
  FALLBACK_TASK_ATTRIBUTE_COLOR,
  resolveTaskAttributeColor,
} from "./task-attribute-color";

describe("resolveTaskAttributeColor", () => {
  it("resolves palette tokens through their CSS variables", () => {
    expect(resolveTaskAttributeColor("stone")).toBe("var(--color-stone-500)");
    expect(resolveTaskAttributeColor("red")).toBe("var(--color-red-600)");
  });

  it("falls back for unknown tokens", () => {
    expect(resolveTaskAttributeColor("magenta")).toBe(
      FALLBACK_TASK_ATTRIBUTE_COLOR,
    );
  });
});
