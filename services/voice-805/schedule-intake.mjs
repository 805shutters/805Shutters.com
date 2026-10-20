import { e164 } from './config.mjs';
import { spokenDecision } from './receptionist.mjs';

// Residential visits are 60 minutes. Commercial visits stay on the calendar
// duration for the window count: 60, 120, or 180 minutes. This spoken line
// does not change that contract.
export const DURATION_ANSWER = 'Generally about one hour.';
export const CHOICE_QUESTION = 'Would you like to leave a message for a callback, or would you like to schedule an appointment?';
export const CALLBACK_QUESTION = 'No open CRM time fits. May I take a callback message so staff can see whether they can accommodate it?';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const BLOCKED_CALLER_IDS = new Set(['+266696687', '+7378742833', '+8656696']);
const BLOCKED_WORDS = new Set(['anonymous', 'restricted', 'unavailable', 'unknown', 'blocked', 'private']);

export function callerPhone(from, businessNumber = '') {
  const value = String(from || '').trim();
  if (!value || BLOCKED_WORDS.has(value.toLowerCase()) || !e164.test(value) || BLOCKED_CALLER_IDS.has(value) || value === businessNumber) return null;
  return value;
}

export function initialSchedule(from, businessNumber = '') {
  const phone = callerPhone(from, businessNumber);
  return {
    callerId: phone,
    purpose: null,
    weekday: null,
    date: null,
    time: null,
    window: null,
    address: null,
    addressConfirmed: false,
    city: null,
    kind: null,
    windowCount: null,
    name: null,
    phone,
    phoneSource: phone ? 'caller-id' : null,
    offer: null,
    awaiting: 'choice',
    asked: CHOICE_QUESTION,
  };
}

