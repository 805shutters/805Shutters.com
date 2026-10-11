import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

// One dedicated service replica, persistent local volume. Never use Vercel /tmp.
// Transactions contain synchronous local work only; provider IO is always outside.
export class Store {
  constructor(path) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, call_id TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS controls (nonce TEXT PRIMARY KEY, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS inbound (sid TEXT PRIMARY KEY, call_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
      INSERT OR IGNORE INTO schema_version VALUES(1);`);
  }
  tx(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  get(kind, id) {
    const row = this.db
      .prepare("SELECT body FROM entities WHERE kind=? AND id=?")
      .get(kind, id);
    return row ? JSON.parse(row.body) : null;
  }
  put(kind, value) {
    this.db
      .prepare(
        "INSERT INTO entities VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body",
      )
      .run(kind, value.id, JSON.stringify(value));
    return value;
  }
  list(kind) {
    return this.db
      .prepare("SELECT body FROM entities WHERE kind=? ORDER BY rowid DESC")
      .all(kind)
      .map((row) => JSON.parse(row.body));
  }
  once(id, callId) {
    return (
      this.db
        .prepare("INSERT OR IGNORE INTO events VALUES(?,?,?)")
        .run(id, callId, Date.now()).changes > 0
    );
  }
  inbound(sid, create) {
    return this.tx(() => {
      const old = this.db
        .prepare("SELECT call_id FROM inbound WHERE sid=?")
        .get(sid);
      if (old) return this.get("call", old.call_id);
      const call = create();
      this.db.prepare("INSERT INTO inbound VALUES(?,?)").run(sid, call.id);
      return this.put("call", call);
    });
  }
  effect(call, type, data = {}) {
    const id = randomUUID();
    return this.put("effect", {
      id,
      callId: call.id,
      type,
      data,
      status: "pending",
      attempts: 0,
      at: Date.now(),
      nextAt: Date.now(),
    });
  }
  // Claim before making a non-idempotent provider request. A crash leaves uncertain,
  // never "pending"; callbacks or explicit reconciliation resolve it.
  claim(kind, now = Date.now()) {
    return this.tx(() => {
      const item = this.list(kind)
        .reverse()
        .find((x) => x.status === "pending" && x.nextAt <= now);
      return item
        ? this.put(kind, {
            ...item,
            status: "sending",
            attempts: item.attempts + 1,
            leaseUntil: now + 30000,
          })
        : null;
    });
  }
  recover(now = Date.now()) {
    for (const kind of ["effect", "notification"])
      for (const item of this.list(kind))
        if (item.status === "sending" && item.leaseUntil < now)
          this.put(kind, {
            ...item,
            status: "uncertain",
            error:
              "Worker interrupted; reconcile provider evidence before retry.",
          });
  }
  close() {
    this.db.close();
  }
}
