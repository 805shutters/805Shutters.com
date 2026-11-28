// Run with MERCURY_WEBHOOK_SECRET supplied securely by the environment.
// Uses a non-transaction verification event: no ledger, payment or SMS effects.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const target = process.argv[2] || "https://www.805shutters.com/api/webhooks/mercury";
assert.equal(new URL(target).pathname, "/api/webhooks/mercury", "Verify the exact non-slash endpoint");
const secret = process.env.MERCURY_WEBHOOK_SECRET?.trim();
assert.ok(secret, "MERCURY_WEBHOOK_SECRET must be supplied securely; do not pass it as a command argument");
const raw = '{ "type": "webhook.verification", "id": "805-route-verification" }\n';
const digest = createHmac("sha256", secret).update(raw).digest("hex");
const dir = mkdtempSync(join(tmpdir(), "805-mercury-verify-"));
try {
  const bodyFile = join(dir, "request.json");
  writeFileSync(bodyFile, raw, { mode: 0o600 });
  for (const [name, signature, expected] of [
    ["unsigned", null, 401],
    ["bad signature", "00".repeat(32), 401],
    ["signed", digest, 200],
    ["signed replay", digest, 200],
  ]) {
    const output = join(dir, "response");
    const headers = join(dir, "headers");
    // Header travels over stdin, not command arguments or diagnostic output.
    const input = signature ? `header = "Mercury-Signature: ${signature}"\n` : "";
    const result = spawnSync("curl", ["--silent", "--show-error", "--max-time", "15", "--max-redirs", "0",
      "--config", "-", "--request", "POST", "--header", "Content-Type: application/json",
      "--data-binary", `@${bodyFile}`, "--output", output, "--dump-header", headers,
      "--write-out", "%{http_code} %{time_total}", target], { input, encoding: "utf8" });
    assert.equal(result.status, 0, `${name}: curl transport failed`);
    const [status, seconds] = result.stdout.trim().split(" ");
    assert.equal(Number(status), expected, `${name}: unexpected HTTP status`);
    assert.doesNotMatch(readFileSync(headers, "utf8"), /^location:/im, `${name}: must not redirect`);
    if (expected === 200) assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), { received: true, ignored: true });
    console.log(`${name}: ${status}; no redirect; ${seconds}s${expected === 200 ? "; handler response verified" : ""}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
