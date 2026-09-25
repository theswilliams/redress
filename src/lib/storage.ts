// Object storage abstraction. Uses Vercel Blob (private access — files are
// never served statically; access always goes through an authenticated,
// ownership-checked route handler, see app/api/documents/[documentId]/route.ts)
// when BLOB_READ_WRITE_TOKEN is configured, and falls back to the local
// filesystem otherwise so local dev works without setting up Blob storage.
// Note: the local filesystem fallback does NOT work when deployed to Vercel
// (serverless functions have a read-only filesystem outside /tmp, which is
// wiped between invocations) — BLOB_READ_WRITE_TOKEN is required in
// production.

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink, rm } from "node:fs/promises";
import path from "node:path";
import { put, get, del, list } from "@vercel/blob";

const STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_ROOT ?? "./storage/uploads");

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** True only if `target` is STORAGE_ROOT or a path inside it (a bare startsWith would also accept `uploads-evil`). */
export function isInsideStorageRoot(target: string, root: string = STORAGE_ROOT): boolean {
  const rel = path.relative(root, path.resolve(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(-120) || "file";
}

async function streamToBuffer(stream: ReadableStream | NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function saveUpload(params: {
  userId: string;
  fileName: string;
  bytes: Buffer;
}): Promise<{ storageKey: string; sha256: string; sizeBytes: number }> {
  const safeName = sanitizeFileName(params.fileName);
  const storageKey = `${params.userId}/${randomUUID()}-${safeName}`;
  const sha256 = createHash("sha256").update(params.bytes).digest("hex");

  if (blobConfigured()) {
    await put(storageKey, params.bytes, { access: "private", addRandomSuffix: false });
  } else {
    const dir = path.join(STORAGE_ROOT, params.userId);
    await mkdir(dir, { recursive: true });
    const fullPath = path.join(STORAGE_ROOT, storageKey);
    // Defense in depth against path traversal even though we built the key ourselves.
    if (!isInsideStorageRoot(fullPath)) {
      throw new Error("Invalid storage path");
    }
    await writeFile(fullPath, params.bytes);
  }

  return { storageKey, sha256, sizeBytes: params.bytes.byteLength };
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  if (blobConfigured()) {
    const result = await get(storageKey, { access: "private" });
    if (!result || !result.stream) {
      throw new Error(`Document not found in blob storage: ${storageKey}`);
    }
    return streamToBuffer(result.stream);
  }

  const fullPath = path.join(STORAGE_ROOT, storageKey);
  if (!isInsideStorageRoot(fullPath)) {
    throw new Error("Invalid storage path");
  }
  return readFile(fullPath);
}

export async function deleteUpload(storageKey: string): Promise<void> {
  if (blobConfigured()) {
    await del(storageKey).catch(() => undefined);
    return;
  }

  const fullPath = path.join(STORAGE_ROOT, storageKey);
  if (!isInsideStorageRoot(fullPath)) {
    throw new Error("Invalid storage path");
  }
  await unlink(fullPath).catch(() => undefined);
}

/** Deletes every uploaded file for a user, e.g. as part of account deletion. */
export async function deleteAllUploadsForUser(userId: string): Promise<void> {
  if (blobConfigured()) {
    const { blobs } = await list({ prefix: `${userId}/` });
    if (blobs.length > 0) {
      await del(blobs.map((b) => b.url)).catch(() => undefined);
    }
    return;
  }

  const dir = path.join(STORAGE_ROOT, userId);
  if (!isInsideStorageRoot(dir)) {
    throw new Error("Invalid storage path");
  }
  await rm(dir, { recursive: true, force: true });
}
