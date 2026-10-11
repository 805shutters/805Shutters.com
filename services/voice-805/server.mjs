import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { loadConfig, readiness } from "./config.mjs";
import { Store } from "./store.mjs";
import { Engine, Conflict } from "./engine.mjs";
import {
  SimulationProvider,
  TwilioProvider,
  Worker,
  applyDelivery,
  conferenceXml,
} from "./provider.mjs";
import { MediaBridge } from "./media.mjs";
import { authorizeControl, twilioSignature, xml, twiml } from "./security.mjs";

async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 65536) throw new Error("Body too large");
  }
  return raw;
}
const reply = (res, status, data, type = "application/json") => {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(type === "application/json" ? JSON.stringify(data) : data);
};
const say = (value) => `<Say>${xml(value)}</Say>`;
export function createService(config = loadConfig(), options = {}) {
  if (config.mode === "simulation" && !config.offerSeconds)
    config = { ...config, offerSeconds: 25 }; // Synthetic fixture only; never a live default.
  if (!["simulation", "standby", "live"].includes(config.mode))
    throw new Error("Invalid phone mode");
  if (config.mode === "live" && !readiness(config).ready)
    throw new Error(
      "805 phone service is not ready: " + readiness(config).missing.join(", "),
    );
  const store = options.store || new Store(config.database),
    engine = new Engine(store, config);
  const dataset = store.get("system", "dataset");
  if (dataset && dataset.mode !== config.mode)
    throw new Error(
      "Each phone mode must use a separate database",
    );
  store.put("system", { id: "dataset", mode: config.mode });
  const provider =
    options.provider ||
    (config.mode === "live"
      ? new TwilioProvider(config)
      : new SimulationProvider());
  const media = options.media || new MediaBridge(engine, config),
    worker = new Worker(engine, provider, media);
  // Existing sessions cannot survive process restart. Recover on the next worker tick.
  for (const call of store.list("call"))
    if (call.phase !== "ended" && !options.preserveCalls)
      engine.failed(call.id, "Service restarted", `restart:${randomUUID()}`);
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, "http://localhost").pathname,
        parts = path.split("/").filter(Boolean),
        raw = await body(req);
      if (path === "/health" && req.method === "GET")
        return reply(res, 200, {
          service: "805-phone",
          mode: config.mode,
          ready: readiness(config).ready,
        });
      if (config.mode === "standby")
        return reply(res, 503, {
          error: "805 phone service is in standby; calling is disabled.",
        });
      if (config.mode === "simulation" && path === "/" && req.method === "GET")
        return reply(
          res,
          200,
          readFileSync(new URL("./simulator.html", import.meta.url), "utf8"),
          "text/html",
        );
      if (parts[0] === "control" || parts[0] === "simulate") {
        let actor;
        if (parts[0] === "simulate") {
          if (
            config.mode !== "simulation" ||
            !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
              req.socket.remoteAddress,
            )
          )
            return reply(res, 403, { error: "Simulation disabled" });
          if (
            req.headers.origin &&
            req.headers.origin !== `http://${req.headers.host}`
          )
            return reply(res, 403, { error: "Origin rejected" });
          actor = "mike";
        } else actor = authorizeControl(store, config, req, raw);
        if (!actor)
          return reply(res, 401, { error: "Staff authorization required" });
        const data = raw ? JSON.parse(raw) : {};
        if (req.method === "GET" && parts.length === 1)
          return reply(res, 200, {
            ...engine.snapshot(),
            readiness: readiness(config),
            actor,
          });
        if (req.method !== "POST")
          return reply(res, 405, { error: "Method not allowed" });
        let result;
        if (parts[1] === "calls" && parts[3] === "command")
          result = engine.command(
            parts[2],
            parts[0] === "simulate" ? data.actor || actor : actor,
            data.revision,
            data.command,
            data.commandId,
          );
        else if (parts[1] === "messages" && parts[3] === "ack")
          result = engine.acknowledge(parts[2], actor);
        else if (parts[1] === "messages" && parts[3] === "followup")
          result = engine.followup(parts[2], actor, data.status, data.note);
        else if (parts[1] === "messages" && parts[3] === "callback")
          result = engine.callback(parts[2], actor, data.commandId);
        else if (parts[1] === "messages" && parts[3] === "text")
          result = engine.sendText(
            parts[2],
            actor,
            data.text,
            data.consent,
            data.commandId,
          );
        else if (parts[1] === "calls" && parts[3] === "link")
          result = engine.link(parts[2], data, actor, true);
        else if (parts[1] === "links") {
          if (!Array.isArray(data.links) || data.links.length > 1000)
            throw new Conflict("Invalid links");
          for (const link of data.links) engine.link(link.callId, link, actor);
          result = { updated: data.links.length };
        } else if (parts[0] === "simulate")
          result = simulate(engine, provider, parts[1], data);
        else return reply(res, 404, { error: "Unknown control" });
        await worker.drain();
        return reply(res, 200, result);
      }
      if (
        config.mode !== "live" ||
        parts[0] !== "twilio" ||
        req.method !== "POST"
      )
        return reply(res, 404, { error: "Not found" });
      const params = new URLSearchParams(raw);
      if (
        !twilioSignature(
          config.authToken,
          config.origin + req.url,
          params,
          req.headers["x-twilio-signature"],
        ) ||
        params.get("AccountSid") !== config.accountSid
      )
        return reply(res, 403, {
          error: "Invalid provider signature or account",
        });
      let response = twiml("");
      const sid = params.get("CallSid");
      if (parts[1] === "incoming-sms") {
        if (params.get("To") !== config.number)
          return reply(res, 403, { error: "Wrong 805 text destination" });
        engine.inboundText(
          params.get("MessageSid"),
          params.get("From"),
          params.get("Body") || "",
          params.get("OptOutType") || "",
          params.get("NumMedia") || 0,
        );
      } else if (parts[1] === "inbound") {
        if (
          params.get("To") !== config.number ||
          !/^CA[0-9a-f]{32}$/i.test(sid || "")
        )
          return reply(res, 403, { error: "Wrong 805 number or call" });
        const call = engine.inbound(sid, params.get("From"));
        if (call.phase === "ended") response = twiml("<Hangup/>");
        else response = streamXml(config, media, call);
      } else if (parts[1] === "caller-status") {
        const row = store.db
          .prepare("SELECT call_id FROM inbound WHERE sid=?")
          .get(sid);
        if (!row || params.get("To") !== config.number)
          return reply(res, 403, { error: "Wrong inbound call identity" });
        if (
          ["completed", "failed", "busy", "no-answer", "canceled"].includes(
            params.get("CallStatus"),
          )
        )
          engine.ended(
            row.call_id,
            sid,
            `caller-status:${sid}:${params.get("CallStatus")}`,
          );
      } else if (parts[1] === "sms") {
        const item = store.get("notification", decodeURIComponent(parts[2]));
        if (
          !item ||
          params.get("To") !== item.destination ||
          params.get("From") !== config.number
        )
          return reply(res, 403, { error: "Wrong message identity" });
        applyDelivery(
          store,
          item.id,
          params.get("MessageSid"),
          params.get("MessageStatus"),
        );
      } else {
        const call = store.get("call", parts[2]);
        if (!call) return reply(res, 404, { error: "Unknown call" });
        const eventId = [
          parts[1],
          call.id,
          sid,
          params.get("SequenceNumber"),
          params.get("StatusCallbackEvent"),
          params.get("CallStatus"),
          params.get("ConferenceSid"),
        ].join(":");
        if (parts[1] === "offer") {
          const offer = call.offers.find((o) => o.id === parts[3]);
          if (
            !offer ||
            params.get("To") !== config.staff[offer.staff].destination ||
            params.get("From") !== config.number
          )
            return reply(res, 403, { error: "Wrong staff leg" });
          engine.bind(call.id, offer.id, sid);
          if (parts[4] === "status") {
            if (
              ["completed", "busy", "failed", "no-answer", "canceled"].includes(
                params.get("CallStatus"),
              )
            )
              engine.ended(call.id, sid, eventId);
          } else if (parts[4] === "accept") {
            const next = engine.accept(
              call.id,
              offer.id,
              sid,
              params.get("Digits"),
            );
            const accepted =
              next.offers.find((o) => o.id === offer.id)?.status === "accepted";
            response = accepted
              ? twiml('<Pause length="60"/>')
              : twiml(say("This call is no longer available.") + "<Hangup/>");
          } else {
            const current = store
              .get("call", call.id)
              .offers.find((o) => o.id === offer.id);
            response = ["ringing", "pending"].includes(current.status)
              ? twiml(
                  `<Gather input="dtmf" numDigits="1" timeout="${config.offerSeconds}" action="${xml(config.origin + req.url + "/accept")}">${say("805 Shutters call. Press 1 to accept.")}</Gather><Hangup/>`,
                )
              : twiml("<Hangup/>");
          }
        } else if (parts[1] === "customer") {
          if (
            call.direction !== "outbound" ||
            params.get("To") !== call.outboundTarget ||
            params.get("From") !== config.number
          )
            return reply(res, 403, { error: "Wrong callback destination" });
          engine.customerBound(call.id, sid);
          if (parts[3] === "status") engine.ended(call.id, sid, eventId);
          else
            response =
              call.phase === "ended"
                ? twiml("<Hangup/>")
                : conferenceXml(config, call, "main");
        } else if (parts[1] === "conference") {
          const role = parts[3];
          if (
            !["main", "consult"].includes(role) ||
            ![call.sid, ...call.offers.map((o) => o.sid)].includes(sid) ||
            params.get("FriendlyName") !== `805-${call.id}-${role}`
          )
            return reply(res, 403, { error: "Wrong conference identity" });
          const event = params.get("StatusCallbackEvent");
          if (event === "participant-join")
            engine.joined(
              call.id,
              sid,
              role,
              params.get("ConferenceSid"),
              eventId,
            );
          // A leave may be our intentional redirect; final CallStatus is authoritative for staff hangup.
          if (
            event === "participant-leave" &&
            sid === call.sid &&
            ["human", "held"].includes(call.phase)
          )
            engine.ended(call.id, sid, eventId);
        } else {
          if (sid !== call.sid)
            return reply(res, 403, { error: "Wrong caller leg" });
          if (parts[1] === "continue") {
            if (call.phase === "handoff" && !call.ai)
              response = conferenceXml(config, call, "main");
            else if (call.phase === "ended") response = twiml("<Hangup/>");
            else {
              engine.failed(
                call.id,
                "Voice stream ended",
                `continue:${call.revision}`,
              );
              response = twiml(
                `<Redirect>${xml(config.origin + "/twilio/fallback/" + call.id + "/name")}</Redirect>`,
              );
            }
          } else if (parts[1] === "status") {
            if (
              ["completed", "failed", "canceled", "busy", "no-answer"].includes(
                params.get("CallStatus"),
              )
            )
              engine.ended(call.id, sid, eventId);
          } else if (parts[1] === "fallback")
            response = fallback(engine, call, parts[3], params, config);
          else return reply(res, 404, { error: "Unknown callback" });
        }
      }
      reply(res, 200, response, "text/xml");
      void worker.drain();
    } catch (error) {
      if (error instanceof Conflict)
        return reply(res, 409, { error: error.message });
      // Never log caller text, credentials, or raw provider bodies.
      reply(res, 500, {
        error: "Phone operation could not be completed. Refresh or retry.",
      });
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1048576 });
  server.on("upgrade", (req, socket, head) => {
    if (
      config.mode !== "live" ||
      req.url !== "/media" ||
      !twilioSignature(
        config.authToken,
        config.origin + "/media",
        new URLSearchParams(),
        req.headers["x-twilio-signature"],
      )
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => media.attach(ws));
  });
  // Standby is health-only: do not advance calls or submit/reconcile effects.
  const timer =
    config.mode === "standby"
      ? null
      : setInterval(() => void worker.drain().catch(() => {}), 1000);
  timer?.unref();
  const reconciliation =
    config.mode === "standby"
      ? null
      : setInterval(() => void worker.reconcile().catch(() => {}), 60000);
  reconciliation?.unref();
  return {
    server,
    store,
    engine,
    provider,
    worker,
    close: async () => {
      clearInterval(timer);
      clearInterval(reconciliation);
      for (const ws of wss.clients) ws.terminate();
      await new Promise((resolve) => server.close(resolve));
      store.close();
    },
  };
}
function streamXml(config, media, call) {
  return twiml(
    `<Connect><Stream url="${xml(config.origin.replace(/^https:/, "wss:") + "/media")}"><Parameter name="callId" value="${call.id}"/><Parameter name="token" value="${xml(media.token(call))}"/></Stream></Connect><Redirect>${xml(config.origin + "/twilio/continue/" + call.id)}</Redirect>`,
  );
}
function fallback(engine, call, step, p, config) {
  if (call.phase === "ended") return twiml("<Hangup/>");
  const url = (next) =>
    xml(`${config.origin}/twilio/fallback/${call.id}/${next}`);
  const gather = (next, prompt, input = "speech", extra = "") =>
    twiml(
      `<Gather input="${input}" actionOnEmptyResult="true" action="${url(next)}" timeout="7" speechTimeout="auto" ${extra}>${say(prompt)}</Gather>`,
    );
  const current = engine.store.get("draft", call.id) || { id: call.id };
  if (step === "name")
    return gather("number", config.fallbackGreeting + " Please say your name.");
  if (step === "number") {
    current.name = (p.get("SpeechResult") || "").slice(0, 120);
    engine.store.put("draft", current);
    return gather(
      "message",
      "Enter your callback number including country code, followed by the pound key.",
      "dtmf",
      'finishOnKey="#"',
    );
  }
  if (step === "message") {
    current.callback = "+" + (p.get("Digits") || "");
    engine.store.put("draft", current);
    return gather("confirm", "Please say your short message.");
  }
  if (step === "confirm") {
    current.message = (p.get("SpeechResult") || "").slice(0, 2000);
    engine.store.put("draft", current);
    return gather(
      "save",
      `Your name is ${current.name}. Your callback number is ${[...(current.callback || "")].join(" ")}. Your message is ${current.message}. Press 1 to confirm and save, or any other key to start again.`,
      "dtmf",
      'numDigits="1"',
    );
  }
  if (step === "save" && p.get("Digits") === "1") {
    try {
      engine.saveMessage(
        call.id,
        { ...current, confirmed: true },
        `fallback:${call.id}`,
      );
      return twiml(
        say(
          "Your message has been saved for the 805 Shutters team. Thank you.",
        ) + "<Hangup/>",
      );
    } catch {
      return twiml(
        say("Your message could not be saved. Please try again.") +
          `<Redirect>${url("name")}</Redirect>`,
      );
    }
  }
  return twiml(`<Redirect>${url("name")}</Redirect>`);
}
function simulate(engine, provider, action, d) {
  const id = d.id,
    call = id ? engine.store.get("call", id) : null;
  if (action === "inbound") {
    const c = engine.inbound(
      "CA" + randomUUID().replaceAll("-", ""),
      "+15555550100",
    );
    c.open = d.open === true;
    return engine.store.put("call", c);
  }
  if (!call) throw new Conflict("Choose a simulated call");
  if (action === "greet") return engine.greeted(id, randomUUID());
  if (action === "accept") {
    const offer = call.offers.find(
      (o) => o.staff === d.staff && o.status === "ringing",
    );
    if (!offer) throw new Conflict("No ringing offer");
    return engine.accept(id, offer.id, offer.sid, "1");
  }
  if (action === "join") {
    const sid =
      d.role === "caller"
        ? call.sid
        : d.role === "target"
          ? call.targetSid
          : call.ownerSid;
    if (!sid) throw new Conflict("No participant");
    return engine.joined(
      id,
      sid,
      d.room || "main",
      "CF" + (d.room === "consult" ? "2" : "1").repeat(32),
      randomUUID(),
    );
  }
  if (action === "timeout") {
    engine.tick(Date.now() + 400000);
    return engine.store.get("call", id);
  }
  if (action === "message")
    return engine.saveMessage(
      id,
      {
        name: "Simulation caller",
        callback: "+15555550100",
        message: "Please return this simulated call.",
        confirmed: true,
      },
      randomUUID(),
    );
  if (action === "hangup") return engine.ended(id, call.sid, randomUUID());
  if (action === "delivery") {
    const n = engine.store
      .list("notification")
      .find((n) => n.messageId === call.messageId && n.recipient === d.staff);
    if (!n?.sid) throw new Conflict("No provider-accepted notification");
    return applyDelivery(engine.store, n.id, n.sid, "delivered");
  }
  throw new Conflict("Unknown simulation");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const service = createService(config);
  service.server.listen(
    config.port,
    config.mode === "simulation" ? "127.0.0.1" : "0.0.0.0",
    () => console.log(`805 phone service: ${config.mode}, port ${config.port}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      await service.close();
      process.exit(0);
    });
}
