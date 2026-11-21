import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOTUS_VENDOR_ACCOUNT,
  NORMAN_PRICE_BOT,
  NORMAN_VENDOR_ACCOUNT,
  ONYX_PRICE_SITE,
  PRICE_RECORD_SCHEMA,
  SUNDANCE_PRICE_SITE,
  acceptLotusPriceRecord,
  acceptOnyxPriceRecord,
  acceptSundancePriceRecord,
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

const lineId = "20000000-0000-4000-8000-000000000701";

describe("Onyx and Sundance price records", () => {
  it("validates the portal, the bot, and an unconfirmed price basis", () => {
    expect(acceptOnyxPriceRecord({
      lineId,
      product: "Painted Basswood",
      widthInches: 36,
      heightInches: 48,
      options: { "Frame Type": "L Frame", color: "100_Pure White" },
      dealerNetBasePrice: 210,
      capturedAt: "2026-11-21T17:00:00Z",
      sourceUrl: "https://example.com/price",
    })).toEqual({ ok: false, reason: "invalid_record" });
    expect(acceptSundancePriceRecord({
      lineId,
      product: "Sheerview",
      widthInches: 24,
      heightInches: 36,
      dealerNetBasePrice: 180,
      capturedAt: "2026-11-21T17:00:00Z",
      sourceUrl: SUNDANCE_PRICE_SITE,
      capturedBy: "norman",
    })).toEqual({ ok: false, reason: "invalid_record" });
    expect(acceptOnyxPriceRecord({
      lineId,
      product: "painted_basswood",
      widthInches: 36,
      heightInches: 48,
      observedPrice: { label: "Grand Total", amount: 840 },
      capturedAt: "2026-11-21T17:00:00Z",
      sourceUrl: ONYX_PRICE_SITE,
    })).toMatchObject({ ok: false, reason: "price_basis_unconfirmed" });
    expect(acceptSundancePriceRecord({
      lineId,
      product: "sundance_sheerview",
      widthInches: 24,
      heightInches: 36,
      options: { suggested_retail: 552 },
      capturedAt: "2026-11-21T17:00:00Z",
      evidence: "portal total was not labeled dealer net",
    })).toMatchObject({ ok: false, reason: "price_basis_unconfirmed" });
  });

  it("fails closed with no_vendor_account and does not invent an account", () => {
    const onyx = acceptOnyxPriceRecord({
      lineId,
      product: "Painted Basswood",
      widthInches: 36.04,
      heightInches: 48,
      options: { "Frame Type": "L Frame", louver: " 2.5 " },
      dealerNetBasePrice: 210.5,
      capturedAt: "2026-11-21T17:00:00Z",
      sourceUrl: ONYX_PRICE_SITE,
    });
    const sundance = acceptSundancePriceRecord({
      lineId,
      product: "Sheer View",
      widthInches: 24,
      heightInches: 36,
      options: { "Motor Type": "GLYDEA" },
      dealerNetBasePrice: 180,
      capturedAt: "2026-11-21T17:00:00Z",
      sourceUrl: `${SUNDANCE_PRICE_SITE}/quote`,
    });
    expect(onyx).toMatchObject({ ok: false, reason: "no_vendor_account" });
    expect(sundance).toMatchObject({ ok: false, reason: "no_vendor_account" });
    expect(onyx).not.toHaveProperty("record");
    expect(sundance).not.toHaveProperty("record");
    expect(JSON.stringify(onyx)).not.toMatch(/password|secret|token|RA00743/i);
    expect(JSON.stringify(sundance)).not.toMatch(/password|secret|token|RA00743/i);
    if (!onyx.ok) expect(onyx.spec_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps spec_hash parity with Norman", () => {
    const canonical = specHash({
      manufacturer: "onyx",
      product: "painted_basswood",
      widthInches: 36,
      heightInches: 48,
      options: { frame_type: "L Frame", louver: "2.5" },
    });
    expect(specHash({
      manufacturer: " Onyx ",
      product: " Painted Basswood ",
      widthInches: 36.04,
      heightInches: 48,
      options: { louver: " 2.5 ", "Frame Type": "L Frame", grand_total: 999 },
    })).toBe(canonical);
    expect(canonical).toMatch(/^[0-9a-f]{64}$/);
    expect(specHash({ manufacturer: "onyx", product: "Sycamore", widthInches: 36, heightInches: 48, options: {} }))
      .toBe(specHash({ manufacturer: "onyx", product: "secamore", widthInches: 36, heightInches: 48, options: {} }));
    expect(specHash({
      manufacturer: "sundance",
      product: "Sheerview",
      widthInches: 24,
      heightInches: 36,
      options: { "Motor Type": "GLYDEA" },
    })).toBe(specHash({
      manufacturer: "sundance",
      product: "sundance_sheerview",
      widthInches: 24,
      heightInches: 36,
      options: { motor_type: "GLYDEA" },
    }));
    expect(specHash({ manufacturer: "norman", product: "roller", widthInches: 36, heightInches: 48, options: { "Frame Type": "L" } }))
      .not.toBe(specHash({ manufacturer: "norman", product: "roller", widthInches: 36, heightInches: 48, options: { frame_type: "L" } }));
    expect(specHash({ manufacturer: "onyx", product: "roller", widthInches: 36, heightInches: 48, options: {} }))
      .not.toBe(specHash({ manufacturer: "norman", product: "roller", widthInches: 36, heightInches: 48, options: {} }));
    const sixteenth = specHash({
      manufacturer: "onyx",
      product: "ash",
      widthInches: null,
      heightInches: 48,
      options: { width_a: { whole: 36, fraction: "1/16" } },
    });
    expect(sixteenth).toBe(specHash({ manufacturer: "onyx", product: "ash", widthInches: 36.125, heightInches: 48, options: {} }));
    expect(sixteenth).not.toBe(specHash({ manufacturer: "onyx", product: "ash", widthInches: 36, heightInches: 48, options: {} }));
  });
});

describe("Onyx and Sundance price-record migration", () => {
  const sql = readFileSync("supabase/migrations/20261121234500_onyx_sundance_price_records.sql", "utf8");

  it("is additive, seeds no account, and does not turn a switch on", () => {
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\btruncate\s+(?:table|only)\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/enabled\s*=\s*true/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.crm_vendor_accounts/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.crm_live_lookup_switch/i);
    expect(sql).toContain("no_vendor_account");
    expect(sql).toContain("spec_changed");
    expect(sql).not.toMatch(/password|api_key|client_secret/i);
  });
});

