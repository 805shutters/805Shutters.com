/* eslint-disable @typescript-eslint/no-explicit-any */

import type { QuoteBuilderDatabase } from "@mts/integrations/supabase/quoteBuilderDatabase";
import type { SalesQuote, SalesQuoteDesign, SalesQuoteLineItem } from "@mts/types/quote";
import { quoteLabProductType } from "@/lib/quote-lab/builder";
import { QUOTE_LAB_MAX_LINES } from "@/lib/quote-lab/types";
import type {
  QuoteLabCatalogResponse,
  QuoteLabComparison,
  QuoteLabFixture,
} from "@/lib/quote-lab/types";

type TableName = "sales_quotes" | "sales_quote_line_items" | "sales_quote_designs";
type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] }
  | { kind: "not-in"; column: string; values: unknown[] };

type QuoteLabState = {
  quotes: SalesQuote[];
  lineItems: SalesQuoteLineItem[];
  designs: SalesQuoteDesign[];
  selectedVariantByLine: Record<string, string>;
};

function uniqueId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function now() {
  return new Date().toISOString();
}

function fractionParts(value: number): { whole: number; fraction: string } {
  const whole = Math.floor(Number(value) || 0);
  const sixteenths = Math.round(((Number(value) || 0) - whole) * 16);
  if (sixteenths <= 0) return { whole, fraction: "0" };
  if (sixteenths >= 16) return { whole: whole + 1, fraction: "0" };
  const divisor = sixteenths % 8 === 0 ? 8 : sixteenths % 4 === 0 ? 4 : sixteenths % 2 === 0 ? 2 : 1;
  return { whole, fraction: `${sixteenths / divisor}/${16 / divisor}` };
}

