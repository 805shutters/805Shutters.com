import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../store.mjs";
import { Engine } from "../engine.mjs";
import { loadConfig, isOpen, readiness } from "../config.mjs";
import {
  Worker,
  SimulationProvider,
  ProviderError,
  applyDelivery,
  TwilioProvider,
} from "../provider.mjs";
import { hmac, twilioSignature, authorizeControl } from "../security.mjs";
import { createService } from "../server.mjs";
import { randomUUID } from "node:crypto";
const id = () => randomUUID();
const config = () => ({
  ...loadConfig({}),
  offerSeconds: 25,
  hours: Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((i) => [i, [[540, 1020]]]),
  ),
  holidays: {},
  staff: {
    mike: { kind: "cell", destination: "+15555550101", sms: "+15555550101" },
    jessica: { kind: "cell", destination: "+15555550102", sms: "+15555550102" },
  },
  controlKey: "s".repeat(40),
});
function setup(t, path = ":memory:") {
  const store = new Store(path),
    engine = new Engine(store, config()),
    provider = new SimulationProvider(),
    media = {
      disconnect() {},
      collect() {
        return true;
      },
    },
    worker = new Worker(engine, provider, media);
  t.after(() => store.close());
  return { store, engine, provider, worker };
}
async function ringing(s) {
  const c = s.engine.inbound(
    "CA" + id().replaceAll("-", ""),
    "+15555550100",
    Date.parse("2026-10-06T18:00:00Z"),
  );
  s.engine.greeted(c.id, id());
  await s.worker.drain();
  return s.store.get("call", c.id);
}
async function human(s) {
  let c = await ringing(s);
  const o = c.offers[0];
  s.engine.accept(c.id, o.id, o.sid, "1");
  await s.worker.drain();
  c = s.store.get("call", c.id);
  s.engine.joined(c.id, c.ownerSid, "main", "CFmain", id());
  await s.worker.drain();
  s.engine.joined(c.id, c.sid, "main", "CFmain", id());
  return s.store.get("call", c.id);
}
async function message(s) {
  const c = s.engine.inbound(
    "CA" + id().replaceAll("-", ""),
    "+15555550100",
    Date.parse("2026-10-07T05:00:00Z"),
  );
  s.engine.greeted(c.id, id());
  return s.engine.saveMessage(
    c.id,
    {
      name: "Test caller",
      callback: "+15555550100",
      message: "Please call back.",
      confirmed: true,
    },
    id(),
  );
}

