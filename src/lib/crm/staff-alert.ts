import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OWNER_ALERT_FROM_PHONE } from "@/lib/notify/owner-alert-routing";
import { toE164 } from "@/lib/notify/phone";
import { getSupabaseServiceClient } from "@/lib/supabase-server";

const PACIFIC = "America/Los_Angeles";
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MESSAGING_SERVICE_PREFIX = "MG60d4";
const SALE_OR_SIGNING_TOKENS = new Set(["sale", "sold", "signed", "signing", "signature"]);
const PAYMENT_TOKENS = new Set(["payment", "payments", "paid", "deposit"]);
const DEDUPE_STATUSES = ["sent", "held"] as const;

export type StaffAlertStatus = "sent" | "held" | "deduped" | "rejected" | "failed";

export type StaffAlertRecord = {
  id: string;
  status: StaffAlertStatus;
  customer: string;
  job_number: string;
  missing: string[];
  from_bot: string;
  event_type: string;
  dedupe_key: string;
  deliver_at: string | null;
  sent_at: string | null;
  twilio_sids: string[];
  error: string | null;
  claim_token: string | null;
  created_at: string;
};

export type NewStaffAlert = Omit<StaffAlertRecord, "id" | "created_at">;

export type StaffAlertStore = {
  findRecent(dedupeKey: string, sinceIso: string): Promise<StaffAlertRecord | null>;
  insert(row: NewStaffAlert): Promise<StaffAlertRecord>;
  claimDue(limit: number): Promise<StaffAlertRecord[]>;
  finish(
    id: string,
    claimToken: string,
    patch: { status: "sent" | "failed"; sent_at: string | null; twilio_sids: string[]; error: string | null },
  ): Promise<boolean>;
};

type Env = Record<string, string | undefined>;

type SmsSendResult =
  | { ok: true; sid: string }
  | { ok: false; error: string };

export type StaffAlertDeps = {
  now: () => Date;
  env: Env;
  store: StaffAlertStore | null;
  send: (input: { to: string; body: string; env: Env }) => Promise<SmsSendResult>;
};

type PacificParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function pacificParts(instant: Date): PacificParts {
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant)) {
    if (part.type !== "literal") bag[part.type] = part.value;
  }
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second ?? 0),
  };
}

function pacificOffsetMinutes(instant: Date): number {
  const parts = pacificParts(instant);
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((wallAsUtc - instant.getTime()) / 60000);
}

/** 7:00 AM Pacific as a UTC instant. The wall clock stays 7:00 through DST. */
export function pacificWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utcMs = wallAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = wallAsUtc - pacificOffsetMinutes(new Date(utcMs)) * 60000;
    if (next === utcMs) break;
    utcMs = next;
  }
  return new Date(utcMs);
}

/** Quiet hours are 8:00 PM through 6:59 AM America/Los_Angeles. 7:00 AM sends. */
export function isPacificQuietHours(now: Date): boolean {
  const parts = pacificParts(now);
  const minuteOfDay = parts.hour * 60 + parts.minute;
  return minuteOfDay >= 20 * 60 || minuteOfDay < 7 * 60;
}

export function nextPacificSevenAm(now: Date): Date {
  const parts = pacificParts(now);
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (parts.hour >= 7) base.setUTCDate(base.getUTCDate() + 1);
  return pacificWallTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), 7, 0);
}

export function staffAlertText(input: { customer: string; job_number: string; missing: readonly string[]; from_bot: string }): string {
  return `805 ALERT | ${input.customer} | ${input.job_number} | missing: ${input.missing.join(", ")} | from ${input.from_bot}`;
}

export function isSaleOrSigningEvent(eventType: string): boolean {
  const tokens = eventType.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((token) => SALE_OR_SIGNING_TOKENS.has(token))) return true;
  const payment = tokens.some((token) => PAYMENT_TOKENS.has(token));
  return tokens.includes("accepted") && !payment;
}

export function staffAlertCountsTowardDedupe(status: string): boolean {
  return (DEDUPE_STATUSES as readonly string[]).includes(status);
}

export function staffAlertDedupeKey(input: { customer: string; job_number: string; missing: readonly string[]; event_type: string }): string {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const missing = input.missing.map(normalize).filter(Boolean).sort().join("|");
  const material = [normalize(input.customer), normalize(input.job_number), missing, normalize(input.event_type)].join("\n");
  return createHash("sha256").update(`staff-alert-v1\n${material}`, "utf8").digest("hex");
}

export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header || "");
  return match?.[1] ?? null;
}

