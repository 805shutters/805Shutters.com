// Runs under Supabase edge-runtime (no global Buffer), not plain Deno.
// edge-runtime start --main-service=services/voice-805/test/edge-runtime --port=9999
import { Buffer } from "node:buffer";
import { createSupabaseHandler } from "../../supabase-handler.mjs";
import { SupabaseState } from "../../supabase-store.mjs";
import { SupabaseWorker } from "../../supabase-worker.mjs";
import { SimulationProvider, TwilioProvider } from "../../provider.mjs";
import { hmac } from "../../security.mjs";
import { loadSupabaseConfig } from "../../supabase-config.mjs";
import { promptPublicPath } from "../../prompts.mjs";

const logged = [];
const originalError = console.error.bind(console);
console.error = (...args) => {
  logged.push(args.map(String).join(" "));
  originalError(...args);
};

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${detail}`);
}

function config() {
  return {
    ...loadSupabaseConfig({}),
    mode: "pilot",
    dataset: "pilot",
    pilotAuthorized: true,
    pilotCallers: ["+18055550199"],
    agentReviewed: true,
    workerVerified: true,
    transport: "media",
    notificationsApproved: false,
    origin: "https://example.supabase.co/functions/v1/voice-805",
    accountSid: "AC" + "a".repeat(32),
    authToken: "t".repeat(32),
    number: "+18055550100",
    xaiKey: "x".repeat(20),
    toolsKey: "t".repeat(32),
    controlKey: "c".repeat(32),
    workerKey: "w".repeat(32),
    offerSeconds: 20,
    hours: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, [[0, 1440]]])),
    holidays: {},
    staff: {
      mike: { kind: "cell", destination: "+18055550101", sms: "+18055550101" },
      jessica: { kind: "cell", destination: "+18055550102", sms: "+18055550102" },
    },
  };
}
class FakeClient {
  constructor() {
    this.row = { revision: 0, body: { entities: {}, events: {}, inbound: {} } };
    this.callbacks = [];
    this.failures = [];
    this.lookup = { match: "unmatched" };
  }
  from() {
    return { select: () => ({ eq: () => ({ single: async () => ({ data: structuredClone(this.row) }) }) }) };
  }
  async rpc(name, p) {
    if (name === "voice_805_caller_context") return { data: this.lookup };
    if (name === "voice_805_save_callback") {
      if (this.failCrm) throw new Error(this.failCrm);
      this.callbacks.push(p);
      return { data: { id: "cb-test", call_sid: p.p_call_sid } };
    }
    if (name === "voice_805_log_failure") {
      this.failures.push(p);
      return { error: null };
    }
    if (name !== "voice_805_commit") return { data: null };
    if (p.p_revision !== this.row.revision) return { data: false };
    this.row = { revision: this.row.revision + 1, body: structuredClone(p.p_body) };
    return { data: true };
  }
}
function fixture(client = new FakeClient()) {
  const c = config();
  const state = new SupabaseState(client, c);
  const provider = new SimulationProvider();
  const worker = new SupabaseWorker(state, provider);
  const tasks = [];
  const handler = createSupabaseHandler({ state, client, worker, waitUntil: (p) => tasks.push(p) });
  return { c, client, state, provider, worker, tasks, handler };
}
function carrier(f, path, fields) {
  const p = new URLSearchParams({ AccountSid: f.c.accountSid, ...fields });
  const payload = f.c.origin + path + [...new Set(p.keys())].sort().map((k) => k + p.get(k)).join("");
  return new Request(f.c.origin + path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": hmac(f.c.authToken, payload, "sha1") },
    body: p,
  });
}
const sampleWav = () => Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x07, 0x00, 0x01, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x01, 0x00, 0x08, 0x00, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00]);
async function offered(f, sid) {
  const inbound = await f.handler(carrier(f, "/twilio/inbound", { CallSid: sid, To: f.c.number, From: "+18055550199" }));
  const greeting = await inbound.text();
  await Promise.all(f.tasks);
  const ringing = await f.state.transact((_e, s) => s.list("call").find((item) => item.sid === sid));
  const atAnswer = {
    phase: ringing.phase,
    greetingPlayed: ringing.greetingPlayed,
    dials: f.provider.operations.filter((item) => item.type === "dial").map((item) => item.staff).sort(),
    parentMoves: f.provider.operations.filter((item) => item.type === "ringback" || item.type === "connect-agent" || (item.type === "route" && item.sid === ringing.sid)).length,
  };
  const greeted = await f.handler(carrier(f, `/twilio/greeted/${ringing.id}`, { CallSid: sid, To: f.c.number, From: "+18055550199" }));
  await Promise.all(f.tasks);
  return { status: inbound.status, greeting, conference: await greeted.text(), call: await f.state.transact((_e, s) => s.get("call", ringing.id)), atAnswer };
}
function amd(f, call, offer, answeredBy) {
  return carrier(f, `/twilio/offer/${call.id}/${offer.id}/amd`, {
    CallSid: offer.sid, To: f.c.staff[offer.staff].destination, From: f.c.number, AnsweredBy: answeredBy,
  });
}
async function settle(f) {
  await Promise.all(f.tasks);
}

const http = fixture();

check("edge runtime has no global Buffer", typeof globalThis.Buffer === "undefined", `typeof Buffer=${typeof globalThis.Buffer}`);

const wrong = await http.handler(new Request(http.c.origin + "/worker", { method: "POST", headers: { authorization: "Bearer wrong-key-wrong-key-wrong-key-xx" } }));
check("worker wrong key is 401", wrong.status === 401, `status=${wrong.status} body=${await wrong.text()}`);

const right = await http.handler(new Request(http.c.origin + "/worker", { method: "POST", headers: { authorization: "Bearer " + http.c.workerKey } }));
const rightBody = await right.text();
check("worker right key is 200", right.status === 200 && rightBody.includes('"ok":true'), `status=${right.status} body=${rightBody}`);

const inbound = await offered(http, "CA" + "1".repeat(32));
check(
  "signed inbound is accepted",
  inbound.status === 200 && inbound.greeting.includes("<Connect><Stream ") && !inbound.greeting.includes("<Say>") && !inbound.greeting.includes("<Play>") && !inbound.greeting.includes("ringback"),
  `status=${inbound.status} greeting=${inbound.greeting.replaceAll("\n", " ")}`,
);
check(
  "staff ring while the greeting plays",
  inbound.atAnswer.phase === "offering" && inbound.atAnswer.greetingPlayed === false && inbound.atAnswer.dials.join(",") === "jessica,mike" && inbound.atAnswer.parentMoves === 0 && /<Connect><Stream /.test(inbound.greeting) && !/Gather|Sip|ringback/.test(inbound.greeting),
  `phase=${inbound.atAnswer.phase} played=${inbound.atAnswer.greetingPlayed} dials=${inbound.atAnswer.dials.join(",")} parentMoves=${inbound.atAnswer.parentMoves}`,
);

const mike = inbound.call.offers.find((o) => o.staff === "mike");
const jessica = inbound.call.offers.find((o) => o.staff === "jessica");
const mikeResponse = await http.handler(amd(http, inbound.call, mike, "human"));
const mikeXml = await mikeResponse.text();
await settle(http);
const mikeCall = await http.state.transact((_e, s) => s.get("call", inbound.call.id));
check(
  "Mike answers",
  mikeResponse.status === 200 && /<Pause/.test(mikeXml) && mikeCall.owner === "mike" && mikeCall.phase === "handoff" && mikeCall.offers.find((o) => o.staff === "jessica").status === "canceled",
  `status=${mikeResponse.status} owner=${mikeCall.owner} phase=${mikeCall.phase} jessica=${mikeCall.offers.find((o) => o.staff === "jessica").status} hangup=${http.provider.operations.some((item) => item.type === "hangup" && item.sid === jessica.sid)}`,
);

const jessicaFixture = fixture();
const jessicaCall = await offered(jessicaFixture, "CA" + "2".repeat(32));
const jessicaOffer = jessicaCall.call.offers.find((o) => o.staff === "jessica");
const mikeOffer = jessicaCall.call.offers.find((o) => o.staff === "mike");
const jessicaResponse = await jessicaFixture.handler(amd(jessicaFixture, jessicaCall.call, jessicaOffer, "human"));
await settle(jessicaFixture);
const jessicaNext = await jessicaFixture.state.transact((_e, s) => s.get("call", jessicaCall.call.id));
check(
  "Jessica answers",
  jessicaResponse.status === 200 && jessicaNext.owner === "jessica" && jessicaNext.offers.find((o) => o.staff === "mike").status === "canceled" && jessicaNext.offers.find((o) => o.id === jessicaOffer.id).status === "accepted",
  `owner=${jessicaNext.owner} mike=${jessicaNext.offers.find((o) => o.staff === "mike").status} jessica=${jessicaNext.offers.find((o) => o.id === jessicaOffer.id).status} hangup=${jessicaFixture.provider.operations.some((item) => item.type === "hangup" && item.sid === mikeOffer.sid)}`,
);

const both = fixture();
const bothOffered = await offered(both, "CA" + "3".repeat(32));
const [first, second] = bothOffered.call.offers;
const [firstResponse, secondResponse] = await Promise.all([
  both.handler(amd(both, bothOffered.call, first, "human")),
  both.handler(amd(both, bothOffered.call, second, "human")),
]);
await settle(both);
const bothNext = await both.state.transact((_e, s) => s.get("call", bothOffered.call.id));
const accepted = bothNext.offers.filter((o) => o.status === "accepted");
const canceled = bothNext.offers.filter((o) => o.status === "canceled");
check(
  "both answer at once",
  firstResponse.status === 200 && secondResponse.status === 200 && bothNext.phase === "handoff" && accepted.length === 1 && canceled.length === 1 && ["mike", "jessica"].includes(bothNext.owner),
  `phase=${bothNext.phase} owner=${bothNext.owner} accepted=${accepted.map((o) => o.staff).join(",")} canceled=${canceled.map((o) => o.staff).join(",")}`,
);

const quiet = fixture();
const quietOffered = await offered(quiet, "CA" + "4".repeat(32));
await quiet.state.transact((e) => e.tick(Date.now() + 20000));
await quiet.worker.drain();
const quietCall = await quiet.state.transact((_e, s) => s.get("call", quietOffered.call.id));
check(
  "nobody answers",
  quietCall.phase === "message" && quietCall.answeredAt === undefined && quietCall.owner === null && quiet.provider.operations.filter((item) => item.type === "connect-agent").length === 0 && quiet.provider.operations.every((item) => item.type !== "ringback"),
  `phase=${quietCall.phase} owner=${quietCall.owner} answeredAt=${quietCall.answeredAt} connect-agent=${quiet.provider.operations.filter((item) => item.type === "connect-agent").length}`,
);

const voice = fixture();
const voiceOffered = await offered(voice, "CA" + "5".repeat(32));
const voiceOffer = voiceOffered.call.offers.find((o) => o.staff === "mike");
const voiceResponse = await voice.handler(amd(voice, voiceOffered.call, voiceOffer, "machine_end_beep"));
const voiceXml = await voiceResponse.text();
await settle(voice);
const voiceCall = await voice.state.transact((_e, s) => s.get("call", voiceOffered.call.id));
check(
  "voicemail picks up",
  voiceResponse.status === 200 && /<Hangup\/>/.test(voiceXml) && voiceCall.owner === null && voiceCall.offers.find((o) => o.staff === "mike").status === "no-answer" && voiceCall.phase !== "human",
  `status=${voiceResponse.status} xml=${voiceXml} owner=${voiceCall.owner} mike=${voiceCall.offers.find((o) => o.staff === "mike").status} phase=${voiceCall.phase}`,
);

const down = fixture();
const downCall = await down.state.transact((e) => e.inbound("CA" + "6".repeat(32), "+18055550199"));
const downResponse = await down.handler(carrier(down, `/twilio/continue/${downCall.id}`, { CallSid: downCall.sid, To: down.c.number, From: "+18055550199" }));
const downXml = await downResponse.text();
await settle(down);
const downNext = await down.state.transact((_e, s) => s.get("call", downCall.id));
check(
  "voice agent down",
  downResponse.status === 200 && /<Record/.test(downXml) && /<Say>/.test(downXml) && /Apologies, but team members are tied up at the moment/.test(downXml) && !/Thank you for calling/.test(downXml) && !/Would you like/.test(downXml) && downNext.phase === "voicemail" && downNext.alert === "agent_down",
  `status=${downResponse.status} phase=${downNext.phase} alert=${downNext.alert} failureLog=${down.client.failures.map((item) => item.p_action).join(",")}`,
);

const during = fixture();
const duringSid = "CA" + "d".repeat(32);
const duringInbound = await during.handler(carrier(during, "/twilio/inbound", { CallSid: duringSid, To: during.c.number, From: "+18055550199" }));
await settle(during);
await during.state.transact((e) => e.tick(Date.now() + 20000));
await during.worker.drain();
const duringCall = await during.state.transact((_e, s) => s.list("call").find((item) => item.sid === duringSid));
const duringAgents = during.provider.operations.filter((item) => item.type === "connect-agent").length;
const duringGreeted = await during.handler(carrier(during, `/twilio/greeted/${duringCall.id}`, { CallSid: duringSid, To: during.c.number, From: "+18055550199" }));
const duringXml = await duringGreeted.text();
await settle(during);
check(
  "offer timeout during the greeting does not cut it off",
  duringInbound.status === 200 && duringCall.phase === "message" && duringCall.greetingPlayed === false && duringAgents === 0 && duringGreeted.status === 200 && /<Stream /.test(duringXml) && !/Conference/.test(duringXml) && during.provider.operations.filter((item) => item.type === "connect-agent").length === 0,
  `phase=${duringCall.phase} played=${duringCall.greetingPlayed} agents=${duringAgents} xml=${duringXml.replaceAll("\n", " ")}`,
);

const played = fixture();
const wav = sampleWav();
played.c.promptAudio = { greeting: wav, unavailable: wav, voicemail: wav };
const playedInbound = await played.handler(carrier(played, "/twilio/inbound", { CallSid: "CA" + "e".repeat(32), To: played.c.number, From: "+18055550199" }));
const playedXml = await playedInbound.text();
await settle(played);
const playedDials = played.provider.operations.filter((item) => item.type === "dial").map((item) => item.staff).sort().join(",");
const playedAudio = await played.handler(new Request(played.c.origin + promptPublicPath("greeting")));
const playedBytes = new Uint8Array(await playedAudio.arrayBuffer());
check(
  "cached greeting is Grok audio",
  playedInbound.status === 200 && playedXml.includes("<Connect><Stream ") && !playedXml.includes("<Play>") && !playedXml.includes("<Say>") && playedDials === "jessica,mike" && playedAudio.status === 200 && playedAudio.headers.get("content-type") === "audio/wav" && playedAudio.headers.get("cache-control") === "public, max-age=86400" && playedBytes.length === wav.length,
  `status=${playedInbound.status} audio=${playedAudio.status} dials=${playedDials} xml=${playedXml.replaceAll("\n", " ")}`,
);
const denied = await played.handler(carrier(played, "/twilio/inbound", { CallSid: "CA" + "f".repeat(32), To: played.c.number, From: "+18055550198" }));
const deniedXml = await denied.text();
const deniedCalls = await played.state.transact((_e, s) => s.list("call").length);
check(
  "not available line uses cached Grok audio",
  denied.status === 200 && deniedXml.includes(promptPublicPath("unavailable")) && deniedXml.includes("<Hangup/>") && !deniedXml.includes("<Say>") && deniedCalls === 1,
  `status=${denied.status} calls=${deniedCalls} xml=${deniedXml.replaceAll("\n", " ")}`,
);
const mail = await played.handler(carrier(played, "/twilio/fallback.xml", { CallSid: "CA" + "e".repeat(32), To: played.c.number, From: "+18055550199" }));
const mailXml = await mail.text();
const hold = await played.handler(carrier(played, "/twilio/ringback", { CallSid: "CA" + "e".repeat(32), To: played.c.number, From: "+18055550199" }));
const holdXml = await hold.text();
check(
  "voicemail uses cached Grok audio and ringback is a tone",
  mail.status === 200 && mailXml.includes(promptPublicPath("voicemail")) && !mailXml.includes("/twilio/prompts/voicemail.wav<") && mailXml.includes("<Record") && !mailXml.includes("<Say>") && hold.status === 200 && holdXml.includes("<Play loop=\"0\">") && holdXml.includes("/twilio/ringback.wav") && !holdXml.includes("hold.wav") && !holdXml.includes("<Say>") && !holdXml.includes("<Pause"),
  `mail=${mail.status} ${mailXml.replaceAll("\n", " ")} hold=${hold.status} ${holdXml.replaceAll("\n", " ")}`,
);

const crm = fixture();
crm.client.failCrm = "callback table missing";
const crmSid = "CA" + "7".repeat(32);
await crm.handler(carrier(crm, "/twilio/inbound", { CallSid: crmSid, To: crm.c.number, From: "+18055550199" }));
const crmCall = await crm.state.transact((_e, s) => s.list("call").find((item) => item.sid === crmSid));
const beforeLogs = logged.length;
const crmResponse = await crm.handler(carrier(crm, `/twilio/recording/${crmCall.id}`, {
  CallSid: crmSid, To: crm.c.number, From: "+18055550199", RecordingStatus: "completed", RecordingUrl: "https://example.test/recording",
}));
const crmXml = await crmResponse.text();
await settle(crm);
const crmLogs = logged.slice(beforeLogs).join("\n");
check(
  "CRM write fails",
  crmResponse.status === 200 && crm.client.callbacks.length === 0 && crm.client.failures.some((item) => item.p_action === "crm_write_failed" && item.p_detail === "callback table missing") && crmLogs.includes('"errorClass":"Error"') && crmLogs.includes("callback table missing"),
  `status=${crmResponse.status} callbacks=${crm.client.callbacks.length} failures=${JSON.stringify(crm.client.failures)} xml=${crmXml} log=${crmLogs}`,
);

const secret = "s".repeat(40);
const broken = new FakeClient();
broken.from = () => ({ select: () => ({ eq: () => ({ single: async () => { throw new Error(`database Bearer ${secret} unavailable`); } }) }) });
const brokenFixture = fixture(broken);
const beforeSecret = logged.length;
const unavailable = await brokenFixture.handler(new Request(brokenFixture.c.origin + "/worker", { method: "POST", headers: { authorization: "Bearer " + brokenFixture.c.workerKey } }));
const unavailableBody = await unavailable.text();
const secretLogs = logged.slice(beforeSecret).join("\n");
check(
  "503 logs class and redacts secrets",
  unavailable.status === 503 && unavailableBody === '{"error":"805 phone operation unavailable"}' && secretLogs.includes('"errorClass":"Error"') && secretLogs.includes("Bearer [redacted]") && !secretLogs.includes(secret),
  `status=${unavailable.status} body=${unavailableBody} log=${secretLogs}`,
);

let dialAuth = "";
let dialBody = "";
const dialer = new TwilioProvider(config(), async (_url, options) => {
  dialAuth = options.headers.Authorization;
  dialBody = String(options.body);
  return { ok: true, json: async () => ({ sid: "CA" + "8".repeat(32) }) };
});
const dialed = await dialer.dial(
  { id: "29f2554b-df46-4b8b-9ce8-89898e62bbbb" },
  { id: "11111111-1111-4111-8111-111111111111", staff: "mike" },
);
const decoded = Buffer.from(dialAuth.slice("Basic ".length), "base64").toString();
const events = [...dialBody.matchAll(/StatusCallbackEvent=([^&]+)/g)].map((match) => match[1]);
check(
  "staff dial builds Basic auth without a global Buffer",
  dialed.sid === "CA" + "8".repeat(32) && decoded === config().accountSid + ":" + config().authToken && events.join(",") === "initiated,ringing,answered,completed" && dialBody.includes("MachineDetection=Enable") && dialBody.includes("AsyncAmd=true") && dialBody.includes("MachineDetectionTimeout=8") && dialBody.includes("Timeout=20") && dialBody.includes("From=%2B18055550100") && !dialBody.includes("Twiml") && !dialBody.includes("waitUrl") && !dialBody.includes(","),
  `sid=${dialed.sid} body=${dialBody}`,
);

const report = {
  runtime: "supabase-edge-runtime",
  bufferGlobal: typeof globalThis.Buffer,
  crmRowsWritten: http.client.callbacks.length + crm.client.callbacks.length,
  results,
};
console.log("EDGE_REPORT_BEGIN");
console.log(JSON.stringify(report, null, 2));
console.log("EDGE_REPORT_END");
if (results.some((item) => !item.ok)) throw new Error("edge runtime tests failed");
Deno.serve(fixture().handler);
