import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CrmAuthError } from "@/lib/crm/auth";

export const MTS_805_ACCOUNT_ID = "72ccf12a-11c0-4261-8ad0-31af8ad0bbfb";

const DEFAULT_MTS_SUPABASE_URL = "https://djduaqegxwjnmjlzjdor.supabase.co";

export type MtsQuoteTable =
  | "sales_quotes"
  | "sales_quote_line_items"
  | "sales_quote_designs"
  | "sales_quote_media"
  | "sales_805_appointments"
  | "quote_order_agent_queue"
  | "crm_users";

export type MtsQuoteFilter =
  | { method: "eq" | "neq"; column: string; value: unknown }
  | { method: "in"; column: string; value: unknown[] }
  | { method: "not"; column: string; operator: string; value: unknown };

export type MtsQuoteOrder = {
  column: string;
  options?: {
    ascending?: boolean;
    nullsFirst?: boolean;
    foreignTable?: string;
    referencedTable?: string;
  };
};

export type MtsQuoteRequest =
  | {
      kind: "query";
      table: MtsQuoteTable;
      action: "select" | "insert" | "update" | "upsert" | "delete";
      values?: unknown;
      options?: Record<string, unknown>;
      select?: string;
      filters?: MtsQuoteFilter[];
      orders?: MtsQuoteOrder[];
      limit?: number;
      single?: boolean;
      maybeSingle?: boolean;
    }
  | {
      kind: "rpc";
      name: "next_quote_number";
      args?: Record<string, unknown>;
    }
  | {
      kind: "function";
      name: "send-quote-email" | "send-quote-sms" | "send-sms" | "r2-upload";
      body?: Record<string, unknown>;
    };

type MtsServiceClient = SupabaseClient;

type ChildScope = {
  table: "sales_quote_line_items" | "sales_quote_designs" | "sales_quote_media";
  parentColumn: "quote_id" | "line_item_id";
};

const tableSet = new Set<MtsQuoteTable>([
  "sales_quotes",
  "sales_quote_line_items",
  "sales_quote_designs",
  "sales_quote_media",
  "sales_805_appointments",
  "quote_order_agent_queue",
  "crm_users",
]);

const childScopes: Partial<Record<MtsQuoteTable, ChildScope>> = {
  sales_quote_line_items: { table: "sales_quote_line_items", parentColumn: "quote_id" },
  sales_quote_designs: { table: "sales_quote_designs", parentColumn: "line_item_id" },
  sales_quote_media: { table: "sales_quote_media", parentColumn: "quote_id" },
};

export function getMtsSupabaseServiceClient() {
  const url = process.env.MTS_SUPABASE_URL?.trim() || DEFAULT_MTS_SUPABASE_URL;
  const serviceRoleKey = process.env.MTS_SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new CrmAuthError(503, "MTS Supabase service role key is not configured.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function assertMtsQuoteTable(table: string): asserts table is MtsQuoteTable {
  if (!tableSet.has(table as MtsQuoteTable)) {
    throw new CrmAuthError(400, "Unsupported MTS quote table.");
  }
}

export function normalizeMtsRows<T extends Record<string, unknown>>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

export async function assertQuoteIdsBelongTo805(
  supabase: MtsServiceClient,
  quoteIds: string[]
) {
  const ids = [...new Set(quoteIds.filter(Boolean))];
  if (ids.length === 0) return;

  const { data, error } = await supabase
    .from("sales_quotes")
    .select("id")
    .in("id", ids)
    .eq("account_id", MTS_805_ACCOUNT_ID);
  if (error) throw new CrmAuthError(502, "Could not verify quote account scope.");

  const found = new Set((data || []).map((row) => row.id));
  const blocked = ids.filter((id) => !found.has(id));
  if (blocked.length > 0) {
    throw new CrmAuthError(403, "MTS quote request is outside the 805 account scope.");
  }
}

async function assertLineItemIdsBelongTo805(supabase: MtsServiceClient, lineItemIds: string[]) {
  const ids = [...new Set(lineItemIds.filter(Boolean))];
  if (ids.length === 0) return;

  const { data, error } = await supabase
    .from("sales_quote_line_items")
    .select("id, sales_quotes!inner(account_id)")
    .in("id", ids)
    .eq("sales_quotes.account_id", MTS_805_ACCOUNT_ID);
  if (error) throw new CrmAuthError(502, "Could not verify quote line item scope.");

  const found = new Set((data || []).map((row) => row.id));
  const blocked = ids.filter((id) => !found.has(id));
  if (blocked.length > 0) {
    throw new CrmAuthError(403, "MTS quote request is outside the 805 account scope.");
  }
}

function collectStringField(rows: Record<string, unknown>[], field: string) {
  return rows
    .flatMap((row) => row[field])
    .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);
}

export async function assertPayloadBelongsTo805(
  supabase: MtsServiceClient,
  table: MtsQuoteTable,
  values: unknown
) {
  if (!values || typeof values !== "object") return;
  const rows = normalizeMtsRows(values as Record<string, unknown>);
  if (rows.length === 0) return;

  if (table === "sales_quotes") {
    for (const row of rows) {
      if (row.account_id && row.account_id !== MTS_805_ACCOUNT_ID) {
        throw new CrmAuthError(403, "MTS quote request is outside the 805 account scope.");
      }
      row.account_id = MTS_805_ACCOUNT_ID;
    }
    return;
  }

  if (table === "sales_805_appointments" || table === "quote_order_agent_queue") {
    for (const row of rows) {
      if (row.account_id && row.account_id !== MTS_805_ACCOUNT_ID) {
        throw new CrmAuthError(403, "MTS quote request is outside the 805 account scope.");
      }
      row.account_id = MTS_805_ACCOUNT_ID;
    }
    await assertQuoteIdsBelongTo805(supabase, collectStringField(rows, "quote_id"));
    return;
  }

  if (table === "sales_quote_line_items" || table === "sales_quote_media") {
    await assertQuoteIdsBelongTo805(supabase, collectStringField(rows, "quote_id"));
    return;
  }

  if (table === "sales_quote_designs") {
    await assertLineItemIdsBelongTo805(supabase, collectStringField(rows, "line_item_id"));
  }
}

