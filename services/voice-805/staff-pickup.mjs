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
    if (!fields.get('Digits')) {
      engine.ended(callId, sid, `staff-declined:${offerId}:${sid}`);
      return twiml('<Hangup/>');
    }
  } else if (!action) {
    call = engine.staffAnswered(callId, offerId, sid, now);
    offer = call.offers.find(o => o.id === offerId);
  } else throw new Conflict('Unsupported staff action');
  const remaining = Math.floor((offer.expiresAt - now) / 1000);
  if (call.phase === 'ended' || offer.status !== 'ringing' || !offer.answeredAt || remaining < 5) return twiml('<Hangup/>');
  const timeout = Math.max(1, Math.min(10, remaining - 4));
  const url = `${config.origin}/twilio/offer/${callId}/${offerId}/accept`;
  return twiml(`<Gather input="dtmf" numDigits="1" timeout="${timeout}" actionOnEmptyResult="true" method="POST" action="${xml(url)}"><Say>805 Shutters call. Press 1 to connect.</Say></Gather><Hangup/>`);
}
