import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LINE_EVENT_SCHEMA_ID } from "@/lib/crm/line-event-queue";
import {
  handleOnyxLineEventWake,
  ONYX_LINE_EVENT_CLAIMED_BY,
  ONYX_LINE_EVENT_FLAG_ENV,
  ONYX_LINE_EVENT_SECRET_ENV,
} from "@/lib/crm/onyx-line-event-worker";

const secret = "test-only-not-a-secret";
const key = "40000000-0000-4000-8000-000000000001:1";

function request(body: unknown, authorization = `Bearer ${secret}`) {
  return new Request("https://www.805shutters.com/api/crm/onyx-line-event-worker", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  delete process.env[ONYX_LINE_EVENT_SECRET_ENV];
  delete process.env[ONYX_LINE_EVENT_FLAG_ENV];
  vi.restoreAllMocks();
});

describe("onyx line-event worker route", () => {
  it("fails closed when the secret is unset and does not claim", async () => {
    const rpc = vi.fn();
    const response = await handleOnyxLineEventWake(request({ manufacturer: "onyx", idempotency_key: key }), { rpc });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ woken: false, reason: "wake_unconfigured", schema: LINE_EVENT_SCHEMA_ID });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns wake_disabled when the enable flag is off", async () => {
    process.env[ONYX_LINE_EVENT_SECRET_ENV] = secret;
    const rpc = vi.fn();
    const response = await handleOnyxLineEventWake(
      request({ manufacturer: "onyx", idempotency_key: key }),
      { rpc },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ woken: false, reason: "wake_disabled" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("consumes one onyx event and leaves every other manufacturer untouched", async () => {
    process.env[ONYX_LINE_EVENT_SECRET_ENV] = secret;
    process.env[ONYX_LINE_EVENT_FLAG_ENV] = "true";
    const rpc = vi.fn(async () => ({ data: { outcome: "priced", state: "priced", blocked: false }, error: null }));
    const priced = await handleOnyxLineEventWake(
      request({ manufacturer: "onyx", idempotency_key: key, event_id: "40000000-0000-4000-8000-000000000099" }),
      { rpc },
    );
    expect(priced.status).toBe(200);
    expect(await priced.json()).toMatchObject({ woken: true, result: { outcome: "priced", blocked: false } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("consume_onyx_line_event", {
      p_idempotency_key: key,
      p_claimed_by: ONYX_LINE_EVENT_CLAIMED_BY,
    });

    const norman = await handleOnyxLineEventWake(
      request({ manufacturer: "norman", idempotency_key: "40000000-0000-4000-8000-000000000002:1" }),
      { rpc },
    );
    expect(await norman.json()).toMatchObject({ woken: false, reason: "not_onyx", ignored: true });
    expect(rpc).toHaveBeenCalledTimes(1);

    const batch = await handleOnyxLineEventWake(
      request({ manufacturer: "onyx", idempotency_key: key, events: [key, key] }),
      { rpc },
    );
    expect(batch.status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing or wrong secret", async () => {
    process.env[ONYX_LINE_EVENT_SECRET_ENV] = secret;
    process.env[ONYX_LINE_EVENT_FLAG_ENV] = "true";
    const rpc = vi.fn();
    const missing = await handleOnyxLineEventWake(
      request({ manufacturer: "onyx", idempotency_key: key }, ""),
      { rpc },
    );
    expect(missing.status).toBe(401);
    const wrong = await handleOnyxLineEventWake(
      request({ manufacturer: "onyx", idempotency_key: key }, "Bearer other-value"),
      { rpc },
    );
    expect(wrong.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not send mail, text, write tables, or use installer notes", () => {
    const sources = [
      "src/lib/crm/onyx-line-event-worker.ts",
      "src/app/api/crm/onyx-line-event-worker/route.ts",
      "supabase/migrations/20261122040000_onyx_line_event_consumer.sql",
    ].map((path) => readFileSync(path, "utf8"));
    const joined = sources.join("\n");
    expect(joined).not.toMatch(/twilio|sendgrid|telegram|nodemailer|square|quickbooks|resend/i);
    expect(sources[0]).not.toMatch(/installer_notes|__internal805/);
    expect(sources[1]).not.toMatch(/installer_notes|__internal805|\.from\(/);
    expect(sources[0] + sources[1]).not.toMatch(/\.from\(\s*["'](?:crm_|line_event|sales_)/);
    expect(sources[1]).toContain("rpc");
    const executable = sources[2].replace(/--.*$/gm, "");
    expect(executable).not.toMatch(/installer_notes|__internal805/);
    expect(executable).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b/i);
    expect(executable).not.toContain("crm_live_lookup_switch");
    expect(executable).not.toMatch(/grant\s+(insert|update|delete|all)\b/i);
    expect(executable).not.toMatch(/1\.1025|10\.25/);
    expect(sources[2]).toContain("manufacturer_bot_onyx nologin");
    expect(sources[2]).toContain("wake_disabled");
    expect(sources[2]).toContain("price_basis_unconfirmed");
    expect(sources[2]).toContain("no_vendor_account");
    expect(sources[2]).not.toContain("CHE01");
  });
});
