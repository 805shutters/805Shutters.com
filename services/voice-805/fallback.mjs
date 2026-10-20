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

export function ringbackTwiml(config = {}) {
  return twiml(`${promptVerb(config, "hold", PROMPTS.hold)}<Pause length="5"/>`);
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
