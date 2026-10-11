import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Store } from "../store.mjs";

test("consistent backup restores messages; retention preserves active, unresolved and incomplete records", () => {
  const directory = mkdtempSync(join(tmpdir(), "voice-805-backup-"));
  const path = join(directory, "source.sqlite"),
    copy = join(directory, "backup.sqlite");
  const script = fileURLToPath(new URL("../maintenance.mjs", import.meta.url));
  const run = (...args) =>
    execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });
  let store;
  try {
    store = new Store(path);
    const old = Date.now() - 100 * 86400000;
    for (const [id, phase, endedAt] of [
      ["resolved", "ended", old],
      ["open", "ended", old],
      ["active", "human", old],
      ["missing", "ended", undefined],
    ]) {
      store.put("call", { id, phase, endedAt });
      store.put("message", {
        id: `message-${id}`,
        callId: id,
        status: id === "open" ? "open" : "resolved",
        text: "Synthetic durable callback",
      });
      store.put("log", { id: `log-${id}`, callId: id, event: "ended" });
    }
    run("backup", path, copy);
    assert.match(run("verify", copy), /integrity: ok/);
    const restored = new Store(copy);
    assert.equal(
      restored.get("message", "message-open").text,
      "Synthetic durable callback",
    );
    assert.equal(restored.list("call").length, 4);
    restored.close();
    assert.match(run("prune", path, "30"), /Pruned 1/);
    assert.equal(store.get("call", "resolved"), null);
    assert.equal(store.get("message", "message-resolved"), null);
    assert.equal(store.get("log", "log-resolved"), null);
    assert.equal(store.list("call").length, 3);
    assert.equal(store.get("message", "message-open").status, "open");
  } finally {
    store?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
