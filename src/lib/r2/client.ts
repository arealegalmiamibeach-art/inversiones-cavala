import "server-only";

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requiredEnv(name: string, fallback?: string) {
  const value = process.env[name] || (fallback ? process.env[fallback] : undefined);
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  },
});

const BUCKET = requiredEnv("R2_BUCKET_NAME", "R2_BUCKET");

export async function getUploadUrl(key: string, contentType: string, sha256: string, expiresIn = 3600) {
  if (!/^[0-9a-f]{64}$/i.test(sha256)) throw new Error("Checksum SHA-256 inválido");

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    // R2 valida los bytes antes de aceptar el objeto. Sin este checksum, un
    // cliente podría declarar un hash ajeno y sobrescribir su clave compartida.
    ChecksumSHA256: Buffer.from(sha256, "hex").toString("base64"),
  });
  return getSignedUrl(r2, command, { expiresIn });
}

export async function getDownloadUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(r2, command, { expiresIn });
}

export async function getObjectMetadata(key: string) {
  const response = await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
  return {
    contentLength: response.ContentLength ?? null,
    contentType: response.ContentType ?? null,
  };
}

export function getBucketName() {
  return BUCKET;
}

export async function deleteObject(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export function buildKey(category: string, entityId: string, filename: string) {
  return `${category}/${entityId}/${filename}`;
}
