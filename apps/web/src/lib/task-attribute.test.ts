import { describe, expect, it } from "vite-plus/test";
import {
  compareTaskAttributes,
  getTaskAttributeById,
  isTaskAttributeRef,
} from "./task-attribute";

describe("isTaskAttributeRef", () => {
  it("accepts a complete attribute reference", () => {
    expect(
      isTaskAttributeRef({
        id: "attribute-1",
        name: "Bug",
        icon: "bug",
        iconColor: "red",
        textColor: "white",
      }),
    ).toBe(true);
  });

  it("rejects partial or malformed payloads", () => {
    expect(isTaskAttributeRef(null)).toBe(false);
    expect(isTaskAttributeRef("Bug")).toBe(false);
    expect(
      isTaskAttributeRef({
        id: "attribute-1",
        name: "Bug",
        icon: "bug",
        iconColor: "red",
      }),
    ).toBe(false);
  });
});

describe("compareTaskAttributes", () => {
  it("orders by position first and name as a tiebreak", () => {
    const low = { position: 0, name: "Task" };
    const high = { position: 1, name: "Bug" };
    expect(compareTaskAttributes(low, high)).toBeLessThan(0);
    expect(compareTaskAttributes(high, low)).toBeGreaterThan(0);
    expect(
      compareTaskAttributes({ position: 2, name: "alpha" }, {
        position: 2,
        name: "beta",
      }),
    ).toBeLessThan(0);
  });
});

describe("getTaskAttributeById", () => {
  const attributes = [
    { id: "attribute-1", name: "Task" },
    { id: "attribute-2", name: "Bug" },
  ];

  it("finds an attribute by id", () => {
    expect(getTaskAttributeById(attributes, "attribute-2")?.name).toBe("Bug");
  });

  it("returns undefined for missing ids, null and empty lists", () => {
    expect(getTaskAttributeById(attributes, "attribute-3")).toBeUndefined();
    expect(getTaskAttributeById(attributes, null)).toBeUndefined();
    expect(getTaskAttributeById(undefined, "attribute-1")).toBeUndefined();
  });
});
