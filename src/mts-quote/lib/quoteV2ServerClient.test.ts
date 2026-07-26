import { describe, expect, it, vi } from "vitest";
import type { QuoteBuilderDatabase } from "@mts/integrations/supabase/quoteBuilderDatabase";
import {
  createQuoteV2Draft,
  customerSafeQuoteV2Options,
  mutateQuoteV2Structure,
  quoteV2DesignPatch,
  quoteV2LinePatch,
  quoteV2QuotePatch,
} from "./quoteV2ServerClient";

function databaseWithToken(token = "crm-token") {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: token } },
        error: null,
      }),
    },
  } as unknown as QuoteBuilderDatabase;
}

describe("Quote V2 authenticated client boundary", () => {
  it("removes price, cost, provenance, and nested snapshot values", () => {
    expect(
      customerSafeQuoteV2Options({
        fabric_color_code: "F1484",
        discount_percent: 10,
        unit_price: 500,
        wholesale_cost: 100,
        authoritative_v2_snapshot: { total: 500 },
        motor: {
          power_configuration: "Plug-in",
          internalCost: 90,
          optionAmount: 75,
        },
        portal_line_price: 450,
        source_id: "portal-fixture",
        guide_version: "2026-07",
        fabric_price_group: "PG1",
        total_panel_width_inches: 88,
      }),
    ).toEqual({
      fabric_color_code: "F1484",
      discount_percent: 10,
      motor: { power_configuration: "Plug-in" },
      fabric_price_group: "PG1",
      total_panel_width_inches: 88,
    });
  });

  it("maps only structural line and design fields to the server contract", () => {
    expect(
      quoteV2LinePatch({
        room_name: "Living Room",
        width_whole: 30,
        width_fraction: "1/2",
        quantity: 2,
      }),
    ).toEqual({
      roomName: "Living Room",
      widthWhole: 30,
      widthFraction: "1/2",
      quantity: 2,
    });

    expect(
      quoteV2DesignPatch({
        product_type: "Roller Shades",
        supplier: "Norman",
        lift_system: "Motorized",
        unit_price: 999,
        options_json: {
          fabric_color_code: "F1484",
          pricing_grid_price: 999,
        },
      }),
    ).toEqual({
      productType: "Roller Shades",
      supplier: "Norman",
      liftSystem: "Motorized",
      optionsJson: { fabric_color_code: "F1484" },
    });

    expect(
      quoteV2QuotePatch({
        customer_name: "Test Customer",
        customer_phone: null,
        total_amount: 500,
      }),
    ).toEqual({
      customerName: "Test Customer",
      customerPhone: null,
    });
  });

  it("authenticates draft creation and never submits account or price fields", async () => {
    const database = databaseWithToken();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          backend: "authoritative_v2",
          quoteId: "11111111-1111-4111-8111-111111111111",
          quoteNumber: "805-0200",
          revision: 1,
          status: "draft",
          quoteV2Status: "draft",
          lineCount: 0,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );

    await createQuoteV2Draft(database, {
      customerName: "Internal Test",
      customerEmail: null,
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(request?.headers).toEqual(
      expect.objectContaining({ Authorization: "Bearer crm-token" }),
    );
    const body = JSON.parse(String(request?.body));
    expect(body).toEqual(
      expect.objectContaining({
        customerName: "Internal Test",
        customerEmail: null,
      }),
    );
    expect(body).not.toHaveProperty("accountId");
    expect(body).not.toHaveProperty("totalAmount");
    fetchMock.mockRestore();
  });

  it("sends structural identities and revision without client money", async () => {
    const database = databaseWithToken();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          backend: "authoritative_v2",
          quoteId: "11111111-1111-4111-8111-111111111111",
          revision: 2,
          status: "draft",
          quoteV2Status: "stale",
          lineCount: 1,
          selectedDesigns: {},
          operations: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await mutateQuoteV2Structure(
      database,
      "11111111-1111-4111-8111-111111111111",
      1,
      [
        {
          type: "line.update",
          lineItemId: "22222222-2222-4222-8222-222222222222",
          patch: { roomName: "Office" },
        },
      ],
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.expectedRevision).toBe(1);
    expect(body.operations).toEqual([
      {
        type: "line.update",
        lineItemId: "22222222-2222-4222-8222-222222222222",
        patch: { roomName: "Office" },
      },
    ]);
    expect(JSON.stringify(body)).not.toMatch(/unitPrice|cost|margin|totalAmount/);
    fetchMock.mockRestore();
  });
});