export function secretsMatch(provided: string, expected: string): boolean {
  const actual = createHash("sha256").update(provided, "utf8").digest();
  const wanted = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actual, wanted);
}

export function read805StaffAlertTwilio(env: Env):
  | { ok: true; accountSid: string; authToken: string; messagingServiceSid: string; fromPhone: string }
  | { ok: false; reason: string } {
  const accountSid = env.TWILIO_805_ACCOUNT_SID?.trim() || "";
  const authToken = env.TWILIO_805_AUTH_TOKEN?.trim() || "";
  const messagingServiceSid = env.TWILIO_805_MESSAGING_SERVICE_SID?.trim() || "";
  const fromPhone = toE164(env.TWILIO_805_FROM_PHONE);
  if (!accountSid || !authToken || !messagingServiceSid || !fromPhone) {
    return { ok: false, reason: "805 Twilio credentials are not configured." };
  }
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) {
    return { ok: false, reason: "805 Twilio account is not configured." };
  }
  if (!messagingServiceSid.toUpperCase().startsWith(MESSAGING_SERVICE_PREFIX.toUpperCase())) {
    return { ok: false, reason: "805 Twilio messaging service is not configured." };
  }
  if (fromPhone === OWNER_ALERT_FROM_PHONE) {
    return { ok: false, reason: "805 Twilio sender is not allowed." };
  }
  return { ok: true, accountSid, authToken, messagingServiceSid, fromPhone };
}

export function staffAlertRecipients(env: Env): { ok: true; phones: [string, string] } | { ok: false; reason: string } {
  const mike = toE164(env.MIKE_805_SALES_SMS_NUMBER);
  const jessica = toE164(env.JESSICA_805_SALES_SMS_NUMBER);
  if (!mike || !jessica) return { ok: false, reason: "Staff alert recipients are not configured." };
  return { ok: true, phones: [mike, jessica] };
}

export async function send805TwilioSms(input: { to: string; body: string; env: Env }): Promise<SmsSendResult> {
  const config = read805StaffAlertTwilio(input.env);
  if (!config.ok) return { ok: false, error: config.reason };
  const params = new URLSearchParams({
    To: input.to,
    Body: input.body,
    MessagingServiceSid: config.messagingServiceSid,
    From: config.fromPhone,
  });
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({})) as { sid?: string };
    if (!response.ok || !data.sid) return { ok: false, error: `Twilio error ${response.status}` };
    return { ok: true, sid: data.sid };
  } catch {
    return { ok: false, error: "Twilio request failed" };
  }
}

type ParsedAlert = {
  customer: string;
  job_number: string;
  missing: string[];
  from_bot: string;
  event_type: string;
};

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function parseStaffAlertBody(body: unknown): { ok: true; value: ParsedAlert } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "A JSON object is required." };
  }
  const record = body as Record<string, unknown>;
  const customer = requiredText(record.customer);
  const jobNumber = requiredText(record.job_number);
  const fromBot = requiredText(record.from_bot);
  const eventType = requiredText(record.event_type);
  if (!customer) return { ok: false, error: "customer is required." };
  if (!jobNumber) return { ok: false, error: "job_number is required." };
  if (!fromBot) return { ok: false, error: "from_bot is required." };
  if (!eventType) return { ok: false, error: "event_type is required." };
  if (!("missing" in record)) return { ok: false, error: "missing is required." };
  let missing: string[] | null = null;
  if (typeof record.missing === "string") {
    const item = record.missing.trim();
    missing = item ? [item] : null;
  } else if (Array.isArray(record.missing) && record.missing.every((item) => typeof item === "string")) {
    const items = record.missing.map((item) => item.trim()).filter(Boolean);
    missing = items.length ? items : null;
  }
  if (!missing) return { ok: false, error: "missing must be a string or an array of strings." };
  return { ok: true, value: { customer, job_number: jobNumber, missing, from_bot: fromBot, event_type: eventType } };
}

function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

async function remember(store: StaffAlertStore, row: NewStaffAlert): Promise<StaffAlertRecord> {
  try {
    return await store.insert(row);
  } catch (error) {
    console.warn("[staff-alert] log failed", error instanceof Error ? error.name : "Error");
    throw new Error("Staff alert log is unavailable.");
  }
}

function blankOutcome(input: ParsedAlert, dedupeKey: string, status: StaffAlertStatus, extra: Partial<NewStaffAlert> = {}): NewStaffAlert {
  return {
    status,
    customer: input.customer,
    job_number: input.job_number,
    missing: input.missing,
    from_bot: input.from_bot,
    event_type: input.event_type,
    dedupe_key: dedupeKey,
    deliver_at: null,
    sent_at: null,
    twilio_sids: [],
    error: null,
    claim_token: null,
    ...extra,
  };
}

