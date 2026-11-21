import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { quoteLineSpecHash } from "@/lib/crm/price-record";
import {
  UNPRICED_PENDING_NORMAN_LIVE_LOOKUP_NOTE,
  liveLookupStoredSpecIsCurrent,
  portalDraftIdFromReceipt,
  quoteLivePriceMayUpdateQuote,
  quoteStatusAfterSuccessfulLivePrice,
  staleQuoteStatusBackfillApplies,
} from "@/lib/quote/live-lookup-current";

const migration = readFileSync("supabase/migrations/20261122004500_current_live_price_readers.sql", "utf8");
const lineHash = quoteLineSpecHash({
  productType: "Roller Shades",
  widthWhole: 36,
  widthFraction: "0",
  heightWhole: 48,
  heightFraction: "0",
  options: { lift_system: "Cordless" },
});

describe("current line spec hash", () => {
  it("accepts only price_record_line_spec_hash and ignores an old revision hash", () => {
    const oldRevisionHash = "5d41402abc4b2a76b9719d911017c592";
    expect(oldRevisionHash).toHaveLength(32);
    expect(lineHash).toHaveLength(64);
    expect(liveLookupStoredSpecIsCurrent(oldRevisionHash, lineHash)).toBe(false);
    expect(liveLookupStoredSpecIsCurrent(lineHash, lineHash)).toBe(true);
    expect(liveLookupStoredSpecIsCurrent(null, lineHash)).toBe(false);
    expect(migration).toContain("price_record_line_spec_hash");
    expect(migration).not.toMatch(/live_lookup_spec_hash\s*\(/);
  });
});

describe("portal draft id", () => {
  it("reads the receipt JSON key portal_draft_id and ignores a blank value", () => {
    expect(portalDraftIdFromReceipt({ portal_draft_id: " Roller Shades session 107 " })).toBe("Roller Shades session 107");
    expect(portalDraftIdFromReceipt({ portal_draft_id: "   " })).toBeNull();
    expect(portalDraftIdFromReceipt({ evidence: "session 107" })).toBeNull();
    expect(portalDraftIdFromReceipt(null)).toBeNull();
    expect(migration).toContain("p_receipt->>'portal_draft_id'");
  });
});

describe("quote status after a live price", () => {
  it("prices a quote whose lines are all current and blocks a quote that still has an open line", () => {
    expect(quoteStatusAfterSuccessfulLivePrice({ backend: true, lineCount: 1, linesWithCurrentPrice: 1 })).toBe("priced");
    expect(quoteStatusAfterSuccessfulLivePrice({ backend: true, lineCount: 2, linesWithCurrentPrice: 1 })).toBe("blocked");
    expect(quoteStatusAfterSuccessfulLivePrice({ backend: false, lineCount: 1, linesWithCurrentPrice: 1 })).toBeNull();
  });

  it("backfills only a stale draft whose every line has a current live price", () => {
    const ready = { quoteV2Status: "stale", quoteStatus: "draft", backend: true, lineCount: 1, linesWithCurrentLivePrice: 1 };
    expect(staleQuoteStatusBackfillApplies(ready)).toBe(true);
    expect(staleQuoteStatusBackfillApplies({ ...ready, quoteV2Status: "priced" })).toBe(false);
    expect(staleQuoteStatusBackfillApplies({ ...ready, quoteStatus: "sent" })).toBe(false);
    expect(staleQuoteStatusBackfillApplies({ ...ready, linesWithCurrentLivePrice: 0 })).toBe(false);
    expect(staleQuoteStatusBackfillApplies({ ...ready, lineCount: 2, linesWithCurrentLivePrice: 1 })).toBe(false);
    expect(migration).toContain("q.quote_v2_status = 'stale'");
    expect(migration).toContain("q.status = 'draft'");
    expect(migration).toContain("is distinct from 'live_site'");
  });
});

describe("quote row guard", () => {
  it("updates only an open draft and leaves sent and archived quotes alone", () => {
    expect(quoteLivePriceMayUpdateQuote("draft", "stale")).toBe(true);
    expect(quoteLivePriceMayUpdateQuote("draft", "priced")).toBe(true);
    expect(quoteLivePriceMayUpdateQuote("sent", "sent")).toBe(false);
    expect(quoteLivePriceMayUpdateQuote("archived", "priced")).toBe(false);
    expect(quoteLivePriceMayUpdateQuote("draft", "sent")).toBe(false);
    expect(migration).toContain("quote_not_draft");
    expect(migration).toContain("quote_v2_status in ('draft', 'stale', 'priced', 'blocked')");
    expect(migration).not.toContain("set notes = null");
    expect(migration).not.toContain("design.notes =");
  });
});

describe("current live price migration", () => {
  it("is additive and names the expected 0592 A and 0593 A rows", () => {
    expect(migration).not.toMatch(/\bdrop\s+(table|column|function)\b/i);
    expect(migration).not.toMatch(/\btruncate\s+(?:table|only)\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
    expect(migration).toContain("805-0592 A");
    expect(migration).toContain("805-0593 A");
    expect(migration).toContain("portal_draft_id is null");
    expect(migration).toContain("no_vendor_account");
    expect(migration).toContain("admin[.]onyxshutters");
    expect(migration).toContain("sundance[.]blindata");
    expect(migration).toContain("price_record_line_spec_hash");
    expect(migration).not.toMatch(/enabled\s*=\s*true/i);
  });
});
