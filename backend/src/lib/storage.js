const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function rootDir() {
  const root = process.env.STORAGE_PATH || path.join(process.cwd(), 'data');
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
