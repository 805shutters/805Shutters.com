import { twiml } from "./security.mjs";

export const FALLBACK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling 805 Shutters. We appreciate you supporting local business. No one can take your call right now. After the tone, please leave your name, your phone number, and the reason for your call.</Say>
  <Record maxLength="120" playBeep="true" timeout="5" transcribe="true" transcribeCallback="ORIGIN/twilio/fallback-transcription" recordingStatusCallback="ORIGIN/twilio/fallback-recording" recordingStatusCallbackEvent="completed"/>
  <Hangup/>
</Response>
`;

export function voicemailXml(
  origin,
  recordingPath = "/twilio/fallback-recording",
  transcriptionPath = "/twilio/fallback-transcription",
) {
  return FALLBACK_XML.replaceAll(
    "ORIGIN/twilio/fallback-transcription",
    origin + transcriptionPath,
  ).replaceAll(
    "ORIGIN/twilio/fallback-recording",
    origin + recordingPath,
  );
}

export function ringbackTwiml() {
  return twiml(
    "<Say>Please hold while we connect you to an 805 Shutters team member.</Say><Pause length=\"5\"/>",
  );
}

export function fallback(_engine, call, _step, _params, config) {
  if (call.phase === "ended") return twiml("<Hangup/>");
  return voicemailXml(
    config.origin,
    `/twilio/recording/${call.id}`,
    `/twilio/transcription/${call.id}`,
  );
}
