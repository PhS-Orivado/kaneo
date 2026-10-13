import { afterEach, describe, expect, it } from "vite-plus/test";
import { validateMatrixConfig } from "../../../apps/api/src/plugins/matrix/config";

const originalAllowPrivateDestinations =
  process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;

afterEach(() => {
  if (originalAllowPrivateDestinations === undefined) {
    delete process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;
  } else {
    process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS =
      originalAllowPrivateDestinations;
  }
});

const validConfig = {
  homeserverUrl: "https://127.0.0.1",
  accessToken: "syt_example-token",
  mode: "existing",
  roomId: "!room:example.com",
};

describe("validateMatrixConfig", () => {
  it("rejects private homeserver destinations by default", async () => {
    delete process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS;

    const result = await validateMatrixConfig(validConfig);

    expect(result.valid).toBe(false);
    expect(result.errors?.join(" ")).toContain("non-routable address");
  });

  it("allows private destinations when the self-hosting override is enabled", async () => {
    process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";

    const result = await validateMatrixConfig(validConfig);

    expect(result).toEqual({ valid: true });
  });

  it("rejects an explicitly empty access token", async () => {
    const result = await validateMatrixConfig({
      ...validConfig,
      accessToken: "",
    });

    expect(result.valid).toBe(false);
  });

  it("rejects a room reference that is neither an ID nor an alias", async () => {
    process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";

    const result = await validateMatrixConfig({
      ...validConfig,
      roomId: "not-a-room",
    });

    expect(result.valid).toBe(false);
  });

  it("rejects a homeserver URL without a protocol", async () => {
    process.env.KANEO_ALLOW_PRIVATE_WEBHOOK_DESTINATIONS = "true";

    const result = await validateMatrixConfig({
      ...validConfig,
      homeserverUrl: "matrix.example.com",
    });

    expect(result.valid).toBe(false);
  });
});