type FilterableQuery = {
  eq: (column: string, value: unknown) => unknown;
  neq: (column: string, value: unknown) => unknown;
  in: (column: string, value: unknown[]) => unknown;
  not: (column: string, operator: string, value: unknown) => unknown;
};

type OrderableQuery = {
  order: (column: string, options?: Record<string, unknown>) => unknown;
  limit: (count: number) => unknown;
};

type AccountScopedQuery = {
  eq: (column: string, value: unknown) => unknown;
};

function applyFilters<T extends FilterableQuery>(
  query: T,
  filters: MtsQuoteFilter[] = []
): T {
  return filters.reduce<unknown>((current, filter) => {
    const next = current as FilterableQuery;
    if (filter.method === "eq") return next.eq(filter.column, filter.value);
    if (filter.method === "neq") return next.neq(filter.column, filter.value);
    if (filter.method === "in") return next.in(filter.column, filter.value);
    const notFilter = filter as Extract<MtsQuoteFilter, { method: "not" }>;
    return next.not(notFilter.column, notFilter.operator, notFilter.value);
  }, query) as T;
}

export function applyMtsQueryModifiers<T extends OrderableQuery>(
  query: T,
  request: Extract<MtsQuoteRequest, { kind: "query" }>
): T {
  let next: unknown = query;
  for (const order of request.orders || []) {
    next = (next as OrderableQuery).order(order.column, order.options || {});
  }
  if (typeof request.limit === "number") {
    next = (next as OrderableQuery).limit(request.limit);
  }
  return next as T;
}

export function applyMtsFilters<T extends FilterableQuery>(
  query: T,
  filters: MtsQuoteFilter[] = []
): T {
  return applyFilters(query, filters);
}

export function addAccountScope<T extends AccountScopedQuery>(query: T, table: MtsQuoteTable): T {
  if (
    table === "sales_quotes" ||
    table === "sales_805_appointments" ||
    table === "quote_order_agent_queue"
  ) {
    return query.eq("account_id", MTS_805_ACCOUNT_ID) as T;
  }
  return query;
}

export async function assertFilteredMutationBelongsTo805(
  supabase: MtsServiceClient,
  table: MtsQuoteTable,
  filters: MtsQuoteFilter[] = []
) {
  if (!childScopes[table]) return;
  if (filters.length === 0) {
    throw new CrmAuthError(400, "Scoped MTS quote mutation requires a filter.");
  }

  const scope = childScopes[table]!;
  const query = applyMtsFilters(
    (supabase.from(table) as any).select(`id, ${scope.parentColumn}`),
    filters
  );
  const { data, error } = await query;
  if (error) throw new CrmAuthError(502, "Could not verify MTS quote mutation scope.");

  const parentIds = (data || [])
    .map((row: Record<string, unknown>) => row[scope.parentColumn])
    .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);

  if (scope.parentColumn === "quote_id") {
    await assertQuoteIdsBelongTo805(supabase, parentIds);
  } else {
    await assertLineItemIdsBelongTo805(supabase, parentIds);
  }
}

export async function filterRowsTo805(
  supabase: MtsServiceClient,
  table: MtsQuoteTable,
  data: unknown
) {
  const scope = childScopes[table];
  if (!scope || !data) return data;

  const rows = Array.isArray(data) ? data : [data];
  const parentIds = rows
    .map((row) => (row as Record<string, unknown>)[scope.parentColumn])
    .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);

  if (parentIds.length === 0) return data;

  let allowedParentIds: Set<string>;
  if (scope.parentColumn === "quote_id") {
    const { data: quotes, error } = await supabase
      .from("sales_quotes")
      .select("id")
      .in("id", [...new Set(parentIds)])
      .eq("account_id", MTS_805_ACCOUNT_ID);
    if (error) throw new CrmAuthError(502, "Could not filter MTS quote rows.");
    allowedParentIds = new Set((quotes || []).map((row) => row.id));
  } else {
    const { data: lineItems, error } = await supabase
      .from("sales_quote_line_items")
      .select("id, sales_quotes!inner(account_id)")
      .in("id", [...new Set(parentIds)])
      .eq("sales_quotes.account_id", MTS_805_ACCOUNT_ID);
    if (error) throw new CrmAuthError(502, "Could not filter MTS quote rows.");
    allowedParentIds = new Set((lineItems || []).map((row) => row.id));
  }

  const filtered = rows.filter((row) =>
    allowedParentIds.has(String((row as Record<string, unknown>)[scope.parentColumn] || ""))
  );

  return Array.isArray(data) ? filtered : filtered[0] || null;
}

export function serializeMtsError(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) {
    return { message: error.message, name: error.name };
  }
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      message: typeof record.message === "string" ? record.message : "MTS quote request failed.",
      code: record.code,
      details: record.details,
      hint: record.hint,
    };
  }
  return { message: String(error) };
}
