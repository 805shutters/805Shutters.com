import { timingSafeEqual } from "node:crypto";
import { LINE_EVENT_SCHEMA_ID } from "@/lib/crm/line-event-queue";

export const LOTUS_LINE_EVENT_SECRET_ENV = "LOTUS_LINE_EVENT_WORKER_SECRET";
export const LOTUS_LINE_EVENT_FLAG_ENV = "LOTUS_LINE_EVENT_WAKE_ENABLED";
export const LOTUS_LINE_EVENT_CLAIMED_BY = "manufacturer_bot_lotus";

type RpcError = { message: string } | null;

export type LotusLineEventRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError }>;
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function authorized(request: Request, secret: string) {
  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/**
 * One Lotus line event per request. Records a confirmation already in hand
 * through consume_lotus_line_event. Does not send the order form, an email,
 * or an SMS, and does not place a portal order. The secret and the enable
 * flag both come from the environment. Either one missing leaves the wake
 * closed and does not claim a line.
 */
export async function handleLotusLineEventWake(request: Request, db: LotusLineEventRpc | null) {
  const secret = process.env[LOTUS_LINE_EVENT_SECRET_ENV]?.trim() ?? "";
  if (!secret) {
    return json({ woken: false, reason: "wake_unconfigured", schema: LINE_EVENT_SCHEMA_ID }, 503);
  }
  if (!authorized(request, secret)) {
    return json({ woken: false, reason: "unauthorized", schema: LINE_EVENT_SCHEMA_ID }, 401);
  }
  if (process.env[LOTUS_LINE_EVENT_FLAG_ENV] !== "true") {
    return json({ woken: false, reason: "wake_disabled", schema: LINE_EVENT_SCHEMA_ID });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ woken: false, reason: "one_event", schema: LINE_EVENT_SCHEMA_ID }, 400);
  }
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.events) || Array.isArray(record.idempotency_keys) || Array.isArray(record.lines)) {
    return json({ woken: false, reason: "one_event", schema: LINE_EVENT_SCHEMA_ID }, 400);
  }
  const manufacturer = typeof record.manufacturer === "string" ? record.manufacturer.trim().toLowerCase() : "";
  if (manufacturer !== "lotus") {
    return json({
      woken: false,
      reason: "not_lotus",
      ignored: true,
      schema: LINE_EVENT_SCHEMA_ID,
    });
  }
  const idempotencyKey = typeof record.idempotency_key === "string" ? record.idempotency_key.trim() : "";
  if (!idempotencyKey) {
    return json({ woken: false, reason: "idempotency_key", schema: LINE_EVENT_SCHEMA_ID }, 400);
  }
  if (!db) {
    return json({ woken: false, reason: "wake_unconfigured", schema: LINE_EVENT_SCHEMA_ID }, 503);
  }
  const { data, error } = await db.rpc("consume_lotus_line_event", {
    p_idempotency_key: idempotencyKey,
    p_claimed_by: LOTUS_LINE_EVENT_CLAIMED_BY,
  });
  if (error) {
    return json({ woken: false, reason: "consume_failed", schema: LINE_EVENT_SCHEMA_ID }, 500);
  }
  return json({ woken: true, schema: LINE_EVENT_SCHEMA_ID, result: data });
}