function baseQuote(total: number): SalesQuote {
  const timestamp = now();
  return {
    id: "quote-lab-exact",
    quote_number: "TEST-805-40",
    account_id: "805-shutters",
    status: "draft",
    customer_name: "40-Line Test Customer",
    customer_email: null,
    customer_phone: "805-555-0040",
    customer_address: "Camarillo, CA",
    appointment_date: null,
    installer_notes: JSON.stringify({ __quoteBuilderNote: "Isolated test quote — production writes are disabled." }),
    product_cost: 0,
    total_amount: total,
    profit_amount: 0,
    deposit_paid: 0,
    balance_paid: 0,
    payment_method: null,
    customer_signature: null,
    customer_printed_name: null,
    signed_at: null,
    share_token: "quote-lab-only",
    created_by: null,
    sales_owner: "mike",
    sales_owner_auth_user_id: null,
    sales_owner_set_at: null,
    created_job_id: null,
    quote_group_id: "quote-lab-group",
    quote_letter: "A",
    sent_at: null,
    ordered_at: null,
    received_at: null,
    installed_at: null,
    archived_at: null,
    sent_via: null,
    manufacturer_order_ref: null,
    manufacturer_cost: 0,
    manufacturer_name: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function seedState(
  catalog: QuoteLabCatalogResponse,
  fixture: QuoteLabFixture,
  comparison: QuoteLabComparison,
): QuoteLabState {
  const lineItems: SalesQuoteLineItem[] = [];
  const designs: SalesQuoteDesign[] = [];
  const selectedVariantByLine: Record<string, string> = {};
  const timestamp = now();

  fixture.quote.lines.forEach((sourceLine, index) => {
    const firstDesign = sourceLine.designs[0];
    const productType = firstDesign ? quoteLabProductType(firstDesign.productId) : null;
    const width = fractionParts(firstDesign?.widthInches ?? 36);
    const height = fractionParts(firstDesign?.heightInches ?? 60);
    const lineId = `quote-lab-line-${index + 1}`;
    lineItems.push({
      id: lineId,
      quote_id: "quote-lab-exact",
      room_name: sourceLine.room,
      product_type: productType ?? "Roller Shades",
      width_whole: width.whole,
      width_fraction: width.fraction,
      height_whole: height.whole,
      height_fraction: height.fraction,
      quantity: sourceLine.quantity,
      sort_order: index,
      created_at: timestamp,
    });

    const comparedLine = comparison.lines.find((candidate) => candidate.lineId === sourceLine.id);
    sourceLine.designs.forEach((sourceDesign, designIndex) => {
      const variant = sourceDesign.label || String.fromCharCode(65 + designIndex);
      const product = catalog.products.find((candidate) => candidate.id === sourceDesign.productId);
      const program = product?.programs.find((candidate) => candidate.id === sourceDesign.programId);
      const priced = comparedLine?.designs.find((candidate) => candidate.designId === sourceDesign.id)?.authoritative;
      designs.push({
        id: `quote-lab-design-${index + 1}-${variant}`,
        line_item_id: lineId,
        variant,
        product_type: productType ?? "Roller Shades",
        supplier: sourceDesign.productId === "onyx_shutters" ? "Onyx" : "Norman",
        material: program?.name ?? null,
        louver_size: null,
        tilt_type: null,
        hinge_color: null,
        panel_config: null,
        mount_type: null,
        shade_type: null,
        lift_system: null,
        valance: null,
        fabric: sourceDesign.fabric ?? null,
        motor_type: null,
        remote_type: null,
        hard_surface_install: false,
        ladder_over_15ft: false,
        requires_takedown: false,
        unit_price: priced?.ok ? priced.unitPrice : 0,
        notes: null,
        options_json: {
          quote_lab_product_id: sourceDesign.productId,
          quote_lab_program_id: sourceDesign.programId,
          catalog_program_id: sourceDesign.programId,
          discount_percent: sourceDesign.discountPercent,
          authoritative_price_status: priced?.ok ? "ok" : priced?.code ?? "unpriced",
          authoritative_once_total: priced?.ok ? priced.onceTotal : 0,
        },
        created_at: timestamp,
      });
    });
    const selected = sourceLine.designs.find((design) => design.id === sourceLine.selectedDesignId);
    selectedVariantByLine[lineId] = selected?.label ?? sourceLine.designs[0]?.label ?? "A";
  });

  return {
    quotes: [baseQuote(comparison.authoritativeTotal)],
    lineItems,
    designs,
    selectedVariantByLine,
  };
}

function parseNotInValues(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  return value
    .replace(/^\(|\)$/g, "")
    .split(",")
    .map((entry) => entry.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

class QuoteLabQuery {
  private operation: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private payload: any = null;
  private filters: Filter[] = [];
  private orderColumn: string | null = null;
  private returning = false;

  constructor(private client: ExactQuoteLabDatabase, private table: TableName) {}

  select(_columns = "*") {
    this.returning = true;
    return this;
  }

  insert(payload: any) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  upsert(payload: any, _options?: any) {
    this.operation = "upsert";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ kind: "in", column, values });
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "in") this.filters.push({ kind: "not-in", column, values: parseNotInValues(value) });
    return this;
  }

  order(column: string) {
    this.orderColumn = column;
    return this;
  }

  async single() {
    const result = await this.execute();
    return { ...result, data: Array.isArray(result.data) ? result.data[0] ?? null : result.data };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    try {
      const data = await this.client.execute(
        this.table,
        this.operation,
        this.payload,
        this.filters,
        this.orderColumn,
      );
      return { data: this.operation === "select" || this.returning ? data : null, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error("Quote Lab operation failed.") };
    }
  }
}

class ExactQuoteLabDatabase {
  private queuedReprices = new Map<string, Promise<void>>();

  readonly auth = {
    getSession: async () => ({ data: { session: null }, error: null }),
  };

  constructor(private state: QuoteLabState) {}

  from(table: TableName) {
    return new QuoteLabQuery(this, table);
  }

  async rpc(name: string) {
    if (name !== "next_quote_number") return { data: null, error: new Error("Unsupported test RPC.") };
    return { data: `TEST-${String(this.state.quotes.length + 1).padStart(3, "0")}`, error: null };
  }

  private rows(table: TableName): any[] {
    if (table === "sales_quotes") return this.state.quotes;
    if (table === "sales_quote_line_items") return this.state.lineItems;
    return this.state.designs;
  }

  private matches(row: any, filters: Filter[]) {
    return filters.every((filter) => {
      if (filter.kind === "eq") return row[filter.column] === filter.value;
      if (filter.kind === "in") return filter.values.includes(row[filter.column]);
      return !filter.values.includes(row[filter.column]);
    });
  }

  private normalizeInserted(table: TableName, source: any, index: number) {
    const timestamp = now();
    if (table === "sales_quotes") {
      return {
        ...baseQuote(0),
        ...source,
        id: source.id ?? uniqueId("quote-lab-quote"),
        created_at: source.created_at ?? timestamp,
        updated_at: timestamp,
      };
    }
    if (table === "sales_quote_line_items") {
      return {
        id: source.id ?? uniqueId("quote-lab-line"),
        quote_id: source.quote_id,
        room_name: source.room_name ?? "Room",
        product_type: source.product_type ?? "Roller Shades",
        width_whole: Number(source.width_whole) || 0,
        width_fraction: source.width_fraction ?? "0",
        height_whole: Number(source.height_whole) || 0,
        height_fraction: source.height_fraction ?? "0",
        quantity: Math.max(1, Math.floor(Number(source.quantity) || 1)),
        sort_order: Number.isFinite(Number(source.sort_order)) ? Number(source.sort_order) : index,
        created_at: timestamp,
      } satisfies SalesQuoteLineItem;
    }
    return {
      id: source.id ?? uniqueId("quote-lab-design"),
      line_item_id: source.line_item_id,
      variant: source.variant ?? "A",
      product_type: source.product_type ?? null,
      supplier: source.supplier ?? null,
      material: source.material ?? null,
      louver_size: source.louver_size ?? null,
      tilt_type: source.tilt_type ?? null,
      hinge_color: source.hinge_color ?? null,
      panel_config: source.panel_config ?? null,
      mount_type: source.mount_type ?? null,
      shade_type: source.shade_type ?? null,
      lift_system: source.lift_system ?? null,
      valance: source.valance ?? null,
      fabric: source.fabric ?? null,
      motor_type: source.motor_type ?? null,
      remote_type: source.remote_type ?? null,
      hard_surface_install: Boolean(source.hard_surface_install),
      ladder_over_15ft: Boolean(source.ladder_over_15ft),
      requires_takedown: Boolean(source.requires_takedown),
      unit_price: Number(source.unit_price) || 0,
      notes: source.notes ?? null,
      options_json: source.options_json ?? {},
      created_at: source.created_at ?? timestamp,
    } satisfies SalesQuoteDesign;
  }

  private async repriceQuote(quoteId: string) {
    const lines = this.state.lineItems.filter((line) => line.quote_id === quoteId);
    const lineIds = new Set(lines.map((line) => line.id));
    const designs = this.state.designs.filter((design) => lineIds.has(design.line_item_id));
    const response = await fetch("/api/quote-lab/reprice-exact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, designs, selectedVariantByLine: this.state.selectedVariantByLine }),
    });
    const body = (await response.json().catch(() => ({}))) as {
      quote?: { total: number; designs: Array<{ lineItemId: string; variant: string; result: any }> };
      error?: string;
    };
    if (!response.ok || !body.quote) throw new Error(body.error || "Authoritative quote pricing failed.");
    for (const priced of body.quote.designs) {
      const design = this.state.designs.find(
        (candidate) => candidate.line_item_id === priced.lineItemId && candidate.variant === priced.variant,
      );
      if (!design) continue;
      const result = priced.result;
      design.unit_price = result.ok ? Number(result.unitPrice) || 0 : 0;
      design.options_json = {
        ...(design.options_json ?? {}),
        authoritative_price_status: result.ok ? "ok" : result.code,
        authoritative_price_error: result.ok ? null : result.error,
        authoritative_price_breakdown: result,
        authoritative_once_total: result.ok ? Number(result.onceTotal) || 0 : 0,
      };
    }
    const quote = this.state.quotes.find((candidate) => candidate.id === quoteId);
    if (quote) {
      quote.total_amount = body.quote.total;
      quote.updated_at = now();
    }
  }

  private queueReprice(quoteId: string) {
    const pending = this.queuedReprices.get(quoteId);
    if (pending) return pending;
    const queued = new Promise<void>((resolve, reject) => {
      window.setTimeout(() => {
        void this.repriceQuote(quoteId).then(resolve, reject).finally(() => {
          this.queuedReprices.delete(quoteId);
        });
      }, 25);
    });
    this.queuedReprices.set(quoteId, queued);
    return queued;
  }

  private quoteIdForLine(lineId: string) {
    return this.state.lineItems.find((line) => line.id === lineId)?.quote_id;
  }

  async execute(
    table: TableName,
    operation: "select" | "insert" | "update" | "delete" | "upsert",
    payload: any,
    filters: Filter[],
    orderColumn: string | null,
  ) {
    const rows = this.rows(table);
    if (operation === "select") {
      const selected = rows.filter((row) => this.matches(row, filters)).map((row) => structuredClone(row));
      if (orderColumn) selected.sort((a, b) => String(a[orderColumn] ?? "").localeCompare(String(b[orderColumn] ?? ""), undefined, { numeric: true }));
      return selected;
    }

    if (operation === "insert") {
      const sourceRows = Array.isArray(payload) ? payload : [payload];
      if (table === "sales_quote_line_items") {
        const quoteId = sourceRows[0]?.quote_id;
        const existing = this.state.lineItems.filter((line) => line.quote_id === quoteId).length;
        if (existing + sourceRows.length > QUOTE_LAB_MAX_LINES) {
          throw new Error(`A quote can contain no more than ${QUOTE_LAB_MAX_LINES} line items.`);
        }
      }
      const inserted = sourceRows.map((source, index) => this.normalizeInserted(table, source, rows.length + index));
      rows.push(...inserted);
      if (table === "sales_quote_line_items") {
        for (const line of inserted as SalesQuoteLineItem[]) this.state.selectedVariantByLine[line.id] = "A";
        await this.queueReprice((inserted[0] as SalesQuoteLineItem).quote_id);
      }
      if (table === "sales_quote_designs") {
        const quoteId = this.quoteIdForLine((inserted[0] as SalesQuoteDesign).line_item_id);
        if (quoteId) await this.queueReprice(quoteId);
      }
      return structuredClone(inserted);
    }

    if (operation === "update") {
      const matched = rows.filter((row) => this.matches(row, filters));
      const updates = table === "sales_quotes"
        ? Object.fromEntries(Object.entries(payload ?? {}).filter(([key]) => key !== "total_amount"))
        : payload;
      for (const row of matched) Object.assign(row, updates, table === "sales_quotes" ? { updated_at: now() } : {});
      if (table === "sales_quote_line_items") {
        const quoteIds = new Set((matched as SalesQuoteLineItem[]).map((line) => line.quote_id));
        for (const quoteId of quoteIds) await this.queueReprice(quoteId);
      }
      return structuredClone(matched);
    }

    if (operation === "upsert") {
      const sourceRows = Array.isArray(payload) ? payload : [payload];
      const saved: SalesQuoteDesign[] = [];
      for (const source of sourceRows) {
        const existing = this.state.designs.find(
          (design) => design.line_item_id === source.line_item_id && design.variant === source.variant,
        );
        const merged = this.normalizeInserted("sales_quote_designs", existing ? { ...existing, ...source } : source, this.state.designs.length);
        if (existing) Object.assign(existing, merged);
        else this.state.designs.push(merged);
        saved.push(merged);
      }
      if (sourceRows.length === 1) this.state.selectedVariantByLine[sourceRows[0].line_item_id] = sourceRows[0].variant;
      const quoteIds = new Set(saved.map((design) => this.quoteIdForLine(design.line_item_id)).filter(Boolean) as string[]);
      for (const quoteId of quoteIds) await this.queueReprice(quoteId);
      return structuredClone(saved);
    }

    const deleted = rows.filter((row) => this.matches(row, filters));
    const keep = rows.filter((row) => !this.matches(row, filters));
    rows.splice(0, rows.length, ...keep);
    if (table === "sales_quote_line_items") {
      const deletedIds = new Set((deleted as SalesQuoteLineItem[]).map((line) => line.id));
      this.state.designs = this.state.designs.filter((design) => !deletedIds.has(design.line_item_id));
      for (const id of deletedIds) delete this.state.selectedVariantByLine[id];
      const quoteIds = new Set((deleted as SalesQuoteLineItem[]).map((line) => line.quote_id));
      for (const quoteId of quoteIds) await this.queueReprice(quoteId);
    } else if (table === "sales_quote_designs") {
      const quoteIds = new Set((deleted as SalesQuoteDesign[]).map((design) => this.quoteIdForLine(design.line_item_id)).filter(Boolean) as string[]);
      for (const quoteId of quoteIds) await this.queueReprice(quoteId);
    } else {
      const quoteIds = new Set((deleted as SalesQuote[]).map((quote) => quote.id));
      const lineIds = new Set(this.state.lineItems.filter((line) => quoteIds.has(line.quote_id)).map((line) => line.id));
      this.state.lineItems = this.state.lineItems.filter((line) => !quoteIds.has(line.quote_id));
      this.state.designs = this.state.designs.filter((design) => !lineIds.has(design.line_item_id));
    }
    return structuredClone(deleted);
  }
}

export function createExactQuoteLabDatabase(
  catalog: QuoteLabCatalogResponse,
  fixture: QuoteLabFixture,
  comparison: QuoteLabComparison,
): QuoteBuilderDatabase {
  return new ExactQuoteLabDatabase(seedState(catalog, fixture, comparison)) as unknown as QuoteBuilderDatabase;
}
