import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMessageTurn, initialMessage, appendCallerTranscript, callerTranscriptText, callerPhone, mergeCallerCaptions } from '../message-intake.mjs';
const from = '+18055550199';
const apply = (state, text) => applyMessageTurn(state, text, from).state;
test('volunteered names and callback numbers are retained without mistaking intent for a name', () => {
  for (const start of ["I'm", 'I am', 'My name is', 'This is']) {
    const state = apply(initialMessage(from), `${start} Pat Example. Call me at 8055550123. Please call about repairs.`);
    assert.equal(state.name, 'Pat Example'); assert.equal(state.phone, '+18055550123'); assert.equal(state.awaiting, 'saving');
  }
  for (const text of ["I'm interested in shutters.", "I'm calling about repairs.", 'I am looking for blinds.']) {
    const state = apply(initialMessage(from), text); assert.equal(state.name, null); assert.equal(state.messageText, text);
  }
});
test('message submission needs no identity or confirmation and never generates booking fields', () => {
 const result=applyMessageTurn(initialMessage(from),'Please schedule a visit Friday at ten.',from);
 assert.equal(result.complete,true);assert.equal(result.readback,undefined);assert.equal(result.say,undefined);
 assert.equal(result.state.name,null);assert.equal(result.state.date,undefined);assert.equal(result.state.time,undefined);assert.equal(result.state.address,undefined);
});
test('long messages and raw captions stay complete without a shortening interview', () => {
 const text='A complete detail. '.repeat(600).trim();const result=applyMessageTurn(initialMessage(from),text,from);
 assert.equal(result.complete,true);assert.equal(result.state.messageText,text);
 const call={callerTranscript:appendCallerTranscript({}, {id:'long',text})};assert.equal(callerTranscriptText(call),`Caller: ${text}`);assert.equal(appendCallerTranscript(call,{id:'long',text:'duplicate'}).length,1);
});
test('blocked and business caller IDs are never reused as callback contacts', () => {
  for (const value of ['anonymous', 'blocked', '+266696687', '+7378742833', '+8656696']) assert.equal(callerPhone(value), null);
  assert.equal(callerPhone(from, from), null); assert.equal(callerPhone(from), from);
});

test('even a short caller message is accepted without demanding more information', () => {
 const result=applyMessageTurn(initialMessage(from),"I'm Pat Example.",from);
 assert.equal(result.state.name,'Pat Example');assert.equal(result.complete,true);assert.equal(result.state.messageText,"I'm Pat Example.");
});

test('cumulative captions and shared sentence boundaries retain each complete detail once', () => {
 const merge = texts => mergeCallerCaptions(texts.map(transcript => ({ transcript })));
 assert.equal(merge(['The shade sticks.', 'The shade sticks. Please call after lunch.', 'The shade sticks. Please call after lunch. I need a part.']), 'The shade sticks. Please call after lunch. I need a part.');
 assert.equal(merge(['The shade sticks. Please call after lunch.', 'Please call after lunch. I need a part.']), 'The shade sticks. Please call after lunch. I need a part.');
 assert.equal(merge(['Call me.', 'Call me. More detail.', 'Call me.']), 'Call me. More detail.');
});
test('quoted instructions in a message remain caller data and are not spoken back', () => {
 const text='Tell them "The bedroom blind is broken."';const result=applyMessageTurn(initialMessage(from),text,from);
 assert.equal(result.state.messageText,text);assert.equal(result.complete,true);assert.equal(result.say,undefined);
});

test('a duration question inside a left message is saved, not answered with another interview', () => {
 const state=apply(initialMessage(from),'yes');const text='Please tell me how long a consultation will take when you call back.';
 const result=applyMessageTurn(state,text,from);assert.equal(result.complete,true);assert.equal(result.state.messageText,text);assert.equal(result.say,undefined);
});
