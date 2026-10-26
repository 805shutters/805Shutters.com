import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFindResult, applyScheduleTurn, bookedSchedule, callbackSchedule, callerPhone, findPayload, initialSchedule, preparePayload, questionCount, sanitizeSchedule, DURATION_ANSWER, CALLBACK_QUESTION } from '../schedule-intake.mjs';

const caller = '+18055550199';
const NOW = new Date('2026-10-20T18:00:00Z');
const FRIDAY = 'Friday, October 23';
test('unrecognized or ambiguous choices clarify once instead of repeating forever', () => {
 for (const text of ['the other thing', 'leave a message or schedule an appointment']) {
  const first=applyScheduleTurn(initialSchedule(caller),text,caller,'',NOW);
  assert.equal(first.state.purpose,null);
  assert.equal(first.state.clarifyCount,1);
  const second=applyScheduleTurn(first.state,text,caller,'',NOW);
  assert.equal(second.state.awaiting,'callback');
  assert.equal(second.state.clarifyCount,2);
  assert.match(second.say,/callback message/);
 }
});
function turn(state, text, from = caller) {
  const applied = applyScheduleTurn(state, text, from, '', NOW);
  assert.equal(questionCount(applied.say), 1, applied.say);
  assert.doesNotMatch(applied.say, /we.?re confirmed|is booked|appointment is booked/i);
  return applied;
}

test('an impossible calendar date asks once and then offers a callback', () => {
  const start = turn(initialSchedule(caller), 'I want to schedule an appointment').state;
  const first = turn(start, '2026-13-01');
  assert.equal(first.state.date, null);
  assert.match(first.say, /not a valid date/);
  assert.match(first.say, /What day works for you/);
  assert.equal(first.state.clarifyCount, 1);
  const second = turn(first.state, '2026-02-31');
  assert.equal(second.state.date, null);
  assert.equal(second.state.awaiting, 'callback');
  assert.match(second.say, /callback message/);
});
test('records Friday before asking the single time question', () => {
  const first = turn(initialSchedule(caller), 'I would like to schedule an appointment');
  assert.equal(first.state.purpose, 'appointment');
  assert.equal(first.state.weekday, null);
  assert.equal(first.say, 'What day works for you?');
  const friday = turn(first.state, 'Friday');
  assert.equal(friday.state.weekday, 'friday');
  assert.equal(friday.state.time, null);
  assert.equal(friday.state.date, '2026-10-23');
  assert.equal(friday.say, `What time on ${FRIDAY} works for you?`);
  assert.equal(friday.state.phone, caller);
  assert.equal(friday.state.phoneSource, 'caller-id');
});

test('a volunteered Friday anytime skips the clock-time question', () => {
  const applied = turn(initialSchedule(caller), 'Friday anytime');
  assert.equal(applied.state.purpose, 'appointment');
  assert.equal(applied.state.weekday, 'friday');
  assert.equal(applied.state.window, 'anytime');
  assert.equal(applied.state.time, null);
  assert.equal(applied.state.date, '2026-10-23');
  assert.equal(applied.say, `Absolutely, I'll check ${FRIDAY}. May I please get your address?`);
  assert.doesNotMatch(applied.say, /what time/i);
});

