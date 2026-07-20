// Local filesystem object storage. This is intentionally a thin abstraction —
// swap the implementation for an S3-compatible client later without touching
// callers. Files are never served statically; access always goes through an
// authenticated, ownership-checked route handler (see
// app/api/documents/[documentId]/route.ts).

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, rm } from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? "./storage/uploads");

function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(-120) || "file";
}

export async function saveUpload(params: {
  userId: string;
  fileName: string;
  bytes: Buffer;
}): Promise<{ storageKey: string; sha256: string; sizeBytes: number }> {
  const dir = path.join(STORAGE_ROOT, params.userId);
  await mkdir(dir, { recursive: true });

  const safeName = sanitizeFileName(params.fileName);
  const storageKey = `${params.userId}/${randomUUID()}-${safeName}`;
  const fullPath = path.join(STORAGE_ROOT, storageKey);

  // Defense in depth against path traversal even though we built the key ourselves.
  if (!fullPath.startsWith(STORAGE_ROOT)) {
    throw new Error("Invalid storage path");
  }

  await writeFile(fullPath, params.bytes);

  const sha256 = createHash("sha256").update(params.bytes).digest("hex");

  return { storageKey, sha256, sizeBytes: params.bytes.byteLength };
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  const fullPath = path.join(STORAGE_ROOT, storageKey);
  if (!fullPath.startsWith(STORAGE_ROOT)) {
    throw new Error("Invalid storage path");
  }
  return readFile(fullPath);
}

export async function deleteUpload(storageKey: string): Promise<void> {
  const fullPath = path.join(STORAGE_ROOT, storageKey);
  if (!fullPath.startsWith(STORAGE_ROOT)) {
    throw new Error("Invalid storage path");
  }
  await unlink(fullPath).catch(() => undefined);
}

/** Deletes every uploaded file for a user, e.g. as part of account deletion. */
export async function deleteAllUploadsForUser(userId: string): Promise<void> {
  const dir = path.join(STORAGE_ROOT, userId);
  if (!dir.startsWith(STORAGE_ROOT)) {
    throw new Error("Invalid storage path");
  }
  await rm(dir, { recursive: true, force: true });
}
