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

// The conference waitUrl is fetched again whenever this document ends.
// Speech here would repeat until a staff member joins, so the caller hears silence.
export function ringbackTwiml() {
  return twiml('<Pause length="40"/>');
}

const xaiSip = /^sip:\+[1-9]\d{7,14}@sip\.voice\.x\.ai;transport=tls$/;

// Twilio appends custom SIP headers as URI query parameters. X- headers are allowed.
export function consoleAgentTwiml(config, call) {
  if (!xaiSip.test(config.sipUri || "")) {
    return voicemailXml(
      config.origin,
      `/twilio/recording/${call.id}`,
      `/twilio/transcription/${call.id}`,
      config,
    );
  }
  const uri = `${config.sipUri}?X-805-Call-Id=${call.id}`;
  return twiml(
    `<Dial action="${xml(config.origin + "/twilio/continue/" + call.id)}" method="POST" timeout="30"><Sip>${xml(uri)}</Sip></Dial>`,
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