export function defaultStaffAlertDeps(): StaffAlertDeps {
  return {
    now: () => new Date(),
    env: process.env,
    store: createSupabaseStaffAlertStore(getSupabaseServiceClient()),
    send: send805TwilioSms,
  };
}

export async function handleStaffAlert(request: NextRequest, deps: StaffAlertDeps = defaultStaffAlertDeps()) {
  const expected = deps.env.STAFF_ALERT_BOT_TOKEN?.trim() || "";
  if (!expected) return jsonError(503, "Staff alert token is not configured.");
  const provided = bearerToken(request.headers.get("authorization"));
  if (!provided || !secretsMatch(provided, expected)) return jsonError(401, "Unauthorized");

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, "A JSON object is required.");
  }
  const parsed = parseStaffAlertBody(payload);
  if (!parsed.ok) return jsonError(400, parsed.error);
  const input = parsed.value;
  if (!deps.store) return jsonError(503, "Staff alert log is unavailable.");

  const dedupeKey = staffAlertDedupeKey(input);
  if (isSaleOrSigningEvent(input.event_type)) {
    console.warn("[staff-alert] rejected", { event_type: input.event_type, job_number: input.job_number });
    try {
      const row = await remember(deps.store, blankOutcome(input, dedupeKey, "rejected", {
        error: "Sale and contract-signing events are not texted.",
      }));
      return jsonError(422, "Sale and contract-signing events are not texted.", { status: "rejected", id: row.id });
    } catch (error) {
      return jsonError(503, error instanceof Error ? error.message : "Staff alert log is unavailable.");
    }
  }

  const since = new Date(deps.now().getTime() - DEDUPE_WINDOW_MS).toISOString();
  let recent: StaffAlertRecord | null;
  try {
    recent = await deps.store.findRecent(dedupeKey, since);
  } catch (error) {
    console.warn("[staff-alert] dedupe lookup failed", error instanceof Error ? error.name : "Error");
    return jsonError(503, "Staff alert log is unavailable.");
  }
  if (recent) {
    try {
      const row = await remember(deps.store, blankOutcome(input, dedupeKey, "deduped"));
      return NextResponse.json({ status: "deduped", id: row.id });
    } catch (error) {
      return jsonError(503, error instanceof Error ? error.message : "Staff alert log is unavailable.");
    }
  }

  const now = deps.now();
  if (isPacificQuietHours(now)) {
    const deliverAt = nextPacificSevenAm(now).toISOString();
    try {
      const row = await remember(deps.store, blankOutcome(input, dedupeKey, "held", { deliver_at: deliverAt }));
      return NextResponse.json({ status: "held", id: row.id, deliver_at: row.deliver_at });
    } catch (error) {
      return jsonError(503, error instanceof Error ? error.message : "Staff alert log is unavailable.");
    }
  }

  const config = read805StaffAlertTwilio(deps.env);
  const recipients = staffAlertRecipients(deps.env);
  if (!config.ok || !recipients.ok) {
    const reason = config.ok === false ? config.reason : recipients.ok === false ? recipients.reason : "Staff alert is not configured.";
    try {
      const row = await remember(deps.store, blankOutcome(input, dedupeKey, "failed", { error: reason }));
      return jsonError(503, reason, { status: "failed", id: row.id });
    } catch (error) {
      return jsonError(503, error instanceof Error ? error.message : "Staff alert log is unavailable.");
    }
  }

  const body = staffAlertText(input);
  const sids: string[] = [];
  const errors: string[] = [];
  for (const to of recipients.phones) {
    const result = await deps.send({ to, body, env: deps.env });
    if (result.ok) sids.push(result.sid);
    else errors.push(result.error);
  }
  if (errors.length > 0 || sids.length !== recipients.phones.length) {
    const error = errors[0] || "Twilio did not accept the staff alert.";
    console.warn("[staff-alert] send failed", { job_number: input.job_number, error });
    try {
      const row = await remember(deps.store, blankOutcome(input, dedupeKey, "failed", { error, twilio_sids: sids }));
      return jsonError(502, error, { status: "failed", id: row.id });
    } catch (logError) {
      return jsonError(503, logError instanceof Error ? logError.message : "Staff alert log is unavailable.");
    }
  }

  try {
    const row = await remember(deps.store, blankOutcome(input, dedupeKey, "sent", {
      sent_at: deps.now().toISOString(),
      twilio_sids: sids,
    }));
    return NextResponse.json({ status: "sent", id: row.id, sids: row.twilio_sids });
  } catch (error) {
    return jsonError(503, error instanceof Error ? error.message : "Staff alert log is unavailable.");
  }
}

