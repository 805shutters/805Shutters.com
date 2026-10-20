import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFindResult, applyScheduleTurn, callerPhone, findPayload, initialSchedule, preparePayload, questionCount, sanitizeSchedule, DURATION_ANSWER, CALLBACK_QUESTION } from '../schedule-intake.mjs';

const caller = '+18055550199';
function turn(state, text) {
  const applied = applyScheduleTurn(state, text, caller);
  assert.equal(questionCount(applied.say), 1, applied.say);
  assert.doesNotMatch(applied.say, /we.?re confirmed|is booked|appointment is booked/i);
  return applied;
}

test('records Friday before asking the single time question', () => {
  const first = turn(initialSchedule(caller), 'I would like to schedule an appointment');
  assert.equal(first.state.purpose, 'appointment');
  assert.equal(first.state.weekday, null);
  assert.equal(first.say, 'What day works for you?');
  const friday = turn(first.state, 'Friday');
  assert.equal(friday.state.weekday, 'friday');
  assert.equal(friday.state.time, null);
  assert.equal(friday.say, 'What time on Friday works for you?');
  assert.equal(friday.state.phone, caller);
  assert.equal(friday.state.phoneSource, 'caller-id');
});

test('a volunteered Friday anytime skips the clock-time question', () => {
  const applied = turn(initialSchedule(caller), 'Friday anytime');
  assert.equal(applied.state.purpose, 'appointment');
  assert.equal(applied.state.weekday, 'friday');
  assert.equal(applied.state.window, 'anytime');
  assert.equal(applied.state.time, null);
  assert.equal(applied.say, "Absolutely, I'll check Friday. May I please get your address?");
  assert.doesNotMatch(applied.say, /what time/i);
});