describe("Lotus price record", () => {
  it("keeps an unconfirmed cost unconfirmed and does not invent an account", () => {
    expect(LOTUS_VENDOR_ACCOUNT).toBeNull();
    const unconfirmed = acceptLotusPriceRecord({
      lineId,
      product: "Lotus Roller",
      widthInches: 30,
      heightInches: 48,
      observedPrice: { label: "Grand Total", amount: 640 },
      capturedAt: "2026-11-21T17:00:00Z",
      evidence: "emailed confirmation total",
    });
    expect(unconfirmed).toMatchObject({ ok: false, reason: "price_basis_unconfirmed" });
    expect(unconfirmed).not.toHaveProperty("record");
    const closed = acceptLotusPriceRecord({
      lineId,
      product: "Lotus Vertical",
      widthInches: 36,
      heightInches: 72,
      dealerNetBasePrice: 88,
      capturedAt: "2026-11-21T17:00:00Z",
      evidence: "emailed confirmation dealer net",
    });
    expect(closed).toMatchObject({ ok: false, reason: "no_vendor_account" });
    expect(closed).not.toHaveProperty("record");
    expect(JSON.stringify(closed)).not.toMatch(/password|secret|token|RA00743/i);
    if (!closed.ok) expect(closed.spec_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(acceptOnyxPriceRecord({
      lineId,
      product: "Painted Basswood",
      widthInches: 36,
      heightInches: 48,
      observedPrice: { label: "Grand Total", amount: 840 },
      capturedAt: "2026-11-21T17:00:00Z",
      sourceUrl: ONYX_PRICE_SITE,
    })).toMatchObject({ ok: false, reason: "price_basis_unconfirmed" });
    expect(acceptSundancePriceRecord({
      lineId,
      product: "Sheer View",
      widthInches: 24,
      heightInches: 36,
      dealerNetBasePrice: 180,
      capturedAt: "2026-11-21T17:00:00Z",
      sourceUrl: SUNDANCE_PRICE_SITE,
    })).toMatchObject({ ok: false, reason: "no_vendor_account" });
  });
});
