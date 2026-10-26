import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMessageTurn, initialMessage, appendCallerTranscript, callerTranscriptText, callerPhone, mergeCallerCaptions } from '../message-intake.mjs';
const from = '+18055550199';
const apply = (state, text) => applyMessageTurn(state, text, from).state;
test('volunteered names and callback numbers are retained without mistaking intent for a name', () => {
  for (const start of ["I'm", 'I am', 'My name is', 'This is']) {
    const state = apply(initialMessage(from), `${start} Pat Example. Call me at 8055550123. Please call about repairs.`);
    assert.equal(state.name, 'Pat Example'); assert.equal(state.phone, '+18055550123'); assert.equal(state.awaiting, 'confirm');
  }
  for (const text of ["I'm interested in shutters.", "I'm calling about repairs.", 'I am looking for blinds.']) {
    const state = apply(initialMessage(from), text); assert.equal(state.name, null); assert.equal(state.messageText, text);
  }
});
test('corrections replace facts, additional detail appends, and no scheduling fields are generated', () => {
  let state = apply(initialMessage(from), 'This is Pat Example. Please schedule a visit Friday at ten.');
  state = apply(state, 'Actually, my name is Sam Example.'); assert.equal(state.name, 'Sam Example');
  state = apply(state, 'Change the message to Please call about my broken shade.');
  state = apply(state, 'Also add I am available after noon.');
  assert.equal(state.messageText, 'Please call about my broken shade. I am available after noon.');
  assert.equal(state.date, undefined); assert.equal(state.time, undefined); assert.equal(state.address, undefined);
});
test('oversize messages are explicitly shortened by the caller, never silently saved; raw captions remain complete', () => {
  const text = 'A complete detail. '.repeat(600);
  const result = applyMessageTurn(initialMessage(from), text, from);
  assert.equal(result.state.messageText, null); assert.match(result.say, /shorter message/);
  const call = { callerTranscript: appendCallerTranscript({}, { id: 'long', text }) };
  assert.equal(call.callerTranscript[0].text, text.trim());
  assert.equal(appendCallerTranscript(call, { id: 'long', text: 'duplicate' }).length, 1);
  assert.equal(callerTranscriptText(call), `Caller: ${text.trim()}`);
});
test('blocked and business caller IDs are never reused as callback contacts', () => {
  for (const value of ['anonymous', 'blocked', '+266696687', '+7378742833', '+8656696']) assert.equal(callerPhone(value), null);
  assert.equal(callerPhone(from, from), null); assert.equal(callerPhone(from), from);
});

test('volunteering only a name asks for the actual message next', () => {
 const result = applyMessageTurn(initialMessage(from), "I'm Pat Example.", from);
 assert.equal(result.state.name, 'Pat Example'); assert.equal(result.state.messageText, null); assert.equal(result.state.awaiting, 'message');
});

test('cumulative captions and shared sentence boundaries retain each complete detail once', () => {
 const merge = texts => mergeCallerCaptions(texts.map(transcript => ({ transcript })));
 assert.equal(merge(['The shade sticks.', 'The shade sticks. Please call after lunch.', 'The shade sticks. Please call after lunch. I need a part.']), 'The shade sticks. Please call after lunch. I need a part.');
 assert.equal(merge(['The shade sticks. Please call after lunch.', 'Please call after lunch. I need a part.']), 'The shade sticks. Please call after lunch. I need a part.');
 assert.equal(merge(['Call me.', 'Call me. More detail.', 'Call me.']), 'Call me. More detail.');
});
test('ASR quotation marks around a replacement do not become spoken message punctuation', () => {
 let state = apply(initialMessage(from), 'This is Pat Example. Call about repairs.');
 state = apply(state, 'Change the message to "The bedroom blind is broken."');
 assert.equal(state.messageText, 'The bedroom blind is broken.');
});
