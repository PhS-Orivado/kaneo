export type InstanceConfigFieldType = "text" | "int" | "boolean";

export type InstanceConfigField = {
  /** Key in the public smtp/s3 response objects. */
  key: string;
  /** The process.env key the value overrides. */
  env: string;
  /** The instance_config column storing the override. */
  column: string;
  type: InstanceConfigFieldType;
  /** Secret values are never returned to the client. */
  secret?: boolean;
};

export const SMTP_FIELDS: InstanceConfigField[] = [
  { key: "host", env: "SMTP_HOST", column: "smtp_host", type: "text" },
  { key: "port", env: "SMTP_PORT", column: "smtp_port", type: "int" },
  { key: "secure", env: "SMTP_SECURE", column: "smtp_secure", type: "boolean" },
  {
    key: "requireTls",
    env: "SMTP_REQUIRE_TLS",
    column: "smtp_require_tls",
    type: "boolean",
  },
  { key: "user", env: "SMTP_USER", column: "smtp_user", type: "text" },
  {
    key: "password",
    env: "SMTP_PASSWORD",
    column: "smtp_password",
    type: "text",
    secret: true,
  },
  { key: "from", env: "SMTP_FROM", column: "smtp_from", type: "text" },
];

export const S3_FIELDS: InstanceConfigField[] = [
  { key: "endpoint", env: "S3_ENDPOINT", column: "s3_endpoint", type: "text" },
  { key: "region", env: "S3_REGION", column: "s3_region", type: "text" },
  { key: "bucket", env: "S3_BUCKET", column: "s3_bucket", type: "text" },
  {
    key: "accessKeyId",
    env: "S3_ACCESS_KEY_ID",
    column: "s3_access_key_id",
    type: "text",
  },
  {
    key: "secretAccessKey",
    env: "S3_SECRET_ACCESS_KEY",
    column: "s3_secret_access_key",
    type: "text",
    secret: true,
  },
  {
    key: "publicBaseUrl",
    env: "S3_PUBLIC_BASE_URL",
    column: "s3_public_base_url",
    type: "text",
  },
  {
    key: "keyPrefix",
    env: "S3_KEY_PREFIX",
    column: "s3_key_prefix",
    type: "text",
  },
  {
    key: "forcePathStyle",
    env: "S3_FORCE_PATH_STYLE",
    column: "s3_force_path_style",
    type: "boolean",
  },
];

export const INSTANCE_CONFIG_FIELDS = [...SMTP_FIELDS, ...S3_FIELDS];

/** Raw instance_config row; every column is nullable except id and timestamps. */
export type InstanceConfigRow = {
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_require_tls: boolean | null;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_from: string | null;
  s3_endpoint: string | null;
  s3_region: string | null;
  s3_bucket: string | null;
  s3_access_key_id: string | null;
  s3_secret_access_key: string | null;
  s3_public_base_url: string | null;
  s3_key_prefix: string | null;
  s3_force_path_style: boolean | null;
};
