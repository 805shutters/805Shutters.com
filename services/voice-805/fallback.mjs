import { twiml, xml } from "./security.mjs";
import { PROMPTS, promptVerb } from "./prompts.mjs";

export function voicemailXml(
  origin,
  recordingPath = "/twilio/fallback-recording",
  transcriptionPath = "/twilio/fallback-transcription",
  config = null,
) {
  const spoken = promptVerb(
    { origin, ...(config || {}) },
    "voicemail",
    PROMPTS.voicemail,
  );
  return twiml(
    `${spoken}<Record maxLength="120" playBeep="true" timeout="5" transcribe="true" transcribeCallback="${xml(origin + transcriptionPath)}" recordingStatusCallback="${xml(origin + recordingPath)}" recordingStatusCallbackEvent="completed"/><Hangup/>`,
  );
}

// North American ringback: 440 Hz + 480 Hz for two seconds, then four seconds
// of silence. One cycle, looped by Twilio. No speech, so nothing is repeated.
let ringbackBytes;
export function ringbackWav() {
  if (ringbackBytes) return ringbackBytes;
  const rate = 8000;
  const on = rate * 2;
  const total = rate * 6;
  const data = new Uint8Array(total * 2);
  for (let i = 0; i < on; i++) {
    const t = i / rate;
    const sample = Math.round(
      0.2 * 32767 * (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)),
    );
    data[i * 2] = sample & 0xff;
    data[i * 2 + 1] = (sample >> 8) & 0xff;
  }
  const bytes = new Uint8Array(44 + data.length);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set([0x64, 0x61, 0x74, 0x61], 36);
  view.setUint32(40, data.length, true);
  bytes.set(data, 44);
  ringbackBytes = bytes;
  return bytes;
}
export function ringbackTwiml(origin) {
  return twiml(`<Play loop="0">${xml(origin + "/twilio/ringback.wav")}</Play>`);
}
export function silentWaitTwiml() {
  return twiml('<Pause length="40"/>');
}
export function mediaStreamTwiml(origin, callId) {
  const base = String(origin || "").replace(/\/$/, "");
  const url = `${base.replace(/^https:/, "wss:")}/twilio/media/${callId}`;
  return twiml(
    `<Connect><Stream url="${xml(url)}" statusCallback="${xml(`${base}/twilio/stream/${callId}`)}" statusCallbackMethod="POST" /></Connect><Redirect method="POST">${xml(`${base}/twilio/continue/${callId}`)}</Redirect>`,
  );
}

export function fallback(_engine, call, _step, _params, config) {
  if (call.phase === "ended") return twiml("<Hangup/>");
  return voicemailXml(
    config.origin,
    `/twilio/recording/${call.id}`,
    `/twilio/transcription/${call.id}`,
    config,
  );
}
