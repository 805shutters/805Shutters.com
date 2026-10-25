/**
 * Reviewed replacement for the dedicated 805 number backup.
 * Do not deploy this file from the review branch.
 *
 * Live number PNaafffce88dd92efd78345e2967637931, service
 * ZS85a203f4cf8accf080ac48195e3801ed, currently serves
 * https://voice-805-fallback-9089-prod.twil.io/fallback
 * A read-only GET of that URL still returns a Record verb with maxLength 120.
 * See README.md for the exact live body.
 *
 * This source removes Record. It does not claim a recording, transcript,
 * or written message, because this backup runs when the Edge call state
 * is unavailable.
 */
const SPOKEN = "We could not continue this call, and no recording was made. Please call back to leave a message or schedule an appointment.";

function fallbackTwiml() {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${SPOKEN}</Say><Hangup/></Response>`;
}

exports.SPOKEN = SPOKEN;
exports.fallbackTwiml = fallbackTwiml;
exports.handler = function handler(_context, _event, callback) {
  const response = new Twilio.twiml.VoiceResponse();
  response.say(SPOKEN);
  response.hangup();
  callback(null, response);
};
