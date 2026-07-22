import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";
import {
  applyLegacySalesQuoteV2Reprice,
  parseLegacyV2RepriceApplyBody,
  parseLegacyV2RepricePreviewBody,
  previewLegacySalesQuoteV2Reprice,
  type LegacyV2SelectedDesign,
} from "./sales-quote-v2-legacy-reprice";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "44444444-4444-4444-8444-444444444444";
const PREVIEW_ID = "55555555-5555-4555-8555-555555555555";
const PREVIEW_DIGEST = `sha256:${"a".repeat(64)}`;

type FakeRows = Record<string, Array<Record<string, unknown>>>;

function indexedUuid(prefix: string, index: number): string {
  return `${prefix.repeat(8)}-${prefix.repeat(4)}-4${prefix.repeat(3)}-8${prefix.repeat(3)}-${String(index + 1).padStart(12, "0")}`;
}

function lineId(index: number) {
  return indexedUuid("2", index);
}

function designId(index: number) {
  return indexedUuid("3", index);
}

function quoteRows(count = 1, overrides: {
  quote?: Record<string, unknown>;
  line?: Record<string, unknown>;
  designOptions?: Record<string, unknown>;
  extraDesign?: boolean;
} = {}): FakeRows {
  const lines = Array.from({ length: count }, (_, index) => ({
    id: lineId(index),
    quote_id: QUOTE_ID,
    room_name: index === 0 ? "Living Room" : `Room ${index + 1}`,
    product_type: "Roller Shades",
    width_whole: 36,
    width_fraction: "0",
    height_whole: 60,
    height_fraction: "0",
    quantity: 1,
    sort_order: index,
    created_at: "2026-07-22T00:00:00.000Z",
    ...overrides.line,
  }));
  const designs = lines.map((line, index) => ({
    id: designId(index),
    line_item_id: line.id,
    variant: "A",
    product_type: "Roller Shades",
    supplier: "Norman",
    material: null,
    louver_size: null,
    tilt_type: null,
    hinge_color: null,
    panel_config: null,
    mount_type: "Inside Mount",
    shade_type: "Single",
    lift_system: "Cordless",
    valance: "No Top Treatment",
    fabric: "Amelia",
    motor_type: null,
    remote_type: null,
    hard_surface_install: false,
    ladder_over_15ft: false,
    requires_takedown: false,
    unit_price: 999_999,
    notes: null,
    options_json: {
      quote_lab_product_id: "roller",
      fabric_program_id: "roller_cordless_fabric_price_group_2_pg2",
      fabric_color_collection: "Amelia",
      fabric_color_code: "F1484",
      fabric_color_name: "Mist Gray",
      roller_application: "Single",
      roller_tube: "all tubes",
      roller_region_scope: "ca_ma",
      shipping_region: "continental_us",
      ...overrides.designOptions,
    },
    created_at: "2026-07-22T00:00:00.000Z",
  }));
  if (overrides.extraDesign) {
    designs.push({
      ...designs[0],
      id: "88888888-8888-4888-8888-888888888888",
      variant: "B",
      unit_price: 88_888,
    });
  }
  return {
    sales_quotes: [
      {
        id: QUOTE_ID,
        status: "draft",
        total_amount: 999,
        quote_v2_backend: false,
        quote_v2_status: "legacy",
        quote_v2_revision: 0,
        ...overrides.quote,
      },
    ],
    sales_quote_line_items: lines,
    sales_quote_designs: designs,
    sales_quote_v2_legacy_reprice_previews: [],
  };
}

function selections(count = 1): LegacyV2SelectedDesign[] {
  return Array.from({ length: count }, (_, index) => ({
    lineItemId: lineId(index),
    designId: designId(index),
  }));
}

function previewRow(selected = selections()): Record<string, unknown> {
  return {
    id: PREVIEW_ID,
    quote_id: QUOTE_ID,
    quote_revision: 0,
    preview_digest: PREVIEW_DIGEST,
    server_catalog_date: "2026-08-01",
    selection_map: selected,
    line_count: selected.length,
    expires_at: "2999-01-01T00:00:00.000Z",
    created_by: ACTOR_ID,
  };
}

