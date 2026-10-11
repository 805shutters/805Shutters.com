export const staffIds = ["mike", "jessica"];
export const e164 = /^\+[1-9]\d{7,14}$/;
export function loadConfig(env = process.env) {
  const json = (key, fallback) => (env[key] ? JSON.parse(env[key]) : fallback);
  return {
    mode: env.VOICE_805_MODE || "simulation",
    port: Number(env.VOICE_805_PORT || 8095),
    database: env.VOICE_805_DATABASE || "./data/voice-805.sqlite",
    origin: env.VOICE_805_PUBLIC_ORIGIN || "",
    accountSid: env.VOICE_805_TWILIO_ACCOUNT_SID || "",
    authToken: env.VOICE_805_TWILIO_AUTH_TOKEN || "",
    number: env.VOICE_805_NUMBER || "",
    xaiKey: env.VOICE_805_XAI_API_KEY || "",
    agentId: env.VOICE_805_XAI_AGENT_ID || "",
    controlKey: env.VOICE_805_CONTROL_KEY || "",
    staff: json("VOICE_805_STAFF_JSON", {}),
    hours: json("VOICE_805_HOURS_JSON", null),
    holidays: json("VOICE_805_HOLIDAYS_JSON", null),
    offerSeconds: Number(env.VOICE_805_OFFER_SECONDS || 0),
    greeting: env.VOICE_805_GREETING || "",
    closedGreeting: env.VOICE_805_CLOSED_GREETING || "",
    fallbackGreeting: env.VOICE_805_FALLBACK_GREETING || "",
    liveAuthorized: env.VOICE_805_LIVE_AUTHORIZED === "true",
    agentReviewed: env.VOICE_805_AGENT_REVIEWED === "true",
    notificationsApproved: env.VOICE_805_NOTIFICATIONS_APPROVED === "true",
    retentionDays: Number(env.VOICE_805_RETENTION_DAYS || 0),
    appClientVerified: env.VOICE_805_APP_CLIENT_VERIFIED === "true",
  };
}
export function readiness(c) {
  const missing = [];
  if (c.mode !== "live") missing.push("live mode is disabled");
  for (const key of [
    "origin",
    "accountSid",
    "authToken",
    "number",
    "xaiKey",
    "agentId",
    "controlKey",
    "greeting",
    "closedGreeting",
    "fallbackGreeting",
  ])
    if (!c[key]) missing.push(key);
  if (!e164.test(c.number)) missing.push("valid dedicated 805 number");
  if (!/^AC[0-9a-f]{32}$/i.test(c.accountSid))
    missing.push("valid dedicated Twilio account");
  if (!/^https:\/\/[^/]+$/.test(c.origin))
    missing.push("HTTPS public service origin without path");
  if (c.controlKey.length < 32)
    missing.push("control key of at least 32 characters");
  if (
    !Number.isInteger(c.offerSeconds) ||
    c.offerSeconds < 10 ||
    c.offerSeconds > 60
  )
    missing.push("approved offer duration (10–60 seconds)");
  if (!Number.isInteger(c.retentionDays) || c.retentionDays < 1)
    missing.push("approved retention days");
  if (!validHours(c.hours)) missing.push("weekly hours");
  if (
    !c.holidays ||
    typeof c.holidays !== "object" ||
    Array.isArray(c.holidays) ||
    !Object.entries(c.holidays).every(
      ([day, spans]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && validSpans(spans),
    )
  )
    missing.push("holiday calendar (explicit empty object allowed)");
  for (const id of staffIds) {
    const s = c.staff[id];
    if (
      !s ||
      !["cell", "app"].includes(s.kind) ||
      !(s.kind === "cell"
        ? e164.test(s.destination) && s.destination !== c.number
        : /^client:[a-zA-Z0-9_-]{1,64}$/.test(s.destination))
    )
      missing.push(`${id} ring endpoint`);
    if (!e164.test(s?.sms || "") || s?.sms === c.number)
      missing.push(`${id} SMS destination`);
    if (s?.kind === "app" && !c.appClientVerified)
      missing.push(
        `${id} installed calling client and locked-device push verification`,
      );
  }
  if (
    c.staff.mike?.destination &&
    c.staff.mike.destination === c.staff.jessica?.destination
  )
    missing.push("distinct staff ring endpoints");
  if (c.staff.mike?.sms && c.staff.mike.sms === c.staff.jessica?.sms)
    missing.push("distinct staff SMS destinations");
  if (!c.liveAuthorized) missing.push("live provider authorization");
  if (!c.agentReviewed) missing.push("reviewed published agent version");
  if (!c.notificationsApproved)
    missing.push("staff notification consent and messaging registration");
  return { ready: missing.length === 0, mode: c.mode, missing };
}
function validSpans(spans) {
  return (
    Array.isArray(spans) &&
    spans.every(
      (s, i) =>
        Array.isArray(s) &&
        s.length === 2 &&
        s.every(Number.isInteger) &&
        s[0] >= 0 &&
        s[1] <= 1440 &&
        s[0] < s[1] &&
        (i === 0 || spans[i - 1][1] <= s[0]),
    )
  );
}
export function validHours(hours) {
  return (
    hours &&
    typeof hours === "object" &&
    Array.from({ length: 7 }, (_, i) => i).every((i) => validSpans(hours[i]))
  );
}
// Split overnight intervals at midnight in configuration. No guessed business hours.
export function isOpen(c, now = new Date()) {
  if (!validHours(c.hours) || !c.holidays) return false;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const spans =
    c.holidays[day] ??
    c.hours[
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday)
    ];
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  return (
    validSpans(spans) &&
    spans.some(([from, to]) => minute >= from && minute < to)
  );
}
