import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import {
  PROMPTS,
  REALTIME_MODEL,
  REALTIME_URL,
  TTS_URL,
  VOICE_ID,
  createSupabasePromptStore,
  ensureSpoken,
  promptIsReady,
  promptVerb,
  renderPrompt,
  storePrompt,
  warmPrompts,
} from "../prompts.mjs";

const wav = () =>
  Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00, 0x07, 0x00, 0x01, 0x00, 0x40, 0x1f, 0x00, 0x00, 0x40, 0x1f, 0x00, 0x00,
    0x01, 0x00, 0x08, 0x00, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
  ]);
const config = () => ({ xaiKey: "x".repeat(20), origin: "https://example.test/voice-805", promptReadMs: 20 });
const wavResponse = (bytes = wav(), status = 200, type = "audio/wav") =>
  new Response(bytes, { status, headers: { "content-type": type } });

test("realtime and tts contracts match the current xAI voice API", () => {
  assert.equal(VOICE_ID, "eve");
  assert.equal(TTS_URL, "https://api.x.ai/v1/tts");
  assert.equal(REALTIME_MODEL, "grok-voice-3.0");
  assert.equal(REALTIME_URL, "wss://api.x.ai/v1/realtime?model=grok-voice-3.0");
  assert.equal(PROMPTS.greeting, "Thank you for calling 805 Shutters. We appreciate you supporting local business. Let me get you over to one of our team members immediately.");
  const entry = readFileSync(new URL("../../../supabase/functions/voice-805/index.ts", import.meta.url), "utf8");
  assert.match(entry, /new WebSocket\(REALTIME_URL/);
  assert.doesNotMatch(entry, /grok-voice-latest/);
});

test("say is the fallback and play is used only for durable audio", () => {
  const c = config();
  assert.match(promptVerb(c, "greeting", PROMPTS.greeting), new RegExp(`<Say>${PROMPTS.greeting}</Say>`));
  assert.equal(storePrompt(c, "greeting", Uint8Array.from([1, 2, 3, 4]), true), false);
  assert.equal(promptIsReady(c, "greeting"), false);
  c.promptAudio = { greeting: wav() };
  assert.match(promptVerb(c, "greeting", PROMPTS.greeting), /<Play>https:\/\/example\.test\/voice-805\/twilio\/prompts\/greeting\.wav<\/Play>/);
  const other = config();
  assert.equal(promptIsReady(other, "greeting"), false);
});

test("render posts eve wav at 8 kHz, dedupes, and rejects non-wav", async () => {
  const c = config();
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const fetcher = async (url, init) => {
    calls += 1;
    assert.equal(url, TTS_URL);
    assert.match(init.headers.authorization, /^Bearer x{20}$/);
    const body = JSON.parse(init.body);
    assert.equal(body.voice_id, "eve");
    assert.equal(body.language, "en");
    assert.equal(body.text, PROMPTS.hold);
    assert.deepEqual(body.output_format, { codec: "wav", sample_rate: 8000 });
    await gate;
    return wavResponse();
  };
  const first = renderPrompt(c, "hold", fetcher);
  const second = renderPrompt(c, "hold", fetcher);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(promptIsReady(c, "hold"), false);
  const encoded = config();
  const json = await renderPrompt(encoded, "greeting", async () =>
    new Response(JSON.stringify({ audio: Buffer.from(wav()).toString("base64") }), {
      headers: { "content-type": "application/json" },
    }),
  );
  assert.equal(json.length, wav().length);
  await assert.rejects(
    renderPrompt(config(), "voicemail", async () => wavResponse(Uint8Array.from([1, 2, 3, 4]))),
    /not a wav/,
  );
  let fetched = false;
  assert.equal(await renderPrompt({ ...config(), xaiKey: "" }, "greeting", async () => {
    fetched = true;
    return wavResponse();
  }), null);
  assert.equal(fetched, false);
  await assert.rejects(renderPrompt(config(), "unavailable", async () => new Response("no", { status: 503 })), /503/);
});

test("warm stores wavs once and a slow read does not block the spoken fallback", async () => {
  const c = config();
  const puts = [];
  let buckets = 0;
  const store = {
    ensureBucket: async () => {
      buckets += 1;
    },
    get: async () => null,
    put: async (name, bytes) => {
      assert.equal(bytes[0], 0x52);
      puts.push(name);
    },
  };
  await warmPrompts(c, store, async () => wavResponse());
  assert.equal(buckets, 1);
  assert.deepEqual(puts.sort(), ["greeting", "hold", "unavailable", "voicemail"]);
  assert.equal(promptIsReady(c, "greeting"), true);
  const cold = config();
  cold.promptFetch = async () => wavResponse();
  const tasks = [];
  const started = Date.now();
  await ensureSpoken(cold, ["greeting"], { get: () => new Promise(() => {}), put: async () => {} }, (job) => tasks.push(job));
  assert.ok(Date.now() - started < 200);
  assert.equal(promptIsReady(cold, "greeting"), false);
  await Promise.all(tasks);
  assert.equal(promptIsReady(cold, "greeting"), true);
});

test("supabase prompt storage ignores an existing private bucket and rejects a bad upload without echoing it", async () => {
  const uploads = [];
  const client = {
    storage: {
      createBucket: async (_name, options) => {
        assert.equal(options.public, false);
        return { error: { message: "The resource already exists", statusCode: "409" } };
      },
      from() {
        return {
          download: async () => ({ data: { arrayBuffer: async () => wav().buffer }, error: null }),
          upload: async (path, bytes, options) => {
            uploads.push({ path, bytes, options });
            return { error: { message: "Bearer " + "s".repeat(40) } };
          },
        };
      },
    },
  };
  const store = createSupabasePromptStore(client);
  await store.ensureBucket();
  assert.equal((await store.get("greeting")).length, wav().length);
  await assert.rejects(store.put("greeting", wav()), (error) => {
    assert.equal(error.message, "Prompt audio was not stored");
    assert.equal(error.message.includes("Bearer"), false);
    return true;
  });
  assert.equal(uploads[0].path, "greeting.wav");
  assert.equal(uploads[0].options.contentType, "audio/wav");
  assert.equal(uploads[0].options.upsert, true);
  const broken = createSupabasePromptStore({
    storage: {
      createBucket: async () => ({ error: { message: "permission denied" } }),
      from: () => ({ download: async () => ({ data: { arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer }, error: null }) }),
    },
  });
  await assert.rejects(broken.ensureBucket(), /Prompt bucket was not created/);
  assert.equal(await broken.get("greeting"), null);
});
