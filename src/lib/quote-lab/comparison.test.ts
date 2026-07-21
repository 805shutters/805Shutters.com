import { describe, expect, it } from "vitest";
import { compareQuoteLab, normalizeQuoteLabQuote, QUOTE_LAB_ISOLATION, QuoteLabInputError } from "./comparison";
import { quoteLabFixture, quoteLabFixtures } from "./fixtures";
import { QUOTE_LAB_MAX_LINES } from "./types";

function compareFixture(id: string) {
  const fixture = quoteLabFixture(id);
  if (!fixture) throw new Error(`Missing fixture ${id}`);
  return compareQuoteLab(fixture.quote);
}

describe("Quote Lab isolation", () => {
  it("has no production-capable integrations", () => {
    expect(QUOTE_LAB_ISOLATION).toEqual({
      database: "isolated_sqlite",
      productionWrites: false,
      email: false,
      sms: false,
      payments: false,
      manufacturerOrders: false,
      persistence: "server-test-database",
    });
  });

  it("ships only anonymized test fixtures", () => {
    const serialized = JSON.stringify(quoteLabFixtures).toLowerCase();
    expect(serialized).not.toContain("@805shutters.com");
    expect(serialized).not.toContain("phone");
    expect(serialized).not.toContain("address");
  });
});

describe("Quote Lab comparison", () => {
  it("matches the ordinary Woodlore reference before options", () => {
    const result = compareFixture("woodlore-reference");
    expect(result.sendBlocked).toBe(false);
    expect(result.authoritativeTotal).toBe(result.legacyTotal);
    expect(result.difference).toBe(0);
  });

  it("bills only the selected A/B design in the authoritative total", () => {
    const result = compareFixture("alternative-designs");
    expect(result.sendBlocked).toBe(false);
    expect(result.legacyTotal).toBeGreaterThan(result.authoritativeTotal);
    expect(result.findings.join(" ")).toContain("every A/B/C alternative");
  });

  it("blocks an invalid selected design while exposing legacy stale-price retention", () => {
    const result = compareFixture("invalid-stale-price");
    expect(result.sendBlocked).toBe(true);
    expect(result.authoritativeTotal).toBe(0);
    expect(result.legacyTotal).toBe(500);
    expect(result.lines[0].designs[0].legacy.status).toBe("stale_retained");
    expect(result.lines[0].designs[0].authoritative.ok).toBe(false);
  });

  it("makes a browser-local shutter rate divergence visible", () => {
    const result = compareFixture("browser-rate-drift");
    expect(result.sendBlocked).toBe(false);
    expect(result.authoritativeTotal).toBeGreaterThan(result.legacyTotal);
    expect(result.findings.join(" ")).toContain("browser-local retail-rate override");
  });

  it("shows products supported by the catalog but missing in the active legacy switch", () => {
    const result = compareFixture("smartfold-coverage");
    expect(result.lines[0].designs[0].authoritative.ok).toBe(true);
    expect(result.lines[0].designs[0].legacy.status).toBe("unsupported");
    expect(result.findings.join(" ")).toContain("unsupported by the active legacy switch");
  });

  it("calculates manufacturer freight and oversize exposure separately from retail", () => {
    const result = compareFixture("oversize-order-costs");
    expect(result.orderCharges.map((charge) => charge.id)).toEqual(["freight-shades", "oversize-shades"]);
    expect(result.orderChargeTotal).toBe(166);
    expect(result.authoritativeTotal).toBeGreaterThan(0);
  });

  it("prices a full forty-line quote through the authoritative backend", () => {
    const result = compareFixture("forty-line-quote");
    expect(result.lines).toHaveLength(QUOTE_LAB_MAX_LINES);
    expect(result.sendBlocked).toBe(false);
    expect(result.authoritativeTotal).toBeGreaterThan(0);
  });

  it("uses the builder's real room presets for all forty test lines", () => {
    const fixture = quoteLabFixture("forty-line-quote")!;
    const roomNames = fixture.quote.lines.map((line) => line.room);

    expect(roomNames.slice(0, 4)).toEqual([
      "Living Room",
      "Living Room",
      "Family Room",
      "Family Room",
    ]);
    expect(roomNames.slice(-2)).toEqual(["Closet", "Closet"]);
    expect(new Set(roomNames)).toHaveLength(20);
    expect(roomNames).not.toContain("Room 1");
    expect(roomNames).not.toContain("Room 40");
  });
});

describe("Quote Lab input boundary", () => {
  it("rejects a quote without windows", () => {
    expect(() => normalizeQuoteLabQuote({ id: "q", name: "Test", lines: [] })).toThrow(QuoteLabInputError);
  });

  it("caps user-controlled quantities", () => {
    const fixture = quoteLabFixture("woodlore-reference")!;
    const quote = structuredClone(fixture.quote);
    quote.lines[0].quantity = 100000;
    expect(normalizeQuoteLabQuote(quote).lines[0].quantity).toBe(100);
  });

  it("rejects a forty-first line item instead of silently dropping it", () => {
    const fixture = quoteLabFixture("forty-line-quote")!;
    const quote = structuredClone(fixture.quote);
    quote.lines.push(structuredClone(quote.lines[0]));
    expect(() => normalizeQuoteLabQuote(quote)).toThrow(`no more than ${QUOTE_LAB_MAX_LINES}`);
  });
});
