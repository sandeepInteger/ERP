import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";

// Local-disk document storage. Every caller goes through these functions, so moving
// to S3 later (as HRMS does) only changes this file.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const ROOT = path.resolve(process.env["UPLOAD_DIR"] ?? "./uploads");

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
]);

function resolveKey(key: string): string {
  const full = path.resolve(ROOT, key);
  // A key comes from our own database, but never let one escape the upload folder.
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key");
  return full;
}

/** Saves a file under <prefix>/<uuid><ext> and returns its storage key. */
export async function saveFile(prefix: string, fileName: string, data: Buffer): Promise<string> {
  const ext = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const key = `${prefix}/${randomUUID()}${ext}`;
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return key;
}

export async function openFile(key: string) {
  const full = resolveKey(key);
  const info = await stat(full);
  return { stream: createReadStream(full), size: info.size };
}
