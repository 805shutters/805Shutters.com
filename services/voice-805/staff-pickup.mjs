import { Conflict } from './engine.mjs';
import { conferenceXml } from './provider.mjs';
import { twiml } from './security.mjs';

function bridgeXml(config, call, offer, sid) {
  if (offer?.status === 'accepted' && call.phase !== 'ended' && (call.ownerSid === sid || call.targetSid === sid)) {
    return conferenceXml(config, call, offer.purpose === 'consult' ? 'consult' : 'main');
  }
  return null;
}

// Called only after Twilio signature, account, To/From and CallSid checks.
// Twilio requests this URL when the staff phone is answered. The first answer
// joins that person to the customer and the other staff leg is hung up.
export function staffPickup(engine, config, callId, offerId, sid, action, _fields, now = Date.now()) {
  let call = engine.store.get('call', callId);
  let offer = call?.offers.find(o => o.id === offerId);
  if (!offer || offer.sid !== sid || offer.acceptance !== 'dtmf') throw new Conflict('Wrong staff confirmation');
  if (action === 'accept') return bridgeXml(config, call, offer, sid) || twiml('<Hangup/>');
  if (action) throw new Conflict('Unsupported staff action');
  call = engine.staffAnswered(callId, offerId, sid, now);
  call = engine.confirmStaff(callId, offerId, sid, now);
  offer = call.offers.find(o => o.id === offerId);
  return bridgeXml(config, call, offer, sid) || twiml('<Hangup/>');
}
