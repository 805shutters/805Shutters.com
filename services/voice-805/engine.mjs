import { randomUUID } from "node:crypto";
import { e164, incomingRingStaff, isOpen, staffIds } from "./config.mjs";

export const MESSAGE_WINDOW_MS = 300000;

// Scheduling intake can run during the listening welcome, while staff are still ringing.
// A human owner or any later phase stops it. Booking still requires the played spoken yes.
export function intakeActive(call) {
  return Boolean(
    call &&
      !call.owner &&
      (call.phase === "message" ||
        (call.phase === "offering" && call.listeningWelcome === true)),
  );
}

// The published scheduling route accepts phase "message" only.
// A choice during the welcome moves there without dropping the ringing offer.
export function retainRingingIntake(call) {
  if (!call || call.owner || call.phase !== "offering" || call.listeningWelcome !== true) return false;
  call.phase = "message";
  call.ringingIntake = true;
  call.deadline = Date.now() + MESSAGE_WINDOW_MS;
  return true;
}

export function initialRingOpen(call) {
  return Boolean(
    call &&
      !call.owner &&
      (call.phase === "offering" ||
        (call.phase === "message" && call.ringingIntake === true)),
  );
}

export class Conflict extends Error {}
function requireCommandId(value) {
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value))
    throw new Conflict("A unique command identifier is required");
}
export class Engine {
  constructor(store, config) {
    this.store = store;
    this.config = config;
  }
  inbound(sid, from, now = Date.now()) {
    return this.store.inbound(sid, () => ({
      id: randomUUID(),
      sid,
      from,
      createdAt: now,
      updatedAt: now,
      revision: 0,
      phase: "greeting",
      open: isOpen(this.config, new Date(now)),
      ai: true,
      owner: null,
      offers: [],
      room: null,
      consultRoom: null,
      held: false,
      callerJoined: false,
      deadline: now + 30000,
    }));
  }
  change(id, eventId, fn) {
    return this.store.tx(() => {
      const call = this.store.get("call", id);
      if (!call) throw new Conflict("Call not found");
      if (!this.store.once(eventId, id)) return call;
      const previous = call.phase;
      fn(call);
      call.revision++;
      call.updatedAt = Date.now();
      this.store.put("log", {
        id: eventId,
        callId: id,
        at: Date.now(),
        event: eventId.split(":")[0],
        from: previous,
        to: call.phase,
        revision: call.revision,
        actor: eventId.startsWith("command:") ? call.lastActor : undefined,
      });
      return this.store.put("call", call);
    });
  }
  effect(c, type, data = {}) {
    return this.store.effect(c, type, data);
  }
  offer(c, staff, purpose = "initial") {
    const offer = {
      id: randomUUID(),
      staff,
      purpose,
      sid: null,
      status: "pending",
      expiresAt: Date.now() + this.config.offerSeconds * 1000,
    };
    c.offers.push(offer);
    this.effect(c, "dial", { offerId: offer.id });
    return offer;
  }
  callback(messageId, actor, commandId) {
    requireCommandId(commandId);
    return this.store.tx(() => {
      const prior = this.store.get("callback", commandId);
      if (prior) return this.store.get("call", prior.callId);
      const m = this.store.get("message", messageId);
      if (!m || !m.confirmed || !e164.test(m.callback))
        throw new Conflict("A confirmed callback number is required");
      if (
        this.store
          .list("call")
          .some(
            (c) =>
              c.phase !== "ended" &&
              (c.owner === actor ||
                c.offers.some(
                  (o) =>
                    o.staff === actor &&
                    o.purpose === "callback" &&
                    ["pending", "ringing", "accepted"].includes(o.status),
                )),
          )
      )
        throw new Conflict("Finish your active call first");
      const now = Date.now(),
        c = {
          id: randomUUID(),
          sid: null,
          from: m.callback,
          outboundTarget: m.callback,
          direction: "outbound",
          messageId,
          customerId: m.customerId,
          customerName: m.customerName,
          createdAt: now,
          updatedAt: now,
          revision: 0,
          phase: "callback-offering",
          ai: false,
          owner: null,
          offers: [],
          held: false,
          deadline: now + this.config.offerSeconds * 1000,
        };
      this.offer(c, actor, "callback");
      this.store.put("callback", { id: commandId, callId: c.id });
      return this.store.put("call", c);
    });
  }
  inboundText(sid, from, body, optOutType = "", mediaCount = 0) {
    if (
      !/^SM[0-9a-f]{32}$/i.test(sid || "") ||
      !e164.test(from || "") ||
      typeof body !== "string" ||
      body.length > 10000
    )
      throw new Conflict("Invalid inbound text identity or body");
    return this.store.tx(() => {
      const prior = this.store.get("incoming-text", sid);
      if (prior) return this.store.get("message", prior.messageId);
      const keyword = body.trim().toUpperCase();
      const stop =
        optOutType === "STOP" ||
        [
          "STOP",
          "STOPALL",
          "UNSUBSCRIBE",
          "CANCEL",
          "END",
          "QUIT",
          "REVOKE",
          "OPT OUT",
        ].includes(keyword);
      const start =
        optOutType === "START" || ["START", "UNSTOP"].includes(keyword);
      if (stop || start)
        this.store.put("text-preference", {
          id: from,
          blocked: stop,
          at: Date.now(),
          sourceSid: sid,
        });
      const now = Date.now(),
        callId = randomUUID();
      const message = this.store.put("message", {
        id: randomUUID(),
        callId,
        kind: "sms",
        name: from,
        callback: from,
        text: body || "[Text has no body]",
        mediaCount: Number(mediaCount) || 0,
        confirmed: true,
        status: "open",
        createdAt: now,
        providerSid: sid,
        optOut: stop,
      });
      this.store.put("call", {
        id: callId,
        sid: null,
        from,
        direction: "inbound-text",
        phase: "ended",
        owner: null,
        offers: [],
        held: false,
        revision: 0,
        createdAt: now,
        endedAt: now,
        messageId: message.id,
      });
      this.store.put("incoming-text", {
        id: sid,
        callId,
        messageId: message.id,
      });
      this.store.put("log", {
        id: `text-in:${sid}`,
        callId,
        at: now,
        event: stop ? "text-opt-out" : start ? "text-opt-in" : "text-received",
      });
      return message;
    });
  }
  customerBound(id, sid) {
    return this.change(id, `customer-bound:${sid}`, (c) => {
      if (c.sid && c.sid !== sid) throw new Conflict("Wrong customer call");
      c.sid = sid;
      if (c.phase === "ended") this.effect(c, "hangup", { sid });
    });
  }
  sendText(messageId, actor, text, consent, commandId) {
    requireCommandId(commandId);
    if (
      consent !== true ||
      typeof text !== "string" ||
      !text.trim() ||
      text.length > 1000
    )
      throw new Conflict(
        "Confirm permission to text and provide a message of up to 1000 characters",
      );
    return this.store.tx(() => {
      const existing = this.store.get("notification", `reply:${commandId}`);
      if (existing) return existing;
      const m = this.store.get("message", messageId);
      if (!m || !m.confirmed || !e164.test(m.callback))
        throw new Conflict("A confirmed callback number is required");
      if (this.store.get("text-preference", m.callback)?.blocked)
        throw new Conflict("This recipient has opted out of texts.");
      this.store.put("log", {
        id: `text:${commandId}`,
        callId: m.callId,
        messageId,
        at: Date.now(),
        event: "staff-text-queued",
        actor,
      });
      return this.store.put("notification", {
        id: `reply:${commandId}`,
        messageId,
        recipient: "customer",
        destination: m.callback,
        body: text.trim(),
        consentBy: actor,
        status: "pending",
        attempts: 0,
        nextAt: Date.now(),
        sid: null,
      });
    });
  }
  greeted(id, eventId) {
    return this.change(id, eventId, (c) => {
      if (c.phase !== "greeting") return;
      // Staff ring while the listening welcome plays. greetingPlayed stays false
      // until that audio finishes; a human answer still pulls the caller immediately.
      c.phase = "offering";
      c.greetingPlayed = false;
      // The caller is already on the listening welcome, so a later no-answer
      // must not redirect them onto a second stream.
      c.listeningWelcome = true;
      c.deadline = Date.now() + this.config.offerSeconds * 1000;
      this.offerIncoming(c);
    });
  }
  markGreetingPlayed(id, eventId) {
    return this.change(id, eventId, (c) => {
      c.greetingPlayed = true;
    });
  }
  beginMessage(id, eventId) {
    return this.change(id, eventId, (c) => {
      if (c.owner || !["followup", "schedule"].includes(c.phase)) return;
      c.phase = "message";
      c.deadline = Date.now() + MESSAGE_WINDOW_MS;
    });
  }
  beginSchedule(id, eventId) {
    return this.change(id, eventId, (c) => {
      if (c.owner || c.phase !== "followup") return;
      c.phase = "schedule";
      c.deadline = Date.now() + MESSAGE_WINDOW_MS;
    });
  }
  markScheduled(id, eventId, appointment) {
    return this.change(id, eventId, (c) => {
      if (c.owner || c.phase !== "schedule") return;
      c.phase = "booked";
      c.appointmentId = appointment.appointmentId;
      c.deadline = Date.now() + 45000;
    });
  }
  agentDown(id, eventId) {
    return this.change(id, eventId, (c) => {
      if (!["greeting", "followup"].includes(c.phase)) return;
      c.phase = "voicemail";
      c.alert = "agent_down";
      c.deadline = Date.now() + 180000;
    });
  }
  requestStaff(id, eventId) {
    return this.change(id, eventId, c => {
      if (!["assistant", "greeting"].includes(c.phase)) return;
      if (!c.open) { c.phase = "message"; c.deadline = Date.now() + MESSAGE_WINDOW_MS; this.effect(c, "collect"); return; }
      c.phase = "offering";
      c.deadline = Date.now() + this.config.offerSeconds * 1000;
      this.offerIncoming(c);
    });
  }
  // Initial inbound offers only. Consult, callback, and SMS keep every staff contact.
  offerIncoming(c) {
    const ringing = incomingRingStaff(this.config);
    if (!ringing.length) {
      this.startFollowup(c, Date.now());
      return;
    }
    for (const staff of ringing) this.offer(c, staff);
  }
  bind(id, offerId, sid) {
    return this.change(id, `bind:${offerId}:${sid}`, (c) => {
      const offer = c.offers.find((o) => o.id === offerId);
      if (!offer) throw new Conflict("Unknown offer");
      if (offer.sid && offer.sid !== sid)
        throw new Conflict("Mismatched staff call");
      // A status callback that already has a CallSid wins over a Create error.
      // If the caller has already left the offer, hang that late leg up.
      if (!offer.sid && offer.status === "no-answer") {
        offer.sid = sid;
        if (initialRingOpen(c)) {
          offer.status = "ringing";
          delete offer.error;
          return;
        }
        this.effect(c, "hangup", { sid });
        return;
      }
      offer.sid = sid;
      if (offer.status === "pending") offer.status = "ringing";
      if (["canceled", "expired"].includes(offer.status) || c.phase === "ended")
        this.effect(c, "hangup", { sid });
    });
  }
  // Twilio returned a terminal Create failure and no CallSid. The matching
  // initial offer is no-answer in the same transaction, then followIfUnanswered
  // moves the caller only when every initial offer is finished.
  rejectInitialDial(id, offerId, error, eventId) {
    return this.change(id, eventId, (c) => {
      const offer = c.offers.find((o) => o.id === offerId);
      if (!offer || offer.purpose !== "initial" || offer.sid) return false;
      if (!["pending", "ringing"].includes(offer.status)) return false;
      offer.status = "no-answer";
      offer.error = String(error || "").slice(0, 300);
      this.followIfUnanswered(c, Date.now());
      return true;
    });
  }
  // The media socket never reached 101, or Twilio reported stream-error.
  // Record that and stop. Do not dial, transfer, or connect the agent again.
  mediaAttachFailed(id, error, eventId) {
    return this.change(id, eventId, (c) => {
      if (c.phase === "ended" || c.mediaStreamSid) return false;
      c.mediaFailed = true;
      if (!c.streamError) c.streamError = String(error || "").slice(0, 300);
      return true;
    });
  }
  recordStream(id, event, error, eventId) {
    return this.change(id, eventId, (c) => {
      c.lastStreamEvent = event;
      if (event !== "stream-error") return;
      c.mediaFailed = true;
      c.streamError = String(error || "").slice(0, 300);
    });
  }
  accept(id, offerId, sid, answeredBy, now = Date.now()) {
    const result = String(answeredBy || "unknown").trim().toLowerCase();
    return this.change(id, `amd:${offerId}:${sid}:${result}`, (c) => {
      const o = c.offers.find((o) => o.id === offerId);
      if (!o || o.sid !== sid) throw new Conflict("Unbound staff callback");
      if (o.status === "accepted") return;
      const human = result === "human";
      const eligible =
        human &&
        now < o.expiresAt &&
        o.status === "ringing" &&
        (o.purpose === "initial"
          ? initialRingOpen(c)
          : o.purpose === "callback"
            ? c.phase === "callback-offering"
            : c.phase === "consult-ringing");
      if (!eligible) {
        if (["pending", "ringing"].includes(o.status)) {
          o.status = human ? "canceled" : "no-answer";
          this.effect(c, "hangup", { sid });
        }
        if (o.purpose === "initial") this.followIfUnanswered(c, now);
        return;
      }
      o.status = "accepted";
      if (o.purpose === "initial") {
        c.owner = o.staff;
        c.ownerSid = sid;
        c.phase = "handoff";
        c.deadline = now + 20000;
        for (const other of c.offers)
          if (other.id !== o.id && other.purpose === "initial") {
            other.status = "canceled";
            if (other.sid) this.effect(c, "hangup", { sid: other.sid });
          }
        this.effect(c, "route", { sid, room: "main" });
        // Pull the caller as soon as a person answers. Do not wait for the
        // welcome audio to finish or for this staff leg to join.
        c.callerPulled = true;
        this.effect(c, "disconnect-ai");
      } else if (o.purpose === "callback") {
        c.owner = o.staff;
        c.ownerSid = sid;
        c.phase = "callback-connecting";
        c.deadline = now + 20000;
        this.effect(c, "route", { sid, room: "main" });
      } else {
        c.target = o.staff;
        c.targetSid = sid;
        this.effect(c, "route", { sid, room: "consult" });
      }
    });
  }
  joined(id, sid, room, conferenceSid, eventId) {
    return this.change(id, eventId, (c) => {
      if (c.phase === "ended") return;
      if (room === "main") {
        c.room = conferenceSid;
        if (sid === c.ownerSid && c.phase === "callback-connecting") {
          c.phase = "callback-dialing";
          c.deadline = Date.now() + 60000;
          this.effect(c, "dial-customer");
        }
        if (sid === c.sid && ["offering", "handoff"].includes(c.phase)) c.callerJoined = true;
        if (sid === c.ownerSid && c.phase === "handoff") {
          c.ownerJoined = true;
          if (!c.callerPulled) {
            c.callerPulled = true;
            this.effect(c, "disconnect-ai");
          }
          if (c.callerJoined) {
            c.ai = false;
            c.answeredAt = Date.now();
            c.phase = "human";
            c.deadline = null;
          }
        }
        if (sid === c.sid && c.phase === "handoff" && c.ownerJoined && !c.ai) {
          c.answeredAt = Date.now();
          c.phase = "human";
          c.deadline = null;
        }
        if (sid === c.sid && c.phase === "callback-dialing") {
          c.callerJoined = true;
          c.answeredAt = Date.now();
          c.phase = "human";
          c.deadline = null;
        }
        if (sid === c.targetSid && c.phase === "completing") {
          c.phase = "unholding-transfer";
          this.effect(c, "hold", { hold: false });
        }
        if (sid === c.ownerSid && c.phase === "resuming") {
          c.phase = "unholding-resume";
          this.effect(c, "hold", { hold: false });
        }
      } else if (room === "consult") {
        c.consultRoom = conferenceSid;
        if (sid === c.ownerSid) c.ownerInConsult = true;
        if (sid === c.targetSid) c.targetInConsult = true;
        if (
          c.ownerInConsult &&
          c.targetInConsult &&
          c.phase === "consult-ringing"
        ) {
          c.phase = "consult";
          c.deadline = Date.now() + 120000;
        }
      }
    });
  }
  aiDisconnected(id, eventId, alreadyRouted = false) {
    return this.change(id, eventId, (c) => {
      c.ai = false;
      if (c.phase === "handoff" && !alreadyRouted)
        this.effect(c, "route", { sid: c.sid, room: "main" });
    });
  }
  command(id, actor, revision, command, commandId) {
    requireCommandId(commandId);
    return this.change(id, `command:${commandId}`, (c) => {
      if (c.revision !== revision)
        throw new Conflict("Call changed. Refresh before trying again.");
      if (c.owner !== actor)
        throw new Conflict(
          "Only the current call owner can control this call.",
        );
      c.lastActor = actor;
      if (command === "hold" && c.phase === "human") {
        c.phase = "holding";
        this.effect(c, "hold", { hold: true });
      } else if (command === "resume" && c.phase === "held") {
        c.phase = "unholding";
        this.effect(c, "hold", { hold: false });
      } else if (command === "consult" && ["human", "held"].includes(c.phase)) {
        c.phase = "holding-consult";
        c.ownerInConsult = false;
        c.targetInConsult = false;
        c.target = null;
        c.targetSid = null;
        this.effect(c, "hold", { hold: true });
      } else if (command === "complete" && c.phase === "consult") {
        c.phase = "completing";
        this.effect(c, "route", { sid: c.targetSid, room: "main" });
      } else if (
        command === "cancel" &&
        ["consult-ringing", "consult", "completing"].includes(c.phase)
      ) {
        this.resume(c);
      } else if (
        command === "end" &&
        ["human", "held", "consult", "consult-ringing"].includes(c.phase)
      ) {
        this.end(c);
      } else
        throw new Conflict(
          "This action is not available in the current call state.",
        );
      if (c.phase !== "ended") c.deadline = Date.now() + 20000;
    });
  }
  holdApplied(id, hold, eventId) {
    return this.change(id, eventId, (c) => {
      c.held = hold;
      if (hold && c.phase === "holding") {
        c.phase = "held";
        c.deadline = Date.now() + 120000;
      } else if (hold && c.phase === "holding-consult") {
        c.phase = "consult-ringing";
        c.deadline = Date.now() + this.config.offerSeconds * 1000 + 15000;
        this.effect(c, "route", { sid: c.ownerSid, room: "consult" });
        this.offer(
          c,
          staffIds.find((id) => id !== c.owner),
          "consult",
        );
      } else if (
        !hold &&
        ["unholding", "unholding-resume", "unholding-transfer"].includes(
          c.phase,
        )
      ) {
        if (c.phase === "unholding-transfer") {
          this.effect(c, "hangup", { sid: c.ownerSid });
          c.owner = c.target;
          c.ownerSid = c.targetSid;
        }
        c.target = null;
        c.targetSid = null;
        c.phase = "human";
        c.deadline = null;
      }
    });
  }
  resume(c) {
    for (const o of c.offers)
      if (o.purpose === "consult") {
        o.status = "canceled";
        if (o.sid) this.effect(c, "hangup", { sid: o.sid });
      }
    c.target = null;
    c.targetSid = null;
    c.phase = "resuming";
    c.deadline = Date.now() + 20000;
    this.effect(c, "route", { sid: c.ownerSid, room: "main" });
  }
  end(c) {
    const draft = this.store.get("draft", c.id);
    if (!c.messageId && !c.booking?.verified && draft?.message) {
      const m = this.store.put("message", {
        id: randomUUID(),
        callId: c.id,
        name: draft.name || "Name not confirmed",
        callback: e164.test(draft.callback || "") ? draft.callback : "",
        text: draft.message,
        confirmed: false,
        status: "open",
        createdAt: Date.now(),
        customerId: c.customerId || null,
        customerName: c.customerName || null,
      });
      c.messageId = m.id;
      this.queueTranscript(m);
      this.store.put("log", {
        id: `partial:${m.id}`,
        callId: c.id,
        messageId: m.id,
        at: Date.now(),
        event: "unconfirmed-message-retained",
      });
    }
    c.phase = "ended";
    c.deadline = null;
    c.endedAt = Date.now();
    this.effect(c, "disconnect-ai");
    for (const sid of new Set([c.sid, ...c.offers.map((o) => o.sid)]))
      if (sid) this.effect(c, "hangup", { sid });
  }
  updateDraft(id, data) {
    const call = this.store.get("call", id);
    if (!intakeActive(call))
      throw new Conflict("Message collection is not active");
    return this.store.put("draft", {
      id,
      name: String(data.name || "")
        .trim()
        .slice(0, 120),
      callback: String(data.callback || "")
        .trim()
        .slice(0, 40),
      message: String(data.message || "")
        .trim()
        .slice(0, 2000),
      confirmed: false,
    });
  }
  ended(id, sid, eventId) {
    return this.change(id, eventId, (c) => {
      if (c.phase === "ended") return;
      if (sid === c.sid) {
        this.end(c);
        return;
      }
      const offer = c.offers.find((o) => o.sid === sid);
      if (offer) {
        const answered = offer.status === "accepted";
        offer.status = "ended";
        if (!answered && offer.purpose === "initial")
          this.followIfUnanswered(c, Date.now());
      }
      if (
        sid === c.targetSid &&
        ["consult-ringing", "consult", "completing"].includes(c.phase)
      )
        this.resume(c);
      else if (sid === c.ownerSid && c.phase !== "unholding-transfer")
        this.recover(c, "Staff disconnected");
    });
  }
  recover(c, reason) {
    if (c.phase === "ended") return;
    if (c.direction === "outbound") {
      c.recovery = reason;
      this.end(c);
      return;
    }
    c.phase = "message";
    c.recovery = reason;
    c.owner = null;
    c.ownerSid = null;
    c.target = null;
    c.targetSid = null;
    c.held = false;
    c.deadline = Date.now() + MESSAGE_WINDOW_MS;
    for (const o of c.offers) {
      o.status = "canceled";
      if (o.sid) this.effect(c, "hangup", { sid: o.sid });
    }
    // A fresh AI stream or Twilio speech/DTMF fallback removes caller from any held conference.
    this.effect(c, "fallback", { sid: c.sid });
  }
  startFollowup(c, now = Date.now()) {
    if (c.phase !== "offering") return;
    c.phase = "message";
    c.deadline = now + MESSAGE_WINDOW_MS;
    for (const o of c.offers)
      if (["pending", "ringing"].includes(o.status)) {
        o.status = "expired";
        if (o.sid) this.effect(c, "hangup", { sid: o.sid });
      }
    // A listening welcome is already the caller's audio. Redirecting it would
    // restart the greeting. An older call still uses the greeting redirect.
    if (!c.listeningWelcome && !c.mediaStreamSid && c.greetingPlayed !== false) this.effect(c, "connect-agent");
  }
  followIfUnanswered(c, now) {
    if (c.phase !== "offering" || c.owner) return;
    const initial = c.offers.filter((o) => o.purpose === "initial");
    if (
      !initial.length ||
      initial.some((o) => ["pending", "ringing", "accepted"].includes(o.status))
    )
      return;
    this.startFollowup(c, now);
  }
  failed(id, reason, eventId) {
    return this.change(id, eventId, (c) => this.recover(c, reason));
  }
  tick(now = Date.now()) {
    for (const call of this.store.list("call"))
      if (call.deadline && call.deadline <= now && call.phase !== "ended")
        this.change(call.id, `timeout:${call.revision}`, (c) => {
          if (c.phase === "offering") this.startFollowup(c, now);
          else if (c.phase === "followup") {
            c.phase = "message";
            c.deadline = now + MESSAGE_WINDOW_MS;
            this.effect(c, "fallback");
          } else if (
            ["consult", "consult-ringing", "completing", "held"].includes(
              c.phase,
            )
          )
            this.resume(c);
          else if (
            c.phase === "message" ||
            c.phase === "booked" ||
            c.phase === "voicemail" ||
            c.direction === "outbound"
          )
            this.end(c);
          else this.recover(c, "Call transition timed out");
        });
  }
  saveMessage(id, data, toolId) {
    return this.store.tx(() => {
      const call = this.store.get("call", id);
      if (!intakeActive(call))
        throw new Conflict("Message collection is not active");
      const existing = this.store.list("message").find((m) => m.callId === id);
      if (existing) return existing;
      const name = String(data.name || "").trim(),
        text = String(data.message || "").trim(),
        callback = String(data.callback || "").trim();
      if (
        !name ||
        name.length > 120 ||
        !text ||
        text.length > 2000 ||
        !e164.test(callback) ||
        data.confirmed !== true
      )
        throw new Conflict(
          "A name, confirmed callback number and confirmed message are required.",
        );
      const message = this.store.put("message", {
        id: randomUUID(),
        callId: id,
        name,
        callback,
        text,
        confirmed: true,
        createdAt: Date.now(),
        toolId,
        status: "open",
        customerId: call.customerId || null,
        customerName: call.customerName || null,
      });
      this.queueTranscript(message);
      call.messageId = message.id;
      call.revision++;
      this.store.put("call", call);
      this.store.put("log", {
        id: `message:${message.id}`,
        callId: id,
        at: Date.now(),
        event: "message-saved",
        messageId: message.id,
      });
      return message;
    });
  }
  queueTranscript(message) {
    const footer = "Reply STOP to unsubscribe; HELP for help.";
    const body = `805 Shutters message from ${message.name}, ${message.callback || "callback number not confirmed"}. ${message.text} ${footer}`.slice(0, 1600);
    for (const staff of staffIds) {
      const id = `${message.id}:${staff}`;
      if (this.store.get("notification", id)) continue;
      this.store.put("notification", {
        id,
        messageId: message.id,
        recipient: staff,
        destination: this.config.staff[staff]?.sms,
        body,
        purpose: "transcript",
        status: "pending",
        attempts: 0,
        nextAt: Date.now(),
        sid: null,
      });
    }
  }
  acknowledge(messageId, actor) {
    return this.store.tx(() => {
      const m = this.store.get("message", messageId);
      if (!m) throw new Conflict("Message missing");
      m.acknowledgedBy = actor;
      m.acknowledgedAt = Date.now();
      return this.store.put("message", m);
    });
  }
  followup(messageId, actor, status, note = "") {
    if (
      !["open", "in-progress", "resolved"].includes(status) ||
      typeof note !== "string" ||
      note.length > 2000
    )
      throw new Conflict("Invalid follow-up");
    return this.store.tx(() => {
      const m = this.store.get("message", messageId);
      if (!m) throw new Conflict("Message missing");
      m.status = status;
      m.updatedBy = actor;
      m.updatedAt = Date.now();
      m.followupNote = note;
      this.store.put("log", {
        id: randomUUID(),
        callId: m.callId,
        messageId,
        at: Date.now(),
        event: "follow-up",
        actor,
        status,
        note,
      });
      return this.store.put("message", m);
    });
  }
  link(id, link, actor, manual = false) {
    return this.change(id, `customer-link:${randomUUID()}`, (c) => {
      if (c.linkSource === "manual" && !manual) return;
      c.customerId = link.customerId || null;
      c.customerName = link.customerName || null;
      c.matchStatus = link.status;
      c.linkSource = manual ? "manual" : "phone";
      c.linkedBy = actor;
      for (const m of this.store.list("message").filter((m) => m.callId === id))
        this.store.put("message", {
          ...m,
          customerId: c.customerId,
          customerName: c.customerName,
        });
    });
  }
  snapshot() {
    const calls = this.store.list("call"),
      messages = this.store.list("message");
    return {
      calls,
      messages,
      unresolvedCount: messages.filter(
        (m) => m.kind !== "sms" && m.status !== "resolved",
      ).length,
      unreadTextCount: messages.filter(
        (m) => m.kind === "sms" && m.status !== "resolved",
      ).length,
      notifications: this.store.list("notification"),
      logs: this.store.list("log"),
      attention: this.store
        .list("effect")
        .filter((e) => ["uncertain", "failed"].includes(e.status))
        .map(({ id, callId, type, status, error }) => ({
          id,
          callId,
          type,
          status,
          error,
        })),
    };
  }
}