function fakeSupabase(
  rows: FakeRows,
  responses: Partial<Record<string, { data: unknown; error: unknown }>> = {},
) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    from(table: string) {
      const filters: Array<
        | { kind: "eq"; column: string; value: unknown }
        | { kind: "in"; column: string; values: unknown[] }
      > = [];
      const evaluate = () =>
        (rows[table] ?? []).filter((row) =>
          filters.every((filter) =>
            filter.kind === "eq"
              ? row[filter.column] === filter.value
              : filter.values.includes(row[filter.column]),
          ),
        );
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push({ kind: "eq", column, value });
          return query;
        },
        async in(column: string, values: unknown[]) {
          filters.push({ kind: "in", column, values });
          return { data: evaluate(), error: null };
        },
        async order(column: string, options: { ascending?: boolean } = {}) {
          const direction = options.ascending === false ? -1 : 1;
          return {
            data: [...evaluate()].sort((left, right) =>
              Number(left[column] ?? 0) > Number(right[column] ?? 0)
                ? direction
                : Number(left[column] ?? 0) < Number(right[column] ?? 0)
                  ? -direction
                  : 0,
            ),
            error: null,
          };
        },
        async maybeSingle() {
          return { data: evaluate()[0] ?? null, error: null };
        },
      };
      return query;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      const response = responses[name];
      if (response) return response;
      if (name === "record_quote_v2_legacy_reprice_preview") {
        return {
          data: [
            {
              preview_id: PREVIEW_ID,
              preview_digest: PREVIEW_DIGEST,
              expires_at: "2026-07-22T20:30:00.000Z",
            },
          ],
          error: null,
        };
      }
      return {
        data: [
          {
            quote_id: QUOTE_ID,
            preview_id: PREVIEW_ID,
            new_revision: 1,
            quote_status: "priced",
            quote_total: 432,
            priced_design_count: 1,
            blocked_design_count: 0,
            product_cost_total: 142.56,
            dealer_margin: 289.44,
          },
        ],
        error: null,
      };
    },
  };
  return { client: client as unknown as SupabaseClient, rpcCalls };
}

function previewInput(count = 1) {
  return {
    quoteId: QUOTE_ID,
    actorId: ACTOR_ID,
    expectedRevision: 0,
    idempotencyKey: "legacy-preview:test-1",
    selectedDesigns: selections(count),
    serverDate: "2026-08-01",
  } as const;
}

function applyInput() {
  return {
    quoteId: QUOTE_ID,
    actorId: ACTOR_ID,
    expectedRevision: 0,
    idempotencyKey: "legacy-apply:test-1",
    previewId: PREVIEW_ID,
    previewDigest: PREVIEW_DIGEST,
    confirmation: "APPLY_V2_REPRICE" as const,
  };
}

