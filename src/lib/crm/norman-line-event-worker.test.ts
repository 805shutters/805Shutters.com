import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LINE_EVENT_SCHEMA_ID } from "@/lib/crm/line-event-queue";
import {
  handleNormanLineEventWake,
  NORMAN_LINE_EVENT_CLAIMED_BY,
  NORMAN_LINE_EVENT_FLAG_ENV,
  NORMAN_LINE_EVENT_SECRET_ENV,
} from "@/lib/crm/norman-line-event-worker";

const secret = "test-only-not-a-secret";
const key = "40000000-0000-4000-8000-000000000001:1";

function request(body: unknown, authorization = `Bearer ${secret}`) {
  return new Request("https://www.805shutters.com/api/crm/norman-line-event-worker", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  delete process.env[NORMAN_LINE_EVENT_SECRET_ENV];
  delete process.env[NORMAN_LINE_EVENT_FLAG_ENV];
  vi.restoreAllMocks();
});

describe("norman line-event worker route", () => {
  it("fails closed when the secret is unset and does not claim", async () => {
    const rpc = vi.fn();
    const response = await handleNormanLineEventWake(request({ manufacturer: "norman", idempotency_key: key }), { rpc });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ woken: false, reason: "wake_unconfigured", schema: LINE_EVENT_SCHEMA_ID });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns wake_disabled when the enable flag is off", async () => {
    process.env[NORMAN_LINE_EVENT_SECRET_ENV] = secret;
    const rpc = vi.fn();
    const response = await handleNormanLineEventWake(
      request({ manufacturer: "norman", idempotency_key: key }),
      { rpc },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ woken: false, reason: "wake_disabled" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("prices one norman event and leaves every other manufacturer untouched", async () => {
    process.env[NORMAN_LINE_EVENT_SECRET_ENV] = secret;
    process.env[NORMAN_LINE_EVENT_FLAG_ENV] = "true";
    const rpc = vi.fn(async () => ({ data: { outcome: "priced", state: "priced", blocked: false }, error: null }));
    const priced = await handleNormanLineEventWake(
      request({ manufacturer: "norman", idempotency_key: key, event_id: "40000000-0000-4000-8000-000000000099" }),
      { rpc },
    );
    expect(priced.status).toBe(200);
    expect(await priced.json()).toMatchObject({ woken: true, result: { outcome: "priced", blocked: false } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("consume_norman_line_event", {
      p_idempotency_key: key,
      p_claimed_by: NORMAN_LINE_EVENT_CLAIMED_BY,
    });

    const onyx = await handleNormanLineEventWake(
      request({ manufacturer: "onyx", idempotency_key: "40000000-0000-4000-8000-000000000002:1" }),
      { rpc },
    );
    expect(await onyx.json()).toMatchObject({ woken: false, reason: "not_norman", ignored: true });
    expect(rpc).toHaveBeenCalledTimes(1);

    const batch = await handleNormanLineEventWake(
      request({ manufacturer: "norman", idempotency_key: key, events: [key, key] }),
      { rpc },
    );
    expect(batch.status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing or wrong secret", async () => {
    process.env[NORMAN_LINE_EVENT_SECRET_ENV] = secret;
    process.env[NORMAN_LINE_EVENT_FLAG_ENV] = "true";
    const rpc = vi.fn();
    const missing = await handleNormanLineEventWake(
      request({ manufacturer: "norman", idempotency_key: key }, ""),
      { rpc },
    );
    expect(missing.status).toBe(401);
    const wrong = await handleNormanLineEventWake(
      request({ manufacturer: "norman", idempotency_key: key }, "Bearer other-value"),
      { rpc },
    );
    expect(wrong.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not send mail, text, or place an order", () => {
    const sources = [
      "src/lib/crm/norman-line-event-worker.ts",
      "src/app/api/crm/norman-line-event-worker/route.ts",
      "supabase/migrations/20261121235500_norman_line_event_consumer.sql",
    ].map((path) => readFileSync(path, "utf8"));
    const joined = sources.join("\n");
    expect(joined).not.toMatch(/twilio|sendgrid|telegram|nodemailer|square|quickbooks|resend/i);
    const executable = sources[2].replace(/--.*$/gm, "");
    expect(executable).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b/i);
    expect(executable).not.toContain("crm_live_lookup_switch");
    expect(sources[2]).toContain("manufacturer_bot_norman nologin");
    expect(sources[2]).toContain("wake_disabled");
  });
});
