import { NextRequest, NextResponse } from "next/server";
import { ACCOUNT_IDS } from "@mts/lib/accounts";
import type { QuoteStatus } from "@mts/types/quote";
import { crmAuthErrorResponse, CrmAuthError, requireCrmUser } from "@/lib/crm/auth";
import {
  deriveQuoteOrderPatch,
  resolveProductLineOrderStates,
  type ProductLineOrderEvent,
} from "@/lib/crm/product-line-ordering";

export const runtime = "nodejs";

type QuoteRow = {
  id: string;
  status: QuoteStatus;
  ordered_at: string | null;
  manufacturer_order_ref: string | null;
};

type LineRow = {
  id: string;
  quote_id: string;
  room_name: string;
  product_type: string;
  sort_order: number;
};

async function loadStates(
  supabase: Awaited<ReturnType<typeof requireCrmUser>>["supabase"],
  quotes: QuoteRow[],
) {
  const quoteIds = quotes.map((quote) => quote.id);
  const { data: lineData, error: lineError } = await supabase
    .from("sales_quote_line_items")
    .select("id,quote_id,room_name,product_type,sort_order")
    .in("quote_id", quoteIds)
    .order("sort_order", { ascending: true });
  if (lineError) throw new CrmAuthError(502, "Product lines could not be loaded.");

  const lines = (lineData || []) as LineRow[];
  const lineIds = lines.map((line) => line.id);
  let events: ProductLineOrderEvent[] = [];

  if (lineIds.length > 0) {
    const { data: eventData, error: eventError } = await supabase
      .from("crm_activity_events")
      .select("entity_id,action,created_at,after_data")
      .eq("entity_type", "quote")
      .in("entity_id", lineIds)
      .in("action", ["sales_quote_line.ordered", "sales_quote_line.confirmed"])
      .order("created_at", { ascending: false });
    if (eventError) throw new CrmAuthError(502, "Product-line order history could not be loaded.");
    events = (eventData || []) as ProductLineOrderEvent[];
  }

  return Object.fromEntries(
    quotes.map((quote) => [
      quote.id,
      resolveProductLineOrderStates({
        lines: lines.filter((line) => line.quote_id === quote.id),
        events,
        quoteStatus: quote.status,
        quoteOrderedAt: quote.ordered_at,
        quoteOrderRef: quote.manufacturer_order_ref,
      }),
    ]),
  );
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await requireCrmUser(request);
    const quoteIds = [...new Set((request.nextUrl.searchParams.get("quoteIds") || "").split(",").filter(Boolean))].slice(0, 100);
    if (quoteIds.length === 0) return NextResponse.json({ quotes: {} });

    const { data, error } = await supabase
      .from("sales_quotes")
      .select("id,status,ordered_at,manufacturer_order_ref")
      .eq("account_id", ACCOUNT_IDS.SHUTTERS_805)
      .in("id", quoteIds);
    if (error) throw new CrmAuthError(502, "Quotes could not be loaded.");

    const quotes = (data || []) as QuoteRow[];
    return NextResponse.json({ quotes: await loadStates(supabase, quotes) });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = (await request.json()) as {
      quoteId?: string;
      lineItemId?: string;
      orderRef?: string;
    };
    const quoteId = payload.quoteId?.trim();
    const lineItemId = payload.lineItemId?.trim();
    const orderRef = payload.orderRef?.trim() || null;
    if (!quoteId || !lineItemId) throw new CrmAuthError(400, "Quote and product line are required.");

    const { data: quoteData, error: quoteError } = await supabase
      .from("sales_quotes")
      .select("id,status,ordered_at,manufacturer_order_ref")
      .eq("account_id", ACCOUNT_IDS.SHUTTERS_805)
      .eq("id", quoteId)
      .maybeSingle();
    if (quoteError || !quoteData) throw new CrmAuthError(404, "Quote was not found.");

    const { data: lineData, error: lineError } = await supabase
      .from("sales_quote_line_items")
      .select("id,quote_id,room_name,product_type,sort_order")
      .eq("quote_id", quoteId)
      .eq("id", lineItemId)
      .maybeSingle();
    if (lineError || !lineData) throw new CrmAuthError(404, "Product line was not found on this quote.");

    const now = new Date().toISOString();
    const { error: eventError } = await supabase.from("crm_activity_events").insert({
      actor_auth_user_id: user.id,
      actor_email: email,
      entity_type: "quote",
      entity_id: lineItemId,
      action: "sales_quote_line.ordered",
      after_data: {
        orderStatus: "ordered",
        orderedAt: now,
        manufacturerOrderRef: orderRef,
        roomName: lineData.room_name,
        productType: lineData.product_type,
      },
      metadata: { quoteId },
    });
    if (eventError) throw new CrmAuthError(502, "Product-line order status could not be saved.");

    const quote = quoteData as QuoteRow;
    const statesByQuote = await loadStates(supabase, [quote]);
    const states = statesByQuote[quoteId] || [];
    const patch = deriveQuoteOrderPatch(quote.status, states, now);
    if (patch) {
      const { error: updateError } = await supabase
        .from("sales_quotes")
        .update(patch)
        .eq("id", quoteId)
        .eq("account_id", ACCOUNT_IDS.SHUTTERS_805);
      if (updateError) throw new CrmAuthError(502, "Quote order summary could not be updated.");
    }

    return NextResponse.json({ lines: states, quotePatch: patch });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}
