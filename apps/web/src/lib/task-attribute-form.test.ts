import { describe, expect, it } from "vite-plus/test";
import {
  hasTaskAttributeDraftErrors,
  validateTaskAttributeDraft,
  type TaskAttributeDraft,
} from "./task-attribute-form";

const valid: TaskAttributeDraft = {
  name: "Bug",
  description: "",
  icon: "Bug",
  iconColor: "red",
  textColor: "red",
  isDefault: false,
};

describe("validateTaskAttributeDraft", () => {
  it("accepts a complete draft", () => {
    expect(validateTaskAttributeDraft(valid)).toEqual({});
    expect(hasTaskAttributeDraftErrors(validateTaskAttributeDraft(valid))).toBe(
      false,
    );
  });

  it("requires a non-empty name", () => {
    expect(validateTaskAttributeDraft({ ...valid, name: "   " }).name).toBe(
      "required",
    );
  });

  it("rejects names beyond the limit", () => {
    expect(
      validateTaskAttributeDraft({ ...valid, name: "a".repeat(65) }).name,
    ).toBe("tooLong");
  });

  it("rejects descriptions beyond the limit", () => {
    expect(
      validateTaskAttributeDraft({
        ...valid,
        description: "a".repeat(257),
      }).description,
    ).toBe("tooLong");
  });

  it("rejects unknown icons and palette tokens", () => {
    const errors = validateTaskAttributeDraft({
      ...valid,
      icon: "NotAnIcon",
      iconColor: "magenta",
      textColor: "chartreuse",
    });
    expect(errors.icon).toBe("invalid");
    expect(errors.iconColor).toBe("invalid");
    expect(errors.textColor).toBe("invalid");
    expect(hasTaskAttributeDraftErrors(errors)).toBe(true);
  });
});