describe("explicit legacy sales-quote V2 repricing", () => {
  it("strictly rejects prices/costs and requires an exact explicit apply phrase", () => {
    expect(() =>
      parseLegacyV2RepricePreviewBody({
        expectedRevision: 0,
        idempotencyKey: "legacy-preview:test-1",
        selectedDesigns: selections(),
        unitPrice: 1,
      }),
    ).toThrowError(CrmAuthError);
    expect(() =>
      parseLegacyV2RepriceApplyBody({
        expectedRevision: 0,
        idempotencyKey: "legacy-apply:test-1",
        previewId: PREVIEW_ID,
        previewDigest: PREVIEW_DIGEST,
        confirmation: true,
      }),
    ).toThrow('confirmation must exactly equal "APPLY_V2_REPRICE"');
  });

  it("previews one selected design with its discount and never trusts legacy stored prices", async () => {
    const rows = quoteRows(1, {
      quote: { total_amount: 9_999 },
      designOptions: { discount_percent: 10 },
      extraDesign: true,
    });
    const fake = fakeSupabase(rows);
    const preview = await previewLegacySalesQuoteV2Reprice(
      fake.client,
      previewInput(),
    );
    expect(preview).toMatchObject({
      canApply: true,
      previewId: PREVIEW_ID,
      legacyStoredTotal: 9_999,
      lineCount: 1,
    });
    expect(preview.proposedSelectedDesignTotal).toBe(
      (preview.lines[0].price as { total: number }).total,
    );
    expect(preview.proposedSelectedDesignTotal).toBeLessThan(9_999);
    expect(preview.lines[0].price).toMatchObject({
      discountPercent: 10,
    });
    expect((preview.lines[0].price as { discountAmount: number }).discountAmount).toBeGreaterThan(0);

    const record = fake.rpcCalls.find(
      (call) => call.name === "record_quote_v2_legacy_reprice_preview",
    );
    expect(record).toBeDefined();
    expect(record?.args.p_selection_map).toEqual(selections());
    expect(record?.args.p_results).toHaveLength(1);
    const resultJson = JSON.stringify(preview);
    expect(resultJson).not.toMatch(
      /dealer|wholesale|landed|internalCost|margin|productCost|freightAllocated/i,
    );
  });

  it("totals only the explicitly selected design, never every saved alternative", async () => {
    const rows = quoteRows(1, { extraDesign: true });
    const fake = fakeSupabase(rows);
    const preview = await previewLegacySalesQuoteV2Reprice(
      fake.client,
      previewInput(),
    );
    expect(preview.canApply).toBe(true);
    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0].selectedDesignId).toBe(designId(0));
    expect(preview.proposedSelectedDesignTotal).not.toBe(88_888);
    expect(preview.proposedSelectedDesignTotal).not.toBeGreaterThan(80_000);
  });

  it("prices exactly 40 explicitly selected lines in one quote-wide dry run", async () => {
    const fake = fakeSupabase(quoteRows(40));
    const preview = await previewLegacySalesQuoteV2Reprice(
      fake.client,
      previewInput(40),
    );
    expect(preview.canApply).toBe(true);
    expect(preview.lineCount).toBe(40);
    expect(preview.lines).toHaveLength(40);
    const record = fake.rpcCalls.find(
      (call) => call.name === "record_quote_v2_legacy_reprice_preview",
    );
    expect(record?.args.p_results).toHaveLength(40);
  });

  it("rejects the 41st line before recording any preview or mutation", async () => {
    const fake = fakeSupabase(quoteRows(41));
    await expect(
      previewLegacySalesQuoteV2Reprice(fake.client, previewInput(41)),
    ).rejects.toMatchObject({ status: 409 });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(() =>
      parseLegacyV2RepricePreviewBody({
        expectedRevision: 0,
        idempotencyKey: "legacy-preview:test-41",
        selectedDesigns: selections(41),
      }),
    ).toThrow("selectedDesigns must contain between 1 and 40 lines");
  });

  it("fails closed for an unsupported saved line and creates no applicable preview", async () => {
    const fake = fakeSupabase(
      quoteRows(1, { line: { width_whole: 999 } }),
    );
    const preview = await previewLegacySalesQuoteV2Reprice(
      fake.client,
      previewInput(),
    );
    expect(preview.canApply).toBe(false);
    expect(preview.previewId).toBeNull();
    expect(preview.lines[0].priceStatus).not.toBe("authoritative");
    expect(preview.blockingReasons.length).toBeGreaterThan(0);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("applies only from the saved preview and redacts protected costs from the response", async () => {
    const rows = quoteRows();
    rows.sales_quote_v2_legacy_reprice_previews = [previewRow()];
    const fake = fakeSupabase(rows, {
      apply_quote_v2_legacy_reprice: {
        data: [
          {
            quote_id: QUOTE_ID,
            preview_id: PREVIEW_ID,
            new_revision: 1,
            quote_status: "priced",
            quote_total: 432,
            priced_design_count: 1,
            blocked_design_count: 0,
            product_cost_total: 142.56,
            internal_landed_cost_total: 171.42,
            dealer_margin: 260.58,
          },
        ],
        error: null,
      },
    });
    const result = await applyLegacySalesQuoteV2Reprice(
      fake.client,
      applyInput(),
    );
    expect(result).toMatchObject({
      mode: "legacy_reprice_applied",
      previewId: PREVIEW_ID,
      revision: 1,
      quoteStatus: "priced",
      pricedDesignCount: 1,
      blockedDesignCount: 0,
    });
    const apply = fake.rpcCalls.find(
      (call) => call.name === "apply_quote_v2_legacy_reprice",
    );
    expect(apply?.args).toMatchObject({
      p_preview_id: PREVIEW_ID,
      p_preview_digest: PREVIEW_DIGEST,
      p_expected_revision: 0,
      p_idempotency_key: "legacy-apply:test-1",
    });
    expect(JSON.stringify(apply?.args.p_results)).toContain("internalCostSnapshot");
    expect(JSON.stringify(result)).not.toMatch(
      /dealer|wholesale|landed|internalCost|margin|productCost|freightAllocated/i,
    );
  });

  it("maps stale-state and revision conflicts to a fail-closed 409", async () => {
    const rows = quoteRows();
    rows.sales_quote_v2_legacy_reprice_previews = [previewRow()];
    const fake = fakeSupabase(rows, {
      apply_quote_v2_legacy_reprice: {
        data: null,
        error: { message: "The legacy quote changed after preview." },
      },
    });
    await expect(
      applyLegacySalesQuoteV2Reprice(fake.client, applyInput()),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("allows a matching completed application to reach the RPC idempotency replay", async () => {
    const rows = quoteRows(1, {
      quote: {
        quote_v2_backend: true,
        quote_v2_status: "priced",
        quote_v2_revision: 1,
        total_amount: 432,
      },
    });
    rows.sales_quote_v2_legacy_reprice_previews = [
      { ...previewRow(), expires_at: "2026-07-22T00:00:00.000Z" },
    ];
    const fake = fakeSupabase(rows);
    const replay = await applyLegacySalesQuoteV2Reprice(
      fake.client,
      applyInput(),
    );
    expect(replay.revision).toBe(1);
    expect(
      fake.rpcCalls.filter(
        (call) => call.name === "apply_quote_v2_legacy_reprice",
      ),
    ).toHaveLength(1);
  });

  it("rejects sent, already-V2, and revision-mismatched quotes before pricing", async () => {
    for (const quote of [
      { status: "sent" },
      { quote_v2_backend: true, quote_v2_status: "priced", quote_v2_revision: 1 },
      { quote_v2_revision: 2 },
    ]) {
      const fake = fakeSupabase(quoteRows(1, { quote }));
      await expect(
        previewLegacySalesQuoteV2Reprice(fake.client, previewInput()),
      ).rejects.toMatchObject({ status: 409 });
      expect(fake.rpcCalls).toHaveLength(0);
    }
  });
});
