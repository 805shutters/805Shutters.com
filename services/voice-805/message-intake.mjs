import { e164 } from './config.mjs';
import { RECEPTIONIST_OPENING, spokenDecision } from './receptionist.mjs';

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const unquote = value => clean(value).replace(/^["“](.*)["”][.!]?$/s, '$1').trim();
// Final captions can be cumulative even when the provider gives each segment a
// new item ID. Keep the fullest caption, without repeating its earlier prefix.
export function mergeCallerCaptions(events) {
  const words = text => [...text.matchAll(/[\p{L}\p{N}’']+/gu)].map(match => ({ key: match[0].toLowerCase(), end: match.index + match[0].length }));
  let merged = '';
  for (const event of events) {
    const next = clean(event.transcript);
    if (!next) continue;
    const left = words(merged), right = words(next);
    const prefix = Math.min(left.length, right.length);
    if (prefix && left.slice(0, prefix).every((word, i) => word.key === right[i].key)) {
      if (right.length >= left.length) merged = next;
      continue;
    }
    let overlap = Math.min(left.length, right.length);
    while (overlap >= 3 && !left.slice(-overlap).every((word, i) => word.key === right[i].key)) overlap--;
    merged = clean(merged + ' ' + (overlap >= 3 ? next.slice(right[overlap - 1].end).replace(/^[\s,.!;:-]+/, '') : next));
  }
  return merged;
}
const blocked = new Set(['+266696687', '+7378742833', '+8656696']);
export function callerPhone(from, business = '') {
  const value = clean(from);
  return e164.test(value) && !blocked.has(value) && value !== business ? value : null;
}
export function initialMessage(from, business = '') {
  const phone = callerPhone(from, business);
  return { purpose: 'message', awaiting: 'permission', asked: RECEPTIONIST_OPENING, name: null,
    phone, phoneSource: phone ? 'caller-id' : null, messageText: null, consent: false, clarifyCount: 0 };
}
const QUESTIONS = {
  message: 'What message would you like me to pass along?',
  name: 'May I please have your name?',
  phone: 'What phone number should our team call back?',
  correction: 'What would you like me to change?',
};
export const MESSAGE_GOODBYE = 'Thank you for calling 805 Shutters. Goodbye.';
export const MESSAGE_SAVED = 'Your message has been saved for our team to review. Thank you for calling 805 Shutters. Goodbye.';
export function messageQuestion(state, prefix = '') {
  const field = !state.messageText ? 'message' : !state.name ? 'name' : !state.phone ? 'phone' : 'confirm';
  if (field === 'confirm') return { state: { ...state, awaiting: 'confirm' }, readback: true };
  const say = `${prefix}${QUESTIONS[field]}`;
  return { state: { ...state, awaiting: field, asked: say }, say };
}
export function messageSilence(state) {
  const count = (state.clarifyCount || 0) + 1;
  if (count >= 2) return { state: { ...state, awaiting: 'done', clarifyCount: count, asked: MESSAGE_GOODBYE }, say: MESSAGE_GOODBYE, end: true };
  const say = state.awaiting === 'confirm' ? 'I did not hear a clear yes. Is the message and callback information correct?' : `I did not hear you. ${state.asked || RECEPTIONIST_OPENING}`;
  return { state: { ...state, clarifyCount: count, asked: say }, say };
}
export function spokenPhone(raw) {
  const digitWords = { zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };
  const text = clean(raw).toLowerCase().replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, word => digitWords[word]);
  const match = text.match(/(?:\+?\d[\d(). -]*){10,}/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits[0] === '1') return '+' + digits;
  return match[0].startsWith('+') && e164.test('+' + digits) ? '+' + digits : null;
}
const DECLINE = /^(?:no(?: thanks| thank you)?|nope|not now|never mind|nevermind|goodbye|bye|cancel)[.! ]*$/i;
const UNCLEAR = /^(?:maybe|perhaps|um|uh|huh|i don'?t know|not sure)[.!? ]*$/i;
const GENERIC_MESSAGE = /^(?:yes[, ]*|please[, ]*|i(?:'d| would)? (?:like|want) to |can i )*(?:leave|take) (?:a |my )?message[.!? ]*$/i;
const SCHEDULE = /\b(?:schedul\w*|book\w*|appointment|consultation)\b/i;
export function applyMessageTurn(prior, raw, from, business = '') {
  const state = prior?.purpose === 'message' ? { ...initialMessage(from, business), ...prior } : initialMessage(from, business);
  const text = clean(raw);
  state.lastAnswer = text;
  // ASR may add punctuation between a refusal and its polite closing.
  const decisionText = text.replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
  if (state.awaiting === 'done') return { state, say: MESSAGE_GOODBYE, end: true };
  if (!text || UNCLEAR.test(text)) return messageSilence(state);
  if (DECLINE.test(decisionText) && ['permission', 'message'].includes(state.awaiting)) return { state: { ...state, awaiting: 'done', asked: MESSAGE_GOODBYE }, say: MESSAGE_GOODBYE, end: true };
  const oldField = state.awaiting;
  if (oldField === 'permission' && spokenDecision(text) === 'affirmative' || GENERIC_MESSAGE.test(text)) {
    state.consent = true; state.clarifyCount = 0; return messageQuestion(state);
  }
  if (['confirm', 'correction'].includes(oldField) && (DECLINE.test(decisionText) || /^(?:no[, ]*)?(?:that(?:'s| is) )?(?:wrong|incorrect)[.! ]*$/i.test(text))) {
    const say = QUESTIONS.correction; return { state: { ...state, awaiting: 'correction', asked: say }, say };
  }
  if (/\bhow long\b.*\b(?:consultation|appointment|visit)\b/i.test(text)) {
    return { state, say: `A consultation generally takes about one hour. ${state.asked || RECEPTIONIST_OPENING}` };
  }
  state.consent = true; state.clarifyCount = 0;
  const phone = spokenPhone(text);
  const phoneLabel = /\b(?:number|reach me|call me (?:back )?at|callback (?:is|at))\b/i.test(text);
  if (phone && (oldField === 'phone' || phoneLabel)) { state.phone = phone; state.phoneSource = 'spoken'; }
  const nameMatch = text.match(/\b(?:my name is|this is|name should be|name is|i am|i[’']m)\s+([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,4}?)(?=[,.!?]|\s+(?:and|calling|my|please|i\b)|$)/iu);
  const volunteeredName = nameMatch && !/^(?:calling|interested|looking|trying|hoping|asking|wondering|sorry|not|ready|having|available|free)\b/i.test(nameMatch[1]);
  if (volunteeredName) state.name = nameMatch[1].trim();
  if (oldField === 'name' && !nameMatch && !phoneLabel && !SCHEDULE.test(text) && !/[?\d]/.test(text) && text.split(' ').length <= 6 && !/^(?:yes|no)[.! ]*$/i.test(text)) state.name = text.replace(/^(?:i am|i'm|it's)\s+/i, '').replace(/[.!]+$/, '');
  const replace = text.match(/^(?:no[, ]*|actually[, ]*)?(?:change (?:the |my )?message (?:to|to say)|the message (?:is|should be)|instead say|i meant)\s*[:,-]?\s*(.+)$/i);
  const add = text.match(/^(?:please )?(?:also (?:add|tell them)|add(?: to (?:the|my) message)?)\s*[:,-]?\s*(.+)$/i);
  let body = null;
  if (replace) body = unquote(replace[1]);
  else if (add) body = [state.messageText, add[1]].filter(Boolean).join(' ');
  else if (['permission', 'message'].includes(oldField) && spokenDecision(text) !== 'affirmative') {
    // A volunteered name/number alone is a field, not the caller's message.
    body = text;
    if (volunteeredName) body = body.replace(nameMatch[0], '');
    if (phone && phoneLabel) body = body.replace(/(?:my )?(?:callback (?:number )?(?:is|at)|(?:phone )?number (?:is|should be)|(?:you can )?(?:reach me|call me(?: back)?) at)\s*(?:\+?\d[\d(). -]*|(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)[\w -]*)/i, '');
    body = body.replace(/^[\s,.!;:-]*(?:and\b[ ,]*)?/i, '').trim();
  }
  else if (SCHEDULE.test(text) && !state.messageText) body = text;
  else if (oldField === 'correction' && !nameMatch && !phoneLabel) body = text.replace(/^(?:no|actually)[, ]+/i, '');
  if (body) {
    if (body.length > 2000) {
      const say = 'Please give me a shorter message so I can read it back accurately.';
      return { state: { ...state, awaiting: 'message', asked: say }, say };
    }
    state.messageText = body;
  }
  if (oldField === 'phone' && !phone) {
    const say = 'Please say the callback number with its area code.';
    return { state: { ...state, awaiting: 'phone', asked: say }, say };
  }
  // A scheduling request is just caller-provided message content. No date,
  // address, availability, booking intent or calendar action is constructed.
  return messageQuestion(state, SCHEDULE.test(text) ? 'I can pass that appointment request to our team for a callback. ' : '');
}
export function appendCallerTranscript(call, turn) {
  const transcript = [...(call.callerTranscript || [])];
  if (!transcript.some(item => item.id === turn.id)) transcript.push({ id: turn.id, text: clean(turn.text) });
  return transcript;
}
export function callerTranscriptText(call) {
  return (call?.callerTranscript || []).map(item => `Caller: ${item.text}`).join('\n');
}
