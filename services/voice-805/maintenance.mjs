import { DatabaseSync, backup } from "node:sqlite";
import { chmodSync } from "node:fs";
import { Store } from "./store.mjs";
const [command, path, arg] = process.argv.slice(2);
if (command === "backup" && path && arg) {
  const db = new DatabaseSync(path, { readOnly: true });
  await backup(db, arg);
  db.close();
  chmodSync(arg, 0o600);
  console.log("805 phone database backup completed.");
} else if (command === "verify" && path) {
  const db = new DatabaseSync(path, { readOnly: true });
  const result = db.prepare("PRAGMA integrity_check").get();
  db.close();
  if (result.integrity_check !== "ok")
    throw new Error("Database integrity check failed");
  console.log("805 phone database integrity: ok");
} else if (command === "prune" && path && Number(arg) >= 1) {
  const store = new Store(path),
    before = Date.now() - Number(arg) * 86400000;
  const count = store.tx(() => {
    let removed = 0;
    for (const call of store.list("call")) {
      if (
        call.phase !== "ended" ||
        !Number.isFinite(call.endedAt) ||
        call.endedAt >= before
      )
        continue;
      const messages = store
        .list("message")
        .filter((m) => m.callId === call.id);
      if (messages.some((m) => m.status !== "resolved")) continue;
      for (const kind of [
        "message",
        "log",
        "effect",
        "draft",
        "callback",
        "incoming-text",
      ])
        for (const item of store.list(kind))
          if (
            item.callId === call.id ||
            (kind === "draft" && item.id === call.id)
          )
            store.db
              .prepare("DELETE FROM entities WHERE kind=? AND id=?")
              .run(kind, item.id);
      for (const item of store.list("notification"))
        if (messages.some((m) => m.id === item.messageId))
          store.db
            .prepare("DELETE FROM entities WHERE kind=? AND id=?")
            .run("notification", item.id);
      store.db
        .prepare("DELETE FROM entities WHERE kind=? AND id=?")
        .run("call", call.id);
      store.db.prepare("DELETE FROM events WHERE call_id=?").run(call.id);
      store.db.prepare("DELETE FROM inbound WHERE call_id=?").run(call.id);
      removed++;
    }
    store.db
      .prepare("DELETE FROM controls WHERE at<?")
      .run(Date.now() - 86400000);
    return removed;
  });
  store.close();
  console.log(
    `Pruned ${count} resolved, ended call records. Active and unresolved records retained.`,
  );
} else
  throw new Error(
    "Usage: maintenance.mjs backup DATABASE DESTINATION | verify DATABASE | prune DATABASE APPROVED_DAYS",
  );
