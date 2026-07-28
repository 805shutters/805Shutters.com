import { describe, it, expect } from "vitest";
import {
  buildSignedQuoteSplitPlan,
  createQuoteVersion,
  materializeSignedQuoteSelection,
  nextLabel,
} from "./quote-groups";

type Tables = Record<string, Array<Record<string, unknown>>>;

function fakeSupabase(tables: Tables) {
  const counters = new Map<string, number>();
  const nextId = (table: string) => {
    const prefix = table.replace(/^crm_/, "").replace(/s$/, "").replace(/_/g, "-");
    const next = (counters.get(table) ?? tables[table]?.length ?? 0) + 1;
    counters.set(table, next);
    return `${prefix}-${next}`;
  };

  class Query {
    private action: "select" | "insert" | "update" | "delete" = "select";
    private payload: unknown;
    private filters: Array<{ key: string; value: unknown }> = [];
    private selectedColumns = "*";

    constructor(private table: string) {}

    select(columns = "*") {
      this.selectedColumns = columns;
      return this;
    }

    order() {
      return this;
    }

    eq(key: string, value: unknown) {
      this.filters.push({ key, value });
      return this;
    }

    insert(payload: unknown) {
      this.action = "insert";
      this.payload = payload;
      return this;
    }

    update(payload: unknown) {
      this.action = "update";
      this.payload = payload;
      return this;
    }

    delete() {
      this.action = "delete";
      return this;
    }

    async maybeSingle() {
      const rows = this.selectRows();
      return { data: rows[0] ?? null, error: null };
    }

    async single() {
      const { data, error } = this.execute();
      return { data: Array.isArray(data) ? data[0] ?? null : data, error };
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
    }

    private matches(row: Record<string, unknown>) {
      return this.filters.every(({ key, value }) => row[key] === value);
    }

    private selectRows() {
      const rows = (tables[this.table] ?? []).filter((row) => this.matches(row));
      if (this.table === "crm_quote_line_items" && this.selectedColumns.includes("designs:")) {
        return rows.map((row) => ({
          ...row,
          designs: (tables.crm_quote_designs ?? []).filter((design) => design.line_item_id === row.id),
        }));
      }
      return rows.map((row) => ({ ...row }));
    }

    private execute() {
      if (this.action === "insert") {
        const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = payloads.map((payload) => {
          const row = {
            id: (payload as Record<string, unknown>)?.id ?? nextId(this.table),
            created_at: "",
            updated_at: "",
            ...(payload as Record<string, unknown>),
          };
          tables[this.table] = tables[this.table] ?? [];
          tables[this.table].push(row);
          return { ...row };
        });
        return { data: inserted, error: null };
      }

      if (this.action === "update") {
        const updated: Record<string, unknown>[] = [];
        for (const row of tables[this.table] ?? []) {
          if (!this.matches(row)) continue;
          Object.assign(row, this.payload as Record<string, unknown>);
          updated.push({ ...row });
        }
        return { data: updated, error: null };
      }

      if (this.action === "delete") {
        const deleted = (tables[this.table] ?? []).filter((row) => this.matches(row));
        tables[this.table] = (tables[this.table] ?? []).filter((row) => !this.matches(row));
        if (this.table === "crm_quote_line_items") {
          const deletedIds = new Set(deleted.map((row) => row.id));
          tables.crm_quote_designs = (tables.crm_quote_designs ?? []).filter(
            (design) => !deletedIds.has(design.line_item_id),
          );
        }
        return { data: deleted, error: null };
      }

      return { data: this.selectRows(), error: null };
    }
  }

  return {
    from(table: string) {
      return new Query(table);
    },
  } as never;
}

