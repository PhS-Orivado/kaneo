import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { createId } from "@paralleldrive/cuid2";
import { describeStorageError } from "./describe-storage-error";
import { applyKeyPrefix, getStorageClient } from "./s3";

const PROBE_TIMEOUT_MS = 10_000;

export type StorageBackendStage =
  | "unconfigured"
  | "config-error"
  | "unreachable"
  | "no-access"
  | "ok";

export type StorageBackendStatus = {
  available: boolean;
  bucket: string | null;
  stage: StorageBackendStage;
  message: string;
};

let latestStatus: StorageBackendStatus | null = null;

// Result of the startup check; null before the API has checked once.
export function getStorageBackendStatus(): StorageBackendStatus | null {
  return latestStatus;
}

export function storageConfigErrorStatus(error: unknown): StorageBackendStatus {
  const message =
    error instanceof Error ? error.message : "S3 storage is not configured.";
  return {
    available: false,
    bucket: null,
    // getStorageConfig only throws the credential-pair error for a
    // misconfiguration; every other message means uploads are not configured.
    stage: /credentials/i.test(message) ? "config-error" : "unconfigured",
    message,
  };
}

// Narrows a probe failure to a stage with a message that is safe to show.
export function describeStorageBackendFailure(
  bucket: string,
  error: unknown,
): StorageBackendStatus {
  const described = describeStorageError(error);
  const status = described.status;
  const code = described.code;

  if (status === 401 || status === 403) {
    return {
      available: false,
      bucket,
      stage: "no-access",
      message: `Kaneo cannot access the S3 bucket "${bucket}" with the configured credentials. Check S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.`,
    };
  }
  if (status === 404 || code === "NoSuchBucket") {
    return {
      available: false,
      bucket,
      stage: "unreachable",
      message: `The S3 bucket "${bucket}" does not exist at the configured endpoint. Check S3_BUCKET and S3_ENDPOINT.`,
    };
  }
  return {
    available: false,
    bucket,
    stage: "unreachable",
    message: `Kaneo could not reach the storage backend for bucket "${bucket}" (${described.name}${code ? ` ${code}` : ""}). Check S3_ENDPOINT.`,
  };
}

async function probeBucketAccess(): Promise<StorageBackendStatus> {
  const { config, client } = getStorageClient();
  const abortSignal = AbortSignal.timeout(PROBE_TIMEOUT_MS);

  await client.send(new HeadBucketCommand({ Bucket: config.bucket }), {
    abortSignal,
  });

  // Head success covers configuration and read access; only a written and
  // removed probe object proves uploads will work too.
  const probeKey = applyKeyPrefix(
    config.keyPrefix,
    `startup-check/${createId()}.txt`,
  );
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: probeKey,
      Body: "kaneo storage backend check",
      ContentType: "text/plain",
    }),
    { abortSignal },
  );
  await client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: probeKey }),
    { abortSignal },
  );

  return {
    available: true,
    bucket: config.bucket,
    stage: "ok",
    message: `The S3 bucket "${config.bucket}" is configured, reachable, and accepts uploads.`,
  };
}

// Checks the storage backend once at API startup: configuration, connection,
// and access. Never throws; the outcome is a status with a message.
export async function checkStorageBackend(): Promise<StorageBackendStatus> {
  let status: StorageBackendStatus;
  try {
    status = await probeBucketAccess();
  } catch (error) {
    try {
      const { config } = getStorageClient();
      status = describeStorageBackendFailure(config.bucket, error);
    } catch (configError) {
      status = storageConfigErrorStatus(configError);
    }
  }

  latestStatus = status;
  return status;
}
