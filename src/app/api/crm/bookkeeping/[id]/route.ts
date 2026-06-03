import { NextRequest, NextResponse } from "next/server";
import { normalizePaymentType } from "@/lib/crm/bookkeeping";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

const allowedEntryFields = new Set([
  "customer_name",
  "sold_date",
  "total_amount",
  "payment_type",
  "cogs_amount",
  "sales_owner",
  "installation_invoice_document_id",
  "installation_invoice_amount",
  "installation_invoice_number",
  "installation_invoice_url",
  "installation_match_status",
  "installation_matched_at",
  "jessica_commission_paid_at",
  "manufacturer_name",
  "manufacturer_order_ref",
  "manufacturer_order_url",
  "manufacturer_document_url",
  "notes",
  "imported_sheet_row"
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
      if (allowedEntryFields.has(key)) patch[key] = value === "" ? null : value;
    }

    if (typeof payload.payment_type === "string") {
      patch.payment_type = normalizePaymentType(payload.payment_type);
    }

    if (typeof payload.sales_owner === "string") {
      patch.sales_owner = normalizeOwner(payload.sales_owner);
      patch.sales_owner_set_at = now;
    }

    if (typeof payload.installation_complete === "boolean") {
      patch.installation_match_status = payload.installation_complete ? "matched" : "unmatched";
      patch.installation_matched_at = payload.installation_complete ? now : null;
    }

    if (typeof payload.jessica_commission_paid === "boolean") {
      patch.jessica_commission_paid_at = payload.jessica_commission_paid ? now : null;
    }

    if (!Object.keys(patch).length && !toMoney(payload.payment_amount)) {
      return NextResponse.json({ message: "No supported bookkeeping fields provided." }, { status: 400 });
    }

    let entry = null;
    if (Object.keys(patch).length) {
      patch.meta = {
        ...(typeof payload.meta === "object" && payload.meta ? payload.meta : {}),
        lastUpdatedBy: email
      };

      const result = await supabase
        .from("crm_quote_bookkeeping_entries")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();

      if (result.error) {
        return NextResponse.json({ message: "Bookkeeping row could not be updated." }, { status: 502 });
      }
      entry = result.data;
    }

    const paymentAmount = toMoney(payload.payment_amount);
    if (paymentAmount > 0) {
      const paymentType = normalizePaymentType(payload.payment_type) || "other";
      await supabase.from("crm_quote_bookkeeping_payments").insert({
        bookkeeping_entry_id: id,
        payment_label: payload.payment_label?.trim() || "Balance payment",
        payment_type: paymentType,
        amount: paymentAmount,
        paid_at: payload.paid_at || new Date().toISOString().slice(0, 10),
        source: payload.source === "legacy_sheet" ? "legacy_sheet" : "manual",
        notes: payload.payment_notes?.trim() || null,
        meta: { createdBy: email }
      });
    }

    return NextResponse.json({ entry });
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