describe("nextLabel", () => {
  it("starts at A", () => {
    expect(nextLabel([])).toBe("A");
  });
  it("returns the first free letter", () => {
    expect(nextLabel(["A"])).toBe("B");
    expect(nextLabel(["A", "B", "C"])).toBe("D");
    expect(nextLabel(["A", "C"])).toBe("B");
  });
  it("is case-insensitive and ignores blanks", () => {
    expect(nextLabel(["a", null, "", "B"])).toBe("C");
  });
  it("falls back past the letters", () => {
    expect(nextLabel(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"])).toBe("Option 11");
  });
});

describe("signed customer selection splitting", () => {
  it("counts selected and remaining quantities from expanded public rows", () => {
    expect(buildSignedQuoteSplitPlan(
      [
        { id: "line-1#1", lineItemId: "line-1" },
        { id: "line-1#2", lineItemId: "line-1" },
        { id: "line-1#3", lineItemId: "line-1" },
        { id: "line-2", lineItemId: "line-2" },
      ],
      ["line-1#2", "line-2"],
    )).toEqual([
      { lineItemId: "line-1", selectedQuantity: 1, remainingQuantity: 2 },
      { lineItemId: "line-2", selectedQuantity: 1, remainingQuantity: 0 },
    ]);
  });

  it("keeps purchased quantities on the sold quote and creates a pending remainder quote", async () => {
    const tables: Tables = {
      crm_quotes: [{
        id: "quote-1",
        job_id: "job-1",
        quote_number: "805-100",
        status: "sold",
        quote_total: 300,
        materials_cost: 0,
        labor_cost: 0,
        discount: 0,
        tax: 0,
        deposit_required: 150,
        balance_due: 150,
        customer_email: "customer@example.com",
        customer_phone: "8055551212",
        customer_address: "10 Main St",
        quote_group_id: null,
        quote_label: null,
        meta: { signed_selection: { lineItemIds: ["line-1#2", "line-2"] } },
        notes: null,
      }],
      crm_quote_line_items: [
        {
          id: "line-1",
          quote_id: "quote-1",
          room: "Living Room",
          width_in: 24,
          height_in: 36,
          quantity: 3,
          discount_percent: 0,
          sort_order: 0,
          selected_design_id: "design-1",
          notes: null,
        },
        {
          id: "line-2",
          quote_id: "quote-1",
          room: "Office",
          width_in: 30,
          height_in: 48,
          quantity: 1,
          discount_percent: 0,
          sort_order: 1,
          selected_design_id: "design-2",
          notes: null,
        },
      ],
      crm_quote_designs: [
        {
          id: "design-1",
          line_item_id: "line-1",
          label: "A",
          sort_order: 0,
          product_id: "honeycomb",
          program_id: "honeycomb_9_16in_cordless_single_cell",
          fabric: null,
          details: {},
          surcharges: [],
          motorization: [],
          unit_price: 100,
          wholesale_unit_price: null,
          price_breakdown: {},
          price_status: "ok",
          priced_at: null,
          notes: null,
        },
        {
          id: "design-2",
          line_item_id: "line-2",
          label: "A",
          sort_order: 0,
          product_id: "honeycomb",
          program_id: "honeycomb_9_16in_cordless_single_cell",
          fabric: null,
          details: {},
          surcharges: [],
          motorization: [],
          unit_price: 200,
          wholesale_unit_price: null,
          price_breakdown: {},
          price_status: "ok",
          priced_at: null,
          notes: null,
        },
      ],
      crm_activity_events: [],
    };

    const result = await materializeSignedQuoteSelection(
      fakeSupabase(tables),
      "quote-1",
      [
        { id: "line-1#1", lineItemId: "line-1" },
        { id: "line-1#2", lineItemId: "line-1" },
        { id: "line-1#3", lineItemId: "line-1" },
        { id: "line-2", lineItemId: "line-2" },
      ],
      ["line-1#2", "line-2"],
    );

    const soldLine1 = tables.crm_quote_line_items.find((row) => row.id === "line-1");
    const soldLine2 = tables.crm_quote_line_items.find((row) => row.id === "line-2");
    const pendingQuote = tables.crm_quotes.find((row) => row.id === result.pendingQuoteId);
    const pendingLines = tables.crm_quote_line_items.filter((row) => row.quote_id === result.pendingQuoteId);

    expect(soldLine1?.quantity).toBe(1);
    expect(soldLine2?.quantity).toBe(1);
    expect(pendingQuote).toMatchObject({
      status: "draft",
      quote_group_id: result.groupId,
      quote_label: "B",
      quote_total: 200,
    });
    expect(pendingLines).toHaveLength(1);
    expect(pendingLines[0]).toMatchObject({ room: "Living Room", quantity: 2 });
    expect(tables.crm_quotes[0].meta).toMatchObject({
      signed_selection: { lineItemIds: ["line-1#2", "line-2"] },
      selection_remainder_quote_id: result.pendingQuoteId,
      selection_remainder_quote_label: "B",
    });

    const retry = await materializeSignedQuoteSelection(
      fakeSupabase(tables),
      "quote-1",
      [
        { id: "line-1", lineItemId: "line-1" },
        { id: "line-2", lineItemId: "line-2" },
      ],
      ["line-1", "line-2"],
    );
    expect(retry.pendingQuoteId).toBe(result.pendingQuoteId);
    expect(tables.crm_quotes.filter((row) => row.meta && (row.meta as Record<string, unknown>).selection_split_role === "remaining")).toHaveLength(1);
  });
});

describe("createQuoteVersion", () => {
  it("copies source windows/designs into a draft without repricing the saved snapshot", async () => {
    const tables: Tables = {
      crm_quotes: [
        {
          id: "quote-1",
          job_id: "job-1",
          quote_number: "805-100",
          status: "sent",
          quote_total: 381.6,
          materials_cost: 125,
          labor_cost: 0,
          discount: 0,
          tax: 0,
          deposit_required: 190.8,
          balance_due: 190.8,
          customer_email: "customer@example.com",
          customer_phone: "8055551212",
          customer_address: "10 Main St",
          quote_group_id: null,
          quote_label: null,
          meta: {
            adjustments: { depositPercent: 50 },
            signed_selection: { lineItemIds: ["line-1"] },
            contract_snapshot: { schema: "805_signed_quote_contract_v1" },
          },
          notes: "Customer-facing note",
        },
      ],
      crm_quote_line_items: [
        {
          id: "line-1",
          quote_id: "quote-1",
          room: "Living Room",
          width_in: 24,
          height_in: 36,
          quantity: 2,
          discount_percent: 10,
          sort_order: 0,
          selected_design_id: "design-1",
          notes: "North window",
        },
      ],
      crm_quote_designs: [
        {
          id: "design-1",
          line_item_id: "line-1",
          label: "A",
          sort_order: 0,
          product_id: "honeycomb",
          program_id: "honeycomb_9_16in_cordless_single_cell",
          fabric: null,
          details: { mount_type: "inside" },
          surcharges: [],
          motorization: [],
          unit_price: 212,
          wholesale_unit_price: null,
          price_breakdown: {
            sourceGuide: "Norman 2026",
            sourcePage: 42,
            engineUnitPrice: 212,
          },
          price_status: "ok",
          priced_at: "2026-07-28T18:00:00.000Z",
          notes: "Use cordless",
        },
      ],
      crm_activity_events: [],
    };

    const result = await createQuoteVersion(fakeSupabase(tables), "quote-1", { email: "rep@805shutters.com" });

    const source = tables.crm_quotes.find((row) => row.id === "quote-1");
    const copiedQuote = tables.crm_quotes.find((row) => row.id === result.quoteId);
    const copiedLine = tables.crm_quote_line_items.find((row) => row.quote_id === result.quoteId);
    const copiedDesign = tables.crm_quote_designs.find((row) => row.line_item_id === copiedLine?.id);

    expect(result.label).toBe("B");
    expect(source?.quote_group_id).toBe(result.groupId);
    expect(source?.quote_label).toBe("A");
    expect(copiedQuote).toMatchObject({
      job_id: "job-1",
      quote_number: "805-100-B",
      status: "draft",
      quote_group_id: result.groupId,
      quote_label: "B",
      customer_email: "customer@example.com",
      customer_phone: "8055551212",
      customer_address: "10 Main St",
      quote_total: 381.6,
      deposit_required: 190.8,
      balance_due: 190.8,
      notes: "Customer-facing note",
    });
    expect(copiedQuote?.meta).toMatchObject({
      adjustments: { depositPercent: 50 },
      createdBy: "rep@805shutters.com",
      createdAsVersionOf: "quote-1",
      quoteVersionLabel: "B",
    });
    expect(copiedQuote?.meta).not.toHaveProperty("signed_selection");
    expect(copiedQuote?.meta).not.toHaveProperty("contract_snapshot");
    expect(copiedLine).toMatchObject({
      quote_id: result.quoteId,
      room: "Living Room",
      width_in: 24,
      height_in: 36,
      quantity: 2,
      discount_percent: 10,
      sort_order: 0,
      notes: "North window",
    });
    expect(copiedDesign).toMatchObject({
      line_item_id: copiedLine?.id,
      label: "A",
      product_id: "honeycomb",
      program_id: "honeycomb_9_16in_cordless_single_cell",
      unit_price: 212,
      price_status: "ok",
      price_breakdown: {
        sourceGuide: "Norman 2026",
        sourcePage: 42,
        engineUnitPrice: 212,
      },
      priced_at: "2026-07-28T18:00:00.000Z",
      notes: "Use cordless",
    });
    expect(copiedLine?.selected_design_id).toBe(copiedDesign?.id);
    expect(tables.crm_activity_events.at(-1)).toMatchObject({
      entity_type: "quote",
      entity_id: result.quoteId,
      action: "version.create",
      metadata: expect.objectContaining({ copyCurrent: true }),
    });
  });

  it("adds a blank sibling without copying line items or historical prices", async () => {
    const tables: Tables = {
      crm_quotes: [
        {
          id: "quote-1",
          job_id: "job-1",
          quote_number: "805-100",
          status: "sent",
          quote_total: 381.6,
          materials_cost: 125,
          labor_cost: 25,
          discount: 20,
          tax: 30,
          deposit_required: 190.8,
          balance_due: 190.8,
          customer_email: "customer@example.com",
          customer_phone: "8055551212",
          customer_address: "10 Main St",
          quote_group_id: null,
          quote_label: null,
          meta: { adjustments: { depositPercent: 50 } },
          notes: "Customer-facing note",
        },
      ],
      crm_quote_line_items: [
        {
          id: "line-1",
          quote_id: "quote-1",
          room: "Living Room",
          width_in: 24,
          height_in: 36,
          quantity: 2,
          discount_percent: 10,
          sort_order: 0,
          selected_design_id: null,
          notes: null,
        },
      ],
      crm_quote_designs: [],
      crm_activity_events: [],
    };

    const result = await createQuoteVersion(
      fakeSupabase(tables),
      "quote-1",
      { email: "rep@805shutters.com" },
      { copyCurrent: false },
    );

    const source = tables.crm_quotes.find((row) => row.id === "quote-1");
    const blankQuote = tables.crm_quotes.find((row) => row.id === result.quoteId);

    expect(result.label).toBe("B");
    expect(source).toMatchObject({
      quote_group_id: result.groupId,
      quote_label: "A",
      quote_total: 381.6,
    });
    expect(blankQuote).toMatchObject({
      job_id: "job-1",
      quote_number: "805-100-B",
      status: "draft",
      quote_group_id: result.groupId,
      quote_label: "B",
      customer_email: "customer@example.com",
      customer_phone: "8055551212",
      customer_address: "10 Main St",
      quote_total: 0,
      materials_cost: 0,
      labor_cost: 0,
      discount: 0,
      tax: 0,
      deposit_required: 0,
      balance_due: 0,
    });
    expect(tables.crm_quote_line_items.filter((row) => row.quote_id === result.quoteId)).toEqual([]);
    expect(tables.crm_activity_events.at(-1)).toMatchObject({
      entity_type: "quote",
      entity_id: result.quoteId,
      action: "version.create",
      metadata: expect.objectContaining({ copyCurrent: false }),
    });
  });
});
