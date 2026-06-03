import { NextRequest, NextResponse } from "next/server";
import { normalizePaymentType } from "@/lib/crm/bookkeeping";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

const allowedQuoteFields = new Set([
  "status",
  "quote_number",
  "quote_total",
  "materials_cost",
  "labor_cost",
  "discount",
  "tax",
  "deposit_required",
  "balance_due",
  "sold_by",
  "sent_at",
  "approved_at",
  "sold_at",
  "ordered_at",
  "received_at",
  "installed_at",
  "archived_at",
  "manufacturer_name",
  "manufacturer_order_ref",
  "manufacturer_order_url",
  "manufacturer_document_url",
  "notes"
]);

function toMoney(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, email } = await requireCrmUser(request);
    const { id } = await context.params;
    const payload = await request.json();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (allowedQuoteFields.has(key)) patch[key] = value === "" ? null : value;
    }

    if (typeof payload.status === "string") {
      if ((payload.status === "sold" || payload.status === "approved") && !patch.sold_at) patch.sold_at = now;
      if (payload.status === "approved" && !patch.approved_at) patch.approved_at = now;
      if (payload.status === "ordered" && !patch.ordered_at) patch.ordered_at = now;
      if (payload.status === "received" && !patch.received_at) patch.received_at = now;
      if (payload.status === "installed" && !patch.installed_at) patch.installed_at = now;
      if (payload.status === "archived" && !patch.archived_at) patch.archived_at = now;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ message: "No supported quote fields provided." }, { status: 400 });
    }

    patch.meta = {
      ...(typeof payload.meta === "object" && payload.meta ? payload.meta : {}),
      lastUpdatedBy: email
    };

    const { data: quote, error } = await supabase
      .from("crm_quotes")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !quote) {
      return NextResponse.json({ message: "Quote could not be updated." }, { status: 502 });
    }

    const paymentType = normalizePaymentType(payload.payment_type) || "other";
    const paymentAmount = toMoney(payload.payment_amount);
    if (paymentAmount > 0) {
      await supabase.from("crm_quote_bookkeeping_payments").insert({
        quote_id: id,
        job_id: quote.job_id,
        payment_label: payload.payment_label?.trim() || "Balance payment",
        payment_type: paymentType,
        amount: paymentAmount,
        paid_at: payload.paid_at || new Date().toISOString().slice(0, 10),
        source: "crm_quote",
        notes: payload.payment_notes?.trim() || null,
        meta: { createdBy: email }
      });
    }

    await supabase.from("crm_quote_bookkeeping_entries").upsert(
      {
        quote_id: id,
        job_id: quote.job_id,
        source: "crm_quote",
        customer_name: payload.customer_name?.trim() || quote.customer_name || "Linked job",
        sold_date: quote.sold_at ? String(quote.sold_at).slice(0, 10) : null,
        total_amount: toMoney(quote.quote_total),
        payment_type: paymentType,
        cogs_amount: toMoney(quote.materials_cost),
        sales_owner: normalizeOwner(quote.sold_by),
        sales_owner_set_at: quote.sold_by ? now : null,
        manufacturer_name: quote.manufacturer_name || null,
        manufacturer_order_ref: quote.manufacturer_order_ref || null,
        manufacturer_order_url: quote.manufacturer_order_url || null,
        manufacturer_document_url: quote.manufacturer_document_url || null,
        notes: quote.notes || null,
        meta: { lastUpdatedBy: email }
      },
      { onConflict: "quote_id" }
    );

    await supabase
      .from("crm_jobs")
      .update({
        status: getJobStatusForQuote(String(quote.status || payload.status)),
        estimated_total: toMoney(quote.quote_total),
        deposit_paid: toMoney(quote.deposit_required)
      })
      .eq("id", quote.job_id);

    return NextResponse.json({ quote });
  } catch (error) {
    return crmAuthErrorResponse(error);
  }
}

function normalizeOwner(value: unknown) {
  const lower = String(value || "").toLowerCase();
  if (lower.includes("jessica")) return "jessica";
  if (lower.includes("mike")) return "mike";
  return null;
}

function getJobStatusForQuote(status: string) {
  if (status === "ordered" || status === "received") return "ordered";
  if (status === "installed" || status === "invoiced" || status === "paid") return "installed";
  if (status === "sold" || status === "approved") return "sold";
  return "quoted";
}
