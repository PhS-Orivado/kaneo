import { describe, expect, it } from "vite-plus/test";
import {
  describeStorageBackendFailure,
  getStorageBackendStatus,
  storageConfigErrorStatus,
} from "./backend-status";

describe("getStorageBackendStatus", () => {
  it("is null until the API has checked the backend", () => {
    expect(getStorageBackendStatus()).toBeNull();
  });
});

describe("storageConfigErrorStatus", () => {
  it("reports missing configuration", () => {
    const status = storageConfigErrorStatus(
      new Error(
        "S3 uploads are not configured. Set S3_ENDPOINT and S3_BUCKET (and either both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither to use the default AWS credential provider chain / IAM role).",
      ),
    );

    expect(status).toEqual({
      available: false,
      bucket: null,
      stage: "unconfigured",
      message: status.message,
    });
  });

  it("reports incomplete credentials as a configuration error", () => {
    const status = storageConfigErrorStatus(
      new Error(
        "Incomplete S3 credentials. Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither to use the default AWS credential provider chain (IAM role / IRSA / environment).",
      ),
    );

    expect(status.stage).toBe("config-error");
    expect(status.available).toBe(false);
  });
});

describe("describeStorageBackendFailure", () => {
  it("turns denied responses into a no-access status", () => {
    const status = describeStorageBackendFailure("kaneo-assets", {
      name: "AccessDenied",
      $metadata: { httpStatusCode: 403 },
    });

    expect(status.stage).toBe("no-access");
    expect(status.bucket).toBe("kaneo-assets");
    expect(status.message).toContain("cannot access");
  });

  it("turns a missing bucket into an unreachable status", () => {
    const status = describeStorageBackendFailure("kaneo-assets", {
      name: "NoSuchBucket",
      code: "NoSuchBucket",
    });

    expect(status.stage).toBe("unreachable");
    expect(status.message).toContain("does not exist");
  });

  it("turns connection failures into an unreachable status", () => {
    const status = describeStorageBackendFailure("kaneo-assets", {
      name: "Error",
      code: "ECONNREFUSED",
    });

    expect(status.stage).toBe("unreachable");
    expect(status.message).toContain("could not reach");
    expect(status.message).toContain("ECONNREFUSED");
  });
});
