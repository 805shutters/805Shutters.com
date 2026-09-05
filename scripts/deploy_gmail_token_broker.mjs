#!/usr/bin/env node
// 805-owned integration hosted beside the existing 805 OAuth credentials.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const target = "djduaqegxwjnmjlzjdor";
const staging = mkdtempSync(join(tmpdir(), "805-gmail-broker-"));
try {
  const functionDir = join(staging, "supabase/functions/gmail-805-token-broker");
  mkdirSync(functionDir, { recursive: true });
  writeFileSync(join(staging, "supabase/config.toml"), 'project_id = "805-gmail-broker"\n[functions.gmail-805-token-broker]\nverify_jwt = false\nentrypoint = "./functions/gmail-805-token-broker/index.js"\n');
  writeFileSync(join(functionDir, "index.js"), readFileSync(new URL("../integrations/gmail-token-broker/index.js", import.meta.url), "utf8").replace("../../src/lib/crm/gmail-token-broker.ts", "./handler.ts"));
  writeFileSync(join(functionDir, "handler.ts"), readFileSync(new URL("../src/lib/crm/gmail-token-broker.ts", import.meta.url)));
  const result = spawnSync("supabase", ["functions", "deploy", "gmail-805-token-broker", "--project-ref", target, "--workdir", staging, "--use-api"], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(staging, { recursive: true, force: true });
}
