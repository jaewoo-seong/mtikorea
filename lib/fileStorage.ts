import { accessSync, constants, mkdirSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Railway persistent volumes mount at /var/data in production. Locally that
// path usually doesn't exist (or isn't writable), so fall back to a
// project-local directory for development.
function resolveStorageRoot() {
  const configured = process.env.STORAGE_PATH || "/var/data";
  try {
    mkdirSync(configured, { recursive: true });
    accessSync(configured, constants.W_OK);
    return configured;
  } catch {
    const fallback = path.join(process.cwd(), "var-data");
    mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

export const STORAGE_ROOT = resolveStorageRoot();

function resolvePath(relativePath: string) {
  const resolved = path.resolve(STORAGE_ROOT, relativePath);
  if (!resolved.startsWith(STORAGE_ROOT)) {
    throw new Error(`Path escapes storage root: ${relativePath}`);
  }
  return resolved;
}

export async function writeStorageFile(relativePath: string, contents: string) {
  const target = resolvePath(relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf-8");
  return relativePath;
}

export async function readStorageFile(relativePath: string) {
  return readFile(resolvePath(relativePath), "utf-8");
}

export async function deleteStorageFile(relativePath: string) {
  await unlink(resolvePath(relativePath));
}

export async function listStorageDir(relativePath: string) {
  return readdir(resolvePath(relativePath));
}
