/**
 * Reviewed source for the dedicated 805 number backup.
 * Do not deploy this file or change the live number from the review branch.
 *
 * Number PNaafffce88dd92efd78345e2967637931 in US1 uses TwiML Bin
 * EH99ed28ca457fca8ced72259f99ec6973 as its voice backup. The old
 * recording Function ZS85a203f4cf8accf080ac48195e3801ed is retained and
 * is no longer selected. A read-only GET of
 * https://voice-805-fallback-9089-prod.twil.io/fallback can still return
 * a Record verb with maxLength 120. Carrier execution of the bin was not
 * tested. See README.md.
 *
 * This source has no Record. It does not claim a recording, transcript,
 * or written message, because this backup runs when the Edge call state
 * is unavailable.
 */
const SPOKEN = "Our team members are tied up at the moment. We could not continue this call, and no recording was made. Please call back to leave a message or schedule an appointment.";

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