export async function deliverHeldStaffAlerts(deps: StaffAlertDeps = defaultStaffAlertDeps()) {
  if (!deps.store) return jsonError(503, "Staff alert log is unavailable.");
  const config = read805StaffAlertTwilio(deps.env);
  const recipients = staffAlertRecipients(deps.env);
  if (config.ok === false) return jsonError(503, config.reason);
  if (recipients.ok === false) return jsonError(503, recipients.reason);
  let claimed: StaffAlertRecord[];
  try {
    claimed = await deps.store.claimDue(25);
  } catch (error) {
    console.warn("[staff-alert] claim failed", error instanceof Error ? error.name : "Error");
    return jsonError(503, "Staff alert log is unavailable.");
  }

  let delivered = 0;
  let failed = 0;
  for (const row of claimed) {
    if (!row.claim_token) continue;
    const body = staffAlertText(row);
    const sids: string[] = [];
    const errors: string[] = [];
    for (const to of recipients.phones) {
      const result = await deps.send({ to, body, env: deps.env });
      if (result.ok) sids.push(result.sid);
      else errors.push(result.error);
    }
    try {
      if (errors.length === 0 && sids.length === recipients.phones.length) {
        const saved = await deps.store.finish(row.id, row.claim_token, {
          status: "sent",
          sent_at: deps.now().toISOString(),
          twilio_sids: sids,
          error: null,
        });
        if (saved) delivered += 1;
      } else {
        await deps.store.finish(row.id, row.claim_token, {
          status: "failed",
          sent_at: null,
          twilio_sids: sids,
          error: errors[0] || "Twilio did not accept the staff alert.",
        });
        failed += 1;
      }
    } catch (error) {
      console.warn("[staff-alert] claim finish failed", error instanceof Error ? error.name : "Error");
      failed += 1;
    }
  }
  return NextResponse.json({ status: "ok", delivered, failed });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function recordFromRow(value: unknown): StaffAlertRecord | null {
  const row = asRecord(value);
  if (!row || typeof row.id !== "string" || typeof row.status !== "string" || typeof row.created_at !== "string") return null;
  return {
    id: row.id,
    status: row.status as StaffAlertStatus,
    customer: String(row.customer ?? ""),
    job_number: String(row.job_number ?? ""),
    missing: Array.isArray(row.missing) ? row.missing.map(String) : [],
    from_bot: String(row.from_bot ?? ""),
    event_type: String(row.event_type ?? ""),
    dedupe_key: String(row.dedupe_key ?? ""),
    deliver_at: row.deliver_at ? String(row.deliver_at) : null,
    sent_at: row.sent_at ? String(row.sent_at) : null,
    twilio_sids: Array.isArray(row.twilio_sids) ? row.twilio_sids.map(String) : [],
    error: row.error ? String(row.error) : null,
    claim_token: row.claim_token ? String(row.claim_token) : null,
    created_at: row.created_at,
  };
}

export function createSupabaseStaffAlertStore(client: SupabaseClient | null): StaffAlertStore | null {
  if (!client) return null;
  return {
    async findRecent(dedupeKey, sinceIso) {
      const { data, error } = await client
        .from("crm_staff_alerts")
        .select("*")
        .eq("dedupe_key", dedupeKey)
        .gte("created_at", sinceIso)
        .in("status", [...DEDUPE_STATUSES])
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      const rows = Array.isArray(data) ? data : [];
      return recordFromRow(rows[0]) ;
    },
    async insert(row) {
      const { data, error } = await client.from("crm_staff_alerts").insert(row).select("*").single();
      if (error || !data) throw new Error(error?.message || "Staff alert log is unavailable.");
      const saved = recordFromRow(data);
      if (!saved) throw new Error("Staff alert log is unavailable.");
      return saved;
    },
    async claimDue(limit) {
      const { data, error } = await client.rpc("claim_due_crm_staff_alerts", { p_limit: limit });
      if (error) throw new Error(error.message);
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      return rows.map(recordFromRow).filter((row): row is StaffAlertRecord => Boolean(row));
    },
    async finish(id, claimToken, patch) {
      const { data, error } = await client
        .from("crm_staff_alerts")
        .update(patch)
        .eq("id", id)
        .eq("claim_token", claimToken)
        .eq("status", "held")
        .select("id");
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length > 0;
    },
  };
}
