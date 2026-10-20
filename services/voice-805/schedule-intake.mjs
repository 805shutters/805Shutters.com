import { e164 } from './config.mjs';
import { spokenDecision } from './receptionist.mjs';

// Residential visits are 60 minutes. Commercial visits stay on the calendar
// duration for the window count: 60, 120, or 180 minutes. This spoken line
// does not change that contract.
export const DURATION_ANSWER = 'Generally about one hour.';
export const CHOICE_QUESTION = 'Would you like to leave a message for a callback, or would you like to schedule an appointment?';
export const CALLBACK_QUESTION = 'No open CRM time fits. May I take a callback message so staff can see whether they can accommodate it?';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const BLOCKED_CALLER_IDS = new Set(['+266696687', '+7378742833', '+8656696']);
const BLOCKED_WORDS = new Set(['anonymous', 'restricted', 'unavailable', 'unknown', 'blocked', 'private']);
const HOUR_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const STREET = /\b(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|place|pl|circle|cir)\b/i;

export function callerPhone(from, businessNumber = '') {
  const value = String(from || '').trim();
  if (!value || BLOCKED_WORDS.has(value.toLowerCase()) || !e164.test(value) || BLOCKED_CALLER_IDS.has(value) || value === businessNumber) return null;
  return value;
}
export function pacificToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function addDays(iso, days) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); }
function weekdayOf(iso) { const [y, m, d] = iso.split('-').map(Number); return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; }
function weekdayLabel(day) { return day ? day.charAt(0).toUpperCase() + day.slice(1) : ''; }
function textOf(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9:' ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function clean(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function clockValue(hour, minute) { return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; }
function validDate(value) {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function validGrid(value) { return typeof value === 'string' && /^\d{2}:(00|30)$/.test(value); }
function validClock(value) { return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }

export function speakClock(time) {
  const [hour, minute] = String(time || '').split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return '';
  const shown = hour % 12 || 12;
  return `${shown}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}
export function speakAppointment(date, time) {
  if (!validDate(date) || !validClock(time)) return '';
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return `${weekdayLabel(weekdayOf(date))}, ${MONTH_LABELS[month - 1]} ${day}, ${speakClock(time)} Pacific`;
}
export function speakWhen(state) {
  if (state.date && state.time) return speakAppointment(state.date, state.time);
  if (state.date && state.requestedTime) return `${speakAppointment(state.date, state.requestedTime).replace(/ Pacific$/, '')} Pacific`;
  const day = state.date ? `${weekdayLabel(weekdayOf(state.date))}, ${MONTH_LABELS[Number(state.date.slice(5, 7)) - 1]} ${Number(state.date.slice(8, 10))}` : weekdayLabel(state.weekday);
  if (state.time) return `${day} at ${speakClock(state.time)} Pacific`;
  if (state.requestedTime) return `${day} near ${speakClock(state.requestedTime)} Pacific`;
  if (state.window === 'morning') return `${day} morning`;
  if (state.window === 'afternoon') return `${day} afternoon`;
  if (state.window && state.window !== 'anytime') return `${day} between ${state.window}`;
  return day || 'that day';
}
export function questionCount(line) { return (String(line || '').match(/\?/g) || []).length; }

export function initialSchedule(from, businessNumber = '') {
  const phone = callerPhone(from, businessNumber);
  return {
    callerId: phone, purpose: null, weekday: null, date: null, time: null, requestedTime: null, window: null, pendingHour: null,
    address: null, addressConfirmed: false, city: null, kind: null, windowCount: null, name: null, messageText: null,
    phone, phoneSource: phone ? 'caller-id' : null, offer: null, alternatives: [], booked: null,
    awaiting: 'choice', asked: CHOICE_QUESTION, clarifyCount: 0, lastAnswer: null,
    pendingMinute: null, pendingEndHour: null, pendingEndMinute: null,
  };
}
function slot(value) { return value && validDate(value.date) && validGrid(value.time) ? { date: value.date, time: value.time } : null; }
export function sanitizeSchedule(input, from = '', businessNumber = '') {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const callerId = callerPhone(source.callerId, businessNumber) || callerPhone(from, businessNumber);
  const next = initialSchedule(callerId, businessNumber);
  next.callerId = callerId;
  next.purpose = source.purpose === 'appointment' || source.purpose === 'message' ? source.purpose : null;
  next.weekday = WEEKDAYS.includes(source.weekday) ? source.weekday : null;
  next.date = validDate(source.date) ? source.date : null;
  next.time = validGrid(source.time) ? source.time : null;
  next.requestedTime = validClock(source.requestedTime) ? source.requestedTime : null;
  next.window = source.window === 'anytime' || source.window === 'morning' || source.window === 'afternoon' || /^\d{2}:(00|30)-\d{2}:(00|30)$/.test(source.window || '') ? source.window : null;
  next.pendingHour = Number.isInteger(source.pendingHour) && source.pendingHour >= 1 && source.pendingHour <= 12 ? source.pendingHour : null;
  next.pendingMinute = Number.isInteger(source.pendingMinute) && source.pendingMinute >= 0 && source.pendingMinute <= 59 ? source.pendingMinute : null;
  next.pendingEndHour = Number.isInteger(source.pendingEndHour) && source.pendingEndHour >= 1 && source.pendingEndHour <= 12 ? source.pendingEndHour : null;
  next.pendingEndMinute = Number.isInteger(source.pendingEndMinute) && source.pendingEndMinute >= 0 && source.pendingEndMinute <= 59 ? source.pendingEndMinute : null;
  next.lastAnswer = typeof source.lastAnswer === 'string' && source.lastAnswer.trim() ? source.lastAnswer.trim().slice(0, 500) : null;
  next.address = typeof source.address === 'string' && source.address.trim() ? source.address.trim().slice(0, 512) : null;
  next.addressConfirmed = source.addressConfirmed === true && Boolean(next.address);
  next.city = typeof source.city === 'string' && /^[a-z][a-z .'-]{1,40}$/i.test(source.city || '') ? source.city.trim().slice(0, 120) : null;
  next.kind = source.kind === 'residential' || source.kind === 'commercial' ? source.kind : null;
  next.windowCount = Number.isInteger(source.windowCount) && source.windowCount >= 1 && source.windowCount <= 10000 ? source.windowCount : null;
  next.name = typeof source.name === 'string' && source.name.trim() ? source.name.trim().slice(0, 120) : null;
  next.messageText = typeof source.messageText === 'string' && source.messageText.trim() ? source.messageText.trim().slice(0, 2000) : null;
  if (source.phoneSource === 'spoken' && e164.test(source.phone || '')) { next.phone = source.phone; next.phoneSource = 'spoken'; }
  else if (source.phoneSource === null && (source.callerId || source.purpose || source.awaiting)) { next.phone = null; next.phoneSource = null; }
  else if (callerId) { next.phone = callerId; next.phoneSource = 'caller-id'; }
  next.offer = slot(source.offer);
  next.alternatives = Array.isArray(source.alternatives) ? source.alternatives.map(slot).filter(Boolean).slice(0, 3) : [];
  next.booked = slot(source.booked);
  next.awaiting = typeof source.awaiting === 'string' ? source.awaiting : next.awaiting;
  next.asked = typeof source.asked === 'string' && source.asked.trim() ? source.asked.trim().slice(0, 500) : next.asked;
  next.clarifyCount = Number.isInteger(source.clarifyCount) && source.clarifyCount > 0 ? Math.min(source.clarifyCount, 5) : 0;
  return next;
}
function isDuration(text) { return /\bhow long\b|\bconsultation length\b|\bhow much time\b|\bwhat is the length\b/.test(text); }
function looksLikeQuestion(text) { return /\?/.test(text) || /\b(what|how|why|where|who|which|do you|can you|products|sell|price|cost)\b/.test(text); }
function mentionedWeekday(text) {
  const days = WEEKDAYS.filter(day => new RegExp(`\\b${day}s?\\b`).test(text) && !new RegExp(`\\b(?:not|except|isn t)\\s+${day}`).test(text));
  return days.length === 1 ? days[0] : days.length > 1 ? 'ambiguous' : null;
}
function wordsToDigits(text) {
  return text
    .replace(new RegExp(`\\b(${Object.keys(HOUR_WORDS).join('|')})\\b`, 'g'), word => String(HOUR_WORDS[word]))
    .replace(/\bhalf past (\d{1,2})\b/g, '$1:30')
    .replace(/\bquarter past (\d{1,2})\b/g, '$1:15')
    .replace(/\b(\d{1,2})\s+thirty\b/g, '$1:30')
    .replace(/\b(\d{1,2})\s+fifteen\b/g, '$1:15');
}
function dateText(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9:/\- ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function stripDates(text) {
  return text
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/20\d{2})?\b/g, ' ')
    .replace(new RegExp(`\\b(?:${MONTHS.join('|')}|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s*20\\d{2})?\\b`, 'g'), ' ')
    .replace(/\b(?:next|this|coming)\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g, ' ')
    .replace(/\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|today|yesterday)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
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
function explicitDate(text, today) {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/);
  if (slash) return `${slash[3] || today.slice(0, 4)}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  const named = text.match(new RegExp(`\\b(${MONTHS.join('|')}|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`));
  if (!named) return null;
  const aliases = { jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const month = aliases[named[1]] || MONTHS.indexOf(named[1]) + 1;
  return `${named[3] || today.slice(0, 4)}-${String(month).padStart(2, '0')}-${named[2].padStart(2, '0')}`;
}
function resolveDate(text, today) {
  if (/\byesterday\b/.test(text)) return { date: addDays(today, -1), past: true };
  if (/\btomorrow\b/.test(text)) return { date: addDays(today, 1) };
  if (/\btoday\b/.test(text)) return { date: today };
  const named = mentionedWeekday(text);
  const date = explicitDate(text, today);
  if (date && !validDate(date)) return { invalid: true };
  if (date && named && named !== 'ambiguous' && weekdayOf(date) !== named) return { mismatch: date, weekday: weekdayOf(date), named };
  if (date) return { date, ...(date < today ? { past: true } : {}) };
  if (named === 'ambiguous') return { ambiguousDay: true };
  if (named) {
    const todayIndex = WEEKDAYS.indexOf(weekdayOf(today));
    let delta = (WEEKDAYS.indexOf(named) - todayIndex + 7) % 7;
    if (/\bnext\b/.test(text) && delta === 0) delta = 7;
    return { date: addDays(today, delta), weekday: named };
  }
  return {};
}
function parseTime(text, loose) {
  const normalized = wordsToDigits(stripDates(text));
  if (!normalized) return null;
  const range = normalized.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a|p)?\s*m?\s*(?:to|through|-)\s*(\d{1,2})(?::(\d{2}))?\s*(a|p)?\s*m?\b/);
  if (range) {
    const endMer = range[6];
    const startMinute = range[2] == null ? 0 : Number(range[2]);
    const endMinute = range[5] == null ? 0 : Number(range[5]);
    const start = classifyHour(Number(range[1]), startMinute, range[3] || endMer);
    const end = classifyHour(Number(range[4]), endMinute, endMer || range[3]);
    if (!start || !end) return null;
    if (start.ambiguous || end.ambiguous) return { ambiguous: true, hour: start.hour || end.hour, minute: start.minute || 0, endHour: end.hour || Number(range[4]), endMinute };
    if (start.time && end.time && start.time < end.time && validGrid(start.time) && validGrid(end.time)) return { window: `${start.time}-${end.time}` };
    return { requestedTime: start.requestedTime || start.time, window: start.window || 'anytime' };
  }
  const match = normalized.match(/\b(?:at\s+|around\s+)?(\d{1,2})(?::(\d{2}))?\s*(a|p)?\s*m?\b/);
  if (!match) return null;
  if (!loose && !match[3] && !/\bat\b|\baround\b/.test(normalized)) return null;
  return classifyHour(Number(match[1]), match[2] == null ? 0 : Number(match[2]), match[3]);
}
function classifyHour(hour, minute, mer) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59 || hour < 0) return null;
  let value = hour;
  if (mer === 'a') value = hour === 12 ? 0 : hour;
  else if (mer === 'p') value = hour === 12 ? 12 : hour + 12;
  else if (hour >= 13) value = hour;
  else return { ambiguous: true, hour, minute };
  const time = clockValue(value, minute);
  const grid = minute === 0 || minute === 30;
  if (!grid || value < 8 || value > 16) return { requestedTime: time, window: value < 12 ? 'morning' : 'afternoon' };
  return { time };
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
function extractAddress(raw) {
  const led = raw.match(/\b(?:my address is|the address is|address is|i live at|live at|located at)\s+(.+)$/i);
  const source = led ? led[1] : raw;
  const match = source.match(/\b\d{1,6}\s+(?:[a-z0-9.'-]+\s+){0,6}(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|way|court|ct|place|pl|circle|cir)\b(?:\s*,\s*[a-z][a-z .'-]{1,40})?/i);
  if (!match || looksLikeQuestion(match[0])) return null;
  return clean(match[0]).slice(0, 512);
}
function hasTime(state) { return Boolean(state.time || state.requestedTime || state.window || state.pendingHour); }
function ask(state) {
  if (state.awaiting === 'done') return state;
  if (state.purpose === 'message') {
    if (!state.name) return { ...state, awaiting: 'message-name', asked: 'May I have your name?' };
    if (!state.messageText) return { ...state, awaiting: 'message-body', asked: 'What would you like the message to say?' };
    if (!state.phone) return { ...state, awaiting: 'message-phone', asked: 'What is the best callback number?' };
    return { ...state, awaiting: 'message-ready', asked: state.asked };
  }
  if (state.purpose !== 'appointment') return { ...state, awaiting: 'choice', asked: CHOICE_QUESTION };
  if (state.pendingHour) {
    const minute = String(state.pendingMinute || 0).padStart(2, '0');
    const end = state.pendingEndHour ? ` to ${state.pendingEndHour}:${String(state.pendingEndMinute || 0).padStart(2, '0')}` : '';
    return { ...state, awaiting: 'ampm', asked: `Do you mean ${state.pendingHour}:${minute}${end} AM or ${state.pendingHour}:${minute}${end} PM Pacific?` };
  }
  if (!state.weekday && !state.date) return { ...state, awaiting: 'day', asked: 'What day works for you?' };
  if (!hasTime(state)) return { ...state, awaiting: 'time', asked: `What time on ${speakWhen(state)} works for you?` };
  if (!state.address) return { ...state, awaiting: 'address', asked: `Absolutely, I'll check ${speakWhen(state)}. May I please get your address?` };
  if (!state.addressConfirmed) return { ...state, awaiting: 'address-confirm', asked: `I have ${state.address}. Is that correct?` };
  if (!state.city) return { ...state, awaiting: 'city', asked: 'What city is that address in?' };
  if (!state.kind) return { ...state, awaiting: 'kind', asked: 'Is this for your home or a commercial property?' };
  if (state.kind === 'commercial' && state.windowCount == null) return { ...state, awaiting: 'count', asked: 'About how many windows is this for?' };
  if (!state.name) return { ...state, awaiting: 'name', asked: 'May I have your name?' };
  if (!state.phone) return { ...state, awaiting: 'phone', asked: 'What is the best callback number?' };
  if (!state.offer) return { ...state, awaiting: 'search', asked: state.asked };
  return { ...state, awaiting: 'offer', asked: `${speakAppointment(state.offer.date, state.offer.time)} is open on our calendar. Does that work for you?` };
}
function resultOf(state, { say = state.asked, search = false, prepare = false, handoff = null, invalidate = false, readback = false, changed = false } = {}) {
  const next = { ...state, asked: say };
  return {
    state: next, say, prepare, handoff, invalidate, changed,
    search: Boolean(search) || (changed && next.awaiting === 'search'),
    readback: Boolean(readback) || (changed && next.awaiting === 'message-ready'),
  };
}
function clarify(state) {
  const count = state.clarifyCount + 1;
  if (count >= 2) return resultOf({ ...state, clarifyCount: count, awaiting: 'callback', offer: null }, { say: 'I still did not catch that. May I take a callback message so our team can help?', changed: false });
  return resultOf({ ...state, clarifyCount: count }, { say: `I did not catch that. ${ask(state).asked}`, changed: false });
}
function finish(state, patch, flags = {}) {
  const merged = { ...state, ...patch, clarifyCount: 0, pendingHour: patch.pendingHour === undefined ? null : patch.pendingHour, pendingMinute: patch.pendingMinute === undefined ? null : patch.pendingMinute, pendingEndHour: patch.pendingEndHour === undefined ? null : patch.pendingEndHour, pendingEndMinute: patch.pendingEndMinute === undefined ? null : patch.pendingEndMinute };
  const scheduleChanged = Boolean(patch.address || patch.time || patch.requestedTime || patch.date || patch.weekday || patch.window);
  if (patch.address && patch.address !== state.address) { merged.addressConfirmed = false; merged.offer = null; merged.alternatives = []; }
  if (patch.time || patch.requestedTime || patch.window || patch.date || (patch.weekday && patch.weekday !== state.weekday)) { merged.offer = null; merged.alternatives = []; }
  const next = ask(merged);
  return resultOf(next, { say: next.asked, invalidate: Boolean(flags.invalidate || scheduleChanged), changed: true });
}
function noted(state, say) {
  const count = state.clarifyCount + 1;
  if (count >= 2) return resultOf({ ...state, clarifyCount: count, awaiting: 'callback', offer: null }, { say: 'I still did not catch that. May I take a callback message so our team can help?' });
  return resultOf({ ...state, clarifyCount: count }, { say });
}
export function applyScheduleTurn(input, transcript, from = '', businessNumber = '', now = new Date()) {
  const state = sanitizeSchedule(input, from, businessNumber);
  const raw = clean(transcript);
  const text = textOf(raw);
  const today = pacificToday(now);
  if (!text) return resultOf(state);
  if (state.awaiting === 'done') {
    if (spokenDecision(raw) === 'affirmative') return resultOf({ ...state, awaiting: 'help', asked: 'What else can I help with?' }, { say: 'What else can I help with?' });
    return resultOf(state, { say: 'Thank you for calling. Goodbye.' });
  }
  if (state.booked && state.awaiting === 'help' && !/\b(message|call me back)\b/.test(text)) {
    if (spokenDecision(raw) === 'negative') return resultOf(state, { say: 'Thank you for calling. Goodbye.' });
    return resultOf(state, { say: 'Your appointment is already confirmed. What else can I help with?' });
  }
  const duration = isDuration(text);
  const echoed = text === textOf(state.asked);
  if (state.awaiting === 'ampm' && state.pendingHour && !duration) {
    const mer = /\b(morning|am|a m)\b/.test(text) ? 'a' : /\b(afternoon|evening|pm|p m)\b/.test(text) ? 'p' : null;
    if (!mer) return clarify(state);
    const start = classifyHour(state.pendingHour, state.pendingMinute || 0, mer);
    if (state.pendingEndHour) {
      const end = classifyHour(state.pendingEndHour, state.pendingEndMinute || 0, mer);
      if (start?.time && end?.time && start.time < end.time) return remember(finish(state, { window: `${start.time}-${end.time}`, time: null, requestedTime: null }, { invalidate: true }), text);
      if (start?.requestedTime) return remember(finish(state, start, { invalidate: true }), text);
    }
    return remember(finish(state, start || {}, { invalidate: true }), text);
  }
  if (state.awaiting === 'callback' && spokenDecision(raw) === 'affirmative') return remember(finish(state, { purpose: 'message', offer: null }), text);
  if (state.awaiting === 'help' && spokenDecision(raw) === 'affirmative') return resultOf(state, { say: 'What else can I help with?' });
  if (state.awaiting === 'help' && spokenDecision(raw) === 'negative') return resultOf(state, { say: 'Thank you for calling. Goodbye.' });
  if (state.awaiting === 'offer' && spokenDecision(raw) === 'affirmative' && state.offer && !/\b(address|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b/.test(text)) return resultOf({ ...state, lastAnswer: text }, { prepare: true });
  const dated = resolveDate(dateText(raw), today);
  if (dated.past) return noted(state, 'That date has already passed. What day works for you?');
  if (dated.invalid) return noted(state, 'That is not a valid date. What day works for you?');
  if (dated.ambiguousDay) return clarify(state);
  if (dated.mismatch) return noted(state, `${MONTH_LABELS[Number(dated.mismatch.slice(5, 7)) - 1]} ${Number(dated.mismatch.slice(8, 10))} is a ${weekdayLabel(dated.weekday)}, not ${weekdayLabel(dated.named)}. What day works for you?`);
  const clock = duration ? null : parseTime(dateText(raw), ['time', 'replan', 'correction', 'ampm', 'offer', 'help'].includes(state.awaiting) || Boolean(dated.date) || /\bat\b|\b\d{1,2}(?::\d{2})?\s*[ap]\s*m\b/.test(text));
  const address = !duration && !looksLikeQuestion(raw) ? extractAddress(raw) : null;
  if (state.awaiting === 'address-confirm' && spokenDecision(raw) === 'negative' && !address) return remember(finish({ ...state, address: null, addressConfirmed: false, offer: null }, {}), text);
  if (state.awaiting === 'offer' && spokenDecision(raw) === 'negative' && !dated.date && !clock?.time && !clock?.requestedTime && !clock?.window && !address) {
    const [alternative, ...rest] = state.alternatives;
    if (alternative) {
      const say = `${speakAppointment(alternative.date, alternative.time)} is also open. Does that work for you?`;
      return resultOf({ ...state, offer: alternative, alternatives: rest, awaiting: 'offer', asked: say, clarifyCount: 0, lastAnswer: text }, { say, changed: true, invalidate: true });
    }
    const say = 'What day or time should I check instead?';
    return resultOf({ ...state, offer: null, alternatives: [], awaiting: 'replan', asked: say, lastAnswer: text }, { say, changed: true, invalidate: true });
  }
  const repeated = text === state.lastAnswer && spokenDecision(raw) !== 'affirmative' && spokenDecision(raw) !== 'negative' && !address;
  if (repeated && !(dated.date && dated.date !== state.date) && !(clock?.time && clock.time !== state.time) && !(clock?.requestedTime && clock.requestedTime !== state.requestedTime)) return clarify(state);
  if (!duration && echoed) return clarify(state);
  if (looksLikeQuestion(text) && !duration && !dated.date && !clock && !address) return clarify(state);
  const patch = {};
  if (dated.date) { patch.date = dated.date; patch.weekday = dated.weekday || weekdayOf(dated.date); }
  if (clock?.ambiguous) { patch.pendingHour = clock.hour; patch.pendingMinute = clock.minute || 0; patch.pendingEndHour = clock.endHour || null; patch.pendingEndMinute = clock.endMinute || null; }
  else if (clock?.window && !clock.time && !clock.requestedTime) { patch.window = clock.window; patch.time = null; patch.requestedTime = null; }
  else if (clock?.time) { patch.time = clock.time; patch.requestedTime = null; patch.window = null; }
  else if (clock?.requestedTime) { patch.requestedTime = clock.requestedTime; patch.time = validGrid(clock.requestedTime) ? clock.requestedTime : null; patch.window = patch.time ? null : clock.window; }
  const window = mentionedWindow(text);
  if (!patch.time && !patch.requestedTime && !patch.pendingHour && window && window !== 'ambiguous') { patch.window = window; patch.time = null; }
  const kind = kindFrom(text);
  if (kind && kind !== 'ambiguous') patch.kind = kind;
  if (state.awaiting === 'count' || /\bwindows?\b/.test(text)) {
    const count = Number((text.match(/\b(\d{1,5})\b/) || [])[1]);
    if (Number.isInteger(count) && count >= 1 && count <= 10000 && count !== patch.pendingHour) patch.windowCount = count;
  }
  if (/\b(different number|another number|call me at|reach me at|my number is)\b/.test(text) || state.awaiting === 'phone' || state.awaiting === 'message-phone') {
    const phone = spokenNumber(text);
    if (phone) { patch.phone = phone; patch.phoneSource = 'spoken'; }
    else if (/\b(different number|another number)\b/.test(text)) return remember(finish({ ...state, phone: null, phoneSource: null, offer: null }, {}), text);
  }
  const named = raw.match(/\bmy name is\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,3})\b/);
  if (named && (state.awaiting === 'name' || state.awaiting === 'message-name' || state.awaiting === 'correction' || state.awaiting === 'choice' || state.awaiting === 'help')) patch.name = clean(named[1]);
  else if (state.awaiting === 'name' || state.awaiting === 'message-name') {
    if (!looksLikeQuestion(raw) && /^[a-z][a-z .'-]{1,80}$/i.test(raw)) patch.name = clean(raw).slice(0, 120);
  }
  const declined = /^(no|nope|nah|maybe|maybe later|not now)$/.test(text);
  if ((state.awaiting === 'message-body' || state.awaiting === 'correction' && state.purpose === 'message' || state.purpose === 'message' && state.name && !state.messageText) && !declined && !looksLikeQuestion(raw) && !address && raw.length > 1) patch.messageText = raw.slice(0, 2000);
  if (state.purpose !== 'appointment' && state.purpose !== 'message' && state.awaiting !== 'help') {
    const message = /\b(leave a message|take a message|call me back)\b/.test(text);
    const appointment = /\b(schedule|appointment|consultation|book a|estimate)\b/.test(text) || Boolean(patch.date || patch.weekday || patch.time || patch.window || patch.requestedTime || patch.pendingHour);
    if (message && !appointment) patch.purpose = 'message';
    else if (appointment && !message) patch.purpose = 'appointment';
    else if (!duration) return resultOf(state, { say: CHOICE_QUESTION });
  } else if ((state.awaiting === 'help' || state.awaiting === 'correction') && /\b(schedule|appointment|consultation)\b/.test(text) && !state.booked) patch.purpose = 'appointment';
  else if ((state.awaiting === 'help' || state.awaiting === 'correction') && /\b(message|call me back)\b/.test(text)) patch.purpose = 'message';
  if (address) { patch.address = address; patch.city = cityFrom(address) || state.city; }
  else if (state.awaiting === 'address-confirm' && spokenDecision(raw) === 'affirmative' && state.address) patch.addressConfirmed = true;
  if (state.awaiting === 'city' && !patch.city && !looksLikeQuestion(raw) && /^[a-z][a-z .'-]{1,40}$/i.test(raw)) patch.city = clean(raw);
  if (!Object.keys(patch).length) return duration ? resultOf(state, { say: `${DURATION_ANSWER} ${state.asked}` }) : clarify(state);
  const answered = remember(finish(state, patch, { invalidate: Boolean(patch.address || patch.time || patch.requestedTime || patch.date || patch.weekday || patch.window) }), text);
  if (duration) { answered.say = `${DURATION_ANSWER} ${answered.say}`; answered.state.asked = answered.say; }
  return answered;
}
function remember(applied, text) { applied.state.lastAnswer = text; return applied; }
export function applyFindResult(input, result) {
  const state = sanitizeSchedule(input);
  const callback = { ...state, offer: null, alternatives: [], awaiting: 'callback', asked: CALLBACK_QUESTION };
  if (!result || result.saved || result.fit === false) return resultOf(callback, { say: CALLBACK_QUESTION });
  const exact = result.exact && result.date && (result.requested || result.slots?.[0]) ? { date: result.date, time: result.requested || result.slots[0] } : null;
  const slots = [result.recommendation, exact, ...(result.alternatives || [])].map(slot).filter(Boolean);
  const unique = [];
  for (const item of slots) if (!unique.some(existing => existing.date === item.date && existing.time === item.time)) unique.push(item);
  if (!unique.length) return resultOf(callback, { say: CALLBACK_QUESTION });
  const [offer, ...alternatives] = unique;
  const note = result.searchComplete === false ? ' It is the best time verified in this check.' : '';
  const say = `${speakAppointment(offer.date, offer.time)} is open on our calendar.${note} Does that work for you?`;
  return resultOf({ ...state, offer, alternatives, awaiting: 'offer', asked: say, clarifyCount: 0 }, { say, changed: true });
}
export function findPayload(input) {
  const state = sanitizeSchedule(input);
  if (!state.addressConfirmed || !state.address || !state.city || !state.kind || (!state.date && !state.weekday)) throw new Error('Scheduling details are incomplete.');
  const grid = validGrid(state.time);
  return {
    city: state.city, address: state.address, kind: state.kind, windowCount: state.kind === 'commercial' ? state.windowCount : null,
    ...(state.date ? { date: state.date } : { weekday: state.weekday }),
    ...(grid ? { time: state.time } : {}),
    ...(!grid && state.window ? { window: state.window } : {}),
  };
}
export function preparePayload(input) {
  const state = sanitizeSchedule(input);
  if (!state.offer || !state.name || !state.phone) throw new Error('Scheduling details are incomplete.');
  const { weekday, window, ...fields } = findPayload({ ...state, date: state.offer.date, time: state.offer.time });
  return { ...fields, date: state.offer.date, time: state.offer.time, name: state.name, phone: state.phone };
}
export function bookedSchedule(input, date, time) {
  const when = speakAppointment(date, time);
  const say = `Absolutely, we're confirmed for ${when}. Is there anything else I can help with?`;
  return { ...sanitizeSchedule(input), awaiting: 'done', asked: say, booked: { date, time }, offer: { date, time }, alternatives: [] };
}
export function callbackSchedule(input, say) {
  return { ...sanitizeSchedule(input), awaiting: 'callback', asked: say, offer: null, alternatives: [] };
}