test('address is repeated until the caller confirms a correction', () => {
  let state = turn(initialSchedule(caller), 'Friday at 3 pm').state;
  assert.equal(state.time, '15:00');
  assert.match(turn(state, 'Friday at 3 pm').say, /I'll check Friday at 3:00/);
  state = turn(state, 'Friday at 3 pm').state;
  const heard = turn(state, '123 Oak Street, Camarillo');
  assert.equal(heard.state.address, '123 Oak Street, Camarillo');
  assert.equal(heard.state.addressConfirmed, false);
  assert.equal(heard.state.city, 'Camarillo');
  assert.equal(heard.say, 'I have 123 Oak Street, Camarillo. Is that correct?');
  const corrected = turn(heard.state, 'No, 456 Pine Street, Camarillo');
  assert.equal(corrected.state.address, '456 Pine Street, Camarillo');
  assert.equal(corrected.state.addressConfirmed, false);
  assert.equal(corrected.say, 'I have 456 Pine Street, Camarillo. Is that correct?');
  const confirmed = turn(corrected.state, 'Yes');
  assert.equal(confirmed.state.addressConfirmed, true);
  assert.equal(confirmed.state.city, 'Camarillo');
  assert.equal(confirmed.say, 'Is this for your home or a commercial property?');
  const streetOnly = turn(state, '123 Oak Street');
  assert.equal(streetOnly.state.city, null);
  const city = turn(turn(streetOnly.state, 'yes').state, 'Camarillo');
  assert.equal(city.state.city, 'Camarillo');
  assert.equal(city.say, 'Is this for your home or a commercial property?');
  const commercial = turn(city.state, 'commercial');
  assert.equal(commercial.say, 'About how many windows is this for?');
  const counted = turn(commercial.state, '25 windows');
  assert.equal(counted.state.windowCount, 25);
  assert.equal(counted.state.kind, 'commercial');
  assert.equal(counted.say, 'May I have your name?');
});

test('reuses a valid caller ID and asks only when the caller ID cannot be used', () => {
  const home = turn(turn(turn(initialSchedule(caller), 'Friday at 3 pm').state, '123 Oak Street, Camarillo').state, 'yes').state;
  const kind = turn(home, 'It is my home');
  assert.equal(kind.state.kind, 'residential');
  assert.equal(kind.say, 'May I have your name?');
  assert.doesNotMatch(kind.say, /number|phone/i);
  const named = turn(kind.state, 'Pat Example');
  assert.equal(named.state.name, 'Pat Example');
  assert.equal(named.state.phone, caller);
  assert.equal(named.search, true);
  const blocked = initialSchedule('+266696687');
  assert.equal(blocked.phone, null);
  assert.equal(callerPhone('anonymous'), null);
  assert.equal(callerPhone('unavailable'), null);
  assert.equal(callerPhone('+7378742833'), null);
  let blockedState = turn(blocked, 'Friday at 3 pm').state;
  blockedState = turn(blockedState, '123 Oak Street, Camarillo').state;
  blockedState = turn(blockedState, 'yes').state;
  blockedState = turn(blockedState, 'home').state;
  const needsPhone = turn(blockedState, 'Pat Example');
  assert.equal(needsPhone.state.name, 'Pat Example');
  assert.equal(needsPhone.say, 'What is the best callback number?');
  const given = turn(needsPhone.state, '805 555 0198');
  assert.equal(given.state.phone, '+18055550198');
  assert.equal(given.state.phoneSource, 'spoken');
  assert.equal(given.search, true);
});

test('a duration question answers and repeats the same unanswered question', () => {
  const friday = turn(initialSchedule(caller), 'Friday').state;
  const duration = turn(friday, 'How long is the consultation?');
  assert.equal(duration.state.weekday, 'friday');
  assert.equal(duration.state.time, null);
  assert.equal(duration.say, `${DURATION_ANSWER} What time on Friday works for you?`);
  const resumed = turn(duration.state, '3 pm');
  assert.equal(resumed.state.time, '15:00');
  assert.match(resumed.say, /May I please get your address/);
});

test('only a verified open slot can be offered, and caller ID cannot be replaced by a tool claim', () => {
  const ready = sanitizeSchedule({ ...initialSchedule(caller), purpose: 'appointment', weekday: 'friday', time: '15:00', address: '123 Oak Street, Camarillo', addressConfirmed: true, city: 'Camarillo', kind: 'residential', name: 'Pat Example', awaiting: 'search' });
  const offered = applyFindResult(ready, { exact: true, date: '2026-10-23', requested: '15:00', slots: ['15:00'], fit: true, saved: false, searchComplete: true });
  assert.deepEqual(offered.state.offer, { date: '2026-10-23', time: '15:00' });
  assert.equal(offered.say, 'Friday at 3:00 is open on our calendar. Does that work for you?');
  assert.equal(questionCount(offered.say), 1);
  const none = applyFindResult(ready, { fit: false, saved: false, exact: false, slots: [], alternatives: [] });
  assert.equal(none.state.offer, null);
  assert.equal(none.say, CALLBACK_QUESTION);
  const tampered = sanitizeSchedule({ ...ready, phone: '+18055550198', phoneSource: 'caller-id', verified: true, confirmed: true });
  assert.equal(tampered.phone, caller);
  assert.equal(tampered.verified, undefined);
  assert.equal(tampered.confirmed, undefined);
  const accepted = applyScheduleTurn(offered.state, 'yes', caller);
  assert.equal(accepted.prepare, true);
  assert.equal(accepted.state.offer.time, '15:00');
  assert.deepEqual(preparePayload(accepted.state), { city: 'Camarillo', address: '123 Oak Street, Camarillo', kind: 'residential', windowCount: null, date: '2026-10-23', time: '15:00', name: 'Pat Example', phone: caller });
  assert.deepEqual(findPayload(ready).time, '15:00');
  const partial = applyFindResult(ready, { fit: true, saved: false, searchComplete: false, recommendation: { date: '2026-10-23', time: '10:30' } });
  assert.match(partial.say, /best time verified/);
  assert.equal(questionCount(partial.say), 1);
});
