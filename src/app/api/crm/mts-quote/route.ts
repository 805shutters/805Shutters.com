import { NextRequest, NextResponse } from "next/server";
import { crmAuthErrorResponse, requireCrmUser, CrmAuthError } from "@/lib/crm/auth";
import {
  addAccountScope,
  applyMtsFilters,
  applyMtsQueryModifiers,
  assertFilteredMutationBelongsTo805,
  assertMtsQuoteTable,
  assertPayloadBelongsTo805,
  assertQuoteIdsBelongTo805,
  filterRowsTo805,
  getMtsSupabaseServiceClient,
  serializeMtsError,
  type MtsQuoteRequest,
} from "@/lib/mts-quote-server";

export const runtime = "nodejs";

const soldSmsRecipients = new Set(["805-630-0848", "805-298-5555"]);
const childParentColumns: Partial<Record<string, string>> = {
  sales_quote_line_items: "quote_id",
  sales_quote_designs: "line_item_id",
  sales_quote_media: "quote_id",
};
const mutationScopeColumns: Partial<Record<string, string[]>> = {
  sales_quotes: ["id"],
  sales_quote_line_items: ["id", "quote_id"],
  sales_quote_designs: ["id", "line_item_id"],
  sales_quote_media: ["id", "quote_id"],
  sales_805_appointments: ["id"],
  quote_order_agent_queue: ["id", "quote_id"],
};

