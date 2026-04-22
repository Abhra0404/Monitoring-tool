#!/usr/bin/env node
// Copy SQL migration files + journal from src-new/db/migrations → dist/db/migrations.
// tsc ignores non-.ts files, so we do this explicitly after every build.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const src = path.join(root, "src-new", "db", "migrations");
const dst = path.join(root, "dist", "db", "migrations");

if (!fs.existsSync(src)) {
  console.error(`[copy-migrations] source not found: ${src}`);
  process.exit(1);
}

fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });

function copyRecursive(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) {
      copyRecursive(path.join(from, entry), path.join(to, entry));
    }
  } else {
    fs.copyFileSync(from, to);
  }
}

copyRecursive(src, dst);
console.log(`[copy-migrations] copied ${src} → ${dst}`);

// Also copy the plugin worker-entry.cjs (tsc ignores non-.ts files).
const workerSrc = path.join(root, "src-new", "modules", "plugins", "worker-entry.cjs");
const workerDst = path.join(root, "dist", "modules", "plugins", "worker-entry.cjs");
if (fs.existsSync(workerSrc)) {
  fs.mkdirSync(path.dirname(workerDst), { recursive: true });
  fs.copyFileSync(workerSrc, workerDst);
  console.log(`[copy-migrations] copied ${workerSrc} → ${workerDst}`);
}
