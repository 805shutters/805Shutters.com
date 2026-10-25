import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { COMMON_GREETING } from "./caller-context.mjs";
import { reportFailure, xml } from "./security.mjs";

// Same built-in voice the realtime receptionist uses. ara is a documented xAI
// voice for POST /v1/tts and the realtime session.update voice field.
export const VOICE_ID = "ara";
export const TTS_URL = "https://api.x.ai/v1/tts";
export const REALTIME_MODEL = "grok-voice-3.0";
export const REALTIME_URL = "wss://api.x.ai/v1/realtime?model=grok-voice-3.0";
export const PROMPT_BUCKET = "voice-805-prompts";

export const PROMPTS = Object.freeze({
  greeting: COMMON_GREETING,
  unavailable: "This test line is not available.",
  voicemail:
    "We could not continue this call, and no recording was made. Please call back to leave a message or schedule an appointment.",
});

const NAMES = Object.keys(PROMPTS);

function isWav(bytes) {
  return (
    bytes &&
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  );
}

function asAudio(bytes) {
  if (!isWav(bytes)) return null;
  return bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
}

// xAI returns a streaming wav: RIFF size 0x80000023 and data size 0x7fffffff.
// Twilio <Play> needs the real lengths, so rewrite both before the bytes are stored.
export function normalizeWavHeader(bytes) {
  const source = asAudio(bytes);
  if (!source || source.length < 20 || source.length > 0xffffffff) return null;
  const copy = Uint8Array.from(source);
  const view = new DataView(copy.buffer);
  view.setUint32(4, copy.length - 8, true);
  let offset = 12;
  while (offset + 8 <= copy.length) {
    const id = String.fromCharCode(copy[offset], copy[offset + 1], copy[offset + 2], copy[offset + 3]);
    if (id === "data") {
      view.setUint32(offset + 4, copy.length - (offset + 8), true);
      return copy;
    }
    const size = view.getUint32(offset + 4, true);
    const next = offset + 8 + size + (size & 1);
    if (size > copy.length || next > copy.length) return null;
    offset = next;
  }
  return null;
}

function memoryOf(config) {
  if (!config.promptMemory) config.promptMemory = new Map();
  return config.promptMemory;
}

function pendingOf(config) {
  if (!config.promptPending) config.promptPending = new Map();
  return config.promptPending;
}

// Play only durable audio: a test override, or bytes already stored where any
// function isolate can read them. A render that has not been uploaded yet stays
// in memory so the caller still hears <Say> on this request.
export function promptSource(config, name) {
  const override = asAudio(config.promptAudio?.[name]);
  if (override) return override;
  const hit = config.promptMemory?.get(name);
  return hit?.durable ? asAudio(hit.bytes) : null;
}

export function promptIsReady(config, name) {
  return promptSource(config, name) != null;
}

export function storePrompt(config, name, bytes, durable = false) {
  const audio = normalizeWavHeader(bytes);
  if (!audio || !PROMPTS[name]) return false;
  const existing = memoryOf(config).get(name);
  memoryOf(config).set(name, {
    bytes: audio,
    durable: Boolean(durable) || existing?.durable === true,
  });
  return true;
}

export function promptVerb(config, name, text) {
  if (promptSource(config, name)) {
    const origin = String(config.origin || "").replace(/\/$/, "");
    return `<Play>${xml(`${origin}${promptPublicPath(name)}`)}</Play>`;
  }
  return `<Say>${xml(text)}</Say>`;
}

async function decodeAudio(response) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("json")) {
    const payload = await response.json();
    return Uint8Array.from(Buffer.from(payload.audio || "", "base64"));
  }
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw[0] === 0x7b) {
    const payload = JSON.parse(Buffer.from(raw).toString("utf8"));
    return Uint8Array.from(Buffer.from(payload.audio || "", "base64"));
  }
  return raw;
}

