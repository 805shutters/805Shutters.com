#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(
  readFileSync(
    path.join(root, "src/lib/quote-v2/source-artifacts.lock.json"),
    "utf8",
  ),
);

function parseSourceDirs(argv) {
  const directories = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--source-dir") continue;
    const value = argv[index + 1];
    if (!value) throw new Error("--source-dir requires an absolute directory path");
    directories.push(path.resolve(value));
    index += 1;
  }
  if (process.env.QUOTE_V2_SOURCE_DIR) {
    directories.push(
      ...process.env.QUOTE_V2_SOURCE_DIR.split(path.delimiter)
        .filter(Boolean)
        .map((entry) => path.resolve(entry)),
    );
  }
  return [...new Set(directories)];
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function locate(fileName, directories) {
  for (const directory of directories) {
    const candidate = path.join(directory, fileName);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

let directories;
try {
  directories = parseSourceDirs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

if (directories.length === 0) {
  console.error(
    "No source vault supplied. Pass --source-dir /absolute/path or set QUOTE_V2_SOURCE_DIR.",
  );
  process.exit(2);
}

const failures = [];
for (const artifact of lock.artifacts) {
  const filePath = locate(artifact.fileName, directories);
  if (!filePath) {
    failures.push(`${artifact.fileName}: missing`);
    continue;
  }
  const byteLength = statSync(filePath).size;
  const digest = sha256(filePath);
  if (byteLength !== artifact.byteLength || digest !== artifact.sha256) {
    failures.push(
      `${artifact.fileName}: expected ${artifact.byteLength} bytes / ${artifact.sha256}, ` +
        `found ${byteLength} bytes / ${digest}`,
    );
    continue;
  }
  console.log(`OK ${artifact.sourceId} ${artifact.fileName}`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log(`Verified ${lock.artifacts.length} immutable Quote V2 source artifacts.`);
