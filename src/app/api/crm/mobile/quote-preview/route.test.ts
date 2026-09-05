import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), prepare: vi.fn() }));
vi.mock("@/lib/crm/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crm/auth")>()),
  requireCrmUser: mocks.auth,
}));
vi.mock("@/lib/crm/sales-quote-v2-price-save", () => ({
  quoteV2ServerCatalogDate: () => "2026-09-05",
  prepareSalesQuoteV2PricingBatch: mocks.prepare,
}));

import { POST } from "./route";

const LINE_ID = "11111111-1111-4111-8111-111111111111";
const DESIGN_ID = "22222222-2222-4222-8222-222222222222";

function line() {
  return {
    id: LINE_ID,
    room_name: "Test Room",
    product_type: "Roller Shades",
    width_whole: 36,
    width_fraction: "0",
    height_whole: 48,
    height_fraction: "0",
    quantity: 1,
    sort_order: 0,
  };
}

function design() {
  return {
    id: DESIGN_ID,
    line_item_id: LINE_ID,
    variant: "A",
    product_type: "Roller Shades",
    supplier: "Norman",
    material: null,
    louver_size: null,
    tilt_type: null,
    hinge_color: null,
    panel_config: null,
    mount_type: "Inside",
    shade_type: null,
    lift_system: "Cordless",
    valance: null,
    fabric: null,
    motor_type: null,
    remote_type: null,
    hard_surface_install: false,
    ladder_over_15ft: false,
    requires_takedown: false,
    notes: null,
    options_json: { catalog_product_id: "norman_roller" },
  };
}

function request(body: unknown) {
  return new NextRequest("http://localhost/api/crm/mobile/quote-preview", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test" },
    body: JSON.stringify(body),
  });
}

describe("stateless mobile Quote V2 preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ supabase: { from: vi.fn() }, user: { id: "actor" } });
    mocks.prepare.mockReturnValue({
      repriced: { total: 420 },
      prepared: [{
        lineItemId: LINE_ID,
        priceStatus: "authoritative",
        customerPrice: { ok: true, total: 420 },
      }],
    });
  });

  it("authenticates, invokes the current quote-wide engine without DB mutation, and returns customer pricing", async () => {
    const supabase = { from: vi.fn() };
    mocks.auth.mockResolvedValue({ supabase, user: { id: "actor" } });
    const response = await POST(request({ lines: [{ line: line(), design: design() }] }));
    expect(response.status).toBe(200);
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ serverDate: "2026-09-05" }));
    expect(supabase.from).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      backend: "authoritative_v2",
      status: "authoritative",
      total: 420,
      authoritativeSubtotal: 420,
      lines: [{ lineItemId: LINE_ID, status: "authoritative", price: { total: 420 }, blockedReason: null, requiresManualPricing: false }],
    });
  });

  it("rejects protected and unknown design fields instead of ignoring them", async () => {
    for (const field of ["unit_price", "manufacturer_cost", "quote_v2_selection_fingerprint"]) {
      const response = await POST(request({ lines: [{ line: line(), design: { ...design(), [field]: 1 } }] }));
      expect(response.status).toBe(400);
    }
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("rejects duplicate line identities", async () => {
    const response = await POST(request({
      lines: [
        { line: line(), design: design() },
        { line: line(), design: { ...design(), id: "33333333-3333-4333-8333-333333333333" } },
      ],
    }));
    expect(response.status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it("returns a null quote total and useful safe reason for partial pricing, never a fake authoritative zero", async () => {
    mocks.prepare.mockReturnValue({
      repriced: { total: 0 },
      prepared: [{
        lineItemId: LINE_ID,
        priceStatus: "blocked",
        customerPrice: { ok: false, error: "Pricing is currently unavailable for this selection." },
      }],
    });
    const response = await POST(request({ lines: [{ line: line(), design: design() }] }));
    expect(await response.json()).toMatchObject({
      status: "partial",
      total: null,
      authoritativeSubtotal: 0,
      lines: [{ status: "blocked", blockedReason: "Pricing is currently unavailable for this selection.", requiresManualPricing: false }],
    });
  });
});