export async function POST(request: NextRequest) {
  try {
    await requireCrmUser(request);
    const payload = (await request.json()) as MtsQuoteRequest;
    const supabase = getMtsSupabaseServiceClient();

    if (payload.kind === "query") {
      return NextResponse.json(await executeQuery(supabase, payload));
    }

    if (payload.kind === "rpc") {
      if (payload.name !== "next_quote_number") {
        throw new CrmAuthError(400, "Unsupported MTS quote RPC.");
      }
      const accountPrefix = String(payload.args?.account_prefix || "");
      if (accountPrefix !== "805") {
        throw new CrmAuthError(403, "MTS quote RPC is outside the 805 account scope.");
      }
      const { data, error } = await supabase.rpc(payload.name, payload.args || {});
      return NextResponse.json({ data, error: serializeMtsError(error) });
    }

    if (payload.kind === "function") {
      await assertFunctionScope(supabase, payload);
      const { data, error } = await supabase.functions.invoke(payload.name, {
        body: payload.body || {},
      });
      return NextResponse.json({ data, error: serializeMtsError(error) });
    }

    throw new CrmAuthError(400, "Unsupported MTS quote request.");
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

async function executeQuery(
  supabase: ReturnType<typeof getMtsSupabaseServiceClient>,
  request: Extract<MtsQuoteRequest, { kind: "query" }>
) {
  assertMtsQuoteTable(request.table);

  if (request.table === "crm_users" && request.action !== "select") {
    throw new CrmAuthError(403, "CRM users are read-only from the 805 quote bridge.");
  }
  if (request.table === "crm_users") {
    assertNarrowCrmUsersRead(request);
  }

  if (request.action === "insert" || request.action === "upsert") {
    await assertPayloadBelongsTo805(supabase, request.table, request.values);
  }

  if (request.action === "update" || request.action === "delete") {
    assertNarrowMutationFilter(request);
    await assertFilteredMutationBelongsTo805(supabase, request.table, request.filters || []);
  }

  let query: any;
  if (request.action === "select") {
    query = supabase.from(request.table).select(selectForScopedRows(request));
  } else if (request.action === "insert") {
    query = supabase.from(request.table).insert(request.values as never);
    if (request.select) query = query.select(request.select);
  } else if (request.action === "update") {
    query = supabase.from(request.table).update(request.values as never);
    if (request.select) query = query.select(request.select);
  } else if (request.action === "upsert") {
    query = supabase.from(request.table).upsert(request.values as never, request.options || {});
    if (request.select) query = query.select(request.select);
  } else {
    query = supabase.from(request.table).delete();
    if (request.select) query = query.select(request.select);
  }

  query = addAccountScope(query, request.table);
  query = applyMtsFilters(query, request.filters || []);
  query = applyMtsQueryModifiers(query, request);

  if (request.single) query = query.single();
  if (request.maybeSingle) query = query.maybeSingle();

  const { data, error, count, status, statusText } = await query;
  const scopedData = error ? data : await filterRowsTo805(supabase, request.table, data);

  if (request.single && !error && data && !scopedData) {
    return {
      data: null,
      error: { message: "MTS quote row is outside the 805 account scope." },
      count,
      status: 403,
      statusText: "Forbidden",
    };
  }

  return {
    data: scopedData,
    error: serializeMtsError(error),
    count,
    status,
    statusText,
  };
}

function selectForScopedRows(request: Extract<MtsQuoteRequest, { kind: "query" }>) {
  const select = request.select || "*";
  const parentColumn = childParentColumns[request.table];
  if (!parentColumn || select === "*") return select;

  const selectedColumns = select.split(",").map((column) => column.trim());
  const alreadySelected = selectedColumns.some((column) => {
    const unaliased = column.includes(":") ? column.split(":").at(-1) || column : column;
    return unaliased === parentColumn || unaliased.startsWith(`${parentColumn}.`);
  });

  return alreadySelected ? select : `${select}, ${parentColumn}`;
}

function assertNarrowMutationFilter(request: Extract<MtsQuoteRequest, { kind: "query" }>) {
  const scopeColumns = mutationScopeColumns[request.table] || ["id"];
  const hasScopeFilter = (request.filters || []).some(
    (filter) =>
      (filter.method === "eq" || filter.method === "in") && scopeColumns.includes(filter.column)
  );

  if (!hasScopeFilter) {
    throw new CrmAuthError(400, "MTS quote mutation requires a narrow scope filter.");
  }
}

function assertNarrowCrmUsersRead(request: Extract<MtsQuoteRequest, { kind: "query" }>) {
  const normalizedSelect = String(request.select || "").replace(/\s+/g, "");
  const allowedSelect = "id,auth_user_id,email,display_name,full_name";
  const hasAuthUserFilter = (request.filters || []).some(
    (filter) =>
      filter.method === "eq" &&
      filter.column === "auth_user_id" &&
      typeof filter.value === "string" &&
      filter.value.length > 0
  );

  if (normalizedSelect !== allowedSelect || !hasAuthUserFilter || !request.maybeSingle) {
    throw new CrmAuthError(403, "CRM user lookup is restricted to the current sales-owner lookup.");
  }
}

async function assertFunctionScope(
  supabase: ReturnType<typeof getMtsSupabaseServiceClient>,
  request: Extract<MtsQuoteRequest, { kind: "function" }>
) {
  if (request.name === "send-quote-email" || request.name === "send-quote-sms") {
    const quoteId = String(request.body?.quoteId || "");
    if (!quoteId) throw new CrmAuthError(400, "Quote function requires quoteId.");
    await assertQuoteIdsBelongTo805(supabase, [quoteId]);
    return;
  }

  if (request.name === "r2-upload") {
    const quoteId = String(request.body?.jobId || "");
    if (!quoteId) throw new CrmAuthError(400, "R2 upload requires an 805 quote id.");
    await assertQuoteIdsBelongTo805(supabase, [quoteId]);
    return;
  }

  if (request.name === "send-sms") {
    const to = String(request.body?.to || "");
    const message = String(request.body?.message || "");
    if (!soldSmsRecipients.has(to) || !message.startsWith("Customer Name:")) {
      throw new CrmAuthError(403, "Only 805 sold-quote owner notifications are allowed.");
    }
    return;
  }

  throw new CrmAuthError(400, "Unsupported MTS quote function.");
}
