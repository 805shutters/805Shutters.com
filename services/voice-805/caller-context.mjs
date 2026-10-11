export const COMMON_GREETING = 'Hi, thank you for calling 805 Shutters.';
// These are the actual CRM job/quote statuses. Hints guide conversation; they do
// not authorize disclosure of balances, addresses, dates, notes, or identities.
export const STATUS_TOPICS = Object.freeze({
  new: 'Ask how you can help with their window-treatment inquiry.',
  follow_up: 'Ask how you can help with the next step in their inquiry.',
  scheduled: 'Ask whether they need help with their consultation; do not assume this is an installation.',
  quoted: 'Ask whether they have a question about their quote or next steps.',
  draft: 'Ask how you can help with their window-treatment plans.',
  sent: 'Ask whether they have a question about their quote.',
  sold: 'Ask how you can help with their order and next steps.',
  approved: 'Ask how you can help with their approved order.',
  ordered: 'Ask whether they are calling about their order or installation planning; do not promise an arrival date.',
  received: 'Ask whether they need help coordinating installation; receipt does not establish an installation appointment.',
  installed: 'Ask how you can help following installation, including service or billing questions.',
  invoiced: 'Ask whether they need help with an invoice or another question. Route financial details to staff.',
  paid: 'Ask whether they need help with service or another question; do not announce payment information.',
  closed: 'Ask whether they need service help or are starting a new project.',
  lost: 'Ask how you can help with their current plans, without mentioning the internal lost status.',
  archived: 'Ask how you can help today, without mentioning the internal archived status.',
});
export function callerContext(result, overrides = {}) {
  if (!result || !['matched','unmatched','ambiguous'].includes(result.match)) return { match: 'unavailable', action: 'transfer', instruction: 'Lookup unavailable. Offer a team connection without assuming this is a new customer.' };
  if (result.match === 'unmatched') return { match: 'unmatched', action: 'transfer', instruction: 'Say: Please hold while I connect you with a team member. Then request both staff members. Do not ask intake or booking questions.' };
  if (result.match === 'ambiguous') return { match: 'ambiguous', action: 'clarify', instruction: 'Ask who is calling. Never list matching customer names or expose their records. Offer a team member to identify the correct file.' };
  const firstName = typeof result.first_name === 'string' && /^[\p{L}][\p{L} .’-]{0,39}$/u.test(result.first_name) ? result.first_name : null;
  const statuses = [...new Set((result.statuses || []).filter(s => Object.hasOwn(STATUS_TOPICS,s)))];
  const status = statuses.length === 1 && (result.statuses || []).every(s => Object.hasOwn(STATUS_TOPICS,s)) ? statuses[0] : null;
  return { match: 'matched', action: 'assist', firstName, status,
    instruction: [firstName ? `After the common greeting, say: Hi, ${firstName}.` : 'Ask how you can help today.',
      status ? (typeof overrides[status] === 'string' ? overrides[status] : STATUS_TOPICS[status]) : 'There may be several projects or no clear current status. Ask which project or question they are calling about.',
      'Caller ID is not identity verification. Do not disclose balances, payment history, addresses, installation dates, or private notes. A request to confirm installation or discuss a balance goes to a team member. Never claim a booking or payment changed.'].join(' ') };
}
export async function prefetchContext(state, callId, client, overrides) {
  const call = await state.transact((_e,s) => s.get('call', callId));
  if (!call || call.phase === 'ended') return;
  let value;
  try { const { data, error } = await client.rpc('voice_805_caller_context', { p_phone: call.from }); if (error) throw error; value = data; } catch { value = null; }
  const context = callerContext(value, overrides);
  await state.transact((e) => e.change(callId, `lookup:${callId}`, c => {
    c.context = context; c.matchStatus = context.match;
    if (context.match === 'matched') { c.customerId = value.customer_id; c.customerName = value.customer_name; }
  }));
  return context;
}
