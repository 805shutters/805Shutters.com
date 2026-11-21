import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NORMAN_PRICE_BOT,
  NORMAN_VENDOR_ACCOUNT,
  PRICE_RECORD_SCHEMA,
  buildNormanPriceRecord,
  specHash,
} from "./price-record";

const base = {
  manufacturer: "norman",
  product: "roller",
  widthInches: 36,
  heightInches: 48,
  options: { lift: "Cordless", mount: "Inside" },
};

describe("805-price-record/v1 spec_hash", () => {
  it("stays the same across key order and whitespace", () => {
    const spaced = specHash({
      manufacturer: " Norman ",
      product: "\tRoller\n",
      widthInches: 36.04,
      heightInches: 48,
      options: { mount: " Inside ", lift: "Cordless" },
    });
    const ordered = specHash({
      product: "roller",
      manufacturer: "norman",
      heightInches: 48,
      widthInches: 36,
      options: { lift: "Cordless", mount: "Inside" },
    });
    expect(spaced).toBe(ordered);
    expect(spaced).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the size or an option changes", () => {
    const original = specHash(base);
    expect(specHash({ ...base, widthInches: 36.125 })).not.toBe(original);
    expect(specHash({ ...base, heightInches: 48.125 })).not.toBe(original);
    expect(specHash({ ...base, options: { lift: "Motorized", mount: "Inside" } })).not.toBe(original);
    expect(specHash({ ...base, widthInches: 36.06 })).toBe(original);
  });
});

describe("Norman price record", () => {
  it("uses the shared shape and the Norman dealer account", () => {
    const record = buildNormanPriceRecord({
      lineId: "20000000-0000-4000-8000-000000000592",
      specHash: specHash(base),
      dealerNetBasePrice: 115.2,
      capturedAt: "2026-11-21T17:00:00Z",
    });
    expect(record).toMatchObject({
      schema: PRICE_RECORD_SCHEMA,
      vendor: "norman",
      account: NORMAN_VENDOR_ACCOUNT,
      line_id: "20000000-0000-4000-8000-000000000592",
      dealer_net_base_price: "115.20",
      currency: "USD",
      captured_at: "2026-11-21T17:00:00Z",
      captured_by: NORMAN_PRICE_BOT,
      source_url: "https://www.normanwindowcoverings.com/Login/default.asp",
    });
    expect(JSON.stringify(record)).not.toMatch(/password|secret|token|api_key/i);
  });
});

describe("shared price record migration", () => {
  const sql = readFileSync("supabase/migrations/20261121180000_shared_price_record.sql", "utf8");

  it("is additive and does not turn a vendor switch on", () => {
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\btruncate\s+(?:table|only)\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/enabled\s*=\s*true/i);
    expect(sql).not.toMatch(/password|api_key|client_secret/i);
    expect(sql).toContain("805-price-record/v1");
    expect(sql).toContain("spec_changed");
    expect(sql).toContain("RA00743");
  });
});
