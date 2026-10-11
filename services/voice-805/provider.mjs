import { randomUUID } from "node:crypto";
import { xml, twiml } from "./security.mjs";
export class ProviderError extends Error {
  constructor(message, uncertain = false, retryable = false) {
    super(message);
    this.uncertain = uncertain;
    this.retryable = retryable;
  }
}
export const roomName = (call, room) => `805-${call.id}-${room}`;
export function conferenceXml(config, call, room) {
  return twiml(
    `<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false" statusCallback="${xml(config.origin + "/twilio/conference/" + call.id + "/" + room)}" statusCallbackEvent="join leave end">${xml(roomName(call, room))}</Conference></Dial>`,
  );
}
export class TwilioProvider {
  constructor(config, fetcher = fetch) {
    this.config = config;
    this.fetch = fetcher;
  }
  async request(path, params, method = "POST") {
    const c = this.config;
    if (c.mode !== "live" || !c.liveAuthorized)
      throw new ProviderError("Live provider operations disabled");
    let response;
    try {
      response = await this.fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}/${path}`,
        {
          method,
          headers: {
            Authorization: `Basic ${Buffer.from(c.accountSid + ":" + c.authToken).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: method === "POST" ? new URLSearchParams(params) : undefined,
          signal: AbortSignal.timeout(12000),
        },
      );
    } catch {
      throw new ProviderError("Provider request outcome unknown", true);
    }
    if (!response.ok)
      throw new ProviderError(
        `Twilio HTTP ${response.status}`,
        response.status >= 500,
        response.status === 429,
      );
    try {
      return await response.json();
    } catch {
      throw new ProviderError("Provider response unreadable", true);
    }
  }
  async dial(call, offer) {
    const c = this.config,
      base = `${c.origin}/twilio/offer/${call.id}/${offer.id}`;
    return this.request("Calls.json", [
      ["To", c.staff[offer.staff].destination],
      ["From", c.number],
      ["Url", base],
      ["StatusCallback", base + "/status"],
      ["StatusCallbackEvent", "initiated"],
      ["StatusCallbackEvent", "ringing"],
      ["StatusCallbackEvent", "answered"],
      ["StatusCallbackEvent", "completed"],
      ["Timeout", String(c.offerSeconds)],
    ]);
  }
  dialCustomer(call) {
    return this.request("Calls.json", [
      ["To", call.outboundTarget],
      ["From", this.config.number],
      ["Url", `${this.config.origin}/twilio/customer/${call.id}`],
      [
        "StatusCallback",
        `${this.config.origin}/twilio/customer/${call.id}/status`,
      ],
      ["StatusCallbackEvent", "completed"],
      ["Timeout", "40"],
    ]);
  }
  route(call, sid, room) {
    return this.request(`Calls/${sid}.json`, {
      Twiml: conferenceXml(this.config, call, room),
    });
  }
  hold(call, hold) {
    if (!call.room) throw new ProviderError("Conference has not been verified");
    return this.request(
      `Conferences/${call.room}/Participants/${call.sid}.json`,
      { Hold: String(hold) },
    );
  }
  hangup(sid) {
    return this.request(`Calls/${sid}.json`, { Status: "completed" });
  }
  fallback(call) {
    return this.request(`Calls/${call.sid}.json`, {
      Url: `${this.config.origin}/twilio/fallback/${call.id}/name`,
      Method: "POST",
    });
  }
  send(item, message) {
    return this.request("Messages.json", {
      To: item.destination,
      From: this.config.number,
      Body:
        item.body ||
        `805 Shutters ${message.confirmed ? "callback" : "UNCONFIRMED message"}: ${message.name}, ${message.callback || "callback number not confirmed"}. ${message.text}`,
      StatusCallback: `${this.config.origin}/twilio/sms/${encodeURIComponent(item.id)}`,
    });
  }
  getMessage(sid) {
    return this.request(`Messages/${sid}.json`, {}, "GET");
  }
  getCall(sid) {
    return this.request(`Calls/${sid}.json`, {}, "GET");
  }
}
export class SimulationProvider {
  constructor() {
    this.operations = [];
    this.failNext = null;
  }
  async run(type, data) {
    this.operations.push({ type, ...data });
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    return {
      sid: (type === "sms" ? "SM" : "CA") + randomUUID().replaceAll("-", ""),
      status: type === "sms" ? "accepted" : "queued",
    };
  }
  dial(call, offer) {
    return this.run("dial", {
      callId: call.id,
      staff: offer.staff,
      offerId: offer.id,
    });
  }
  dialCustomer(call) {
    return this.run("dial-customer", { callId: call.id });
  }
  route(call, sid, room) {
    return this.run("route", { callId: call.id, sid, room });
  }
  hold(call, hold) {
    return this.run("hold", { callId: call.id, hold });
  }
  hangup(sid) {
    return this.run("hangup", { sid });
  }
  fallback(call) {
    return this.run("fallback", { callId: call.id });
  }
  send(item, message) {
    return this.run("sms", { itemId: item.id, messageId: message.id });
  }
}
const deliveryRank = {
  accepted: 0,
  queued: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  undelivered: 4,
  failed: 4,
};
export function applyDelivery(store, id, sid, status) {
  if (!/^SM[0-9a-f]{32}$/i.test(sid || ""))
    throw new Error("Invalid message SID");
  return store.tx(() => {
    const item = store.get("notification", id);
    if (!item) throw new Error("Unknown notification");
    if (item.sid && item.sid !== sid) throw new Error("Message SID mismatch");
    if (!(status in deliveryRank)) return item;
    if (
      item.sid &&
      ["delivered", "undelivered", "failed"].includes(item.status)
    )
      return item;
    if (
      item.sid &&
      (deliveryRank[status] ?? -1) < (deliveryRank[item.status] ?? -1)
    )
      return item;
    return store.put("notification", {
      ...item,
      sid,
      status,
      updatedAt: Date.now(),
    });
  });
}
export class Worker {
  constructor(engine, provider, media) {
    this.engine = engine;
    this.store = engine.store;
    this.provider = provider;
    this.media = media;
    this.running = false;
  }
  async effect(item) {
    const c = this.store.get("call", item.callId),
      d = item.data,
      p = this.provider;
    if (!c) return;
    if (c.phase === "ended" && !["hangup", "disconnect-ai"].includes(item.type))
      return;
    switch (item.type) {
      case "dial": {
        const offer = c.offers.find((o) => o.id === d.offerId);
        if (!offer || offer.status !== "pending") break;
        const result = await p.dial(c, offer);
        this.engine.bind(c.id, offer.id, result.sid);
        break;
      }
      case "dial-customer": {
        if (c.phase !== "callback-dialing") break;
        const result = await p.dialCustomer(c);
        this.engine.customerBound(c.id, result.sid);
        break;
      }
      case "route": {
        const allowed =
          d.room === "consult"
            ? c.held &&
              c.phase === "consult-ringing" &&
              [c.ownerSid, c.targetSid].includes(d.sid)
            : (d.sid === c.ownerSid &&
                ["handoff", "resuming", "callback-connecting"].includes(
                  c.phase,
                )) ||
              (d.sid === c.targetSid && c.phase === "completing") ||
              (d.sid === c.sid && c.phase === "handoff" && !c.ai);
        if (allowed) await p.route(c, d.sid, d.room);
        break;
      }
      case "hold": {
        const allowed = d.hold
          ? ["holding", "holding-consult"].includes(c.phase)
          : ["unholding", "unholding-resume", "unholding-transfer"].includes(
              c.phase,
            );
        if (allowed) {
          await p.hold(c, d.hold);
          this.engine.holdApplied(c.id, d.hold, `effect:${item.id}`);
        }
        break;
      }
      case "hangup":
        await p.hangup(d.sid);
        break;
      case "fallback":
        this.media?.disconnect(c.id);
        this.engine.aiDisconnected(c.id, `fallback-ai:${item.id}`);
        await p.fallback(c);
        break;
      case "disconnect-ai":
        this.media?.disconnect(c.id);
        this.engine.aiDisconnected(c.id, `effect:${item.id}`);
        break;
      case "collect":
        if (this.media?.collect(c.id) === false) await p.fallback(c);
        break;
      default:
        throw new Error("Unknown call effect");
    }
  }
  async handle(item, kind) {
    try {
      if (kind === "effect") {
        await this.effect(item);
        this.store.put(kind, { ...item, status: "done" });
      } else {
        if (this.store.get("text-preference", item.destination)?.blocked)
          throw new ProviderError("Recipient opted out; not sent");
        const message = this.store.get("message", item.messageId);
        const result = await this.provider.send(item, message);
        applyDelivery(
          this.store,
          item.id,
          result.sid,
          result.status || "accepted",
        );
      }
    } catch (error) {
      const current = this.store.get(kind, item.id);
      if (
        kind === "notification" &&
        current?.sid &&
        [
          "accepted",
          "queued",
          "sent",
          "sending",
          "delivered",
          "undelivered",
          "failed",
        ].includes(current.status)
      )
        return;
      if (kind === "effect" && item.type === "dial") {
        const call = this.store.get("call", item.callId),
          offer = call?.offers.find((o) => o.id === item.data.offerId);
        if (offer?.sid) {
          this.store.put(kind, {
            ...item,
            status: "done",
            reconciled: "signed callback bound call SID",
          });
          return;
        }
      }
      const retry = error.retryable && item.attempts < 5;
      this.store.put(kind, {
        ...item,
        status: error.uncertain ? "uncertain" : retry ? "pending" : "failed",
        nextAt:
          Date.now() +
          Math.min(60000, 1000 * 2 ** item.attempts) +
          Math.floor(Math.random() * 1000),
        error: error.message,
      });
      if (kind === "effect" && item.type === "hangup") {
        const call = this.store.get("call", item.callId);
        if (call?.phase === "resuming")
          this.engine.failed(
            call.id,
            "Transfer cancellation could not verify staff removal",
            `cancel-failed:${item.id}`,
          );
      }
      if (
        kind === "effect" &&
        !["hangup", "fallback", "disconnect-ai"].includes(item.type) &&
        !retry
      )
        this.engine.failed(
          item.callId,
          "Provider operation failed or uncertain",
          `failed:${item.id}`,
        );
    }
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      this.store.recover();
      this.engine.tick();
      // Claim a batch together so both staff offers start concurrently.
      for (let round = 0; round < 12; round++) {
        const batch = [];
        for (let i = 0; i < 10; i++) {
          const item = this.store.claim("effect");
          if (!item) break;
          batch.push(item);
        }
        if (!batch.length) break;
        // Preserve each call's effect order. Only simultaneous staff dial offers
        // share a batch; unrelated calls may progress concurrently.
        const lanes = Map.groupBy(batch, (item) => item.callId);
        await Promise.all(
          [...lanes.values()].map(async (lane) => {
            for (let i = 0; i < lane.length; ) {
              if (lane[i].type === "dial") {
                const offers = [];
                while (i < lane.length && lane[i].type === "dial")
                  offers.push(lane[i++]);
                await Promise.all(
                  offers.map((item) => this.handle(item, "effect")),
                );
              } else await this.handle(lane[i++], "effect");
            }
          }),
        );
      }
      const notifications = [];
      for (let i = 0; i < 10; i++) {
        const item = this.store.claim("notification");
        if (!item) break;
        notifications.push(item);
      }
      await Promise.all(
        notifications.map((item) => this.handle(item, "notification")),
      );
    } finally {
      this.running = false;
    }
  }
  async reconcile() {
    if (!this.provider.getMessage) return;
    for (const item of this.store.list("notification")) {
      if (
        !item.sid ||
        ["delivered", "undelivered", "failed"].includes(item.status)
      )
        continue;
      try {
        const remote = await this.provider.getMessage(item.sid);
        if (
          remote.to !== item.destination ||
          remote.from !== this.engine.config.number
        )
          continue;
        applyDelivery(this.store, item.id, remote.sid, remote.status);
      } catch {
        /* Preserve last evidence; never treat lookup failure as non-delivery. */
      }
    }
    for (const call of this.store.list("call"))
      if (call.phase !== "ended") {
        for (const sid of [call.sid, call.ownerSid].filter(Boolean))
          try {
            const remote = await this.provider.getCall(sid);
            if (
              ["completed", "failed", "busy", "no-answer", "canceled"].includes(
                remote.status,
              )
            )
              this.engine.ended(
                call.id,
                sid,
                `reconcile:${sid}:${remote.status}`,
              );
          } catch {
            /* watchdog preserves recoverability */
          }
      }
  }
}