export async function renderPrompt(config, name, fetcher = config.promptFetch || fetch) {
  const cached = config.promptMemory?.get(name);
  if (asAudio(cached?.bytes)) return cached.bytes;
  if (!config.xaiKey || !PROMPTS[name]) return null;
  const pending = pendingOf(config);
  if (pending.has(name)) return pending.get(name);
  const task = (async () => {
    const response = await fetcher(TTS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.xaiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        text: PROMPTS[name],
        voice_id: VOICE_ID,
        language: "en",
        output_format: { codec: "wav", sample_rate: 8000 },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Prompt audio was not rendered (${response.status})`);
    const audio = await decodeAudio(response);
    if (!storePrompt(config, name, audio, false)) throw new Error("Prompt audio was not a wav");
    return memoryOf(config).get(name).bytes;
  })();
  pending.set(name, task);
  try {
    return await task;
  } finally {
    pending.delete(name);
  }
}

export async function fillPrompt(config, name, store, fetcher = config.promptFetch || fetch) {
  const bytes = await renderPrompt(config, name, fetcher);
  if (!bytes) return null;
  if (typeof store?.put === "function") await store.put(name, bytes);
  storePrompt(config, name, bytes, typeof store?.put === "function");
  return bytes;
}

export async function ensureSpoken(config, names, store, waitUntil = () => {}) {
  const limit = Number.isFinite(Number(config.promptReadMs)) ? Number(config.promptReadMs) : 400;
  await Promise.all(
    names.map(async (name) => {
      if (!PROMPTS[name] || promptIsReady(config, name) || typeof store?.get !== "function") return;
      let bytes = null;
      try {
        bytes = await Promise.race([
          Promise.resolve()
            .then(() => store.get(name))
            .then((value) => value || null)
            .catch((error) => {
              reportFailure("prompt-audio", error);
              return null;
            }),
          new Promise((resolve) => setTimeout(() => resolve(null), limit)),
        ]);
      } catch (error) {
        reportFailure("prompt-audio", error);
      }
      if (bytes && storePrompt(config, name, bytes, true)) return;
      waitUntil(
        Promise.resolve(fillPrompt(config, name, store)).catch((error) => reportFailure("prompt-audio", error)),
      );
    }),
  );
}

export async function warmPrompts(config, store, fetcher = config.promptFetch || fetch) {
  try {
    if (typeof store?.ensureBucket === "function") await store.ensureBucket();
  } catch (error) {
    reportFailure("prompt-audio", error);
  }
  for (const name of NAMES) {
    try {
      if (promptIsReady(config, name)) continue;
      const existing = typeof store?.get === "function" ? await store.get(name) : null;
      if (existing && storePrompt(config, name, existing, true)) continue;
      await fillPrompt(config, name, store, fetcher);
    } catch (error) {
      reportFailure("prompt-audio", error);
    }
  }
}

// Storage and the public Play path both include the voice and spoken text.
// A changed line gets a new URL, so Twilio cannot keep the previous wav at
// /twilio/prompts/{name}.wav for max-age=86400. The unversioned path remains
// for compatibility and is not given that long cache.
export function promptDigest(name, text = PROMPTS[name]) {
  return createHash("sha256")
    .update(`${VOICE_ID}\0${text || ""}`)
    .digest("hex")
    .slice(0, 16);
}
export function promptObjectName(name, text = PROMPTS[name]) {
  return `${VOICE_ID}-${name}-${promptDigest(name, text)}.wav`;
}
export function promptPublicPath(name, text = PROMPTS[name]) {
  return `/twilio/prompts/${name}-${promptDigest(name, text)}.wav`;
}
export function createSupabasePromptStore(client) {
  const bucket = () => client.storage.from(PROMPT_BUCKET);
  return {
    async ensureBucket() {
      const { error } = await client.storage.createBucket(PROMPT_BUCKET, { public: false });
      if (error && Number(error.statusCode || error.status) !== 409 && !/exists|duplicate/i.test(error.message || "")) {
        throw new Error("Prompt bucket was not created");
      }
    },
    async get(name) {
      const { data, error } = await bucket().download(promptObjectName(name));
      if (error || !data) return null;
      const bytes = new Uint8Array(await data.arrayBuffer());
      return isWav(bytes) ? bytes : null;
    },
    async put(name, bytes) {
      const { error } = await bucket().upload(promptObjectName(name), bytes, {
        upsert: true,
        contentType: "audio/wav",
      });
      if (error) throw new Error("Prompt audio was not stored");
    },
  };
}
