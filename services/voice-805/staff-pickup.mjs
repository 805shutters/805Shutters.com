import { Conflict } from './engine.mjs';
import { conferenceXml } from './provider.mjs';
import { twiml, xml } from './security.mjs';

// Called only after Twilio signature, account, To/From and CallSid checks.
export function staffPickup(engine, config, callId, offerId, sid, action, fields, now = Date.now()) {
  let call = engine.store.get('call', callId);
  let offer = call?.offers.find(o => o.id === offerId);
  if (!offer || offer.sid !== sid || offer.acceptance !== 'dtmf') throw new Conflict('Wrong staff confirmation');
  if (action === 'accept') {
    call = engine.confirmStaff(callId, offerId, sid, fields.get('Digits'), now);
    offer = call.offers.find(o => o.id === offerId);
    if (offer.status === 'accepted' && call.phase !== 'ended' &&
        (call.ownerSid === sid || call.targetSid === sid)) {
      // Return the staff bridge directly, avoiding a REST redirect racing this response.
      return conferenceXml(config, call, offer.purpose === 'consult' ? 'consult' : 'main');
    }
    // An empty Gather result is silence, not a decline. Keep the original
    // pickup deadline and repeat the prompt while there is time to respond.
  } else if (!action) {
    call = engine.staffAnswered(callId, offerId, sid, now);
    offer = call.offers.find(o => o.id === offerId);
  } else throw new Conflict('Unsupported staff action');
  const remaining = Math.floor((offer.expiresAt - now) / 1000);
  if (call.phase === 'ended' || offer.status !== 'ringing' || !offer.answeredAt) return twiml('<Hangup/>');
  if (remaining < 5) {
    engine.ended(callId, sid, `staff-confirmation-timeout:${offerId}:${sid}`);
    return twiml('<Say>No confirmation received. The caller will remain with 805 Shutters.</Say><Hangup/>');
  }
  const timeout = Math.max(1, Math.min(15, remaining - 4));
  const url = `${config.origin}/twilio/offer/${callId}/${offerId}/accept`;
  return twiml(`<Gather input="dtmf" numDigits="1" finishOnKey="" timeout="${timeout}" actionOnEmptyResult="true" method="POST" action="${xml(url)}"><Say>805 Shutters call. Press 1 to connect.</Say></Gather><Hangup/>`);
}
