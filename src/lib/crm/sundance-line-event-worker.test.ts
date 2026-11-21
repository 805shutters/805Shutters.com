import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LINE_EVENT_SCHEMA_ID } from "@/lib/crm/line-event-queue";
import {
  handleSundanceLineEventWake,
  SUNDANCE_LINE_EVENT_CLAIMED_BY,
  SUNDANCE_LINE_EVENT_FLAG_ENV,
  SUNDANCE_LINE_EVENT_SECRET_ENV,
} from "@/lib/crm/sundance-line-event-worker";

const secret = "test-only-not-a-secret";
const key = "50000000-0000-4000-8000-000000000001:1";
const fieldFile = "data/order-entry/805-sundance-order-fields.json";
const fieldSha = "e42412f4efecf94cd03f6fe2e254ebf64e62798b7521b369892d4e3f21211656";

function request(body: unknown, authorization = `Bearer ${secret}`) {
  return new Request("https://www.805shutters.com/api/crm/sundance-line-event-worker", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  delete process.env[SUNDANCE_LINE_EVENT_SECRET_ENV];
  delete process.env[SUNDANCE_LINE_EVENT_FLAG_ENV];
  vi.restoreAllMocks();
});

describe("sundance line-event worker route", () => {
  it("fails closed when the secret is unset and does not claim", async () => {
    const rpc = vi.fn();
    const response = await handleSundanceLineEventWake(request({ manufacturer: "sundance", idempotency_key: key }), { rpc });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ woken: false, reason: "wake_unconfigured", schema: LINE_EVENT_SCHEMA_ID });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns wake_disabled when the enable flag is off", async () => {
    process.env[SUNDANCE_LINE_EVENT_SECRET_ENV] = secret;
    const rpc = vi.fn();
    const response = await handleSundanceLineEventWake(
      request({ manufacturer: "sundance", idempotency_key: key }),
      { rpc },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ woken: false, reason: "wake_disabled" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records one sundance event and leaves every other manufacturer untouched", async () => {
    process.env[SUNDANCE_LINE_EVENT_SECRET_ENV] = secret;
    process.env[SUNDANCE_LINE_EVENT_FLAG_ENV] = "true";
    const rpc = vi.fn(async () => ({ data: { outcome: "priced", state: "priced", blocked: false }, error: null }));
    const priced = await handleSundanceLineEventWake(
      request({ manufacturer: "sundance", idempotency_key: key, event_id: "50000000-0000-4000-8000-000000000099" }),
      { rpc },
    );
    expect(priced.status).toBe(200);
    expect(await priced.json()).toMatchObject({ woken: true, result: { outcome: "priced", blocked: false } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("consume_sundance_line_event", {
      p_idempotency_key: key,
      p_claimed_by: SUNDANCE_LINE_EVENT_CLAIMED_BY,
    });

    const norman = await handleSundanceLineEventWake(
      request({ manufacturer: "norman", idempotency_key: "50000000-0000-4000-8000-000000000002:1" }),
      { rpc },
    );
    expect(await norman.json()).toMatchObject({ woken: false, reason: "not_sundance", ignored: true });
    expect(rpc).toHaveBeenCalledTimes(1);

    const batch = await handleSundanceLineEventWake(
      request({ manufacturer: "sundance", idempotency_key: key, events: [key, key] }),
      { rpc },
    );
    expect(batch.status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing or wrong secret", async () => {
    process.env[SUNDANCE_LINE_EVENT_SECRET_ENV] = secret;
    process.env[SUNDANCE_LINE_EVENT_FLAG_ENV] = "true";
    const rpc = vi.fn();
    const missing = await handleSundanceLineEventWake(
      request({ manufacturer: "sundance", idempotency_key: key }, ""),
      { rpc },
    );
    expect(missing.status).toBe(401);
    const wrong = await handleSundanceLineEventWake(
      request({ manufacturer: "sundance", idempotency_key: key }, "Bearer other-value"),
      { rpc },
    );
    expect(wrong.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the Sundance order-fields file and does not seed or message", () => {
    const file = readFileSync(fieldFile);
    expect(createHash("sha256").update(file).digest("hex")).toBe(fieldSha);
    const parsed = JSON.parse(file.toString("utf8")) as {
      products: { category: string; fields: { key: string; required: string }[] }[];
    };
    const sheerview = parsed.products.find((product) => product.category === "sundance_sheerview");
    expect(sheerview?.fields.some((field) => field.key === "room_name" && field.required === "always")).toBe(true);

    const sources = [
      "src/lib/crm/sundance-line-event-worker.ts",
      "src/app/api/crm/sundance-line-event-worker/route.ts",
      "supabase/migrations/20261122041000_sundance_line_event_consumer.sql",
    ].map((path) => readFileSync(path, "utf8"));
    const migration = sources[2].replace(/\$sundance_fields\$[\s\S]*\$sundance_fields\$/, "");
    const executable = migration.replace(/--.*$/gm, "");
    expect(executable).not.toMatch(/\bdrop\b/i);
    expect(executable).not.toMatch(/\btruncate\b/i);
    expect(executable).not.toMatch(/\bdelete\s+from\b/i);
    expect(executable).not.toContain("crm_live_lookup_switch");
    expect(executable).not.toContain("ST0142");
    expect(executable).not.toMatch(/insert\s+into\s+public\.crm_vendor_accounts/i);
    expect(executable).not.toMatch(/insert\s+into\s+public\.quote_category_field_sequence/i);
    expect(executable).not.toContain("installer_notes");
    expect(executable).not.toContain("__internal805");
    expect(executable).not.toMatch(/grant\s+(all|insert|update|delete)\s+on/i);
    expect(migration).toContain("manufacturer_bot_sundance nologin");
    expect(migration).toContain("price_basis_unconfirmed");
    expect(migration).toContain("no_vendor_account");
    expect(migration).toContain("quote_category_field_sequence");
    expect([sources[0], sources[1], migration].join("\n")).not.toMatch(/twilio|sendgrid|telegram|nodemailer|square|quickbooks|resend/i);
    expect(sources[1]).not.toMatch(/\.(from|insert|update)\(/);
    expect(sources[1]).toContain("supabase.rpc(fn, args)");
  });
});
