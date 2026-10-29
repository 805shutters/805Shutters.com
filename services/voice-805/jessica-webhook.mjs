const GROK_WEBHOOK_HOST = 'api2.cursor.sh';
const GROK_WEBHOOK_PATH = /^\/automations\/webhook\/[0-9a-f-]{36}$/i;
const PHONE_MESSAGE_FIELDS = [
  'id',
  'call_sid',
  'caller_name',
  'callback_number',
  'call_time',
  'transcript',
  'reason',
  'recording_url',
  'status',
];

export function loadJessicaWebhookConfig(env = {}) {
  const url = String(env.VOICE_805_JESSICA_WEBHOOK_URL || '').trim();
  const key = String(env.VOICE_805_JESSICA_WEBHOOK_KEY || '').trim();
  let endpoint = null;
  try {
    endpoint = new URL(url);
  } catch {}
  const configured = Boolean(
    endpoint &&
    endpoint.protocol === 'https:' &&
    endpoint.hostname === GROK_WEBHOOK_HOST &&
    endpoint.username === '' &&
    endpoint.password === '' &&
    endpoint.search === '' &&
    endpoint.hash === '' &&
    GROK_WEBHOOK_PATH.test(endpoint.pathname) &&
    key.length >= 32,
  );
  return { configured, url: configured ? endpoint.href : '', key: configured ? key : '' };
}

export async function sendJessicaPhoneMessage(fetchImpl, config, row) {
  if (!config?.configured) throw new Error('Jessica phone-message webhook is not configured');
  if (!row?.id || !row?.call_sid) throw new Error('Verified CRM phone message is required');
  const payload = Object.fromEntries(PHONE_MESSAGE_FIELDS.map(field => [field, row[field] ?? null]));
  let response;
  try {
    response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.key}`,
        'X-Idempotency-Key': `805-phone:${row.call_sid}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('Jessica phone-message webhook was unavailable');
  }
  if (!response.ok) throw new Error('Jessica phone-message webhook rejected the message');
  return { delivered: true };
}
