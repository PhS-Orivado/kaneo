import { describe, expect, it } from "vite-plus/test";
import { applyInstanceConfigEnv } from "../../../apps/api/src/instance-config/apply-instance-config-env";
import {
  INSTANCE_CONFIG_FIELDS,
  type InstanceConfigRow,
} from "../../../apps/api/src/instance-config/instance-config-fields";

const FIELD_KEYS = INSTANCE_CONFIG_FIELDS.map((field) => field.env);

// Keys must be cleaned before the first apply call: it snapshots the
// environment once and later restores cleared values from that snapshot.
for (const key of FIELD_KEYS) {
  delete process.env[key];
}
process.env.S3_BUCKET = "boot-bucket";

describe("applyInstanceConfigEnv", () => {
  it("applies stored values, restores the boot environment when cleared", () => {
    applyInstanceConfigEnv(null);

    const override = {
      smtp_host: "mail.example.com",
      smtp_port: 587,
      smtp_secure: true,
      s3_bucket: "ui-bucket",
    } as Partial<InstanceConfigRow>;

    applyInstanceConfigEnv(override);
    expect(process.env.SMTP_HOST).toBe("mail.example.com");
    expect(process.env.SMTP_PORT).toBe("587");
    expect(process.env.SMTP_SECURE).toBe("true");
    expect(process.env.S3_BUCKET).toBe("ui-bucket");

    // A null column falls back to the boot-time environment value.
    applyInstanceConfigEnv({ ...override, s3_bucket: null });
    expect(process.env.S3_BUCKET).toBe("boot-bucket");

    // Clearing a value that the environment never had removes the key.
    applyInstanceConfigEnv({ smtp_host: null } as Partial<InstanceConfigRow>);
    expect(process.env.SMTP_HOST).toBeUndefined();
    expect(process.env.S3_BUCKET).toBe("boot-bucket");
  });
});
