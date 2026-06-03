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
    const { supabase, email } = await requireCrmUser(request);
    const payload = await request.json();

    if (!payload.job_id) {
      return NextResponse.json({ message: "Job is required for a quote." }, { status: 400 });
    }

    const quoteTotal = toMoney(payload.quote_total);
    const depositPaid = toMoney(payload.deposit_paid ?? payload.deposit_required);
    const status = payload.status || "draft";
    const now = new Date().toISOString();

    const record = {
      job_id: payload.job_id,
      quote_number: payload.quote_number?.trim() || null,
      status,
      quote_total: quoteTotal,
      materials_cost: toMoney(payload.materials_cost),
      labor_cost: toMoney(payload.labor_cost),
      discount: toMoney(payload.discount),
      tax: toMoney(payload.tax),
      deposit_required: depositPaid,
      balance_due: Math.max(quoteTotal - depositPaid - toMoney(payload.balance_paid), 0),
      sold_by: payload.sold_by || null,
      sold_at: status === "sold" || status === "approved" ? payload.sold_at || now : null,
      approved_at: status === "approved" ? payload.approved_at || now : null,
      ordered_at: status === "ordered" ? payload.ordered_at || now : null,
      received_at: status === "received" ? payload.received_at || now : null,
      installed_at: status === "installed" ? payload.installed_at || now : null,
      manufacturer_name: payload.manufacturer_name?.trim() || null,
      manufacturer_order_ref: payload.manufacturer_order_ref?.trim() || null,
      manufacturer_order_url: payload.manufacturer_order_url?.trim() || null,
      manufacturer_document_url: payload.manufacturer_document_url?.trim() || null,
      notes: payload.notes?.trim() || null,
      meta: {
        createdBy: email
      }
    };

    const { data, error } = await supabase.from("crm_quotes").insert(record).select("*").single();

    if (error) {
      return NextResponse.json({ message: "Quote could not be saved." }, { status: 502 });
    }

    const paymentType = normalizePaymentType(payload.payment_type) || "other";
    const paymentRows = [
      { label: "Deposit", amount: depositPaid },
      { label: "Balance payment", amount: toMoney(payload.balance_paid) }
    ].filter((payment) => payment.amount > 0);

    if (paymentRows.length) {
      await supabase.from("crm_quote_bookkeeping_payments").insert(
        paymentRows.map((payment) => ({
          quote_id: data.id,
          job_id: payload.job_id,
          payment_label: payment.label,
          payment_type: paymentType,
          amount: payment.amount,
          paid_at: payload.paid_at || new Date().toISOString().slice(0, 10),
          source: "crm_quote",
          meta: { createdBy: email }
        }))
      );
    }

    await supabase.from("crm_quote_bookkeeping_entries").insert({
      quote_id: data.id,
      job_id: payload.job_id,
      source: "crm_quote",
      customer_name: payload.customer_name?.trim() || "Linked job",
      sold_date: payload.sold_at || (status === "draft" || status === "sent" ? null : now.slice(0, 10)),
      total_amount: quoteTotal,
      payment_type: paymentType,
      cogs_amount: toMoney(payload.materials_cost),
      sales_owner: normalizeOwner(payload.sold_by),
      sales_owner_set_at: payload.sold_by ? now : null,
      manufacturer_name: payload.manufacturer_name?.trim() || null,
      manufacturer_order_ref: payload.manufacturer_order_ref?.trim() || null,
      manufacturer_order_url: payload.manufacturer_order_url?.trim() || null,
      manufacturer_document_url: payload.manufacturer_document_url?.trim() || null,
      notes: payload.notes?.trim() || null,
      meta: { createdBy: email }
    });

    await supabase
      .from("crm_jobs")
      .update({
        status: getJobStatusForQuote(status),
        estimated_total: quoteTotal,
        deposit_paid: depositPaid
      })
      .eq("id", payload.job_id);

    return NextResponse.json({ quote: data });
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
