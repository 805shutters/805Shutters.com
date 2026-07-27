import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCustomModeBody } from "./sales-quote-v2-custom-mode";

describe("Quote V2 Custom Mode persistence and safety", () => {
  it("strictly allow-lists internal override input", () => {
    expect(() => parseCustomModeBody({
      lineItemId:"11111111-1111-4111-8111-111111111111",
      designId:"22222222-2222-4222-8222-222222222222",
      expectedRevision:1,idempotencyKey:"custom-test-1",manufacturerCost:10,
      freightCost:2,otherCost:1,profitMode:"dollar",profitValue:5,
      customerPayload:{ internalCost: 10 },
    })).toThrow(/rejected fields/i);
  });

  it("supports a server-resolved manufacturer cost with a $125 line margin", () => {
    expect(
      parseCustomModeBody({
        lineItemId: "11111111-1111-4111-8111-111111111111",
        designId: "22222222-2222-4222-8222-222222222222",
        expectedRevision: 1,
        idempotencyKey: "custom-source-cost-1",
        useAuthoritativeCost: true,
        freightCost: 0,
        otherCost: 0,
        profitMode: "dollar",
        profitValue: 125,
      }),
    ).toMatchObject({
      useAuthoritativeCost: true,
      financial: {
        manufacturerCost: 0,
        profitMode: "dollar",
        profitValue: 125,
      },
    });
  });

  it("stores original and override snapshots while customer projection stays allow-listed", () => {
    const migration=readFileSync(fileURLToPath(new URL("../../../supabase/migrations/20260725213000_add_quote_v2_custom_mode.sql",import.meta.url)),"utf8");
    const send=readFileSync(fileURLToPath(new URL("./sales-quote-v2-send.ts",import.meta.url)),"utf8");
    expect(migration).toContain("original_snapshot jsonb not null");
    expect(migration).toContain("override_financials jsonb not null");
    expect(migration).toContain("'custom_override_applied'");
    expect(migration).toContain("v_original.catalog_version = 'custom-override-v1'");
    expect(migration).toContain("p_retail_snapshot#>>'{retail,unitPrice}'");
    expect(send).toContain('stored.catalogVersion === "custom-override-v1"');
    expect(send).toContain("projectV2CustomerRetailPrice(stored.snapshot.retail)");
    expect(send).not.toContain("customerPrice: stored.snapshotRow.internal_cost_snapshot");
  });

  it("keeps external delivery behind the existing explicit send guard", () => {
    const guard=readFileSync(fileURLToPath(new URL("./sales-quote-v2-send-guard.ts",import.meta.url)),"utf8");
    expect(guard).toContain("external delivery and the sent lifecycle transition remain disabled");
  });
});