function textOf(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9:' ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function weekdayLabel(day) { return day ? day.charAt(0).toUpperCase() + day.slice(1) : ''; }
export function speakClock(time) {
  const [hour, minute] = String(time || '').split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return '';
  const shown = hour % 12 || 12;
  return minute === 0 ? `${shown}:00` : `${shown}:${String(minute).padStart(2, '0')}`;
}
export function speakWhen(state) {
  const day = weekdayLabel(state.weekday) || state.date || 'that day';
  if (state.time) return `${day} at ${speakClock(state.time)}`;
  if (state.window === 'morning') return `${day} morning`;
  if (state.window === 'afternoon') return `${day} afternoon`;
  if (state.window && state.window !== 'anytime') return `${day} between ${state.window}`;
  return day;
}
export function questionCount(line) { return (String(line || '').match(/\?/g) || []).length; }

function isDuration(text) { return /\bhow long\b|\bconsultation length\b|\bhow much time\b|\bwhat is the length\b/.test(text); }
function mentionedWeekday(text) {
  const days = WEEKDAYS.filter(day => new RegExp(`\\b${day}s?\\b`).test(text) && !new RegExp(`\\b(?:not|except|isn t)\\s+${day}`).test(text));
  return days.length === 1 ? days[0] : days.length > 1 ? 'ambiguous' : null;
}
function mentionedWindow(text) {
  const anytime = /\bany\s*time\b|\bwhenever\b/.test(text);
  const morning = /\bmorning\b/.test(text);
  const afternoon = /\bafternoon\b/.test(text);
  if (anytime) return 'anytime';
  if (morning && afternoon) return 'ambiguous';
  if (morning) return 'morning';
  if (afternoon) return 'afternoon';
  return null;
}
function parseClock(text, allowBare) {
  if (!allowBare && !/\b(?:at|around)\s+\d{1,2}\b|\b\d{1,2}(?::\d{2})?\s*[ap]\s*m\b/.test(text)) return null;
  const match = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*([ap])\s*m\b/) || (allowBare ? text.match(/\b(?:at|around)?\s*(\d{1,2})(?::(\d{2}))?\b/) : null);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] == null ? 0 : Number(match[2]);
  if (minute !== 0 && minute !== 30) return 'invalid';
  const mer = match[3];
  if (mer === 'a') hour = hour === 12 ? 0 : hour;
  else if (mer === 'p') hour = hour === 12 ? 12 : hour + 12;
  else if (hour >= 1 && hour <= 7) hour += 12;
  if (hour < 8 || hour > 16) return 'invalid';
  return `${String(hour).padStart(2, '0')}:${minute === 0 ? '00' : '30'}`;
}
function cityFrom(address) {
  const parts = address.split(',').map(part => part.trim()).filter(Boolean);
  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const city = parts[index].replace(/\b\d{5}(?:-\d{4})?\b/g, '').replace(/\b(?:california|ca)\b/ig, '').trim();
    if (/^[a-z][a-z .'-]{1,40}$/i.test(city)) return city;
  }
  return null;
}
function spokenNumber(text) {
  const digits = text.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
function kindFrom(text) {
  const commercial = /\b(commercial|business|office|store|shop)\b/.test(text);
  const residential = /\b(residential|home|house)\b/.test(text);
  if (commercial && residential) return 'ambiguous';
  if (commercial) return 'commercial';
  if (residential) return 'residential';
  return null;
}
function validTime(value) { return typeof value === 'string' && /^\d{2}:(00|30)$/.test(value); }
function validDate(value) { return typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value); }

export function sanitizeSchedule(input, from = '', businessNumber = '') {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const callerId = callerPhone(source.callerId, businessNumber) || callerPhone(from, businessNumber);
  const next = initialSchedule(callerId, businessNumber);
  next.callerId = callerId;
  next.purpose = source.purpose === 'appointment' || source.purpose === 'message' ? source.purpose : null;
  next.weekday = WEEKDAYS.includes(source.weekday) ? source.weekday : null;
  next.date = validDate(source.date) ? source.date : null;
  next.time = validTime(source.time) ? source.time : null;
  next.window = source.window === 'anytime' || source.window === 'morning' || source.window === 'afternoon' || /^\d{2}:(00|30)-\d{2}:(00|30)$/.test(source.window || '') ? source.window : null;
  next.address = typeof source.address === 'string' && source.address.trim() ? source.address.trim().slice(0, 512) : null;
  next.addressConfirmed = source.addressConfirmed === true && Boolean(next.address);
  next.city = typeof source.city === 'string' && source.city.trim() ? source.city.trim().slice(0, 120) : null;
  next.kind = source.kind === 'residential' || source.kind === 'commercial' ? source.kind : null;
  next.windowCount = Number.isInteger(source.windowCount) && source.windowCount >= 1 && source.windowCount <= 10000 ? source.windowCount : null;
  next.name = typeof source.name === 'string' && source.name.trim() ? source.name.trim().slice(0, 120) : null;
  if (source.phoneSource === 'spoken' && e164.test(source.phone || '')) { next.phone = source.phone; next.phoneSource = 'spoken'; }
  else if (source.phoneSource === null && (source.callerId || source.purpose || source.awaiting)) { next.phone = null; next.phoneSource = null; }
  else if (callerId) { next.phone = callerId; next.phoneSource = 'caller-id'; }
  else { next.phone = null; next.phoneSource = null; }
  next.offer = source.offer && validDate(source.offer.date) && validTime(source.offer.time) ? { date: source.offer.date, time: source.offer.time } : null;
  next.awaiting = typeof source.awaiting === 'string' ? source.awaiting : next.awaiting;
  next.asked = typeof source.asked === 'string' && source.asked.trim() ? source.asked.trim().slice(0, 500) : next.asked;
  return next;
}

function ask(state) {
  if (state.purpose === 'message') return { ...state, awaiting: 'message', asked: 'May I have your name?' };
  if (state.purpose !== 'appointment') return { ...state, awaiting: 'choice', asked: CHOICE_QUESTION };
  if (!state.weekday && !state.date) return { ...state, awaiting: 'day', asked: 'What day works for you?' };
  if (!state.time && !state.window) return { ...state, awaiting: 'time', asked: `What time on ${weekdayLabel(state.weekday) || state.date} works for you?` };
  if (!state.address) return { ...state, awaiting: 'address', asked: `Absolutely, I'll check ${speakWhen(state)}. May I please get your address?` };
  if (!state.addressConfirmed) return { ...state, awaiting: 'address-confirm', asked: `I have ${state.address}. Is that correct?` };
  if (!state.city) return { ...state, awaiting: 'city', asked: 'What city is that address in?' };
  if (!state.kind) return { ...state, awaiting: 'kind', asked: 'Is this for your home or a commercial property?' };
  if (state.kind === 'commercial' && state.windowCount == null) return { ...state, awaiting: 'count', asked: 'About how many windows is this for?' };
  if (!state.name) return { ...state, awaiting: 'name', asked: 'May I have your name?' };
  if (!state.phone) return { ...state, awaiting: 'phone', asked: 'What is the best callback number?' };
  if (!state.offer) return { ...state, awaiting: 'search', asked: state.asked };
  return { ...state, awaiting: 'offer', asked: `${speakWhen({ ...state, time: state.offer.time, weekday: state.weekday })} is open on our calendar. Does that work for you?` };
}

function withAnswer(state, patch) {
  const next = ask({ ...state, ...patch, offer: patch.offer === undefined ? state.offer : patch.offer });
  return { state: next, say: next.asked, search: next.awaiting === 'search', prepare: false, handoff: next.purpose === 'message' ? 'message' : null };
}

export function applyScheduleTurn(input, transcript, from = '', businessNumber = '') {
  const state = sanitizeSchedule(input, from, businessNumber);
  const raw = clean(transcript);
  const text = textOf(raw);
  if (!text) return { state, say: state.asked, search: false, prepare: false, handoff: null };
  if (isDuration(text)) return { state, say: `${DURATION_ANSWER} ${state.asked}`, search: false, prepare: false, handoff: null };
  if (state.awaiting === 'offer' && spokenDecision(raw) === 'affirmative' && state.offer) return { state, say: state.asked, search: false, prepare: true, handoff: null };
  if (state.awaiting === 'callback' && spokenDecision(raw) === 'affirmative') return withAnswer(state, { purpose: 'message' });
  if (/\b(different number|another number|call me at|reach me at|my number is)\b/.test(text)) {
    const phone = spokenNumber(text);
    if (!phone) return withAnswer({ ...state, phone: state.phoneSource === 'caller-id' ? null : state.phone, phoneSource: state.phoneSource === 'caller-id' ? null : state.phoneSource, offer: null }, {});
    return withAnswer(state, { phone, phoneSource: 'spoken', offer: null });
  }
  const patch = {};
  const weekday = mentionedWeekday(text);
  if (weekday && weekday !== 'ambiguous') patch.weekday = weekday;
  const window = mentionedWindow(text);
  if (window && window !== 'ambiguous') { patch.window = window; patch.time = null; }
  const clock = parseClock(text, state.awaiting === 'time');
  if (clock && clock !== 'invalid') { patch.time = clock; patch.window = null; }
  const kind = kindFrom(text);
  if (kind && kind !== 'ambiguous') patch.kind = kind;
  if (state.awaiting === 'count' || /\bwindows?\b/.test(text)) {
    const count = Number((text.match(/\b(\d{1,5})\b/) || [])[1]);
    if (Number.isInteger(count) && count >= 1 && count <= 10000) patch.windowCount = count;
  }
  const name = raw.match(/\bmy name is\s+([a-z][a-z .'-]{0,80})$/i);
  if (name) patch.name = clean(name[1]);
  if (state.purpose !== 'appointment' && state.purpose !== 'message') {
    const message = /\b(leave a message|take a message|call me back)\b/.test(text) && !/\b(schedule|appointment|consultation)\b/.test(text);
    const appointment = /\b(schedule|appointment|consultation|book a|estimate)\b/.test(text) || Boolean(patch.weekday || patch.time || patch.window);
    if (message && !appointment) patch.purpose = 'message';
    else if (appointment && !message) patch.purpose = 'appointment';
    else return { state, say: CHOICE_QUESTION, search: false, prepare: false, handoff: null };
  }
  if (state.awaiting === 'address' && !isDuration(text)) {
    const address = clean(raw.replace(/^(?:it is|it's|the address is|my address is)\s+/i, ''));
    if (/\d/.test(address) && /\b(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|place|pl|circle|cir)\b/i.test(address)) {
      patch.address = address.slice(0, 512);
      patch.addressConfirmed = false;
      patch.city = cityFrom(address);
      patch.offer = null;
    }
  }
  if (state.awaiting === 'address-confirm') {
    const corrected = clean(raw.replace(/^(?:no|nope|nah|wrong|incorrect|actually|instead)[, ]*/i, '').replace(/^(?:it is|it's|the address is)\s+/i, ''));
    if (spokenDecision(raw) !== 'affirmative' && /\d/.test(corrected) && /\b(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|place|pl|circle|cir)\b/i.test(corrected)) {
      patch.address = corrected.slice(0, 512);
      patch.addressConfirmed = false;
      patch.city = cityFrom(corrected);
      patch.offer = null;
    } else if (spokenDecision(raw) === 'affirmative' && state.address) patch.addressConfirmed = true;
  }
  if (state.awaiting === 'city' && /^[a-z][a-z .'-]{1,40}$/i.test(raw) && !patch.weekday) patch.city = clean(raw).slice(0, 120);
  if (state.awaiting === 'name' && !patch.name && /^[a-z][a-z .'-]{1,80}$/i.test(raw)) patch.name = clean(raw).slice(0, 120);
  if (state.awaiting === 'phone') {
    const phone = spokenNumber(text);
    if (phone) { patch.phone = phone; patch.phoneSource = 'spoken'; }
  }
  if (patch.weekday && patch.weekday !== state.weekday && patch.time == null && patch.window == null) { patch.time = null; patch.window = null; patch.offer = null; }
  if (patch.time || patch.window || patch.address) patch.offer = null;
  const next = withAnswer(state, patch);
  if ((patch.weekday || patch.time || patch.window || patch.address) && state.offer) next.state.offer = null;
  if (next.state.awaiting === 'search') next.search = true;
  return next;
}

export function applyFindResult(input, result) {
  const state = sanitizeSchedule(input);
  const callback = { ...state, offer: null, awaiting: 'callback', asked: CALLBACK_QUESTION };
  if (!result || result.saved || result.fit === false) return { state: callback, say: CALLBACK_QUESTION, search: false, prepare: false, handoff: null };
  const slot = result.recommendation || (result.exact && result.date && (result.requested || result.slots?.[0]) ? { date: result.date, time: result.requested || result.slots[0] } : null) || result.alternatives?.[0] || null;
  if (!slot?.date || !slot?.time) return { state: callback, say: CALLBACK_QUESTION, search: false, prepare: false, handoff: null };
  const when = speakWhen({ ...state, time: slot.time });
  const note = result.searchComplete === false ? ' It is the best time verified in this check.' : '';
  const asked = `${when} is open on our calendar.${note} Does that work for you?`;
  const next = { ...state, offer: { date: slot.date, time: slot.time }, awaiting: 'offer', asked };
  return { state: next, say: asked, search: false, prepare: false, handoff: null };
}

export function findPayload(input) {
  const state = sanitizeSchedule(input);
  if (!state.addressConfirmed || !state.address || !state.city || !state.kind) throw new Error('Scheduling details are incomplete.');
  return {
    city: state.city,
    address: state.address,
    kind: state.kind,
    windowCount: state.kind === 'commercial' ? state.windowCount : null,
    ...(state.date ? { date: state.date } : { weekday: state.weekday }),
    ...(state.time ? { time: state.time } : {}),
    ...(state.window && !state.time ? { window: state.window } : {}),
  };
}

export function preparePayload(input) {
  const state = sanitizeSchedule(input);
  if (!state.offer || !state.name || !state.phone) throw new Error('Scheduling details are incomplete.');
  const { weekday, window, ...fields } = findPayload(state);
  return { ...fields, date: state.offer.date, time: state.offer.time, name: state.name, phone: state.phone };
}
