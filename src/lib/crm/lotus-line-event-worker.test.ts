import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LINE_EVENT_SCHEMA_ID } from "@/lib/crm/line-event-queue";
import {
  handleLotusLineEventWake,
  LOTUS_LINE_EVENT_CLAIMED_BY,
  LOTUS_LINE_EVENT_FLAG_ENV,
  LOTUS_LINE_EVENT_SECRET_ENV,
} from "@/lib/crm/lotus-line-event-worker";

const secret = "test-only-not-a-secret";
const key = "50000000-0000-4000-8000-000000000011:1";

function request(body: unknown, authorization = `Bearer ${secret}`) {
  return new Request("https://www.805shutters.com/api/crm/lotus-line-event-worker", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  delete process.env[LOTUS_LINE_EVENT_SECRET_ENV];
  delete process.env[LOTUS_LINE_EVENT_FLAG_ENV];
  vi.restoreAllMocks();
});

describe("lotus line-event worker route", () => {
  it("fails closed when the secret is unset and does not claim", async () => {
    const rpc = vi.fn();
    const response = await handleLotusLineEventWake(request({ manufacturer: "lotus", idempotency_key: key }), { rpc });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ woken: false, reason: "wake_unconfigured", schema: LINE_EVENT_SCHEMA_ID });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns wake_disabled when the enable flag is off", async () => {
    process.env[LOTUS_LINE_EVENT_SECRET_ENV] = secret;
    const rpc = vi.fn();
    const response = await handleLotusLineEventWake(
      request({ manufacturer: "lotus", idempotency_key: key }),
      { rpc },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ woken: false, reason: "wake_disabled" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records one lotus event and leaves every other manufacturer untouched", async () => {
    process.env[LOTUS_LINE_EVENT_SECRET_ENV] = secret;
    process.env[LOTUS_LINE_EVENT_FLAG_ENV] = "true";
    const rpc = vi.fn(async () => ({ data: { outcome: "priced", state: "priced", blocked: false }, error: null }));
    const recorded = await handleLotusLineEventWake(
      request({ manufacturer: "lotus", idempotency_key: key, event_id: "50000000-0000-4000-8000-000000000099" }),
      { rpc },
    );
    expect(recorded.status).toBe(200);
    expect(await recorded.json()).toMatchObject({ woken: true, result: { outcome: "priced", blocked: false } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("consume_lotus_line_event", {
      p_idempotency_key: key,
      p_claimed_by: LOTUS_LINE_EVENT_CLAIMED_BY,
    });

    const norman = await handleLotusLineEventWake(
      request({ manufacturer: "norman", idempotency_key: "50000000-0000-4000-8000-000000000002:1" }),
      { rpc },
    );
    expect(await norman.json()).toMatchObject({ woken: false, reason: "not_lotus", ignored: true });
    expect(rpc).toHaveBeenCalledTimes(1);

    const batch = await handleLotusLineEventWake(
      request({ manufacturer: "lotus", idempotency_key: key, events: [key, key] }),
      { rpc },
    );
    expect(batch.status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing or wrong secret", async () => {
    process.env[LOTUS_LINE_EVENT_SECRET_ENV] = secret;
    process.env[LOTUS_LINE_EVENT_FLAG_ENV] = "true";
    const rpc = vi.fn();
    const missing = await handleLotusLineEventWake(
      request({ manufacturer: "lotus", idempotency_key: key }, ""),
      { rpc },
    );
    expect(missing.status).toBe(401);
    const wrong = await handleLotusLineEventWake(
      request({ manufacturer: "lotus", idempotency_key: key }, "Bearer other-value"),
      { rpc },
    );
    expect(wrong.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not send mail, text, or place an order", () => {
    const sources = [
      "src/lib/crm/lotus-line-event-worker.ts",
      "src/app/api/crm/lotus-line-event-worker/route.ts",
      "supabase/migrations/20261122042000_lotus_order_worker.sql",
    ].map((path) => readFileSync(path, "utf8"));
    const joined = sources.join("\n");
    expect(joined).not.toMatch(/twilio|sendgrid|telegram|nodemailer|resend/i);
    expect(sources[1]).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.delete\(/);
    const executable = sources[2].replace(/--.*$/gm, "");
    expect(executable).not.toMatch(/installer_notes|__internal805|set role service_role/i);
    expect(sources[0] + sources[1]).not.toMatch(/installer_notes|__internal805|set role service_role/i);
    expect(executable).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bdrop\s+table\b/i);
    expect(executable).not.toMatch(/insert\s+into\s+public\.crm_vendor_accounts/i);
    expect(executable).not.toContain("crm_live_lookup_switch");
    expect(sources[2]).toContain("manufacturer_bot_lotus nologin");
    expect(sources[2]).toContain("wake_disabled");
    expect(sources[2]).toContain("confirmation_ref");
    const routeCode = sources[0].replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(routeCode).not.toMatch(/\bfetch\(|net\.http_post|smtp|mailto:/i);
    expect(routeCode).toContain("consume_lotus_line_event");
  });
});