test('address is repeated until the caller confirms a correction', () => {
  let state = turn(initialSchedule(caller), 'Friday at 3 pm').state;
  assert.equal(state.time, '15:00');
  assert.match(turn(state, 'Friday at 3 pm').say, /I'll check Friday, October 23, 3:00 PM Pacific/);
  assert.equal(turn(state, 'Friday at 3 pm').state.address, null);
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
  assert.equal(duration.say, `${DURATION_ANSWER} What time on ${FRIDAY} works for you?`);
  const resumed = turn(duration.state, '3 pm');
  assert.equal(resumed.state.time, '15:00');
  assert.match(resumed.say, /May I please get your address/);
});

test('only a verified open slot can be offered, and caller ID cannot be replaced by a tool claim', () => {
  const ready = sanitizeSchedule({ ...initialSchedule(caller), purpose: 'appointment', weekday: 'friday', time: '15:00', address: '123 Oak Street, Camarillo', addressConfirmed: true, city: 'Camarillo', kind: 'residential', name: 'Pat Example', awaiting: 'search' });
  const offered = applyFindResult(ready, { exact: true, date: '2026-10-23', requested: '15:00', slots: ['15:00'], fit: true, saved: false, searchComplete: true });
  assert.deepEqual(offered.state.offer, { date: '2026-10-23', time: '15:00' });
  assert.equal(offered.say, `${FRIDAY}, 3:00 PM Pacific is open on our calendar. Does that work for you?`);
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
  assert.match(partial.say, /Friday, October 23, 10:30 AM Pacific/);
  assert.equal(questionCount(partial.say), 1);
});

test('a rejected offer moves to the returned alternative, then asks once instead of repeating it', () => {
  const ready = sanitizeSchedule({ ...initialSchedule(caller), purpose: 'appointment', date: '2026-10-23', weekday: 'friday', time: '15:00', address: '123 Oak Street, Camarillo', addressConfirmed: true, city: 'Camarillo', kind: 'residential', name: 'Pat Example', awaiting: 'search' });
  const offered = applyFindResult(ready, { exact: true, date: '2026-10-23', requested: '15:00', slots: ['15:00'], alternatives: [{ date: '2026-10-26', time: '10:00' }], fit: true, saved: false });
  const declined = turn(offered.state, 'No');
  assert.equal(declined.prepare, false);
  assert.deepEqual(declined.state.offer, { date: '2026-10-26', time: '10:00' });
  assert.equal(declined.say, 'Monday, October 26, 10:00 AM Pacific is also open. Does that work for you?');
  assert.doesNotMatch(declined.say, /Friday/);
  const again = turn(declined.state, 'no');
  assert.equal(again.state.awaiting, 'replan');
  assert.equal(again.state.offer, null);
  assert.equal(again.prepare, false);
  assert.equal(again.say, 'What day or time should I check instead?');
  const repeated = turn(again.state, 'no');
  assert.equal(repeated.prepare, false);
  assert.notEqual(repeated.state.awaiting, 'offer');
});
test('date and time corrections invalidate the old offer before another availability check', () => {
 const ready=sanitizeSchedule({...initialSchedule(caller),purpose:'appointment',date:'2026-10-23',weekday:'friday',time:'15:00',address:'123 Oak Street, Camarillo',addressConfirmed:true,city:'Camarillo',kind:'residential',name:'Pat Example',awaiting:'offer',offer:{date:'2026-10-23',time:'15:00'}});
 for(const [text,date,time] of [['Actually Monday at 10 am','2026-10-26','10:00'],['Actually 2 pm','2026-10-23','14:00']]) {
  const corrected=applyScheduleTurn(ready,text,caller,'',NOW);
  assert.equal(corrected.state.date,date);assert.equal(corrected.state.time,time);
  assert.equal(corrected.state.offer,null);assert.equal(corrected.search,true);
  assert.equal(corrected.prepare,false);assert.equal(corrected.state.address,ready.address);
  assert.doesNotMatch(corrected.say,/we.?re confirmed|is booked/i);
 }
});

test('an offer uses the returned date when it is not the requested weekday', () => {
  const ready = sanitizeSchedule({ ...initialSchedule(caller), purpose: 'appointment', weekday: 'friday', date: '2026-10-23', time: '15:00', address: '123 Oak Street', addressConfirmed: true, city: 'Camarillo', kind: 'residential', name: 'Pat', awaiting: 'search' });
  const offered = applyFindResult(ready, { exact: false, fit: true, saved: false, alternatives: [{ date: '2026-10-26', time: '11:30' }] });
  assert.equal(offered.say, 'Monday, October 26, 11:30 AM Pacific is open on our calendar. Does that work for you?');
  assert.equal(offered.state.offer.date, '2026-10-26');
});

test('relative dates, word times, windows, and outside-hours preferences are recorded once', () => {
  const tomorrow = turn(initialSchedule(caller), 'tomorrow at 3 pm');
  assert.equal(tomorrow.state.date, '2026-10-21');
  assert.equal(tomorrow.state.weekday, 'wednesday');
  assert.equal(tomorrow.state.time, '15:00');
  const nextTuesday = turn(initialSchedule(caller), 'next Tuesday at 9 am');
  assert.equal(nextTuesday.state.date, '2026-10-27');
  assert.equal(nextTuesday.state.time, '09:00');
  const named = turn(initialSchedule(caller), 'October 23 at 3 pm');
  assert.equal(named.state.date, '2026-10-23');
  assert.equal(named.state.weekday, 'friday');
  const slash = turn(initialSchedule(caller), '10/23 at 3 pm');
  assert.equal(slash.state.date, '2026-10-23');
  const past = applyScheduleTurn(initialSchedule(caller), 'October 1', caller, '', NOW);
  assert.equal(past.state.date, null);
  assert.match(past.say, /already passed/);
  const mismatch = applyScheduleTurn(initialSchedule(caller), 'Friday October 22', caller, '', NOW);
  assert.equal(mismatch.state.date, null);
  assert.match(mismatch.say, /October 22 is a Thursday/);
  const ambiguous = turn(turn(initialSchedule(caller), 'I want to schedule').state, 'Friday at ten');
  assert.equal(ambiguous.state.time, null);
  assert.equal(ambiguous.state.pendingHour, 10);
  assert.match(ambiguous.say, /10:00 AM or 10:00 PM Pacific/);
  const evening = turn(ambiguous.state, 'pm');
  assert.equal(evening.state.pendingHour, null);
  assert.equal(evening.state.requestedTime, '22:00');
  assert.match(evening.say, /address/i);
  const five = turn(initialSchedule(caller), 'Friday 5pm');
  assert.equal(five.state.time, '17:00');
  assert.equal(five.state.awaiting, 'address');
  assert.doesNotMatch(five.say, /what time/i);
  const quarter = turn(turn(initialSchedule(caller), 'Friday').state, '3:15pm');
  assert.equal(quarter.state.time, null);
  assert.equal(quarter.state.requestedTime, '15:15');
  assert.equal(quarter.state.window, 'afternoon');
  assert.match(quarter.say, /address/i);
  const word = turn(turn(initialSchedule(caller), 'Friday').state, 'three thirty pm');
  assert.equal(word.state.time, '15:30');
  const span = turn(initialSchedule(caller), 'Friday 9:00 AM to 11:00 AM');
  assert.equal(span.state.window, '09:00-11:00');
  assert.equal(span.state.time, null);
  assert.match(span.say, /address/i);
  const withDuration = turn(initialSchedule(caller), 'Friday, and how long will it take?');
  assert.equal(withDuration.state.date, '2026-10-23');
  assert.equal(withDuration.say, `${DURATION_ANSWER} What time on ${FRIDAY} works for you?`);
});

test('unknown input escapes to one callback question, and a plain no asks for a new address', () => {
  let state = turn(initialSchedule(caller), 'I want to schedule an appointment').state;
  const first = turn(state, 'asdfgh');
  assert.match(first.say, /did not catch/i);
  assert.equal(first.state.weekday, null);
  const second = turn(first.state, 'qwerty');
  assert.equal(second.state.awaiting, 'callback');
  assert.match(second.say, /callback message/i);
  state = turn(turn(initialSchedule(caller), 'Friday at 3 pm').state, '123 Oak Street, Camarillo').state;
  const declined = turn(state, 'no');
  assert.equal(declined.state.address, null);
  assert.equal(declined.state.addressConfirmed, false);
  assert.match(declined.say, /May I please get your address/);
  assert.doesNotMatch(declined.say, /Is that correct/);
});

test('a later address correction clears the offer and a product question is not a city', () => {
  const ready = sanitizeSchedule({ ...initialSchedule(caller), purpose: 'appointment', date: '2026-10-23', weekday: 'friday', time: '15:00', address: '123 Oak Street, Camarillo', addressConfirmed: true, city: 'Camarillo', kind: 'residential', name: 'Pat Example', awaiting: 'offer', offer: { date: '2026-10-23', time: '15:00' } });
  const corrected = turn(ready, 'actually my address is 456 Pine Street, Camarillo');
  assert.equal(corrected.state.address, '456 Pine Street, Camarillo');
  assert.equal(corrected.state.addressConfirmed, false);
  assert.equal(corrected.state.offer, null);
  assert.match(corrected.say, /456 Pine Street, Camarillo/);
  assert.match(corrected.say, /Is that correct/);
  const city = sanitizeSchedule({ ...ready, awaiting: 'city', offer: null, address: '123 Oak Street', city: null, name: null });
  const products = turn(city, 'what products do you sell?');
  assert.equal(products.state.city, null);
  assert.equal(products.state.name, null);
  assert.match(products.say, /did not catch|What city/i);
});

test('a completed booking does not offer the old slot again, and a failed prepare stays on callback', () => {
  const booked = bookedSchedule({ ...initialSchedule(caller), purpose: 'appointment', weekday: 'friday', date: '2026-10-23', time: '15:00' }, '2026-10-26', '10:00');
  assert.equal(booked.awaiting, 'done');
  assert.match(booked.asked, /Absolutely, we're confirmed for Monday, October 26, 10:00 AM Pacific/);
  const no = applyScheduleTurn(booked, 'no', caller, '', NOW);
  assert.equal(no.prepare, false);
  assert.match(no.say, /Goodbye/);
  const yes = applyScheduleTurn(booked, 'yes', caller, '', NOW);
  assert.equal(yes.prepare, false);
  assert.equal(yes.state.awaiting, 'help');
  const callback = callbackSchedule(booked, CALLBACK_QUESTION);
  const accepted = turn(callback, 'yes');
  assert.equal(accepted.prepare, false);
  assert.equal(accepted.state.purpose, 'message');
  assert.match(accepted.say, /May I have your name/);
});

test('a message keeps the caller ID and one volunteered answer at a time', () => {
  const named = turn(initialSchedule(caller), 'I would like to leave a message');
  assert.match(named.say, /May I have your name/);
  const body = turn(named.state, 'Pat Example');
  assert.equal(body.state.name, 'Pat Example');
  assert.equal(body.state.phone, caller);
  assert.match(body.say, /I can call you back at/);
  assert.match(body.say, /right number/);
  assert.doesNotMatch(body.say, /best callback number/i);
  const confirmed = turn(body.state, 'yes');
  assert.match(confirmed.say, /reason for your call/);
  const ready = turn(confirmed.state, 'Please call me about shutters');
  assert.equal(ready.readback, true);
  assert.equal(ready.state.phone, caller);
  assert.equal(ready.state.messageText, 'Please call me about shutters');
  const blocked = turn(initialSchedule('+266696687'), 'I would like to leave a message', '+266696687');
  const needsPhone = turn(turn(blocked.state, 'Pat Example', '+266696687').state, 'Please call', '+266696687');
  assert.equal(needsPhone.state.phone, null);
  assert.match(needsPhone.say, /callback number/);
});