test("missing live settings fail readiness; no MTS or generic credential fallback", () => {
  const c = loadConfig({
    TWILIO_AUTH_TOKEN: "MTS token",
    XAI_API_KEY: "MTS key",
  });
  assert.equal(c.authToken, "");
  assert.equal(c.xaiKey, "");
  assert.equal(readiness(c).ready, false);
  assert.throws(() => createService({ ...c, mode: "live" }), /not ready/);
});
test("Pacific schedule covers DST and holidays with exclusive close boundary", () => {
  const c = config();
  assert.equal(isOpen(c, new Date("2026-10-06T16:00:00Z")), true);
  assert.equal(isOpen(c, new Date("2026-10-07T00:00:00Z")), false);
  assert.equal(isOpen(c, new Date("2026-11-03T16:59:00Z")), false);
  assert.equal(isOpen(c, new Date("2026-11-03T17:00:00Z")), true);
  c.holidays["2026-10-06"] = [];
  assert.equal(isOpen(c, new Date("2026-10-06T18:00:00Z")), false);
  assert.equal(isOpen({ ...c, hours: null }), false);
});
test("both offers start after greeting; pickup without press 1 never wins", async (t) => {
  const s = setup(t);
  const c = await ringing(s);
  assert.equal(c.offers.length, 2);
  assert.deepEqual(
    s.provider.operations.filter((o) => o.type === "dial").map((o) => o.staff),
    ["mike", "jessica"],
  );
  s.engine.accept(c.id, c.offers[0].id, c.offers[0].sid, "");
  assert.equal(s.store.get("call", c.id).owner, null);
});
test("competing acceptances atomically pick one; losing and late-created legs are canceled", async (t) => {
  const s = setup(t);
  const c = await ringing(s),
    [a, b] = c.offers;
  await Promise.all([
    Promise.resolve().then(() => s.engine.accept(c.id, a.id, a.sid, "1")),
    Promise.resolve().then(() => s.engine.accept(c.id, b.id, b.sid, "1")),
  ]);
  await s.worker.drain();
  assert.equal(s.store.get("call", c.id).owner, a.staff);
  assert.ok(
    s.provider.operations.some((o) => o.type === "hangup" && o.sid === b.sid),
  );
  assert.equal(
    s.store.get("call", c.id).offers.filter((o) => o.status === "accepted")
      .length,
    1,
  );
});
test("duplicate inbound and duplicate acceptance do not create extra calls or dial effects", async (t) => {
  const s = setup(t),
    c = await ringing(s),
    o = c.offers[0];
  assert.equal(s.engine.inbound(c.sid, c.from).id, c.id);
  s.engine.accept(c.id, o.id, o.sid, "1");
  const count = s.store.list("effect").length;
  s.engine.accept(c.id, o.id, o.sid, "1");
  assert.equal(s.store.list("effect").length, count);
});
test("caller is not routed to human conference before staff join and AI disconnect", async (t) => {
  const s = setup(t),
    c = await ringing(s),
    o = c.offers[0];
  s.engine.accept(c.id, o.id, o.sid, "1");
  await s.worker.drain();
  assert.equal(
    s.provider.operations.some((x) => x.type === "route" && x.sid === c.sid),
    false,
  );
  s.engine.joined(c.id, o.sid, "main", "CFmain", id());
  await s.worker.drain();
  assert.equal(s.store.get("call", c.id).ai, false);
  assert.ok(
    s.provider.operations.some((x) => x.type === "route" && x.sid === c.sid),
  );
});
test("hold precedes private consultation; transfer waits for target join before unhold and owner removal", async (t) => {
  const s = setup(t);
  let c = await human(s);
  s.provider.operations = [];
  s.engine.command(c.id, c.owner, c.revision, "consult", id());
  await s.worker.drain();
  c = s.store.get("call", c.id);
  assert.equal(c.held, true);
  assert.equal(s.provider.operations[0].type, "hold");
  assert.equal(s.provider.operations[0].hold, true);
  assert.ok(s.provider.operations.findIndex((o) => o.room === "consult") > 0);
  const target = c.offers.find((o) => o.purpose === "consult");
  s.engine.accept(c.id, target.id, target.sid, "1");
  await s.worker.drain();
  c = s.store.get("call", c.id);
  s.engine.joined(c.id, c.ownerSid, "consult", "CFconsult", id());
  s.engine.joined(c.id, c.targetSid, "consult", "CFconsult", id());
  c = s.store.get("call", c.id);
  s.engine.command(c.id, c.owner, c.revision, "complete", id());
  await s.worker.drain();
  assert.equal(s.store.get("call", c.id).held, true);
  s.engine.joined(c.id, c.targetSid, "main", "CFmain", id());
  await s.worker.drain();
  const next = s.store.get("call", c.id);
  assert.equal(next.owner, target.staff);
  assert.equal(next.held, false);
  assert.equal(next.phase, "human");
});
test("cancel returns owner before unholding; stale revisions and non-owner controls rejected", async (t) => {
  const s = setup(t);
  let c = await human(s);
  assert.throws(
    () => s.engine.command(c.id, "jessica", c.revision, "hold", id()),
    /owner/,
  );
  assert.throws(
    () => s.engine.command(c.id, c.owner, c.revision - 1, "hold", id()),
    /changed/,
  );
  s.engine.command(c.id, c.owner, c.revision, "consult", id());
  await s.worker.drain();
  c = s.store.get("call", c.id);
  s.engine.command(c.id, c.owner, c.revision, "cancel", id());
  await s.worker.drain();
  assert.equal(s.store.get("call", c.id).held, true);
  s.engine.joined(c.id, c.ownerSid, "main", "CFmain", id());
  await s.worker.drain();
  assert.equal(s.store.get("call", c.id).phase, "human");
});
test("watchdog recovers handoff; caller hangup prevents pending outbound work", async (t) => {
  const s = setup(t),
    c = await ringing(s),
    o = c.offers[0];
  s.engine.accept(c.id, o.id, o.sid, "1");
  s.engine.tick(Date.now() + 30000);
  assert.equal(s.store.get("call", c.id).phase, "message");
  s.engine.ended(c.id, c.sid, id());
  await s.worker.drain();
  assert.equal(s.store.get("call", c.id).phase, "ended");
  assert.equal(
    s.provider.operations.filter((o) => o.type === "route").length,
    0,
  );
});
test("message and exactly two durable notification intents are atomic, deduped, and not falsely delivered", async (t) => {
  const s = setup(t),
    m = await message(s);
  const again = s.engine.saveMessage(
    m.callId,
    {
      name: "Test",
      callback: "+15555550100",
      message: "Duplicate",
      confirmed: true,
    },
    id(),
  );
  assert.equal(again.id, m.id);
  assert.equal(s.store.list("notification").length, 2);
  await s.worker.drain();
  assert.ok(s.store.list("notification").every((n) => n.status === "accepted"));
  const n = s.store.list("notification")[0];
  applyDelivery(s.store, n.id, n.sid, "delivered");
  applyDelivery(s.store, n.id, n.sid, "sent");
  assert.equal(s.store.get("notification", n.id).status, "delivered");
  assert.throws(
    () => applyDelivery(s.store, n.id, "SM" + "0".repeat(32), "delivered"),
    /mismatch/,
  );
});
test("database error rolls back both saved message and recipient intents", async (t) => {
  const s = setup(t);
  const c = s.engine.inbound(
    "CAfail",
    "+15555550100",
    Date.parse("2026-10-07T05:00:00Z"),
  );
  s.engine.greeted(c.id, id());
  const put = s.store.put.bind(s.store);
  s.store.put = (kind, value) => {
    if (kind === "notification" && value.recipient === "jessica")
      throw new Error("Disk failure");
    return put(kind, value);
  };
  assert.throws(
    () =>
      s.engine.saveMessage(
        c.id,
        {
          name: "Test",
          callback: "+15555550100",
          message: "Message",
          confirmed: true,
        },
        id(),
      ),
    /Disk/,
  );
  assert.equal(s.store.list("message").length, 0);
  assert.equal(s.store.list("notification").length, 0);
});
test("uncertain SMS outcome is not blindly retried and can reconcile from signed delivery evidence", async (t) => {
  const s = setup(t);
  await message(s);
  s.provider.failNext = new ProviderError("timeout", true);
  await s.worker.drain();
  const uncertain = s.store
    .list("notification")
    .find((n) => n.status === "uncertain");
  assert.ok(uncertain);
  const sent = s.provider.operations.length;
  await s.worker.drain();
  assert.equal(s.provider.operations.length, sent);
  applyDelivery(s.store, uncertain.id, "SM" + "3".repeat(32), "sent");
  assert.equal(s.store.get("notification", uncertain.id).status, "sent");
});
test("durable store survives restart with message, badge count, customer link and shared resolved status", async () => {
  const dir = mkdtempSync(join(tmpdir(), "805-phone-test-")),
    path = join(dir, "phone.sqlite");
  let store = new Store(path);
  try {
    let engine = new Engine(store, config());
    const c = engine.inbound(
      "CApersist",
      "+15555550100",
      Date.parse("2026-10-07T05:00:00Z"),
    );
    engine.greeted(c.id, id());
    const m = engine.saveMessage(
      c.id,
      {
        name: "Test",
        callback: "+15555550100",
        message: "Durable",
        confirmed: true,
      },
      id(),
    );
    engine.link(
      c.id,
      { customerId: "customer-1", customerName: "Customer", status: "matched" },
      "mike",
    );
    assert.equal(engine.snapshot().unresolvedCount, 1);
    store.close();
    store = new Store(path);
    engine = new Engine(store, config());
    assert.equal(store.get("message", m.id).customerId, "customer-1");
    engine.followup(m.id, "jessica", "resolved", "Returned call");
    assert.equal(engine.snapshot().unresolvedCount, 0);
    assert.equal(engine.snapshot().messages[0].status, "resolved");
    engine.followup(m.id, "mike", "open");
    assert.equal(engine.snapshot().unresolvedCount, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("missed call without message does not inflate unresolved-message badge", (t) => {
  const s = setup(t),
    c = s.engine.inbound("CAmissed", "anonymous");
  s.engine.ended(c.id, c.sid, id());
  assert.equal(s.engine.snapshot().unresolvedCount, 0);
  assert.equal(s.engine.snapshot().calls[0].answeredAt, undefined);
});
test("callback dials staff first and customer only after staff accepts and joins", async (t) => {
  const s = setup(t),
    m = await message(s);
  let c = s.engine.callback(m.id, "mike", id());
  await s.worker.drain();
  c = s.store.get("call", c.id);
  assert.equal(
    s.provider.operations.some((o) => o.type === "dial-customer"),
    false,
  );
  const o = c.offers[0];
  s.engine.accept(c.id, o.id, o.sid, "1");
  await s.worker.drain();
  c = s.store.get("call", c.id);
  s.engine.joined(c.id, c.ownerSid, "main", "CFmain", id());
  await s.worker.drain();
  assert.ok(s.provider.operations.some((o) => o.type === "dial-customer"));
});
test("Twilio signatures bind full configured URL, account context and exact form values", () => {
  const params = new URLSearchParams({ CallSid: "CA1", To: "+15555550111" }),
    url = "https://phone.example/twilio/inbound",
    sig = hmac("secret", url + "CallSidCA1To+15555550111", "sha1");
  assert.equal(twilioSignature("secret", url, params, sig), true);
  assert.equal(twilioSignature("secret", url + "?fake=1", params, sig), false);
});
test("staff command HMAC rejects replay, wrong actor and altered body", (t) => {
  const s = setup(t),
    at = String(Date.now()),
    nonce = id(),
    req = {
      method: "POST",
      url: "/control/calls/a/command",
      headers: {
        "x-805-time": at,
        "x-805-nonce": nonce,
        "x-805-actor": "mike",
      },
    };
  req.headers["x-805-signature"] = hmac(
    s.engine.config.controlKey,
    `POST\n${req.url}\n${at}\n${nonce}\nmike\n{}`,
  );
  assert.equal(
    authorizeControl(s.store, s.engine.config, req, "altered"),
    null,
  );
  assert.equal(authorizeControl(s.store, s.engine.config, req, "{}"), "mike");
  assert.equal(authorizeControl(s.store, s.engine.config, req, "{}"), null);
});
test("real provider refuses all network requests in simulation", async () => {
  let touched = false;
  const p = new TwilioProvider(config(), () => {
    touched = true;
  });
  await assert.rejects(() => p.hangup("CA1"), /disabled/);
  assert.equal(touched, false);
});
test("HTTP simulator is local only and refuses unauthenticated control; live webhooks disabled", async (t) => {
  const service = createService({ ...config(), database: ":memory:" });
  await new Promise((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve),
  );
  t.after(() => service.close());
  const origin = `http://127.0.0.1:${service.server.address().port}`;
  assert.equal((await fetch(origin + "/control")).status, 401);
  assert.equal(
    (
      await fetch(origin + "/simulate", {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(origin + "/twilio/inbound", { method: "POST" })).status,
    404,
  );
  const created = await (
    await fetch(origin + "/simulate/inbound", {
      method: "POST",
      body: JSON.stringify({ open: true }),
    })
  ).json();
  assert.equal(created.phase, "greeting");
  assert.equal(
    (await (await fetch(origin + "/simulate")).json()).calls.length,
    1,
  );
});

test("partial message survives caller hangup but cannot initiate an unconfirmed callback", async (t) => {
  const s = setup(t),
    c = s.engine.inbound(
      "CApartial",
      "anonymous",
      Date.parse("2026-10-07T05:00:00Z"),
    );
  s.engine.greeted(c.id, id());
  s.engine.updateDraft(c.id, {
    name: "Caller",
    callback: "+15555550100",
    message: "Please help with my shutters",
  });
  s.engine.ended(c.id, c.sid, id());
  const m = s.store.list("message")[0];
  assert.equal(m.confirmed, false);
  assert.equal(s.store.list("notification").length, 2);
  assert.equal(s.engine.snapshot().unresolvedCount, 1);
  assert.throws(
    () => s.engine.callback(m.id, "mike", id()),
    /confirmed callback/,
  );
});
test("delivered callback arriving before a send timeout remains authoritative", async (t) => {
  const s = setup(t);
  await message(s);
  s.provider.send = async (item) => {
    applyDelivery(s.store, item.id, "SM" + "7".repeat(32), "delivered");
    throw new ProviderError("timeout", true);
  };
  await s.worker.drain();
  assert.ok(
    s.store.list("notification").every((n) => n.status === "delivered"),
  );
});
test("failed transfer cancellation never unholds a caller with an uncertain extra staff leg", async (t) => {
  const s = setup(t);
  let c = await human(s);
  s.engine.command(c.id, c.owner, c.revision, "consult", id());
  await s.worker.drain();
  c = s.store.get("call", c.id);
  s.engine.command(c.id, c.owner, c.revision, "cancel", id());
  s.provider.failNext = new ProviderError("Hangup outcome unknown", true);
  await s.worker.drain();
  assert.equal(s.store.get("call", c.id).phase, "message");
  assert.equal(
    s.provider.operations.some((o) => o.type === "hold" && o.hold === false),
    false,
  );
});
test("manual customer linking persists through later automatic matching", async (t) => {
  const s = setup(t),
    m = await message(s);
  s.engine.link(
    m.callId,
    { customerId: "chosen", customerName: "Chosen", status: "matched" },
    "mike",
    true,
  );
  s.engine.link(
    m.callId,
    { customerId: "automatic", status: "matched" },
    "jessica",
  );
  assert.equal(s.store.get("message", m.id).customerId, "chosen");
});

test("signed HTTP callbacks reject other numbers/accounts and persist caller completion", async (t) => {
  const c = {
    ...config(),
    mode: "live",
    database: ":memory:",
    origin: "https://phone.example",
    accountSid: "AC" + "1".repeat(32),
    authToken: "synthetic-secret",
    number: "+15555550111",
    xaiKey: "synthetic-key",
    agentId: "synthetic-agent",
    greeting: "Test",
    closedGreeting: "Test closed",
    fallbackGreeting: "Test fallback",
    liveAuthorized: true,
    agentReviewed: true,
    notificationsApproved: true,
    retentionDays: 30,
  };
  const service = createService(c, {
    provider: new SimulationProvider(),
    media: {
      token: () => "test-token",
      disconnect() {},
      collect() {
        return true;
      },
    },
  });
  await new Promise((resolve) =>
    service.server.listen(0, "127.0.0.1", resolve),
  );
  t.after(() => service.close());
  const base = `http://127.0.0.1:${service.server.address().port}`;
  async function post(path, fields) {
    const form = new URLSearchParams(fields),
      payload =
        c.origin +
        path +
        [...form.keys()]
          .sort()
          .map((k) => k + form.get(k))
          .join("");
    return fetch(base + path, {
      method: "POST",
      headers: { "X-Twilio-Signature": hmac(c.authToken, payload, "sha1") },
      body: form,
    });
  }
  const fields = {
    AccountSid: c.accountSid,
    CallSid: "CA" + "2".repeat(32),
    To: c.number,
    From: "+15555550100",
  };
  assert.equal(
    (await post("/twilio/inbound", { ...fields, To: "+15555550999" })).status,
    403,
  );
  assert.equal(
    (
      await post("/twilio/inbound", {
        ...fields,
        AccountSid: "AC" + "3".repeat(32),
      })
    ).status,
    403,
  );
  const result = await post("/twilio/inbound", fields);
  assert.equal(result.status, 200);
  assert.match(await result.text(), /<Connect><Stream/);
  assert.equal(service.store.list("call").length, 1);
  await post("/twilio/inbound", fields);
  assert.equal(service.store.list("call").length, 1);
  assert.equal(
    (
      await post("/twilio/caller-status", {
        ...fields,
        CallStatus: "completed",
      })
    ).status,
    200,
  );
  assert.equal(service.store.list("call")[0].phase, "ended");
  const sms = {
    AccountSid: c.accountSid,
    MessageSid: "SM" + "4".repeat(32),
    From: fields.From,
    To: c.number,
    Body: "Please text me back.",
  };
  assert.equal(
    (await post("/twilio/incoming-sms", { ...sms, To: "+15555550999" })).status,
    403,
  );
  assert.equal((await post("/twilio/incoming-sms", sms)).status, 200);
  assert.equal((await post("/twilio/incoming-sms", sms)).status, 200);
  assert.equal(service.store.list("message").length, 1);
  assert.equal(service.engine.snapshot().unresolvedCount, 0);
  assert.equal(service.engine.snapshot().unreadTextCount, 1);
});

test("inbound text deduplication, shared customer linkage and STOP suppress new and queued replies", async (t) => {
  const s = setup(t),
    from = "+15555550100";
  const m = s.engine.inboundText(
    "SM" + "7".repeat(32),
    from,
    "Please text me back",
  );
  assert.equal(
    s.engine.inboundText("SM" + "7".repeat(32), from, "duplicate").id,
    m.id,
  );
  assert.equal(s.store.list("message").length, 1);
  s.engine.link(
    m.callId,
    { customerId: "known", customerName: "Known", status: "matched" },
    "mike",
  );
  assert.equal(s.store.get("message", m.id).customerId, "known");
  const pending = s.engine.sendText(m.id, "mike", "Hello", true, id());
  s.engine.inboundText("SM" + "8".repeat(32), from, "STOP", "STOP");
  assert.throws(
    () => s.engine.sendText(m.id, "mike", "Hello again", true, id()),
    /opted out/,
  );
  await s.worker.drain();
  assert.equal(s.store.get("notification", pending.id).status, "failed");
  assert.equal(s.provider.operations.filter((o) => o.type === "sms").length, 0);
  assert.equal(s.engine.snapshot().unresolvedCount, 0);
  s.engine.inboundText("SM" + "9".repeat(32), from, "START", "START");
  s.engine.sendText(m.id, "mike", "Requested reply", true, id());
  await s.worker.drain();
  assert.equal(s.provider.operations.filter((o) => o.type === "sms").length, 1);
});

test("standby exposes only health and never accepts simulator, control or provider actions", async (t) => {
  const provider = new SimulationProvider();
  const service = createService(
    { ...config(), mode: "standby", database: ":memory:" },
    { provider },
  );
  await new Promise((resolve) => service.server.listen(0, "127.0.0.1", resolve));
  t.after(() => service.close());
  const base = `http://127.0.0.1:${service.server.address().port}`;
  const health = await fetch(base + "/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    service: "805-phone", mode: "standby", ready: false,
  });
  for (const path of ["/control", "/simulate/inbound", "/twilio/inbound", "/twilio/incoming-sms"]) {
    const response = await fetch(base + path, { method: "POST", body: "{}" });
    assert.equal(response.status, 503);
  }
  assert.equal(service.store.list("call").length, 0);
  assert.equal(provider.operations.length, 0);
});
