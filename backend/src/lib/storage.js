const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function rootDir() {
  const configured = process.env.STORAGE_PATH || 'data';
  // A relative STORAGE_PATH must resolve to the SAME absolute directory no matter
  // which process requires this module — backend and worker are separate Node
  // processes with different cwd (backend/, worker/), so resolving against
  // process.cwd() silently gave each its own "./data" folder, with backend never
  // seeing files the worker wrote. Anchor relative paths at the repo root (three
  // levels up from this file: lib -> src -> backend -> repo root) instead, which
  // is stable regardless of which process's cwd requires the module. Absolute
  // paths (e.g. Railway's /var/data) are used as-is, unaffected by this.
  const root = path.isAbsolute(configured)
    ? configured
    : path.resolve(__dirname, '../../..', configured);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function ensureDir(...parts) {
  const dir = path.join(rootDir(), ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveBuffer(subdir, originalName, buffer) {
  const safe = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const id = crypto.randomBytes(8).toString('hex');
  const dir = ensureDir(subdir);
  const filename = `${id}-${safe}`;
  const full = path.join(dir, filename);
  fs.writeFileSync(full, buffer);
  return {
    storagePath: path.join(subdir, filename).replace(/\\/g, '/'),
    absolutePath: full,
    size: buffer.length,
  };
}

function resolvePath(storagePath) {
  const full = path.join(rootDir(), storagePath);
  if (!full.startsWith(rootDir())) {
    throw new Error('Invalid storage path');
  }
  return full;
}

function readFile(storagePath) {
  return fs.readFileSync(resolvePath(storagePath));
}

module.exports = { rootDir, ensureDir, saveBuffer, resolvePath, readFile };
