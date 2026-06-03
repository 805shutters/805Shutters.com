import { NextRequest, NextResponse } from "next/server";
import { normalizePaymentType } from "@/lib/crm/bookkeeping";
import { crmAuthErrorResponse, requireCrmUser } from "@/lib/crm/auth";

export const runtime = "nodejs";

function toMoney(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, email, user } = await requireCrmUser(request);
    const payload = await request.json();
    const paymentType = normalizePaymentType(payload.payment_type) || "other";
    const source = payload.source === "legacy_sheet" ? "legacy_sheet" : "manual";
    const totalAmount = toMoney(payload.total_amount);
    const depositAmount = toMoney(payload.deposit_paid);
    const balanceAmount = toMoney(payload.balance_paid);
    const now = new Date().toISOString();

    if (!payload.customer_name?.trim()) {
      return NextResponse.json({ message: "Customer name is required for a bookkeeping row." }, { status: 400 });
    }

    const { data: entry, error } = await supabase
      .from("crm_quote_bookkeeping_entries")
      .insert({
        source,
        customer_name: payload.customer_name.trim(),
        sold_date: payload.sold_date || null,
        total_amount: totalAmount,
        payment_type: paymentType,
        cogs_amount: toMoney(payload.cogs_amount),
        sales_owner: normalizeOwner(payload.sales_owner),
        sales_owner_auth_user_id: normalizeOwner(payload.sales_owner) ? user.id : null,
        sales_owner_set_at: normalizeOwner(payload.sales_owner) ? now : null,
        installation_invoice_amount: toMoney(payload.installation_invoice_amount),
        installation_invoice_number: payload.installation_invoice_number?.trim() || null,
        installation_invoice_url: payload.installation_invoice_url?.trim() || null,
        installation_match_status: payload.installation_complete ? "matched" : "unmatched",
        installation_matched_at: payload.installation_complete ? now : null,
        jessica_commission_paid_at: payload.jessica_commission_paid ? now : null,
        manufacturer_name: payload.manufacturer_name?.trim() || null,
        manufacturer_order_ref: payload.manufacturer_order_ref?.trim() || null,
        manufacturer_order_url: payload.manufacturer_order_url?.trim() || null,
        manufacturer_document_url: payload.manufacturer_document_url?.trim() || null,
        notes: payload.notes?.trim() || null,
        imported_sheet_row: payload.imported_sheet_row ? Number(payload.imported_sheet_row) : null,
        meta: { createdBy: email }
      })
      .select("*")
      .single();

    if (error || !entry) {
      return NextResponse.json({ message: "Bookkeeping row could not be created." }, { status: 502 });
    }

    const paymentRows = [
      { label: "Deposit", amount: depositAmount },
      { label: "Balance payment", amount: balanceAmount }
    ].filter((payment) => payment.amount > 0);

    if (paymentRows.length) {
      const { error: paymentError } = await supabase.from("crm_quote_bookkeeping_payments").insert(
        paymentRows.map((payment) => ({
          bookkeeping_entry_id: entry.id,
          payment_label: payment.label,
          payment_type: paymentType,
          amount: payment.amount,
          paid_at: payload.paid_at || payload.sold_date || new Date().toISOString().slice(0, 10),
          source,
          notes: payload.payment_notes?.trim() || null,
          meta: { createdBy: email }
        }))
      );

      if (paymentError) {
        return NextResponse.json({ message: "Bookkeeping row was created, but payments failed to save." }, { status: 502 });
      }
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
